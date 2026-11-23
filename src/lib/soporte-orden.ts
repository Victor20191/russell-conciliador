// ORDEN de la tabla de la Mesa de ayuda (`/reportes`) — puro, sin BD ni UI.
//
// Cada encabezado ordena con el mismo comportamiento de las tablas de módulos (`orden-tabla.ts`):
// ascendente → descendente → sin orden (el de llegada). El código ordena por su número («TKT-99»
// antes de «TKT-100»), el estado por el orden del flujo (Abierto → … → Cerrado), y «Creado» e
// «Imágenes» por su valor.
import { ordenarFilas, type OrdenTabla } from "@/lib/modulos/orden-tabla";
import { ESTADOS_TICKET } from "@/lib/soporte-estados";
import type { TicketKanban } from "@/lib/soporte-kanban";

export type ColumnaTicket = "codigo" | "asunto" | "reportado" | "ubicacion" | "estado" | "imagenes" | "creado";

export const COLUMNAS_TICKET: readonly ColumnaTicket[] = ["codigo", "asunto", "reportado", "ubicacion", "estado", "imagenes", "creado"];

const NUMERICAS: ReadonlySet<string> = new Set<ColumnaTicket>(["estado", "imagenes", "creado"]);

/** ¿La columna se ordena por valor numérico (y no alfabético)? */
export function esColumnaTicketNumerica(columna: string): boolean {
  return NUMERICAS.has(columna);
}

/** El valor por el que se ordena una fila en una columna; null va al final. */
export function valorColumnaTicket(ticket: TicketKanban, columna: string): string | number | null {
  switch (columna) {
    case "codigo":
      return ticket.code;
    case "asunto":
      return ticket.subject;
    case "reportado":
      return ticket.esMio ? "Tú" : ticket.reportante;
    case "ubicacion":
      return ticket.ubicacion;
    case "estado": {
      // El orden del flujo; un estado desconocido va al final.
      const i = (ESTADOS_TICKET as readonly string[]).indexOf(ticket.status);
      return i >= 0 ? i : null;
    }
    case "imagenes":
      return ticket.adjuntos;
    case "creado": {
      const t = Date.parse(ticket.createdAt);
      return Number.isFinite(t) ? t : null;
    }
    default:
      return null;
  }
}

/** Las novedades ordenadas por la columna elegida (sin orden: como llegaron). */
export function ordenarTickets(tickets: readonly TicketKanban[], orden: OrdenTabla): TicketKanban[] {
  return ordenarFilas(tickets, orden, valorColumnaTicket, esColumnaTicketNumerica);
}
