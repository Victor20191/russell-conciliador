import "server-only";

/**
 * Núcleo de la generación del reporte para gerencia, SIN sesión.
 *
 * Lo usan dos caminos que autorizan por su cuenta antes de llamarlo:
 *  - la acción `generarReporteEjecutivoUso` (botón de la pantalla), tras comprobar la
 *    sesión y el permiso del Superadministrador;
 *  - el envío automático semanal por correo (`/api/tareas/notificaciones`), que se
 *    autentica con `CRON_SECRET` y actúa como «Sistema (envío programado)».
 *
 * No consulta la sesión ni decide permisos: quien lo llame debe haberlos resuelto.
 */
import prisma from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { mensajeErrorOpenCode } from "@/lib/opencode";
import {
  evaluarAdopcion,
  soloFuncionalidadesNuevas,
  type CambioNovedadContexto,
} from "@/lib/auditoria/reporte-ejecutivo/adopcion";
import {
  calcularResumenUso,
  clasificarFamilia,
  conteosPorFamiliaCanon,
  type EventoAuditoria,
} from "@/lib/auditoria/reporte-ejecutivo/metricas";
import {
  filtrarCambiosPublicados,
  filtrarEventosPublicados,
  filtrarNavegacionesPublicadas,
  type FiltroPublicacion,
} from "@/lib/auditoria/reporte-ejecutivo/alcance";
import { construirComparativoUso, construirUsoComparable } from "@/lib/auditoria/reporte-ejecutivo/comparativo-servidor";
import { construirCostosIAReporte } from "@/lib/auditoria/reporte-ejecutivo/costos-ia-servidor";
import { construirTicketsAtendidosReporte } from "@/lib/auditoria/reporte-ejecutivo/tickets-atendidos-servidor";
import { parseRangoReporte } from "@/lib/auditoria/reporte-ejecutivo/rango";
import { filtroVersionesDelPeriodo } from "@/lib/auditoria/reporte-ejecutivo/novedades-periodo";
import { omitidosDelPeriodo } from "@/lib/auditoria/reporte-ejecutivo/omitir-novedades";
import {
  actorUnificado,
  aliasDeActores,
  correosDelReporte,
  idsDelUso,
  nombresDelGastoIA,
  nombresDelReporte,
  unificarActores,
  visitasDeCuentas,
} from "@/lib/auditoria/reporte-ejecutivo/usuarios-reporte";
import { construirUsuariosActivos } from "@/lib/auditoria/reporte-ejecutivo/usuarios-activos-servidor";
import { descripcionAvance, tituloAvance } from "@/lib/auditoria/reporte-ejecutivo/texto-avances";
import { modulosPublicadosParaTodos } from "@/lib/rbac/publicacion";
import { MODULOS_PLATAFORMA_KEYS } from "@/lib/rbac/modulos-plataforma";
import { construirDocumentoConsistente } from "@/lib/auditoria/reporte-ejecutivo/documento";
import {
  claveAlcanceReporte,
  guardarInstantanea,
  instantaneaCubreElPeriodo,
  leerInstantanea,
} from "@/lib/auditoria/reporte-ejecutivo/instantaneas";
import {
  MODELO_REPORTE_DETERMINISTA,
  type ReporteEjecutivoUso,
} from "@/lib/auditoria/reporte-ejecutivo/reportes";
import {
  normalizarTerminologiaVisibleReporte,
  type NovedadReporteEjecutivoContexto,
} from "@/lib/auditoria/reporte-ejecutivo/prompt";
import type { ReporteEjecutivoUsoScope } from "@/lib/definitions";


/** Tope de filas de bitácora leídas para el resumen factual (agregación en memoria). */
export const MAX_EVENTOS_AUDITORIA = 25_000;

