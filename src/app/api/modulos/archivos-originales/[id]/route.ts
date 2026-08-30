import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/dal";
import { authorizePermiso } from "@/lib/rbac";
import { registrarError } from "@/lib/errores";
import {
  huellaSha256Archivo,
  nombreArchivoOriginalSeguro,
  tipoContenidoArchivo,
} from "@/lib/modulos/archivo-original";
import { obtenerObjeto } from "@/lib/storage/objetos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RUTA_LOG = "GET /api/modulos/archivos-originales/[id]";

/** Copia propia del binario para que `Response` no reciba un buffer compartido. */
function cuerpoBinario(bytes: Uint8Array): ArrayBuffer {
  return bytes.slice().buffer as ArrayBuffer;
}

function codificarRfc5987(valor: string): string {
  return encodeURIComponent(valor).replace(/[!'()*]/g, (caracter) =>
    `%${caracter.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function contentDispositionSeguro(nombreOriginal: string): string {
  const nombreSeguro = nombreArchivoOriginalSeguro(nombreOriginal);
  const nombreAscii = nombreSeguro
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7e]/g, "_")
    .replace(/["\\]/g, "_")
    .trim() || "archivo-original";

  return `attachment; filename="${nombreAscii}"; filename*=UTF-8''${codificarRfc5987(nombreSeguro)}`;
}

function tipoContenidoRespuesta(
  nombreArchivo: string,
  almacenado: string | null,
  objeto: string,
): string {
  const candidatos = [almacenado, objeto, tipoContenidoArchivo(nombreArchivo)];
  const tipoValido = /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*(?:;\s*charset=[a-z0-9._-]+)?$/i;
  return candidatos.find((tipo) => tipo && tipoValido.test(tipo.trim()))?.trim()
    ?? "application/octet-stream";
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const actor = await getCurrentUser();
  if (!actor) return new Response("No autorizado", { status: 401 });

  // Primer gate: un usuario sin el permiso global no puede usar el id como
  // oráculo para consultar siquiera la metadata de la bitácora.
  const permiso = await authorizePermiso("modulos_datos:ver");
  if (!permiso.ok) return new Response("No autorizado", { status: 403 });

  const { id } = await params;
  const archivoId = Number(id);
  if (!Number.isInteger(archivoId) || archivoId <= 0) {
    return new Response("Identificador inválido", { status: 400 });
  }

  try {
    const archivo = await prisma.archivoOriginalModulo.findUnique({
      where: { id: archivoId },
      select: {
        clienteId: true,
        nombreArchivo: true,
        tipoContenido: true,
        tamanoBytes: true,
        huellaSha256: true,
        claveObjeto: true,
        disponible: true,
      },
    });
    if (!archivo) return new Response("No encontrado", { status: 404 });

    // Segundo gate: el permiso global no basta; también debe existir alcance
    // de lectura vigente sobre el cliente propietario del archivo.
    const alcance = await authorizePermiso("modulos_datos:ver", {
      clientId: archivo.clienteId,
      modo: "lectura",
    });
    // No revelar si el id existe cuando pertenece a un cliente fuera del alcance.
    if (!alcance.ok) return new Response("No encontrado", { status: 404 });

    const metadataDisponible =
      archivo.disponible
      && Boolean(archivo.claveObjeto?.trim())
      && typeof archivo.tamanoBytes === "number"
      && Number.isSafeInteger(archivo.tamanoBytes)
      && archivo.tamanoBytes > 0
      && typeof archivo.huellaSha256 === "string"
      && /^[0-9a-f]{64}$/.test(archivo.huellaSha256);
    if (!metadataDisponible) {
      return new Response("Archivo original no disponible", { status: 404 });
    }

    // Las comprobaciones anteriores estrechan estos campos, pero TypeScript no
    // conserva el estrechamiento de las propiedades mutables del objeto.
    const claveObjeto = archivo.claveObjeto as string;
    const tamanoEsperado = archivo.tamanoBytes as number;
    const huellaEsperada = archivo.huellaSha256 as string;
    const objeto = await obtenerObjeto(claveObjeto);
    if (!objeto) return new Response("Archivo original no disponible", { status: 404 });

    const huellaObtenida = huellaSha256Archivo(objeto.cuerpo);
    if (objeto.cuerpo.byteLength !== tamanoEsperado || huellaObtenida !== huellaEsperada) {
      registrarError(
        `${RUTA_LOG} integridad`,
        new Error(`El objeto ${archivoId} no coincide con su metadata durable.`),
      );
      return new Response("El archivo original no supera la verificación de integridad", {
        status: 409,
      });
    }

    return new Response(cuerpoBinario(objeto.cuerpo), {
      headers: {
        "Content-Type": tipoContenidoRespuesta(
          archivo.nombreArchivo,
          archivo.tipoContenido,
          objeto.contentType,
        ),
        "Content-Length": String(objeto.cuerpo.byteLength),
        "Content-Disposition": contentDispositionSeguro(archivo.nombreArchivo),
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store, max-age=0",
      },
    });
  } catch (error) {
    registrarError(RUTA_LOG, error);
    return new Response("No se pudo obtener el archivo original", { status: 500 });
  }
}
