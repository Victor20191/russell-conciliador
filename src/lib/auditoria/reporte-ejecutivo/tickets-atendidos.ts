// Qué tickets se atendieron en el período del reporte y cuál fue la solución.
//
// El reporte ya cuenta cómo se usó la plataforma y qué cambió en ella; esta
// sección dice qué se le resolvió al equipo de Russell cuando pidió ayuda desde
// `/reportes`. Cuatro decisiones la definen:
//
//  1. **Mismo alcance que el resto del reporte.** Solo la bandeja interna
//     (tickets con creador) y solo lo que reportó el equipo del cliente: una
//     cuenta existente que no sea de Xentria, que construye y prueba la
//     plataforma (ver `usuarios-reporte`, de donde sale la regla). Un creador
//     que ya no existe queda FUERA, igual que sus acciones en el resto del
//     reporte: no hay forma de probar que era del cliente, y en producción los
//     49 tickets de una cuenta borrada parecen hallazgos de pruebas cargados en
//     bloque, y contarlos le atribuiría al cliente un trabajo que no pidió.
//  2. **Un ticket cuenta en el período en que se TRABAJÓ**: si dentro de él pasó
//     a «En proceso», o pasó a «Resuelto» o «Cerrado» desde un estado sin
//     resolver (23/Nov/2026: «atendido» incluye empezar a trabajarlo). Pasar de
//     «Resuelto» a «Cerrado» no es una atención nueva: sin esa regla, el ticket
//     resuelto en un reporte reaparecería en el siguiente apenas alguien lo
//     cierre. El ticket que se empezó en un período y se resolvió en otro sale en
//     los dos, cada uno con lo que se hizo en él. Dentro del período sale una sola
//     vez, con el último estado al que llegó en él (no el de hoy: un reporte
//     pasado no cambia porque el ticket se reabra después).
//  3. **Los tickets anteriores a la tabla de eventos** no tienen historia: su
//     atención se deriva de `resolvedAt`, igual que hace el hilo del ticket
//     (`construirHistorialTicket`). Sin esa marca no se puede ubicar en ningún
//     período y no se inventa una fecha.
//  4. **La solución es lo que se le dijo al cliente**: la respuesta oficial; si
//     no la hay, el último mensaje de Xentria del hilo; si tampoco, una frase
//     que lo dice sin maquillarlo.
//
// Módulo PURO: recibe los tickets ya leídos y no toca BD ni reloj.
import {
  ESTADO_TICKET_CERRADO,
  ESTADO_TICKET_EN_PROCESO,
  ESTADO_TICKET_RESUELTO,
  etiquetaEstadoTicket,
} from "@/lib/soporte-estados";
import { esCuentaInterna } from "./usuarios-reporte";

/** Los estados que muestran que un ticket se atendió: se empezó, se resolvió o se cerró. */
export const ESTADOS_ATENDIDOS = [ESTADO_TICKET_EN_PROCESO, ESTADO_TICKET_RESUELTO, ESTADO_TICKET_CERRADO] as const;
export type EstadoAtendido = (typeof ESTADOS_ATENDIDOS)[number];

export function esEstadoAtendido(estado: string | null | undefined): estado is EstadoAtendido {
  return typeof estado === "string" && (ESTADOS_ATENDIDOS as readonly string[]).includes(estado);
}

/** «Resuelto» o «Cerrado»: el ticket ya tiene una salida. */
function esEstadoFinal(estado: string | null | undefined): boolean {
  return estado === ESTADO_TICKET_RESUELTO || estado === ESTADO_TICKET_CERRADO;
}

/**
 * ¿Este cambio de estado es una atención? Entrar a «En proceso» desde otro
 * estado, o entrar a «Resuelto»/«Cerrado» desde uno sin resolver. Pasar de
 * «Resuelto» a «Cerrado» (o al revés) es trámite, no atención.
 */
export function esMovimientoDeAtencion(e: Pick<EventoTicketReporte, "estadoAnterior" | "estadoNuevo">): boolean {
  if (e.estadoNuevo === ESTADO_TICKET_EN_PROCESO) return e.estadoAnterior !== ESTADO_TICKET_EN_PROCESO;
  return esEstadoFinal(e.estadoNuevo) && !esEstadoFinal(e.estadoAnterior);
}

/** Cambio de estado de un ticket (`eventos_ticket_soporte`), con la fecha ya en ISO. */
export type EventoTicketReporte = {
  estadoAnterior: string | null;
  estadoNuevo: string;
  creadoEn: string;
};

/** Un ticket tal como lo lee la consulta, antes de decidir si entra al reporte. */
export type TicketCandidato = {
  codigo: string;
  asunto: string;
  menuEtiqueta: string | null;
  rutaEtiqueta: string | null;
  /** «Nombre Apellido» tal como los guardó el ticket. */
  reportante: string;
  /** Correo de la cuenta que lo creó; null si esa cuenta ya no existe (el ticket queda fuera). */
  correoCreador: string | null;
  /** Estado ACTUAL del ticket. */
  estado: string;
  solucion: string | null;
  resueltoEn: string | null;
  eventos: readonly EventoTicketReporte[];
  /** Cuerpo del último mensaje del hilo escrito por Xentria, si lo hay. */
  ultimoMensajeXentria: string | null;
};

