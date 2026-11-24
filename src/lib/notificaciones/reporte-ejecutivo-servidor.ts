import "server-only";
import prisma from "@/lib/prisma";
import type { NotificacionProgramada } from "@/generated/prisma/client";
import { logAudit } from "@/lib/audit";
import { registrarError } from "@/lib/errores";
import { conexionNotificaciones, enviarHtmlRegistrado } from "@/lib/correo/notificaciones";
import {
  CID_LOGO_REPORTE,
  documentoCorreo,
  htmlATextoPlano,
  htmlCorreoDeReporte,
} from "@/lib/correo/formato-correo-servidor";
import { logoAzulCorreo } from "@/lib/marca/recursos-correo";
import { LIMITE_RECORTE_GMAIL } from "@/lib/correo/preparar-html-correo";
import { ErrorSmtp } from "@/lib/conexiones/smtp";
import { generarReporteEjecutivoNucleo } from "@/lib/auditoria/reporte-ejecutivo/generar-servidor";
import { parseRangoReporte } from "@/lib/auditoria/reporte-ejecutivo/rango";
import { fmtCalendarDate } from "@/lib/format";
import { correosDeEnvio, TOPE_DESTINATARIOS } from "./destinatarios";
import {
  PROGRAMACION_POR_DEFECTO,
  type PanelEnvioAutomatico,
  type PeriodoManualSugerido,
  type PeriodoProximoPanel,
} from "./panel";
import {
  calcularPeriodoEnvio,
  calcularPeriodoEnvioManual,
  decidirVencimiento,
  envioAtrasado,
  estadoDeEnvio,
  FRECUENCIA_SEMANAL,
  fechaColombia,
  fechaDePeriodoGuardado,
  limiteEnCurso,
  periodoEnvioSemanal,
  proximaEjecucion,
  TIPO_REPORTE_EJECUTIVO,
  TOPE_DIAS_ENVIO_AUTOMATICO,
  type EstadoEjecucion,
  type OrigenEjecucion,
  type PeriodoEnvio,
} from "./programacion";

/**
 * Envío del reporte para gerencia por correo: el programado (lo dispara el cron del
 * servidor a través de `/api/tareas/notificaciones`), el manual y la prueba.
 *
 * Aquí NO se decide quién puede hacer qué: las acciones de la pantalla autorizan al
 * Superadministrador antes de llamar, y la ruta del cron se autentica con
 * `CRON_SECRET`. Todo lo que depende de la hora recibe `ahora`; nada usa `now()` de SQL.
 *
 * Diseño y despliegue: docs/notificaciones/reporte-ejecutivo-programado.md.
 */

export const ACTOR_PROGRAMADO = "Sistema (envío programado)";
export const RUTA_REPORTES_EJECUTIVOS = "/config/reportes-ejecutivos";

/** Quién envía: la persona de la sesión o el sistema (`id` null). */
export type ActorEnvio = { id: number | null; nombre: string };
const SISTEMA: ActorEnvio = { id: null, nombre: ACTOR_PROGRAMADO };

/** Error con un mensaje apto para mostrar (nunca lleva secretos ni textos de SMTP). */
class ErrorEnvioReporte extends Error {}

/* ===== Período del reporte: desde donde terminó el último reporte enviado ===== */

type UltimoPeriodo = { desde: Date; hasta: Date };

/**
 * El período del último reporte enviado por correo (programado o manual a la lista).
 *
 * - Mientras nunca haya salido un correo exitoso desde «Envío automático» (`notificacion_ejecucion`),
 *   devuelve `null`: el primer envío cubre solo los últimos 7 días y NO arrastra registros antiguos
 *   de «Reportes enviados».
 * - Cuando ya hubo al menos un envío por correo, toma el mayor `periodoHasta` entre los envíos por
 *   correo y los registros posteriores de «Reportes enviados», para no repetir días ya comunicados.
 */
