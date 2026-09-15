import { ESTADOS_TICKET, type EstadoTicket } from "./soporte-estados";

export const ESTADOS_OCULTOS_TICKETS_INICIALES: readonly EstadoTicket[] = ["resuelto", "cerrado"];

/** Sin preferencia aplica los valores iniciales; [] es una elección explícita.
 * El orden estable y la deduplicación facilitan comparar y guardar la selección. */
export function resolverEstadosOcultosTickets(estados?: readonly string[] | null): EstadoTicket[] {
  const seleccion = new Set(estados ?? ESTADOS_OCULTOS_TICKETS_INICIALES);
  return ESTADOS_TICKET.filter((estado) => seleccion.has(estado));
}

export type GuardarEstadosOcultosTicketsState = {
  ok: boolean;
  message?: string;
  estadosOcultos?: EstadoTicket[];
};