export type GenerarReporteEjecutivoResult =
  | {
      ok: true;
      report: ReporteEjecutivoUso;
      model: string;
      generatedAt: string;
      totalAcciones: number;
      totalUsuarios: number;
      totalNovedades: number;
      porcentajeAdopcion: number | null;
      desdeCache: boolean;
      /** Versiones de Novedades realmente incluidas: es lo que se registra al marcar el envío. */
      versionIdsIncluidos: number[];
      /** Cambios de esas versiones que este reporte dejó fuera a pedido. */
      cambiosOmitidos: number[];
    }
  | { ok: false; message: string };

function recortarTexto(texto: string | null | undefined, max: number): string | null {
  if (!texto) return null;
  const limpio = texto.trim();
  if (limpio.length <= max) return limpio;
  return `${limpio.slice(0, max - 1).trim()}…`;
}

/** Misma regla que el tablero (ver `rango.ts`): así coinciden sus cifras. */
const parseRango = parseRangoReporte;

export function crearContextoNovedades(
  versiones: Array<{
    number: string;
    title: string;
    summary: string | null;
    status: string;
    releasedAt: Date | null;
    changes: Array<{
      id: number;
      type: string;
      title: string;
      description: string;
      moduleKey: string | null;
      route: string | null;
      howTo: string | null;
      example: string | null;
      featureStatus: string;
    }>;
  }>,
  filtro: FiltroPublicacion,
  /** Cambios que este reporte deja fuera a pedido (ver `omitir-novedades.ts`). */
  omitidos: ReadonlySet<number> = new Set(),
): {
  contexto: NovedadReporteEjecutivoContexto[];
  totalChanges: number;
  includedChanges: number;
  excluidosEnDesarrollo: number;
  excluidosNoPublicados: number;
  omitidosAPedido: number;
  planos: CambioNovedadContexto[];
} {
  let includedChanges = 0;
  let totalChanges = 0;
  let excluidosEnDesarrollo = 0;
  let excluidosNoPublicados = 0;
  let omitidosAPedido = 0;
  const planos: CambioNovedadContexto[] = [];

  const contexto: NovedadReporteEjecutivoContexto[] = versiones.map((version) => {
    // Alcance del reporte: solo funcionalidades disponibles y de módulos
    // publicados para todos los usuarios.
    const publicables = filtrarCambiosPublicados({
      cambios: version.changes.map((c) => ({
        ...c,
        modulo: c.moduleKey,
        estadoFuncionalidad: c.featureStatus,
      })),
      filtro,
      clavesConocidas: MODULOS_PLATAFORMA_KEYS,
    });
    excluidosEnDesarrollo += publicables.enDesarrollo;
    excluidosNoPublicados += publicables.moduloNoPublicado + publicables.sinModulo;
    totalChanges += publicables.cambios.length;
    const cambios = publicables.cambios
      // Lo omitido a pedido no entra en ninguna parte del documento: ni en las
      // tablas de avances ni en los conteos ni en la adopción.
      .filter((change) => {
        if (omitidos.has(change.id)) {
          omitidosAPedido += 1;
          return false;
        }
        includedChanges += 1;
        return true;
      })
      .map((change) => {
        // Al cliente no se le nombra el proveedor ni el modelo, y la
        // descripción termina en oración completa (ver `texto-avances.ts`).
        const item = {
          tipo: change.type,
          titulo: tituloAvance(change.title),
          descripcion: descripcionAvance(change.description),
          modulo: recortarTexto(change.moduleKey, 80),
          ruta: recortarTexto(change.route, 120),
          comoOperar: descripcionAvance(change.howTo, 450) || null,
          ejemplo: descripcionAvance(change.example, 450) || null,
          estadoFuncionalidad: change.featureStatus,
        };
        planos.push({
          versionNumero: version.number,
          versionTitulo: version.title,
          tipo: item.tipo,
          titulo: item.titulo,
          descripcion: item.descripcion,
          modulo: item.modulo,
          ruta: item.ruta,
          comoOperar: item.comoOperar,
          ejemplo: item.ejemplo,
          estadoFuncionalidad: item.estadoFuncionalidad,
        });
        return item;
      });

    return {
      numero: version.number,
      titulo: tituloAvance(version.title),
      resumen: version.summary ? descripcionAvance(version.summary, 500) : null,
      estado: version.status,
      publicadoEn: version.releasedAt ? version.releasedAt.toISOString() : null,
      cambios,
    };
  });

  return {
    // Las versiones que quedaron sin avances publicables no se le cuentan al cliente.
    contexto: contexto.filter((v) => v.cambios.length > 0),
    totalChanges,
    includedChanges,
    excluidosEnDesarrollo,
    excluidosNoPublicados,
    omitidosAPedido,
    planos,
  };
}

