import "server-only";
import { createHmac, timingSafeEqual } from "crypto";
import { getSessionSecret } from "@/lib/session-secret";

function normalizarValor(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizarValor);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const v = (value as Record<string, unknown>)[key];
      if (v !== undefined) out[key] = normalizarValor(v);
    }
    return out;
  }
  return value;
}

function serializarEstable(value: unknown): string {
  return JSON.stringify(normalizarValor(value));
}

export function firmarPayloadServidor(value: unknown, contexto: string): string {
  return createHmac("sha256", getSessionSecret())
    .update(contexto)
    .update("\0")
    .update(serializarEstable(value))
    .digest("base64url");
}

export function validarFirmaPayloadServidor(
  value: unknown,
  firma: unknown,
  contexto: string,
): boolean {
  if (typeof firma !== "string" || firma.length === 0) return false;
  const esperada = firmarPayloadServidor(value, contexto);
  const a = Buffer.from(firma, "base64url");
  const b = Buffer.from(esperada, "base64url");
  return a.byteLength === b.byteLength && timingSafeEqual(a, b);
}
