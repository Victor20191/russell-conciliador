import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/dal";
import { authorizePermiso } from "@/lib/rbac";
import { registrarError } from "@/lib/errores";
import { huellaSha256Archivo } from "@/lib/modulos/archivo-original";
import { contentDispositionSeguro, cuerpoBinario, tipoContenidoRespuesta } from "@/lib/modulos/respuesta-archivo";
import { obtenerObjeto } from "@/lib/storage/objetos";

// Descarga la MUESTRA de una versión de patrón de archivo, tal como se subió, para ver con qué
// formato se creó. La descarga quien ve la lista de patrones (`modulos_datos:crear`, el permiso
// de cargar módulos), no solo el administrador.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RUTA_LOG = "GET /api/modulos/patrones/muestras/[id]";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const actor = await getCurrentUser();
  if (!actor) return new Response("No autorizado", { status: 401 });
  const permiso = await authorizePermiso("modulos_datos:crear");
  if (!permiso.ok) return new Response("No autorizado", { status: 403 });

  const { id } = await params;
  const versionId = Number(id);
  if (!Number.isInteger(versionId) || versionId <= 0) {
    return new Response("Identificador inválido", { status: 400 });
  }

  try {
    const version = await prisma.versionPatronArchivoModulo.findUnique({
      where: { id: versionId },
      select: { muestraClaveObjeto: true, muestraNombre: true, muestraTamanoBytes: true, muestraSha256: true },
    });
    if (!version?.muestraClaveObjeto) return new Response("La versión no tiene muestra", { status: 404 });

    const objeto = await obtenerObjeto(version.muestraClaveObjeto);
    if (!objeto) return new Response("La muestra no está disponible", { status: 404 });

    // Las versiones migradas pueden no tener tamaño o huella: se verifica lo que se registró.
    const tamanoDistinto = version.muestraTamanoBytes != null && objeto.cuerpo.byteLength !== version.muestraTamanoBytes;
    const huellaDistinta = version.muestraSha256 != null && huellaSha256Archivo(objeto.cuerpo) !== version.muestraSha256;
    if (tamanoDistinto || huellaDistinta) {
      registrarError(`${RUTA_LOG} integridad`, new Error(`La muestra de la versión ${versionId} no coincide con su registro.`));
      return new Response("La muestra no supera la verificación de integridad", { status: 409 });
    }

    const nombre = version.muestraNombre ?? "muestra";
    return new Response(cuerpoBinario(objeto.cuerpo), {
      headers: {
        "Content-Type": tipoContenidoRespuesta(nombre, null, objeto.contentType),
        "Content-Length": String(objeto.cuerpo.byteLength),
        "Content-Disposition": contentDispositionSeguro(nombre),
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store, max-age=0",
      },
    });
  } catch (error) {
    registrarError(RUTA_LOG, error);
    return new Response("No se pudo obtener la muestra", { status: 500 });
  }
}
