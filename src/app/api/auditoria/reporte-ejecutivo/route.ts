import { generarReporteEjecutivoUso } from "@/app/actions/auditoria-reporte";
import { registrarError } from "@/lib/errores";

export const runtime = "nodejs";
export const maxDuration = 360;

export async function POST(request: Request): Promise<Response> {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return Response.json({ ok: false, message: "Origen de solicitud no permitido." }, { status: 403 });
  }

  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return Response.json({ ok: false, message: "La solicitud del reporte no es válida." }, { status: 400 });
  }

  // La acción autoriza antes de validar el alcance y consultar los datos.
  try {
    const result = await generarReporteEjecutivoUso(
      input as Parameters<typeof generarReporteEjecutivoUso>[0],
      request.signal,
    );
    return Response.json(result, { status: request.signal.aborted ? 499 : result.ok ? 200 : 400 });
  } catch (error) {
    if (request.signal.aborted) {
      return Response.json({ ok: false, message: "Generación cancelada." }, { status: 499 });
    }
    registrarError("apiReporteEjecutivo", error);
    return Response.json({ ok: false, message: "No se pudo generar el reporte." }, { status: 500 });
  }
}