async function ultimoPeriodoEnviado(): Promise<UltimoPeriodo | null> {
  const ultimoCorreo = await prisma.notificacionEjecucion.findFirst({
    where: {
      programacion: { tipo: TIPO_REPORTE_EJECUTIVO },
      origen: { in: ["programada", "manual"] },
      estado: { in: ["ok", "parcial"] },
      periodoDesde: { not: null },
      periodoHasta: { not: null },
    },
    orderBy: [{ periodoHasta: "desc" }, { id: "desc" }],
    select: { periodoDesde: true, periodoHasta: true },
  });
  if (!ultimoCorreo?.periodoDesde || !ultimoCorreo.periodoHasta) return null;

  const ultimoRegistro = await prisma.envioReporteEjecutivo.findFirst({
    orderBy: [{ periodoHasta: "desc" }, { id: "desc" }],
    select: { periodoDesde: true, periodoHasta: true },
  });
  if (ultimoRegistro && ultimoRegistro.periodoHasta.getTime() > ultimoCorreo.periodoHasta.getTime()) {
    return { desde: ultimoRegistro.periodoDesde, hasta: ultimoRegistro.periodoHasta };
  }
  return { desde: ultimoCorreo.periodoDesde, hasta: ultimoCorreo.periodoHasta };
}

type PeriodoCubierto = Extract<PeriodoEnvio, { estado: "cubierto" }>;

function textoYaCubierto(p: PeriodoCubierto): string {
  return `Ya se reportó hasta el ${fmtCalendarDate(p.cubiertoHasta)}: todavía no hay días nuevos que enviar.`;
}

/** Aviso del historial cuando el período se recortó al tope de 30 días; null si no hubo recorte. */
function notaDeRecorte(p: PeriodoEnvio): string | null {
  if (p.estado !== "nuevo" || !p.recortado || !p.ultimoHasta) return null;
  return `El período se recortó a ${TOPE_DIAS_ENVIO_AUTOMATICO} días: el último reporte enviado terminó el ${fmtCalendarDate(p.ultimoHasta)} y arrancaba el ${fmtCalendarDate(p.desdeSinRecorte)}, pero el tope es ${TOPE_DIAS_ENVIO_AUTOMATICO} días.`;
}

/** El período de un envío con su procedencia, tal como lo muestra el panel. */
function periodoParaPanel(periodo: PeriodoEnvio, ultimo: UltimoPeriodo | null): PeriodoProximoPanel {
  if (periodo.estado === "cubierto") return { estado: "cubierto", hasta: periodo.hasta, cubiertoHasta: periodo.cubiertoHasta };
  return {
    estado: "nuevo",
    desde: periodo.desde,
    hasta: periodo.hasta,
    origen: periodo.origen,
    ultimoDesde: ultimo ? fechaDePeriodoGuardado(ultimo.desde) : null,
    ultimoHasta: periodo.ultimoHasta,
    recortado: periodo.recortado,
    desdeSinRecorte: periodo.desdeSinRecorte,
  };
}

function esConflictoUnico(e: unknown): boolean {
  return Boolean(e && typeof e === "object" && "code" in e && (e as { code?: unknown }).code === "P2002");
}

function mensajeSeguro(e: unknown): string {
  if (e instanceof ErrorEnvioReporte || e instanceof ErrorSmtp) return e.message;
  registrarError("envioReporteProgramado", e);
  return "No se pudo generar o enviar el reporte. Revisa el registro del servidor.";
}

/* ===== Envío (programado, manual o prueba) ===== */

type EntradaEnvio = {
  origen: OrigenEjecucion;
  /** Lo que cubre el reporte (AAAA-MM-DD): lo decide quien llama con `calcularPeriodoEnvio` o el rango elegido en envío manual. */
  periodo: { desde: string; hasta: string };
  /** Aviso sobre el período (p. ej. que se recortó al tope de 366 días), para el mensaje del historial. */
  notaPeriodo?: string | null;
  /** Correos ya normalizados; el servidor SMTP recibe uno por destinatario. */
  destinatarios: string[];
  actor: ActorEnvio;
  /** Deja constancia en «Reportes enviados» (el reporte llegó al cliente); la prueba no. */
  registrarEnvio: boolean;
  /**
   * Reutiliza una instantánea solo si el período ya terminó al generarla. En envío manual con rango
   * elegido tras vista previa (`false`) se reutiliza exactamente la instantánea recién generada.
   */
  soloReutilizarSiCompleta?: boolean;
};

