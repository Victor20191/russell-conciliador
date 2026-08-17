import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/dal";
import { authorizePermiso } from "@/lib/rbac";
import { obtenerObjeto } from "@/lib/storage/objetos";

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

  const adjunto = await prisma.supportTicketAttachment.findUnique({
    where: { id: adjuntoId },
    select: {
      objectKey: true,
      contentType: true,
      ticket: { select: { createdById: true } },
    },
  });
  if (!adjunto) return new Response("No encontrado", { status: 404 });

  const admin = await authorizePermiso("soporte:administrar");
  if (!admin.ok && adjunto.ticket.createdById !== actor.id) {
    return new Response("No encontrado", { status: 404 });
  }

  try {
    const objeto = await obtenerObjeto(adjunto.objectKey);
    if (!objeto) return new Response("No encontrado", { status: 404 });
    const body = objeto.cuerpo.buffer.slice(
      objeto.cuerpo.byteOffset,
      objeto.cuerpo.byteOffset + objeto.cuerpo.byteLength,
    ) as ArrayBuffer;
    return new Response(body, {
      headers: {
        "Content-Type": objeto.contentType || adjunto.contentType,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, max-age=600",
        "Content-Length": String(objeto.cuerpo.byteLength),
      },
    });
  } catch {
    return new Response("No se pudo obtener la imagen", { status: 500 });
  }
}
