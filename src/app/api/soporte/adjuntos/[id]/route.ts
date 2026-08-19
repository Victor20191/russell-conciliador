import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/dal";
import { authorizePermiso } from "@/lib/rbac";
import { registrarError } from "@/lib/errores";
import { cuerpoBinarioRespuesta, tipoContenidoAdjunto } from "@/lib/soporte-adjuntos";
import { obtenerEvidenciaTicket } from "@/lib/storage/evidencias-tickets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const actor = await getCurrentUser();
  if (!actor) return new Response("No autorizado", { status: 401 });

  const { id } = await params;
  const adjuntoId = Number(id);
  if (!Number.isInteger(adjuntoId) || adjuntoId <= 0) {
    return new Response("Identificador inválido", { status: 400 });
  }

  const [ver, admin] = await Promise.all([
    authorizePermiso("soporte:ver"),
    authorizePermiso("soporte:administrar"),
  ]);
  if (!ver.ok) return new Response("No autorizado", { status: 403 });

  const adjunto = await prisma.supportTicketAttachment.findUnique({
    where: { id: adjuntoId },
    select: {
      objectKey: true,
      contentType: true,
      fileName: true,
      ticket: { select: { createdById: true } },
    },
  });
  if (!adjunto) return new Response("No encontrado", { status: 404 });

  // La evidencia de un ticket interno sigue la misma visibilidad global del
  // ticket. La evidencia pública conserva su acceso privado y administrativo.
  if (!admin.ok && adjunto.ticket.createdById === null) {
    return new Response("No encontrado", { status: 404 });
  }

  try {
    const objeto = await obtenerEvidenciaTicket(adjunto.objectKey);
    if (!objeto) return new Response("No encontrado", { status: 404 });
    const url = new URL(_req.url);
    const esDescarga = url.searchParams.has("download") || url.searchParams.has("descargar");
    const headers: Record<string, string> = {
      "Content-Type": tipoContenidoAdjunto(objeto.contentType, adjunto.contentType),
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, max-age=600",
    };
    if (esDescarga) {
      const nombreSeguro = (adjunto.fileName || "adjunto").replace(/[\\/"]/g, "");
      headers["Content-Disposition"] = `attachment; filename="${nombreSeguro}"; filename*=UTF-8''${encodeURIComponent(adjunto.fileName || "adjunto")}`;
    }
    return new Response(cuerpoBinarioRespuesta(objeto.cuerpo), {
      headers,
    });
  } catch (e) {
    registrarError("obtenerAdjuntoTicket", e);
    return new Response("No se pudo obtener la imagen", { status: 500 });
  }
}