type SalidaEnvio = {
  estado: Extract<EstadoEjecucion, "ok" | "parcial" | "error">;
  aceptados: number;
  fallidos: number;
  mensaje: string;
  periodoDesde: Date | null;
  periodoHasta: Date | null;
};

const REFERENCIA_ENVIO: Record<OrigenEjecucion, string> = {
  programada: "Reporte para gerencia (envío programado)",
  manual: "Reporte para gerencia (envío manual)",
  prueba: "Reporte para gerencia (prueba)",
};

function fallo(mensaje: string, periodo?: { desde: Date; hasta: Date }): SalidaEnvio {
  return {
    estado: "error", aceptados: 0, fallidos: 0, mensaje,
    periodoDesde: periodo?.desde ?? null, periodoHasta: periodo?.hasta ?? null,
  };
}

/**
 * Genera el reporte del período, lo convierte al formato correo y lo envía. Nunca
 * lanza: cualquier fallo vuelve como `estado: "error"` con un mensaje claro.
 */
async function enviarReporte(entrada: EntradaEnvio): Promise<SalidaEnvio> {
  try {
    if (!entrada.destinatarios.length) {
      return fallo("No hay destinatarios activos. Agrega al menos uno en la lista.");
    }

    // 1. Con qué se envía: se comprueba ANTES de generar el reporte, que es lo costoso.
    const conexion = await conexionNotificaciones();
    if (!conexion) {
      return fallo("No hay una conexión de correo para notificaciones. Márcala en Configuración › Conexiones.");
    }
    // 2. El reporte del período recibido, sin novedades omitidas a mano.
    const periodo = entrada.periodo;
    const rango = parseRangoReporte(periodo.desde, periodo.hasta);
    if (!rango) return fallo("No se pudo calcular el período del reporte.");
    const generado = await generarReporteEjecutivoNucleo({
      opciones: { desde: periodo.desde, hasta: periodo.hasta, actualizar: false, cambiosOmitidos: [] },
      obtenerActor: async () => entrada.actor,
      // Una instantánea hecha antes de que el período terminara (p. ej. por una prueba) está incompleta.
      soloReutilizarSiCompleta: entrada.soloReutilizarSiCompleta ?? true,
    });
    if (!generado.ok) return fallo(generado.message, rango);

    // 3. El mismo formato que «Copiar formato correo», en el cuerpo del mensaje. El logotipo viaja
    //    incrustado (CID), como en los avisos: no depende de ninguna dirección pública. Sin logotipo
    //    legible, el correo sale sin él.
    const logo = await logoAzulCorreo();
    const fragmento = htmlCorreoDeReporte(generado.report.html, { logoCid: logo ? CID_LOGO_REPORTE : null });
    const titulo = generado.report.titulo;
    const prefijo = entrada.origen === "prueba" ? "[Prueba] " : "";
    const resultado = await enviarHtmlRegistrado(
      conexion,
      entrada.destinatarios,
      {
        asunto: `${prefijo}${titulo}`,
        html: documentoCorreo(fragmento, titulo),
        texto: `${titulo}\n\n${htmlATextoPlano(fragmento)}`,
        referencia: REFERENCIA_ENVIO[entrada.origen],
        imagenes: logo
          ? [{ cid: CID_LOGO_REPORTE, nombre: "russell-bedford-azul.png", contenido: logo, tipo: "image/png" as const }]
          : undefined,
      },
      entrada.actor.nombre,
    );

    const estado = estadoDeEnvio(resultado.aceptados, resultado.fallidos);
    const notas: string[] = [];
    if (entrada.notaPeriodo) notas.push(entrada.notaPeriodo);
    if (!logo) notas.push("No se pudo leer el logotipo: el correo salió sin él.");
    if (fragmento.length > LIMITE_RECORTE_GMAIL) {
      notas.push("El cuerpo supera los 102.000 caracteres: Gmail podría mostrarlo recortado.");
    }

    // 4. Constancia de lo comunicado: el siguiente reporte no repetirá estas novedades.
    if (entrada.registrarEnvio && resultado.aceptados > 0) {
      try {
        await prisma.envioReporteEjecutivo.create({
          data: {
            titulo: titulo.slice(0, 200),
            periodoDesde: rango.desde,
            periodoHasta: rango.hasta,
            versionIds: [...new Set(generado.versionIdsIncluidos)].sort((a, b) => a - b),
            totalNovedades: generado.totalNovedades,
            totalAcciones: generado.totalAcciones,
            canal: "correo",
            nota: `Enviado a ${resultado.aceptados} destinatario(s) (${REFERENCIA_ENVIO[entrada.origen].toLowerCase()}).`,
            enviadoPor: entrada.actor.nombre,
            enviadoPorId: entrada.actor.id,
          },
        });
      } catch (e) {
        registrarError("envioReporteProgramado.registrarEnvio", e);
        notas.push("El correo salió, pero no se pudo dejar constancia en «Reportes enviados»: márcalo a mano para que el próximo reporte no repita estas novedades.");
      }
    }

    await logAudit({
      user: entrada.actor.nombre,
      action: entrada.origen === "prueba" ? "ENVIÓ PRUEBA DE REPORTE" : "ENVIÓ REPORTE POR CORREO",
      entity: "Uso y adopción",
      detail: `${REFERENCIA_ENVIO[entrada.origen]}: «${titulo}» del ${periodo.desde} al ${periodo.hasta}; ${resultado.aceptados} destinatario(s) aceptado(s) y ${resultado.fallidos} con error.`,
    });

    return {
      estado,
      aceptados: resultado.aceptados,
      fallidos: resultado.fallidos,
      mensaje: [resultado.message, ...notas].join(" "),
      periodoDesde: rango.desde,
      periodoHasta: rango.hasta,
    };
  } catch (e) {
    return fallo(mensajeSeguro(e));
  }
}

