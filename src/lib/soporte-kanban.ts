import {
  ESTADO_TICKET_ABIERTO,
  ESTADO_TICKET_CERRADO,
  ESTADO_TICKET_EN_PROCESO,
  ESTADO_TICKET_RESUELTO,
  ESTADOS_TICKET,
  ETIQUETA_ESTADO_TICKET,
  esEstadoTicket,
  requiereSolucion,
  type EstadoTicket,
} from "./soporte-estados";
import type { DominioReporte } from "./soporte-dominios";

/**
 * Tarjeta del tablero Kanban de `/reportes`. Es la misma información de la
 * tabla más `updatedAt`: el tablero mueve tickets y `cambiarEstadoTicket`
 * exige la versión del ticket para no pisar el cambio de otra persona.
 * Las fechas viajan como ISO porque el tablero se pinta en el cliente.
 */
export type TicketKanban = {
  id: number;
  code: string;
  subject: string;
  reportante: string;
  esMio: boolean;
  ubicacion: string | null;
  /** Origen del reportante (Russell / Xentria / otros), para el filtro del listado. */
  dominio: DominioReporte;
  status: string;
  adjuntos: number;
  createdAt: string;
  updatedAt: string;
};

/**
 * Las columnas del pipeline, en el orden en que avanza una novedad. El orden
 * NO se deriva de `ESTADOS_TICKET` por casualidad: es el mismo, pero aquí es
 * una decisión de producto (izquierda = entra, derecha = termina).
 */
export const COLUMNAS_KANBAN: readonly {
  estado: EstadoTicket;
  etiqueta: string;
  tono: "warn" | "blue" | "ok" | "ink";
  ayuda: string;
}[] = [
  {
    estado: ESTADO_TICKET_ABIERTO,
    etiqueta: ETIQUETA_ESTADO_TICKET[ESTADO_TICKET_ABIERTO],
    tono: "warn",
    ayuda: "Entró y todavía nadie la tomó.",
  },
  {
    estado: ESTADO_TICKET_EN_PROCESO,
    etiqueta: ETIQUETA_ESTADO_TICKET[ESTADO_TICKET_EN_PROCESO],
    tono: "blue",
    ayuda: "Xentria la está atendiendo.",
  },
  {
    estado: ESTADO_TICKET_RESUELTO,
    etiqueta: ETIQUETA_ESTADO_TICKET[ESTADO_TICKET_RESUELTO],
    tono: "ok",
    ayuda: "Se solucionó y quedó documentada.",
  },
  {
    estado: ESTADO_TICKET_CERRADO,
    etiqueta: ETIQUETA_ESTADO_TICKET[ESTADO_TICKET_CERRADO],
    tono: "ink",
    ayuda: "Cerrada sin más gestión.",
  },
] as const;

/**
 * Reparte las tarjetas en las cuatro columnas conservando el orden de llegada.
 * Un estado desconocido (dato viejo o migración a medias) NO se pierde en
 * silencio: cae en «Abierto», que es la columna que exige atención.
 */
export function agruparTicketsKanban(
  filas: readonly TicketKanban[],
): Record<EstadoTicket, TicketKanban[]> {
  const columnas = Object.fromEntries(
    ESTADOS_TICKET.map((estado) => [estado, [] as TicketKanban[]]),
  ) as Record<EstadoTicket, TicketKanban[]>;
  for (const fila of filas) {
    const destino = esEstadoTicket(fila.status) ? fila.status : ESTADO_TICKET_ABIERTO;
    columnas[destino].push(fila);
  }
  return columnas;
}

export type MovimientoKanban =
  | { ok: false; motivo: string }
  | { ok: true; ticket: TicketKanban; destino: EstadoTicket; pideSolucion: boolean };

/**
 * Decide si soltar una tarjeta en una columna es un movimiento real. Es puro a
 * propósito: el tablero lo consulta ANTES de tocar el servidor, para no gastar
 * una acción en un arrastre que terminó en su propia columna.
 *
 * `pideSolucion` traduce la regla del servidor (`requiereSolucion`): pasar a
 * «Resuelto» sin explicar cómo se solucionó lo rechaza `cambiarEstadoTicket`,
 * así que el tablero pide el texto en el momento del arrastre.
 */
export function evaluarMovimientoKanban(
  filas: readonly TicketKanban[],
  ticketId: number,
  destino: string,
): MovimientoKanban {
  const ticket = filas.find((fila) => fila.id === ticketId);
  if (!ticket) return { ok: false, motivo: "Este reporte ya no está en el tablero. Recarga la página." };
  if (!esEstadoTicket(destino)) return { ok: false, motivo: "El estado de destino no es válido." };
  if (ticket.status === destino) return { ok: false, motivo: "" };
  return { ok: true, ticket, destino, pideSolucion: requiereSolucion(destino) };
}

/**
 * Aplica el movimiento en memoria para pintar la tarjeta en su nueva columna
 * sin esperar al servidor. La revalidación posterior trae la verdad; si la
 * acción falla, el tablero revierte llamando de nuevo con el estado anterior.
 */
export function moverTicketKanban(
  filas: readonly TicketKanban[],
  ticketId: number,
  destino: EstadoTicket,
): TicketKanban[] {
  return filas.map((fila) => (fila.id === ticketId ? { ...fila, status: destino } : fila));
}
