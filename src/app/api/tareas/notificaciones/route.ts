import { createHash, timingSafeEqual } from "node:crypto";
import { revalidatePath } from "next/cache";
import { registrarError } from "@/lib/errores";
import { procesarNotificacionesPendientes, RUTA_REPORTES_EJECUTIVOS } from "@/lib/notificaciones/reporte-ejecutivo-servidor";

// Disparador de las notificaciones programadas (hoy: el reporte semanal para gerencia).
//
// Lo llama el crontab del servidor cada 10 minutos —no hay un programador dentro de la
// app: PM2 reinicia el proceso por memoria y un temporizador interno se perdería—. La
// línea de crontab está en docs/notificaciones/reporte-ejecutivo-programado.md.
//
// Se autentica con `Authorization: Bearer <CRON_SECRET>`, no con la sesión (`src/proxy.ts`
// excluye `/api`). Sin cookies no hay CSRF que comprobar. Sin `CRON_SECRET` responde 503
// y no hace nada: fallar cerrado es mejor que dejar la ruta abierta.
//
// Es idempotente: cada disparo se reclama con un único en la BD, así que llamarla de más
// (o dos veces a la vez) no envía nada de más. Atiende una programación a la vez, de
// forma síncrona, y por eso `maxDuration` es amplio (la generación y el SMTP tardan).
export const runtime = "nodejs";
export const maxDuration = 600;

/** Compara en tiempo constante (con hashes, que además igualan el largo). */
function secretoCoincide(recibido: string, esperado: string): boolean {
  const a = createHash("sha256").update(recibido).digest();
  const b = createHash("sha256").update(esperado).digest();
  return timingSafeEqual(a, b);
}

function tokenDeLaSolicitud(request: Request): string | null {
  const coincidencia = /^Bearer\s+(\S+)$/i.exec((request.headers.get("authorization") ?? "").trim());
  return coincidencia ? coincidencia[1] : null;
}

export async function POST(request: Request): Promise<Response> {
  const secreto = process.env.CRON_SECRET?.trim();
  if (!secreto) {
    return Response.json(
      { ok: false, message: "El disparador de notificaciones no está configurado (falta CRON_SECRET)." },
      { status: 503 },
    );
  }

  const token = tokenDeLaSolicitud(request);
  if (!token || !secretoCoincide(token, secreto)) {
    return Response.json(
      { ok: false, message: "No autorizado." },
      { status: 401, headers: { "WWW-Authenticate": "Bearer" } },
    );
  }

  try {
    const resumen = await procesarNotificacionesPendientes(new Date());
    // Solo si algo cambió: el historial y la próxima fecha de la pantalla.
    if (resumen.enviadas + resumen.omitidas + resumen.errores + resumen.saltadas + resumen.perdidasCerradas > 0) {
      revalidatePath(RUTA_REPORTES_EJECUTIVOS);
    }
    return Response.json({ ok: true, ...resumen });
  } catch (error) {
    registrarError("apiTareasNotificaciones", error);
    return Response.json({ ok: false, message: "No se pudieron procesar las notificaciones." }, { status: 500 });
  }
}