/** Cierra la ejecución con el resultado del envío. Si la BD falla aquí, el correo ya salió: solo se registra. */
async function cerrarEjecucion(id: number, salida: SalidaEnvio, inicio: Date, fin: Date): Promise<void> {
  try {
    await prisma.notificacionEjecucion.update({
      where: { id },
      data: {
        estado: salida.estado,
        aceptados: salida.aceptados,
        fallidos: salida.fallidos,
        mensaje: salida.mensaje.slice(0, 1000),
        periodoDesde: salida.periodoDesde,
        periodoHasta: salida.periodoHasta,
        terminadaEn: fin,
        duracionMs: Math.max(0, fin.getTime() - inicio.getTime()),
      },
    });
  } catch (e) {
    registrarError("envioReporteProgramado.cerrarEjecucion", e);
  }
}

/* ===== Disparo programado (lo llama el cron) ===== */

export type ResumenProceso = {
  /** Programaciones activas cuya hora ya llegó. */
  revisadas: number;
  enviadas: number;
  /** Retraso mayor a 24 h: solo se avanzó la próxima fecha. */
  omitidas: number;
  /** Otra llamada ya había reclamado ese disparo: no se envía de nuevo. */
  saltadas: number;
  errores: number;
  /** Ejecuciones «en curso» de más de 30 minutos que se dieron por perdidas. */
  perdidasCerradas: number;
};

type Resultado = "enviada" | "omitida" | "saltada" | "error";

