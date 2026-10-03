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
//  2. **Un ticket cuenta cuando ENTRA a «Resuelto» o «Cerrado».** La fecha de
//     atención es la del primer evento que lo lleva a uno de esos estados desde
//     otro que no lo es. Pasar de «Resuelto» a «Cerrado» no es una atención
//     nueva: sin esa regla, el ticket resuelto en un reporte reaparecería como
//     «atendido» en el siguiente apenas alguien lo cierre, y el cliente vería la
//     misma solución dos veces. Un ticket resuelto y luego cerrado dentro del
//     mismo período cuenta una sola vez, con el estado en que está hoy.
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
  ESTADO_TICKET_RESUELTO,
  etiquetaEstadoTicket,
} from "@/lib/soporte-estados";
import { esCuentaInterna } from "./usuarios-reporte";

/** Los dos estados en los que un ticket cuenta como atendido. */
export const ESTADOS_ATENDIDOS = [ESTADO_TICKET_RESUELTO, ESTADO_TICKET_CERRADO] as const;
export type EstadoAtendido = (typeof ESTADOS_ATENDIDOS)[number];

export function esEstadoAtendido(estado: string | null | undefined): estado is EstadoAtendido {
  return typeof estado === "string" && (ESTADOS_ATENDIDOS as readonly string[]).includes(estado);
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
  /** Instante de la atención (ISO); el documento la presenta en el calendario de Colombia. */
  atendidoEn: string;
  /** Estado final: el que tiene hoy. */
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
 * Instante (ms) en que el ticket fue atendido dentro de `[desde, hasta]`, o
 * null si no lo fue.
 *
 * Con historia, solo cuentan las ENTRADAS a un estado atendido (el estado
 * anterior no lo era); con varias dentro de la ventana manda la primera. Sin
 * ninguna entrada registrada —un ticket anterior a la tabla de eventos— la
 * atención es `resolvedAt`.
 */
export function fechaDeAtencion(
  ticket: Pick<TicketCandidato, "eventos" | "resueltoEn">,
  ventana: { desde: number; hasta: number },
): number | null {
  const dentro = (t: number) => t >= ventana.desde && t <= ventana.hasta;
  const entradas = ticket.eventos
    .filter((e) => esEstadoAtendido(e.estadoNuevo) && !esEstadoAtendido(e.estadoAnterior))
    .map((e) => ms(e.creadoEn))
    .filter((t): t is number => t !== null)
    .sort((a, b) => a - b);

  if (entradas.length > 0) return entradas.find(dentro) ?? null;

  const resuelto = ms(ticket.resueltoEn);
  return resuelto !== null && dentro(resuelto) ? resuelto : null;
}

/** Texto de usuario: sin retornos de carro, sin blancos en los bordes. */
export function limpiarTextoTicket(texto: string | null | undefined): string {
  return (texto ?? "").replace(/\r\n?/g, "\n").trim();
}

/** Frase para el ticket atendido sin nada que mostrar como respuesta. */
export function fraseSinRespuesta(estado: EstadoAtendido): string {
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
    // El estado de hoy decide: un ticket que se reabrió ya no está atendido.
    if (!esEstadoAtendido(candidato.estado)) continue;
    if (!esTicketDelCliente(candidato.correoCreador)) continue;
    const atendido = fechaDeAtencion(candidato, ventana);
    if (atendido === null) continue;
    const solucion = solucionDelTicket(candidato, candidato.estado);
    tickets.push({
      codigo: candidato.codigo,
      asunto: limpiarTextoTicket(candidato.asunto),
      ubicacion: ubicacionDelTicket(candidato.rutaEtiqueta, candidato.menuEtiqueta),
      reportante: candidato.reportante.trim(),
      atendidoEn: new Date(atendido).toISOString(),
      estado: candidato.estado,
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
    cerrados: tickets.filter((t) => t.estado === ESTADO_TICKET_CERRADO).length,
    resueltos: tickets.filter((t) => t.estado === ESTADO_TICKET_RESUELTO).length,
    tickets,
  };
}

/** «5 cerrados, 2 resueltos»; vacío si no hubo ninguno. Singular cuando es uno. */
export function desgloseTicketsAtendidos(t: Pick<TicketsAtendidos, "cerrados" | "resueltos">): string {
  const partes: string[] = [];
  if (t.cerrados > 0) partes.push(`${t.cerrados} ${t.cerrados === 1 ? "cerrado" : "cerrados"}`);
  if (t.resueltos > 0) partes.push(`${t.resueltos} ${t.resueltos === 1 ? "resuelto" : "resueltos"}`);
  return partes.join(", ");
}

/** Estado como lo ve el lector («Cerrado», «Resuelto»). */
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
