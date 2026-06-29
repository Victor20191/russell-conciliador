import "server-only";
import { cookies, headers } from "next/headers";
import { encrypt } from "@/lib/jwt";

const COOKIE = "session";

// Atributo `Secure` de la cookie de sesión:
//   - COOKIE_SECURE definido  → se respeta ("true"/"false"); útil detrás de un
//     proxy TLS que termina HTTPS pero reenvía en HTTP.
//   - Sin definir             → sigue el protocolo real de la petición
//     (`x-forwarded-proto`): Secure solo sobre HTTPS. Por HTTP plano la cookie
//     NO es Secure, para que la sesión funcione sin TLS.
async function cookieSecure(): Promise<boolean> {
  if (process.env.COOKIE_SECURE !== undefined) {
    return process.env.COOKIE_SECURE === "true";
  }
  const proto = (await headers()).get("x-forwarded-proto");
  if (process.env.NODE_ENV === "production") return proto !== "http";
  return proto === "https";
}

export async function createSession(
  userId: number,
  role: string,
  sessionVersion: number,
) {
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const session = await encrypt({
    userId,
    role,
    sessionVersion,
    expiresAt: expiresAt.toISOString(),
  });
  const cookieStore = await cookies();

  cookieStore.set(COOKIE, session, {
    httpOnly: true,
    secure: await cookieSecure(),
    expires: expiresAt,
    sameSite: "lax",
    path: "/",
  });
}

export async function deleteSession() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE);
}