async function procesarProgramacion(p: NotificacionProgramada, ahora: Date): Promise<Resultado> {
  const programadaPara = p.proximaEjecucionEn;
  if (!programadaPara) return "saltada";
  const decision = decidirVencimiento({ proximaEjecucionEn: programadaPara, ahora });
  if (decision.accion === "esperar") return "saltada";

  const retrasado = decision.accion === "omitir";
  const siguiente = proximaEjecucion({ ahora, diaSemana: p.diaSemana, hora: p.hora });

  // El período arranca donde terminó el último reporte enviado y llega hasta el día anterior al envío
  // programado. Si ya está cubierto, no hay nada nuevo que reportar: el disparo se omite.
  const ultimo = retrasado ? null : await ultimoPeriodoEnviado();
  const periodo = retrasado ? null : calcularPeriodoEnvio({ referencia: programadaPara, ultimoPeriodoHasta: ultimo?.hasta ?? null });
  const cubierto = periodo?.estado === "cubierto" ? periodo : null;
  const omitir = retrasado || cubierto !== null;
  const motivoOmision = retrasado
    ? "No se envió: el disparador llegó con más de 24 horas de retraso. Se programó el siguiente envío."
    : cubierto
      ? `No se envió: ${textoYaCubierto(cubierto)} Se programó el siguiente envío.`
      : null;

  // Avanza la próxima fecha SOLO si nadie la cambió mientras tanto (p. ej. un guardado de la pantalla).
  const avanzar = () =>
    prisma.notificacionProgramada.updateMany({
      where: { id: p.id, activa: true, proximaEjecucionEn: programadaPara },
      data: { proximaEjecucionEn: siguiente },
    });

  // Reclamo: el único (programación, instante programado) hace que solo UNA llamada envíe.
  let ejecucionId: number;
  try {
    const ejecucion = await prisma.notificacionEjecucion.create({
      data: {
        programacionId: p.id,
        programadaPara,
        origen: "programada",
        estado: omitir ? "omitida" : "en_curso",
        mensaje: motivoOmision,
        ejecutadoPor: ACTOR_PROGRAMADO,
        iniciadaEn: ahora,
        terminadaEn: omitir ? ahora : null,
        duracionMs: omitir ? 0 : null,
      },
      select: { id: true },
    });
    ejecucionId = ejecucion.id;
  } catch (e) {
    if (!esConflictoUnico(e)) throw e;
    // Ya reclamado (otra llamada, o una corrida anterior que murió antes de avanzar): no se reenvía.
    await avanzar();
    return "saltada";
  }

  // Siempre se recalcula la próxima: aun si el envío falla, la semana siguiente vuelve a intentarse.
  await avanzar();
  if (omitir) return "omitida";

  const destinatarios = correosDeEnvio(
    await prisma.notificacionDestinatario.findMany({
      where: { programacionId: p.id },
      orderBy: { id: "asc" },
      select: { correo: true, nombre: true, activo: true },
    }),
  );
  if (periodo?.estado !== "nuevo") return "saltada"; // inalcanzable: `omitir` ya cubrió los otros casos
  const salida = await enviarReporte({
    origen: "programada", periodo, notaPeriodo: notaDeRecorte(periodo), destinatarios, actor: SISTEMA, registrarEnvio: true,
  });
  await cerrarEjecucion(ejecucionId, salida, ahora, new Date());
  return salida.estado === "error" ? "error" : "enviada";
}

/**
 * Lo que hace cada llamada del cron: da por perdidas las ejecuciones colgadas y atiende,
 * UNA a la vez, las programaciones activas cuya hora ya llegó. Idempotente: llamarla de
 * más no envía nada de más.
 */