export type OrigenSolucion = "oficial" | "mensaje" | "ninguna";

export type TicketAtendido = {
  codigo: string;
  asunto: string;
  /** «Módulo · pantalla» como lo ve quien reporta; null si el ticket no lo trae. */
  ubicacion: string | null;
  reportante: string;
  /** Instante del estado que se muestra (ISO); el documento lo presenta en el calendario de Colombia. */
  atendidoEn: string;
  /** Último estado al que llegó dentro del período (no el de hoy). */
  estado: EstadoAtendido;
  /** Texto ya resuelto: la respuesta, el último mensaje o la frase de «sin respuesta». */
  solucion: string;
  origenSolucion: OrigenSolucion;
};

export type TicketsAtendidos = {
  /** Período declarado del reporte, en ISO. */
  desde: string;
  hasta: string;
  total: number;
  enProceso: number;
  cerrados: number;
  resueltos: number;
  tickets: TicketAtendido[];
};

/**
 * ¿Lo reportó el equipo del cliente? Una cuenta que existe y no es de Xentria:
 * la misma regla con la que el reporte decide de quién cuenta el uso
 * (`usuariosDelReporte`). Sin correo —la cuenta se borró— no se puede afirmar,
 * y se deja fuera.
 */
export function esTicketDelCliente(correoCreador: string | null | undefined): boolean {
  if (!correoCreador?.trim()) return false;
  return !esCuentaInterna(correoCreador);
}

