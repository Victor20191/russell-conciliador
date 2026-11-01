import { createHash } from "node:crypto";
import { CABECERAS_ARCHIVO_PRIVADO } from "@/lib/seguridad/cabeceras-archivo";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/dal";
import { authorizePermiso } from "@/lib/rbac";
import { registrarError } from "@/lib/errores";
import { contentDispositionSeguro, cuerpoBinario } from "@/lib/modulos/respuesta-archivo";
import { obtenerObjeto } from "@/lib/storage/objetos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RUTA_LOG = "GET /api/impuestos/formularios/[id]";

/** PDF original de un formulario DIAN cargado (Impuestos · Retención en la fuente). */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getCurrentUser();
  if (!actor) return new Response("No autorizado", { status: 401 });
  // Primer gate: sin el permiso global el id no sirve ni para saber si existe.
  const permiso = await authorizePermiso("impuestos:ver");
  if (!permiso.ok) return new Response("No autorizado", { status: 403 });

  const { id } = await params;
  const formularioId = Number(id);
  if (!Number.isInteger(formularioId) || formularioId <= 0) return new Response("Identificador inválido", { status: 400 });

  try {
    const f = await prisma.formularioDianCargado.findUnique({
      where: { id: formularioId },
      select: { clienteId: true, nombreArchivo: true, claveObjeto: true, huellaSha256: true, tamanoBytes: true },
    });
    if (!f) return new Response("No encontrado", { status: 404 });
    // Segundo gate: alcance de lectura sobre el cliente (sin revelar si el id existe).
    const alcance = await authorizePermiso("impuestos:ver", { clientId: f.clienteId, modo: "lectura" });
    if (!alcance.ok) return new Response("No encontrado", { status: 404 });
    if (!f.claveObjeto) return new Response("El original no se guardó", { status: 404 });

    const objeto = await obtenerObjeto(f.claveObjeto);
    if (!objeto) return new Response("Original no disponible", { status: 404 });
    const huella = createHash("sha256").update(objeto.cuerpo).digest("hex");
    if (objeto.cuerpo.byteLength !== f.tamanoBytes || huella !== f.huellaSha256) {
      registrarError(`${RUTA_LOG} integridad`, new Error(`El objeto del formulario ${formularioId} no coincide con su huella.`));
      return new Response("El original no supera la verificación de integridad", { status: 409 });
    }
    return new Response(cuerpoBinario(objeto.cuerpo), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Length": String(objeto.cuerpo.byteLength),
        "Content-Disposition": contentDispositionSeguro(f.nombreArchivo),
        ...CABECERAS_ARCHIVO_PRIVADO,
      },
    });
  } catch (error) {
    registrarError(RUTA_LOG, error);
    return new Response("No se pudo obtener el original", { status: 500 });
  }
}