export async function procesarNotificacionesPendientes(ahora: Date = new Date()): Promise<ResumenProceso> {
  const resumen: ResumenProceso = { revisadas: 0, enviadas: 0, omitidas: 0, saltadas: 0, errores: 0, perdidasCerradas: 0 };

  const perdidas = await prisma.notificacionEjecucion.updateMany({
    where: { estado: "en_curso", iniciadaEn: { lt: limiteEnCurso(ahora) } },
    data: {
      estado: "error",
      mensaje: "La ejecución no terminó: el servidor se reinició o tardó más de 30 minutos. Revisa si el correo llegó antes de reenviarlo.",
      terminadaEn: ahora,
    },
  });
  resumen.perdidasCerradas = perdidas.count;

  const pendientes = await prisma.notificacionProgramada.findMany({
    where: { activa: true, tipo: TIPO_REPORTE_EJECUTIVO, proximaEjecucionEn: { lte: ahora } },
    orderBy: [{ proximaEjecucionEn: "asc" }, { id: "asc" }],
  });
  resumen.revisadas = pendientes.length;

  for (const programacion of pendientes) {
    try {
      const resultado = await procesarProgramacion(programacion, ahora);
      if (resultado === "enviada") resumen.enviadas++;
      else if (resultado === "omitida") resumen.omitidas++;
      else if (resultado === "saltada") resumen.saltadas++;
      else resumen.errores++;
    } catch (e) {
      registrarError(`notificaciones.procesarProgramacion#${programacion.id}`, e);
      resumen.errores++;
    }
  }
  return resumen;
}

/* ===== Envío manual y prueba (los pide la pantalla, ya autorizada) ===== */

export type ResultadoEnvioManual = {
  ok: boolean;
  message: string;
  estado: EstadoEjecucion | null;
};

/** La programación del tipo; la crea (pausada, con los valores por defecto) si aún no existe. */
export async function obtenerOCrearProgramacion(actor: ActorEnvio): Promise<NotificacionProgramada> {
  return prisma.notificacionProgramada.upsert({
    where: { tipo: TIPO_REPORTE_EJECUTIVO },
    update: {},
    create: {
      tipo: TIPO_REPORTE_EJECUTIVO,
      frecuencia: FRECUENCIA_SEMANAL,
      activa: PROGRAMACION_POR_DEFECTO.activa,
      diaSemana: PROGRAMACION_POR_DEFECTO.diaSemana,
      hora: PROGRAMACION_POR_DEFECTO.hora,
      proximaEjecucionEn: null,
      creadoPor: actor.nombre,
      creadoPorId: actor.id,
      actualizadoPor: actor.nombre,
      actualizadoPorId: actor.id,
    },
  });
}

/**
 * Envía el reporte ahora. `manual` va a toda la lista y deja constancia en «Reportes
 * enviados»; `prueba` va solo a `correoPrueba` y no cuenta como entregado al cliente.
 */
