import {
  ESTADO_TICKET_ABIERTO,
  ESTADO_TICKET_EN_PROCESO,
  ESTADOS_TICKET,
  esEstadoTicket,
  type EstadoTicket,
} from "./soporte-estados";

/**
 * Fila del listado de gestión de reportes (`/config/soporte`): lo justo para
 * ubicar un ticket en la tabla; el detalle completo vive en `/config/soporte/[id]`.
 * Las fechas viajan como ISO porque el listado se pinta en un componente cliente.
 */
export type TicketFilaGestion = {
  id: number;
  code: string;
  /** null = ticket público (formulario sin sesión). */
  createdById: number | null;
  reporterFirstName: string;
  reporterLastName: string;
  subject: string;
  routeLabel: string | null;
  menuLabel: string | null;
  status: string;
  adjuntos: number;
  resolvedByName: string | null;
  resolvedAt: string | null;
  createdAt: string;
};

export const FILTRO_ESTADO_TODOS = "todos";
export const FILTRO_ESTADO_EN_GESTION = "en_gestion";

export type FiltroEstadoTicket =
  | typeof FILTRO_ESTADO_TODOS
  | typeof FILTRO_ESTADO_EN_GESTION
  | EstadoTicket;

export function esFiltroEstadoTicket(valor: string): valor is FiltroEstadoTicket {
  return valor === FILTRO_ESTADO_TODOS || valor === FILTRO_ESTADO_EN_GESTION || esEstadoTicket(valor);
}

/** Un ticket sigue «en gestión» mientras Xentria no lo haya resuelto ni cerrado. */
export function esTicketEnGestion(status: string): boolean {
  return status === ESTADO_TICKET_ABIERTO || status === ESTADO_TICKET_EN_PROCESO;
}

function normalizar(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Filtra el listado en memoria por estado y por texto libre (código, asunto,
 * reportante o ubicación). No reordena: conserva el orden de llegada (más
 * recientes primero, tal como los entrega la consulta).
 */
export function filtrarTicketsGestion(
  filas: readonly TicketFilaGestion[],
  filtros: { busqueda?: string; estado?: FiltroEstadoTicket },
): TicketFilaGestion[] {
  const estado = filtros.estado ?? FILTRO_ESTADO_TODOS;
  const termino = normalizar(filtros.busqueda ?? "");
  return filas.filter((fila) => {
    if (estado === FILTRO_ESTADO_EN_GESTION && !esTicketEnGestion(fila.status)) return false;
    if (estado !== FILTRO_ESTADO_TODOS && estado !== FILTRO_ESTADO_EN_GESTION && fila.status !== estado) return false;
    if (!termino) return true;
    const campos = [
      fila.code,
      fila.subject,
      `${fila.reporterFirstName} ${fila.reporterLastName}`,
      fila.routeLabel ?? "",
      fila.menuLabel ?? "",
    ];
    return campos.some((campo) => normalizar(campo).includes(termino));
  });
}

/** Conteo por estado para los resúmenes del listado (siempre incluye los 4 estados). */
export function contarTicketsPorEstado(filas: readonly TicketFilaGestion[]): Record<EstadoTicket, number> {
  const conteo = Object.fromEntries(ESTADOS_TICKET.map((estado) => [estado, 0])) as Record<EstadoTicket, number>;
  for (const fila of filas) {
    if (esEstadoTicket(fila.status)) conteo[fila.status] += 1;
  }
  return conteo;
}
