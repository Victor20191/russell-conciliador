import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Limpia una cookie de sesión inválida y envía al login.
//
// El proxy es optimista (solo valida la FIRMA del JWT, no la BD). Una cookie con
// firma válida pero cuya sesión ya no existe/coincide en la BD (p. ej. tras un
// reseed o cambio de version_sesion) sería tratada como "autenticada" por el
// proxy, generando un bucle infinito proxy↔DAL: /login → /dashboard → /login…
//
// El DAL no puede borrar la cookie durante el render de un Server Component, así
// que redirige aquí. Un route handler SÍ puede mutar cookies: borramos la cookie
// y mandamos al login, rompiendo el bucle de forma definitiva.
export function GET(req: NextRequest) {
  const res = NextResponse.redirect(new URL("/login", req.nextUrl));
  res.cookies.delete("session");
  return res;
}
