import { createHash, randomBytes } from "node:crypto";
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

const PATRON_CODIGO_TICKET_ACTUAL = /^TKT-\d{1,9}$/;
const PATRON_CODIGO_TICKET_ANTERIOR = /^TKT-\d{8}-[A-Z0-9]{8}$/;

export function esCodigoTicketActual(codigo: string): boolean {
  return PATRON_CODIGO_TICKET_ACTUAL.test(codigo);
}

/**
 * Los enlaces emitidos antes del consecutivo corto conservan el código con
 * fecha y sufijo. El token sigue siendo la credencial privada y permite
 * resolver esos enlaces después de que la migración renumeró el código visible.
 */
export function esCodigoSeguimientoTicket(codigo: string): boolean {
  return esCodigoTicketActual(codigo) || PATRON_CODIGO_TICKET_ANTERIOR.test(codigo);
}

/**
 * El código visible del ticket es un consecutivo corto (`TKT-1`, `TKT-2`…): lo
 * entrega la secuencia `secuencia_codigo_ticket_soporte` de PostgreSQL, así que
 * aquí solo se le da formato. No es un secreto — quien abre el enlace público de
 * seguimiento sigue necesitando el token de acceso (`crearTokenAccesoTicket`).
 */
export function crearCodigoTicket(consecutivo: number): string {
  if (!Number.isInteger(consecutivo) || consecutivo < 1) {
    throw new Error("No fue posible generar el código del ticket.");
  }
  return `TKT-${consecutivo}`;
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