export async function enviarReporteAhora(params: {
  origen: Extract<OrigenEjecucion, "manual" | "prueba">;
  actor: ActorEnvio;
  /** Solo para la prueba: el correo de quien la pide. */
  correoPrueba?: string | null;
  /**
   * Solo para `manual`: rango explícito elegido por la persona al generar y revisar el reporte
   * antes de enviarlo (AAAA-MM-DD). Si se omite, continúa automáticamente desde el último envío hasta ayer.
   */
  periodoManual?: { desde: string; hasta: string };
  ahora?: Date;
}): Promise<ResultadoEnvioManual> {
  const { origen, actor } = params;
  const ahora = params.ahora ?? new Date();
  const programacion = await obtenerOCrearProgramacion(actor);

  let destinatarios: string[];
  if (origen === "prueba") {
    const correo = params.correoPrueba?.trim().toLowerCase();
    if (!correo) return { ok: false, message: "Tu cuenta no tiene un correo registrado: no hay a dónde enviar la prueba.", estado: null };
    destinatarios = [correo];
  } else {
    destinatarios = correosDeEnvio(
      await prisma.notificacionDestinatario.findMany({
        where: { programacionId: programacion.id },
        orderBy: { id: "asc" },
        select: { correo: true, nombre: true, activo: true },
      }),
    );
    if (!destinatarios.length) {
      return { ok: false, message: "No hay destinatarios activos. Agrega al menos uno en la lista.", estado: null };
    }
    // Un envío a la lista a la vez: evita el doble clic y el cruce con el programado.
    const enCurso = await prisma.notificacionEjecucion.findFirst({
      where: {
        programacionId: programacion.id,
        estado: "en_curso",
        origen: { in: ["programada", "manual"] },
        iniciadaEn: { gte: limiteEnCurso(ahora) },
      },
      select: { id: true },
    });
    if (enCurso) {
      return { ok: false, message: "Ya hay un envío a la lista en curso. Espera a que termine antes de pedir otro.", estado: null };
    }
  }

  // El período: si en envío manual llegó un rango elegido por la persona tras generar el reporte,
  // se valida y se envía ese; si no, continúa donde terminó el último reporte. La prueba muestra el
  // que cubriría el PRÓXIMO envío programado (o, si no lo hay o ya estaría cubierto, los últimos 7 días).
  let periodo: { desde: string; hasta: string };
  let notaPeriodo: string | null = null;
  let soloReutilizarSiCompleta = true;
  if (origen === "manual" && params.periodoManual) {
    const { desde, hasta } = params.periodoManual;
    if (!parseRangoReporte(desde, hasta)) {
      return { ok: false, message: "El rango de fechas no es válido o supera 366 días. Ajusta el período e inténtalo de nuevo.", estado: null };
    }
    if (hasta > fechaColombia(ahora)) {
      return { ok: false, message: "La fecha final no puede ser posterior a hoy.", estado: null };
    }
    periodo = { desde, hasta };
    // Reutiliza la instantánea recién generada en la vista previa (aunque `hasta` sea hoy).
    soloReutilizarSiCompleta = false;
  } else {
    const ultimo = await ultimoPeriodoEnviado();
    if (origen === "manual") {
      const calculado = calcularPeriodoEnvio({ referencia: ahora, ultimoPeriodoHasta: ultimo?.hasta ?? null });
      if (calculado.estado === "cubierto") return { ok: false, message: textoYaCubierto(calculado), estado: null };
      periodo = calculado;
      notaPeriodo = notaDeRecorte(calculado);
    } else {
      const proxima = programacion.activa ? programacion.proximaEjecucionEn : null;
      const delProximo = proxima ? calcularPeriodoEnvio({ referencia: proxima, ultimoPeriodoHasta: ultimo?.hasta ?? null }) : null;
      if (delProximo?.estado === "nuevo") {
        periodo = delProximo;
        notaPeriodo = notaDeRecorte(delProximo);
      } else {
        periodo = periodoEnvioSemanal(ahora);
      }
    }
  }

  let ejecucionId: number;
  try {
    const ejecucion = await prisma.notificacionEjecucion.create({
      data: {
        programacionId: programacion.id,
        programadaPara: ahora,
        origen,
        estado: "en_curso",
        ejecutadoPor: actor.nombre,
        iniciadaEn: ahora,
      },
      select: { id: true },
    });
    ejecucionId = ejecucion.id;
  } catch (e) {
    if (esConflictoUnico(e)) return { ok: false, message: "Ya hay un envío en curso. Espera a que termine.", estado: null };
    throw e;
  }

  const salida = await enviarReporte({
    origen,
    periodo,
    notaPeriodo,
    destinatarios,
    actor,
    registrarEnvio: origen === "manual",
    soloReutilizarSiCompleta,
  });
  await cerrarEjecucion(ejecucionId, salida, ahora, new Date());
  return { ok: salida.estado !== "error", message: salida.mensaje, estado: salida.estado };
}

/* ===== Panel ===== */

