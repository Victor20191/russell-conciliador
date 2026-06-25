import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/dal";
import { obtenerObjeto } from "@/lib/storage/objetos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Sirve la foto de perfil de un usuario desde el almacenamiento de objetos.
// Autenticado: cualquier usuario con sesión puede ver avatares de la plataforma.
// El binario se transmite desde S3/MinIO/R2; la BD solo guardó la `key`.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const actor = await getCurrentUser();
  if (!actor) return new Response("No autorizado", { status: 401 });

  const { id } = await params;
  const userId = Number(id);
  if (!Number.isInteger(userId) || userId <= 0) {
    return new Response("Identificador inválido", { status: 400 });
  }

  const usuario = await prisma.user.findUnique({
    where: { id: userId },
    select: { avatarKey: true },
  });
  if (!usuario?.avatarKey) return new Response("Sin foto", { status: 404 });

  try {
    const objeto = await obtenerObjeto(usuario.avatarKey);
    if (!objeto) return new Response("Sin foto", { status: 404 });
    const body = objeto.cuerpo.buffer.slice(
      objeto.cuerpo.byteOffset,
      objeto.cuerpo.byteOffset + objeto.cuerpo.byteLength,
    ) as ArrayBuffer;
    return new Response(body, {
      headers: {
        "Content-Type": objeto.contentType,
        // Defensa en profundidad: no permitir MIME sniffing del binario servido.
        "X-Content-Type-Options": "nosniff",
        // El query ?v=updatedAt invalida la caché al cambiar la foto, así que
        // podemos cachear de forma privada un rato sin servir una foto vieja.
        "Cache-Control": "private, max-age=600",
        "Content-Length": String(objeto.cuerpo.byteLength),
      },
    });
  } catch {
    return new Response("No se pudo obtener la foto", { status: 500 });
  }
}
