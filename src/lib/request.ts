import "server-only";
import { headers } from "next/headers";

// Detrás de Nginx la IP real llega en x-forwarded-for (primer salto).
export async function getClientIp(): Promise<string> {
  const h = await headers();
  const xff = h.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return h.get("x-real-ip")?.trim() ?? "desconocida";
}

export async function getUserAgent(): Promise<string | null> {
  const h = await headers();
  return h.get("user-agent");
}
