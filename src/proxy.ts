import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { getEncodedSessionSecret } from "@/lib/session-secret";

function isPublicRoute(path: string): boolean {
  return path === "/" || path === "/login" || path === "/soporte" || path.startsWith("/soporte/");
}

// Verificación optimista: solo valida la firma del JWT desde la cookie.
// La verificación segura (DB) ocurre en el DAL (verifySession/getCurrentUser).
export default async function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname;
  const isPublic = isPublicRoute(path);

  const token = req.cookies.get("session")?.value;
  let authenticated = false;
  if (token) {
    try {
      await jwtVerify(token, getEncodedSessionSecret(), { algorithms: ["HS256"] });
      authenticated = true;
    } catch {
      authenticated = false;
    }
  }

  if (!isPublic && !authenticated) {
    const res = NextResponse.redirect(new URL("/login", req.nextUrl));
    // Si venía una cookie pero su firma no es válida (expirada/corrupta), limpiarla.
    if (token) res.cookies.delete("session");
    return res;
  }

  if (path === "/login" && authenticated) {
    return NextResponse.redirect(new URL("/dashboard", req.nextUrl));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.svg$|.*\\.png$).*)",
  ],
};