function ms(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

/**
 * Cómo se atendió el ticket dentro de `[desde, hasta]`, o null si no se trabajó
 * en ese período.
 *
 * Con historia: cuenta si hubo al menos un movimiento de atención en la ventana
 * (`esMovimientoDeAtencion`); el estado y el instante que se muestran son los
 * del ÚLTIMO cambio a un estado atendido dentro de ella (así, resuelto y luego
 * cerrado en el mismo período sale «Cerrado»). Sin historia —un ticket anterior
 * a la tabla de eventos— la atención es `resolvedAt`, con su estado de hoy.
 */
export function atencionEnPeriodo(
  ticket: Pick<TicketCandidato, "eventos" | "resueltoEn" | "estado">,
  ventana: { desde: number; hasta: number },
): { instante: number; estado: EstadoAtendido } | null {
  const dentro = (t: number) => t >= ventana.desde && t <= ventana.hasta;
  const eventos = ticket.eventos
    .map((e) => ({ ...e, t: ms(e.creadoEn) }))
    .filter((e): e is typeof e & { t: number } => e.t !== null)
    .sort((a, b) => a.t - b.t);

  // Con algún movimiento de atención registrado, la historia manda. Si no hay
  // ninguno (se resolvió antes de que existiera la tabla y solo se registró el
  // cierre), vale `resolvedAt`, como en los tickets sin historia.
  if (eventos.some(esMovimientoDeAtencion)) {
    const enVentana = eventos.filter((e) => dentro(e.t));
    if (!enVentana.some(esMovimientoDeAtencion)) return null;
    const ultimo = [...enVentana].reverse().find((e) => esEstadoAtendido(e.estadoNuevo));
    return ultimo ? { instante: ultimo.t, estado: ultimo.estadoNuevo as EstadoAtendido } : null;
  }

  const resuelto = ms(ticket.resueltoEn);
  if (resuelto === null || !dentro(resuelto)) return null;
  return { instante: resuelto, estado: esEstadoFinal(ticket.estado) ? (ticket.estado as EstadoAtendido) : ESTADO_TICKET_RESUELTO };
}

/** Instante (ms) de la atención dentro de la ventana, o null (ver `atencionEnPeriodo`). */
export function fechaDeAtencion(
  ticket: Pick<TicketCandidato, "eventos" | "resueltoEn" | "estado">,
  ventana: { desde: number; hasta: number },
): number | null {
  return atencionEnPeriodo(ticket, ventana)?.instante ?? null;
}

/** Texto de usuario: sin retornos de carro, sin blancos en los bordes. */
export function limpiarTextoTicket(texto: string | null | undefined): string {
  return (texto ?? "").replace(/\r\n?/g, "\n").trim();
}

/** Frase para el ticket atendido sin nada que mostrar como respuesta. */
export function fraseSinRespuesta(estado: EstadoAtendido): string {
  if (estado === ESTADO_TICKET_EN_PROCESO) return "En proceso: todavía sin respuesta documentada";
  return `${estado === ESTADO_TICKET_CERRADO ? "Cerrado" : "Resuelto"} sin respuesta documentada`;
}

/** La solución que se le muestra al lector, con su procedencia. */
export function solucionDelTicket(
  ticket: Pick<TicketCandidato, "solucion" | "ultimoMensajeXentria">,
  estado: EstadoAtendido,
): { texto: string; origen: OrigenSolucion } {
  const oficial = limpiarTextoTicket(ticket.solucion);
  if (oficial) return { texto: oficial, origen: "oficial" };
  const mensaje = limpiarTextoTicket(ticket.ultimoMensajeXentria);
  if (mensaje) return { texto: mensaje, origen: "mensaje" };
  return { texto: fraseSinRespuesta(estado), origen: "ninguna" };
}

/**
 * «Módulo · pantalla». Mismo formato que la bandeja de `/reportes`
 * (`etiquetaUbicacionNovedad`), repetido aquí para no arrastrar el árbol del
 * menú a un módulo puro.
 */
export function ubicacionDelTicket(rutaEtiqueta: string | null, menuEtiqueta: string | null): string | null {
  const ruta = rutaEtiqueta?.trim() || null;
  const menu = menuEtiqueta?.trim() || null;
  if (ruta && menu && ruta !== menu) return `${ruta} · ${menu}`;
  return ruta ?? menu;
}

/**
 * Los tickets atendidos en `[desde, hasta]`, ordenados por fecha de atención y
 * código. `corte` acota la ventana cuando el período llega hasta hoy: lo
 * posterior a la consulta no existe todavía.
 */
export function construirTicketsAtendidos(params: {
  candidatos: readonly TicketCandidato[];
  desde: string;
  hasta: string;
  corte?: string | null;
}): TicketsAtendidos {
  const inicio = ms(params.desde) ?? Number.NEGATIVE_INFINITY;
  const fin = ms(params.hasta) ?? Number.POSITIVE_INFINITY;
  const corte = ms(params.corte);
  const ventana = { desde: inicio, hasta: corte !== null && corte < fin ? corte : fin };

  const tickets: TicketAtendido[] = [];
  for (const candidato of params.candidatos) {
    if (!esTicketDelCliente(candidato.correoCreador)) continue;
    // Lo que se hizo EN el período: un reporte pasado no cambia si el ticket se reabre después.
    const atencion = atencionEnPeriodo(candidato, ventana);
    if (atencion === null) continue;
    const solucion = solucionDelTicket(candidato, atencion.estado);
    tickets.push({
      codigo: candidato.codigo,
      asunto: limpiarTextoTicket(candidato.asunto),
      ubicacion: ubicacionDelTicket(candidato.rutaEtiqueta, candidato.menuEtiqueta),
      reportante: candidato.reportante.trim(),
      atendidoEn: new Date(atencion.instante).toISOString(),
      estado: atencion.estado,
      solucion: solucion.texto,
      origenSolucion: solucion.origen,
    });
  }

  tickets.sort(
    (a, b) =>
      Date.parse(a.atendidoEn) - Date.parse(b.atendidoEn) ||
      a.codigo.localeCompare(b.codigo, "es", { numeric: true }),
  );

  return {
    desde: params.desde,
    hasta: params.hasta,
    total: tickets.length,
    enProceso: tickets.filter((t) => t.estado === ESTADO_TICKET_EN_PROCESO).length,
    cerrados: tickets.filter((t) => t.estado === ESTADO_TICKET_CERRADO).length,
    resueltos: tickets.filter((t) => t.estado === ESTADO_TICKET_RESUELTO).length,
    tickets,
  };
}

/** «5 cerrados, 2 resueltos, 1 en proceso»; vacío si no hubo ninguno. Singular cuando es uno. */
export function desgloseTicketsAtendidos(
  t: Pick<TicketsAtendidos, "cerrados" | "resueltos"> & { enProceso?: number },
): string {
  const partes: string[] = [];
  if (t.cerrados > 0) partes.push(`${t.cerrados} ${t.cerrados === 1 ? "cerrado" : "cerrados"}`);
  if (t.resueltos > 0) partes.push(`${t.resueltos} ${t.resueltos === 1 ? "resuelto" : "resueltos"}`);
  // Las instantáneas anteriores no traen el conteo de «en proceso».
  const enProceso = t.enProceso ?? 0;
  if (enProceso > 0) partes.push(`${enProceso} en proceso`);
  return partes.join(", ");
}

/** Estado como lo ve el lector («En proceso», «Cerrado», «Resuelto»). */
export function etiquetaEstadoAtendido(estado: EstadoAtendido): string {
  return etiquetaEstadoTicket(estado);
}

/**
 * Lo que necesita la tarjeta del tablero: sin el texto de las soluciones, que
 * solo se lee en el documento. Evita mandarle al navegador cinco mil caracteres
 * por ticket para pintar una lista de códigos.
 */
export type TicketsAtendidosVista = Omit<TicketsAtendidos, "tickets"> & {
  tickets: Pick<TicketAtendido, "codigo" | "asunto" | "ubicacion" | "atendidoEn" | "estado">[];
};

export function vistaTicketsAtendidos(t: TicketsAtendidos | null | undefined): TicketsAtendidosVista | null {
  if (!t) return null;
  return {
    ...t,
    tickets: t.tickets.map(({ codigo, asunto, ubicacion, atendidoEn, estado }) => ({
      codigo, asunto, ubicacion, atendidoEn, estado,
    })),
  };
}
