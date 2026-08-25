import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/dal";
import { authorizePermiso } from "@/lib/rbac";
import { registrarError } from "@/lib/errores";
import { tipoContenidoSoporte } from "@/lib/modulos/marcas-adjuntos";
import { obtenerObjeto } from "@/lib/storage/objetos";

// Descarga del SOPORTE de una marca de auditoría del cruce contable. El binario vive en
// el almacenamiento de objetos; esta ruta lo sirve con la misma autorización que la
// pantalla: permiso de lectura del módulo Y alcance sobre el cliente de la marca (un id
// adivinado no puede sacar los papeles de otro cliente).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Copia propia del binario para `Response` (evita SharedArrayBuffer / buffer pooled). */
function cuerpoBinario(bytes: Uint8Array): ArrayBuffer {
  return bytes.slice().buffer as ArrayBuffer;
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getCurrentUser();
  if (!actor) return new Response("No autorizado", { status: 401 });

  const { id } = await params;
  const soporteId = Number(id);
  if (!Number.isInteger(soporteId) || soporteId <= 0) {
    return new Response("Identificador inválido", { status: 400 });
  }

  const soporte = await prisma.adjuntoMarcaCruce.findUnique({
    where: { id: soporteId },
    select: {
      claveObjeto: true,
      tipoContenido: true,
      nombreArchivo: true,
      marca: { select: { clienteId: true } },
    },
  });
  if (!soporte) return new Response("No encontrado", { status: 404 });

  const autorizado = await authorizePermiso("modulos_datos:ver", { clientId: soporte.marca.clienteId });
  if (!autorizado.ok) return new Response("No autorizado", { status: 403 });

  try {
    const objeto = await obtenerObjeto(soporte.claveObjeto);
    if (!objeto) return new Response("No encontrado", { status: 404 });

    const url = new URL(req.url);
    const esDescarga = url.searchParams.has("download") || url.searchParams.has("descargar");
    const headers: Record<string, string> = {
      "Content-Type": tipoContenidoSoporte(objeto.contentType, soporte.tipoContenido),
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, max-age=600",
    };
    if (esDescarga) {
      const nombreSeguro = (soporte.nombreArchivo || "soporte").replace(/[\\/"]/g, "");
      headers["Content-Disposition"] =
        `attachment; filename="${nombreSeguro}"; filename*=UTF-8''${encodeURIComponent(soporte.nombreArchivo || "soporte")}`;
    }
    return new Response(cuerpoBinario(objeto.cuerpo), { headers });
  } catch (e) {
    registrarError("GET /api/modulos/marcas/soportes/[id]", e);
    return new Response("No se pudo leer el soporte", { status: 500 });
  }
}