/** Lee todo lo que la pantalla necesita. No crea nada: sin programación guardada devuelve los valores por defecto. */
export async function leerPanelEnvio(params: { correoPrueba: string | null; ahora?: Date }): Promise<PanelEnvioAutomatico> {
  const ahora = params.ahora ?? new Date();
  const programacion = await prisma.notificacionProgramada.findUnique({
    where: { tipo: TIPO_REPORTE_EJECUTIVO },
    include: {
      destinatarios: { orderBy: { id: "asc" } },
      ejecuciones: { orderBy: [{ iniciadaEn: "desc" }, { id: "desc" }], take: 15 },
    },
  });

  let conexion: PanelEnvioAutomatico["conexion"];
  try {
    const encontrada = await conexionNotificaciones();
    conexion = encontrada
      ? { estado: "lista", mensaje: null }
      : { estado: "sin_conexion", mensaje: "No hay una conexión de correo marcada para enviar el reporte para gerencia." };
  } catch (e) {
    conexion =
      e instanceof ErrorSmtp
        ? { estado: "varias", mensaje: e.message }
        : { estado: "error", mensaje: "No se pudo consultar la conexión de correo." };
    if (!(e instanceof ErrorSmtp)) registrarError("notificaciones.leerPanelEnvio", e);
  }

  const activa = programacion?.activa ?? PROGRAMACION_POR_DEFECTO.activa;
  const proximaEjecucionEn = programacion?.proximaEjecucionEn ?? null;

  // Último reporte enviado: sirve tanto para el próximo envío programado como para el rango por defecto del envío manual.
  let ultimo: UltimoPeriodo | null = null;
  let ultimoLeido = false;
  try {
    ultimo = await ultimoPeriodoEnviado();
    ultimoLeido = true;
  } catch (e) {
    registrarError("notificaciones.leerPanelEnvio.periodo", e);
  }

  // Qué cubrirá el próximo envío y de dónde sale ese período (null si está en pausa o no se pudo leer el último reporte).
  let periodoProximo: PeriodoProximoPanel | null = null;
  if (activa && proximaEjecucionEn && ultimoLeido) {
    periodoProximo = periodoParaPanel(
      calcularPeriodoEnvio({ referencia: proximaEjecucionEn, ultimoPeriodoHasta: ultimo?.hasta ?? null }),
      ultimo,
    );
  }

  const manualCalculado = calcularPeriodoEnvioManual({ ahora, ultimoPeriodoHasta: ultimo?.hasta ?? null });
  const periodoManualSugerido: PeriodoManualSugerido = {
    ...manualCalculado,
    ultimoDesde: ultimo ? fechaDePeriodoGuardado(ultimo.desde) : null,
  };

  return {
    existe: Boolean(programacion),
    activa,
    diaSemana: programacion?.diaSemana ?? PROGRAMACION_POR_DEFECTO.diaSemana,
    hora: programacion?.hora ?? PROGRAMACION_POR_DEFECTO.hora,
    proximaEjecucionEn: proximaEjecucionEn?.toISOString() ?? null,
    periodoProximo,
    periodoManualSugerido,
    destinatarios: (programacion?.destinatarios ?? []).map((d) => ({ id: d.id, correo: d.correo, nombre: d.nombre, activo: d.activo })),
    ejecuciones: (programacion?.ejecuciones ?? []).map((e) => ({
      id: e.id,
      origen: e.origen as OrigenEjecucion,
      estado: e.estado as EstadoEjecucion,
      aceptados: e.aceptados,
      fallidos: e.fallidos,
      mensaje: e.mensaje,
      programadaPara: e.programadaPara.toISOString(),
      iniciadaEn: e.iniciadaEn.toISOString(),
      terminadaEn: e.terminadaEn?.toISOString() ?? null,
      periodoDesde: e.periodoDesde?.toISOString() ?? null,
      periodoHasta: e.periodoHasta?.toISOString() ?? null,
      ejecutadoPor: e.ejecutadoPor,
    })),
    conexion,
    disparadorConfigurado: Boolean(process.env.CRON_SECRET?.trim()),
    atrasado: envioAtrasado({ activa, proximaEjecucionEn, ahora }),
    topeDestinatarios: TOPE_DESTINATARIOS,
    correoPrueba: params.correoPrueba,
  };
}
