export const ESTADO_TICKET_ABIERTO = "abierto";
export const ESTADO_TICKET_EN_PROCESO = "en_proceso";
export const ESTADO_TICKET_RESUELTO = "resuelto";
export const ESTADO_TICKET_CERRADO = "cerrado";

export const ESTADOS_TICKET = [
  ESTADO_TICKET_ABIERTO,
  ESTADO_TICKET_EN_PROCESO,
  ESTADO_TICKET_RESUELTO,
  ESTADO_TICKET_CERRADO,
] as const;

export type EstadoTicket = (typeof ESTADOS_TICKET)[number];

export const ETIQUETA_ESTADO_TICKET: Record<EstadoTicket, string> = {
  abierto: "Abierto",
  en_proceso: "En proceso",
  resuelto: "Resuelto",
  cerrado: "Cerrado",
};

export const ADJUNTOS_MAX = 5;
export const ADJUNTO_MAX_BYTES = 4 * 1024 * 1024;

export function esEstadoTicket(valor: string): valor is EstadoTicket {
  return (ESTADOS_TICKET as readonly string[]).includes(valor);
}

export function etiquetaEstadoTicket(estado: string): string {
  return esEstadoTicket(estado) ? ETIQUETA_ESTADO_TICKET[estado] : estado;
}

export function tonoEstadoTicket(estado: string): "ok" | "warn" | "err" | "blue" | "ink" {
  switch (estado) {
    case ESTADO_TICKET_RESUELTO:
      return "ok";
    case ESTADO_TICKET_EN_PROCESO:
      return "blue";
    case ESTADO_TICKET_CERRADO:
      return "ok";
    default:
      return "warn";
  }
}

export function requiereSolucion(estado: string): boolean {
  return estado === ESTADO_TICKET_RESUELTO;
}

export function nombreReportanteDesdeSesion(nombre: string): { firstName: string; lastName: string } {
  const partes = nombre.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return { firstName: "Usuario", lastName: "plataforma" };
  if (partes.length === 1) return { firstName: partes[0]!, lastName: "plataforma" };
  return { firstName: partes[0]!, lastName: partes.slice(1).join(" ") };
}
