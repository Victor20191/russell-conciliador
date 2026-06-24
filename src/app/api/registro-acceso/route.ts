import type { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/dal";
import { getClientIp, getUserAgent } from "@/lib/request";
import { registrarAcceso } from "@/lib/access-log";

// Endpoint de registro de navegación. Lo invoca el rastreador del cliente
// (`AccessTracker`) en cada cambio de ruta. El usuario se resuelve SIEMPRE
// desde la sesión (cookie), nunca desde el cuerpo: el cliente solo informa la
// ruta visitada. Respuesta 204 sin contenido (es best-effort, fire-and-forget).
const SIN_CONTENIDO = () => new Response(null, { status: 204 });

function rutaValida(ruta: unknown): ruta is string {
  return (
    typeof ruta === "string" &&
    ruta.startsWith("/") &&
    ruta.length <= 512 &&
    !ruta.startsWith("/api") &&
    !ruta.startsWith("/_next")
  );
}

export async function POST(req: NextRequest) {
  // Solo se registra navegación de sesiones válidas (getCurrentUser aplica la
  // verificación segura del DAL: usuario activo y versión de sesión vigente).
  const user = await getCurrentUser();
  if (!user) return SIN_CONTENIDO();

  let ruta: unknown;
  try {
    ({ ruta } = await req.json());
  } catch {
    return SIN_CONTENIDO();
  }
  if (!rutaValida(ruta)) return SIN_CONTENIDO();

  const [ip, userAgent] = await Promise.all([getClientIp(), getUserAgent()]);
  await registrarAcceso({
    userId: user.id,
    userName: user.name,
    role: user.role,
    path: ruta,
    kind: "navegacion",
    ip,
    userAgent,
  });
  return SIN_CONTENIDO();
}
