import { createHash, randomBytes } from "node:crypto";
import { fechaColombiaISO } from "@/lib/fecha-hora";
import type { TipoAdjunto } from "@/lib/soporte-adjuntos";

export {
  ADJUNTO_MAX_BYTES,
  ADJUNTOS_MAX,
  ESTADO_TICKET_ABIERTO,
  ESTADO_TICKET_CERRADO,
  ESTADO_TICKET_EN_EVALUACION,
  ESTADO_TICKET_EN_PROCESO,
  ESTADO_TICKET_RESUELTO,
  ESTADOS_TICKET,
  ETIQUETA_ESTADO_TICKET,
  esEstadoTicket,
  etiquetaEstadoTicket,
  nombreReportanteDesdeSesion,
  requiereSolucion,
  tonoEstadoTicket,
  type EstadoTicket,
} from "./soporte-estados";

export function keyAdjuntoTicket(ticketId: number, sufijo: string, tipo: TipoAdjunto): string {
  if (/[\\/]/.test(sufijo)) throw new Error("El sufijo del adjunto no es válido.");
  const limpio = sufijo.replace(/[^a-z0-9]/gi, "").toLowerCase();
  if (!limpio) throw new Error("El sufijo del adjunto no es válido.");
  return `tickets/${ticketId}/${limpio}.${tipo}`;
}

export { urlAdjuntoTicket } from "./soporte-adjuntos";

export function crearCodigoTicket(ahora: Date = new Date(), sufijo?: string): string {
  const fecha = fechaColombiaISO(ahora).replaceAll("-", "");
  const aleatorio = (sufijo ?? randomBytes(4).toString("hex")).replace(/[^a-z0-9]/gi, "").slice(0, 8).toUpperCase();
  if (aleatorio.length !== 8) throw new Error("No fue posible generar el código del ticket.");
  return `TKT-${fecha}-${aleatorio}`;
}

export function crearTokenAccesoTicket(): string {
  return randomBytes(32).toString("base64url");
}

export function huellaTokenAcceso(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function crearUrlSeguimiento(code: string, token: string): string {
  return `/soporte/tickets/${encodeURIComponent(code)}?acceso=${encodeURIComponent(token)}`;
}