function limpiarCercasCodigo(texto: string): string {
  return texto
    .trim()
    .replace(/^```(?:html)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function extraerDocumentoHtml(texto: string): string {
  const limpio = limpiarCercasCodigo(texto);
  const doctypeIndex = limpio.search(/<!doctype/i);
  const htmlIndex = limpio.search(/<html[\s>]/i);
  const inicio = [doctypeIndex, htmlIndex].filter((index) => index >= 0).sort((a, b) => a - b)[0];
  return inicio === undefined ? limpio : limpio.slice(inicio).trim();
}

/**
 * Limpia HTML del modelo: scripts y controles no funcionales (botones/CTA
 * decorativos del estilo newsletter que no navegan a nada).
 */
function sanitizarHtmlReporte(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, "")
    .replace(/<object[\s\S]*?<\/object>/gi, "")
    .replace(/<embed[\s\S]*?>/gi, "")
    .replace(/<form[\s\S]*?<\/form>/gi, "")
    .replace(/<button\b[\s\S]*?<\/button>/gi, "")
    // CTA decorativos típicos generados por el modelo (enlace o span "botón").
    .replace(
      /<(a|div|span|p)\b[^>]*(?:class|style)=["'][^"']*(?:btn|button|cta|call-to-action)[^"']*["'][^>]*>[\s\S]*?<\/\1>/gi,
      "",
    )
    .replace(
      /<(a|div|span)\b[^>]*>\s*(?:Ver detalle(?: del período)?|Leer(?: el)? reporte(?: completo)?|Leer más|Ver más|Continuar)\s*<\/\1>/gi,
      "",
    )
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/javascript:/gi, "");
}

function extraerTituloHtml(html: string): string {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1];
  const crudo = (title ?? h1 ?? "Reporte de uso y avances")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return crudo.slice(0, 180) || "Reporte de uso y avances";
}

function envolverHtmlBasico(cuerpo: string): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8" />
<title>Reporte de uso y avances</title>
<style>
  body { font-family: Lato, Arial, Helvetica, sans-serif; color: #3C3C3B; margin: 32px; line-height: 1.5; }
  h1 { font-size: 22px; font-weight: 300; color: #001871; }
</style>
</head>
<body>
${cuerpo}
</body>
</html>`;
}

function normalizarReporteHtml(texto: string): ReporteEjecutivoUso {
  let html = normalizarTerminologiaVisibleReporte(
    sanitizarHtmlReporte(extraerDocumentoHtml(texto)),
  );
  if (!/<html[\s>]/i.test(html)) html = envolverHtmlBasico(html);
  if (!/^<!doctype/i.test(html.trim())) html = `<!DOCTYPE html>\n${html}`;
  if (!/<body[\s>]/i.test(html)) {
    html = /<\/head>/i.test(html)
      ? html.replace(/<\/head>/i, "</head>\n<body>")
      : html.replace(/<html([^>]*)>/i, "<html$1>\n<body>");
  }
  if (!/<\/body>/i.test(html)) {
    html = /<\/html>/i.test(html) ? html.replace(/<\/html>/i, "</body>\n</html>") : `${html}\n</body>`;
  }
  if (!/<\/html>/i.test(html)) html += "\n</html>";
  return {
    titulo: extraerTituloHtml(html) || "Reporte de uso y avances",
    html,
  };
}

/** Quién genera el reporte: la persona de la sesión o el sistema (`id` null). */
export type ActorReporte = { id: number | null; nombre: string };

/**
 * Genera el reporte (el documento HTML se arma entero en código, sin IA) a partir de la
 * bitácora de auditoría y las novedades publicadas, y guarda su instantánea. Con el
 * mismo alcance reutiliza la instantánea (salvo `actualizar`).
 *
 * `opciones` ya viene validado con `ReporteEjecutivoUsoScopeSchema`. `obtenerActor` se
 * consulta al final, justo antes de guardar y auditar, como lo hacía la acción.
 */
export async function generarReporteEjecutivoNucleo(params: {
  opciones: ReporteEjecutivoUsoScope;
  obtenerActor: () => Promise<ActorReporte | null>;
  signal?: AbortSignal;
  /**
   * Reutiliza una instantánea solo si se generó con el período ya terminado (su corte llega a la
   * fecha final): una hecha antes, con datos parciales, se vuelve a generar. La usa el envío por
   * correo; la acción de la pantalla no la pasa y conserva su comportamiento.
   */
  soloReutilizarSiCompleta?: boolean;
}): Promise<GenerarReporteEjecutivoResult> {
  const { opciones: datos, obtenerActor, signal, soloReutilizarSiCompleta = false } = params;

  const rango = parseRango(datos.desde, datos.hasta);
  if (!rango) {
    return {
      ok: false,
      message: "El rango de fechas no es válido o supera 366 días. Ajusta el período e inténtalo de nuevo.",
    };
  }

  try {
    signal?.throwIfAborted();
    // Avances del reporte: las versiones publicadas DESPLEGADAS en el período
    // (ver `novedades-periodo.ts`); dos períodos distintos no repiten avances.
    // Entran en la clave: si después se publica una versión desplegada en este
    // período, el reporte guardado deja de ser el del alcance y se recalcula.
    const filtroVersiones = filtroVersionesDelPeriodo(rango.desde, rango.hasta);
    const versionesDelPeriodo = await prisma.platformVersion.findMany({
      where: filtroVersiones,
      select: { id: true, changes: { select: { id: true } } },
    });
    const versionIds = versionesDelPeriodo.map((v) => v.id).sort((a, b) => a - b);
    // Lo omitido a pedido también entra en la clave: otra selección es otro reporte.
    const cambiosOmitidos = omitidosDelPeriodo(
      datos.cambiosOmitidos,
      versionesDelPeriodo.flatMap((v) => v.changes.map((c) => c.id)),
    );
    const clave = claveAlcanceReporte(rango.desde, rango.hasta, versionIds, cambiosOmitidos);
    const anterior = await leerInstantanea(clave);
    signal?.throwIfAborted();
    if (anterior && !datos.actualizar && (!soloReutilizarSiCompleta || instantaneaCubreElPeriodo(anterior.corte, rango.hasta))) {
      return { ok: true, ...anterior, desdeCache: true };
    }
    const corte = new Date(Math.min(Date.now(), rango.hasta.getTime()));
    const [[eventosRaw, conexionesRaw, navegacionesRaw, versiones, clientes, usuarios], modulosPublicados] = await Promise.all([
      prisma.$transaction(async (tx) => Promise.all([
      tx.auditEntry.findMany({
        where: {
          createdAt: { gte: rango.desde, lte: corte },
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: MAX_EVENTOS_AUDITORIA + 1,
        select: {
          user: true,
          action: true,
          entity: true,
          detail: true,
          clientId: true,
          createdAt: true,
        },
      }),
      tx.accessLog.groupBy({
        by: ["userName"],
        where: {
          kind: "ingreso",
          createdAt: { gte: rango.desde, lte: corte },
        },
        _count: { userName: true },
        orderBy: { userName: "asc" },
      }),
      // Por ruta Y cuenta: las visitas se filtran por `userId` a las cuentas del uso.
      tx.accessLog.groupBy({
        by: ["path", "userId"],
        where: {
          kind: "navegacion",
          createdAt: { gte: rango.desde, lte: corte },
        },
        _count: { path: true },
        orderBy: { path: "asc" },
      }),
      tx.platformVersion.findMany({
        where: { id: { in: versionIds }, status: "publicada" },
        orderBy: [{ order: "desc" }, { id: "desc" }],
        include: { changes: { orderBy: [{ order: "asc" }, { id: "asc" }] } },
      }),
      tx.client.findMany({
        select: { id: true, name: true },
      }),
      tx.user.findMany({ select: { id: true, name: true, email: true } }),
      ]), { isolationLevel: "RepeatableRead" }),
      modulosPublicadosParaTodos(),
    ]);

    signal?.throwIfAborted();
    if (eventosRaw.length > MAX_EVENTOS_AUDITORIA) {
      return { ok: false, message: "El período supera el límite de movimientos del reporte. Reduce el rango para obtener cifras completas." };
    }
    // Ids realmente usados: es lo que se guarda al marcar el reporte como enviado.
    const versionIdsIncluidos = versiones.map((v) => v.id);

    const eventosCrudos: EventoAuditoria[] = eventosRaw.map((e) => ({
      user: e.user,
      action: e.action,
      entity: e.entity,
      detail: e.detail,
      clientId: e.clientId,
      createdAt: e.createdAt,
    }));

    // Alcance: la bitácora de módulos aún no publicados no se le reporta al cliente.
    const filtro: FiltroPublicacion = { modulosPublicados };
    const alcanceUso = filtrarEventosPublicados({
      eventos: eventosCrudos,
      clasificar: (e) => clasificarFamilia(e.action, e.entity, e.detail),
      filtro,
    });
    // Las cuentas de prueba que usa una persona del equipo se le suman a su cuenta
    // personal (ver `CUENTAS_QUE_SE_SUMAN`).
    const alias = aliasDeActores(usuarios);
    const eventos = unificarActores(alcanceUso.eventos, alias);
    // Visitas solo de las cuentas del uso, como las operaciones (sin Xentria ni pruebas).
    const alcanceNavegaciones = filtrarNavegacionesPublicadas({
      navegaciones: visitasDeCuentas(
        navegacionesRaw.map((navegacion) => ({
          ruta: navegacion.path,
          userId: navegacion.userId,
          total: navegacion._count.path,
        })),
        idsDelUso(usuarios),
      ),
      filtro,
    });

    const nombresClientes = new Map(clientes.map((c) => [c.id, c.name]));
    // El reporte mide el uso del equipo de Russell: fuera los actores técnicos,
    // las cuentas internas de Xentria y las de prueba (ver `usuarios-reporte.ts`).
    const correosUsuarios = correosDelReporte(usuarios);
    const usuariosRegistrados = nombresDelReporte(usuarios);
    // «Usuarios activos: X de Y»: cuentas del equipo que usaron la plataforma en
    // el período (null si no se pudo medir: el documento omite el indicador).
    const usuariosActivos = await construirUsuariosActivos({ desde: rango.desde, hasta: corte });
    signal?.throwIfAborted();
    const uso = calcularResumenUso({
      eventos,
      conexiones: conexionesRaw.map((conexion) => ({
        usuario: actorUnificado(conexion.userName, alias),
        total: conexion._count.userName,
      })),
      navegaciones: alcanceNavegaciones.navegaciones,
      periodoDesde: rango.desde,
      periodoHasta: rango.hasta,
      nombresClientes,
      correosUsuarios,
      usuariosRegistrados,
      usuariosActivos,
    });

    // Comparativo contra el período anterior de igual duración, cortado en el mismo
    // punto si el actual sigue abierto. Los dos lados se miden sin cuentas de prueba
    // ni genéricas; el del período actual se guarda con el reporte
    // (`fuente.usoComparable`) como constancia de las cifras comparadas.
    const usoComparable = await construirUsoComparable({
      desde: rango.desde,
      hasta: rango.hasta,
      corte,
      filtro,
      nombresClientes,
    });
    const comparativo = usoComparable
      ? await construirComparativoUso({
          usoComparableActual: usoComparable,
          desde: rango.desde,
          hasta: rango.hasta,
          corte,
          filtro,
          nombresClientes,
        })
      : null;

    // Costos de IA del período, contra el mismo tramo anterior que el uso. El
    // gasto sí incluye a las cuentas de prueba: su consumo se paga igual.
    const costos = await construirCostosIAReporte({
      desde: rango.desde,
      hasta: rango.hasta,
      corte,
      ventanaPrevia: comparativo?.ventanaPrevia ?? null,
      base: comparativo?.base ?? null,
      usuariosRegistrados: nombresDelGastoIA(usuarios),
    });

    // Tickets que el equipo de Russell reportó y que se atendieron en el
    // período; null si no se pudieron leer (la sección se omite, no se inventa).
    const tickets = await construirTicketsAtendidosReporte({
      desde: rango.desde,
      hasta: rango.hasta,
      corte,
    });

    const {
      contexto: novedades,
      totalChanges,
      includedChanges,
      excluidosEnDesarrollo,
      excluidosNoPublicados,
      omitidosAPedido,
      planos,
    } = crearContextoNovedades(versiones, filtro, new Set(cambiosOmitidos));

    const conteos = conteosPorFamiliaCanon(eventos, usuariosRegistrados);
    // La adopción se mide solo sobre funcionalidades NUEVAS; las mejoras y
    // correcciones se cuentan en su propia sección del documento.
    const adopcion = evaluarAdopcion({ cambios: soloFuncionalidadesNuevas(planos), conteosPorFamilia: conteos });

    // El documento se arma ENTERO en código —cifras y lectura editorial—, así
    // que dos generaciones del mismo período son idénticas. Antes la frase
    // editorial la elegía un modelo entre un vocabulario cerrado y, aun con
    // temperatura 0, cambiaba entre corridas sin que cambiaran los datos.
    signal?.throwIfAborted();
    const report = normalizarReporteHtml(construirDocumentoConsistente({
      uso, adopcion, novedades, comparativo, costos, tickets,
      corte: corte.toISOString(),
    }).html);

    const actor = await obtenerActor();
    signal?.throwIfAborted();


    signal?.throwIfAborted();
    const final = await guardarInstantanea({
      clave, anteriorId: anterior?.id ?? null, report,
      modelo: MODELO_REPORTE_DETERMINISTA,
      desde: rango.desde, hasta: rango.hasta,
      totalAcciones: uso.totalAcciones, totalUsuarios: uso.totalUsuarios,
      totalNovedades: adopcion.totalCambios, porcentajeAdopcion: adopcion.porcentajeAdopcion,
      versionIdsIncluidos, cambiosOmitidos, corte: corte.toISOString(),
      fuente: { uso, usoComparable, adopcion, novedades, comparativo, costos, tickets }, userId: actor?.id ?? null,
    });
    signal?.throwIfAborted();
    await logAudit({
      user: actor?.nombre ?? "Sistema",
      action: "GENERÓ REPORTE IA",
      entity: "Uso y adopción",
      detail: `Generó reporte para gerencia (documento ${MODELO_REPORTE_DETERMINISTA}: ${uso.totalAcciones} acciones, ${uso.totalUsuarios} usuarios, ${includedChanges}/${totalChanges} novedades, ${
        `${versiones.length} versiones desplegadas en el período`
      }${omitidosAPedido ? `, ${omitidosAPedido} novedades omitidas a pedido` : ""}). Registró ${uso.totalNavegaciones} navegaciones separadas de las operaciones. Alcance solo publicado: excluyó ${alcanceUso.descartados} acciones de módulos no publicados y ${alcanceNavegaciones.descartadas} navegaciones fuera de familias operativas publicadas, ${excluidosEnDesarrollo} novedades en desarrollo y ${excluidosNoPublicados} de módulos no publicados.`,
    });
    return { ok: true, ...final, desdeCache: false };
  } catch (e) {
    if (signal?.aborted) return { ok: false, message: "Generación cancelada." };
    return { ok: false, message: mensajeErrorOpenCode("generarReporteEjecutivoUso", e) };
  }
}
