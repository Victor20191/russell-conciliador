"use server";

import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/dal";
import { authorizePermiso } from "@/lib/rbac";
import { getMatriz } from "@/lib/rbac/contexto";
import { tienePermiso } from "@/lib/rbac/permisos";
import { esEntidadComentable, etiquetaEntidad } from "@/lib/comentarios";
import { MESES } from "@/lib/format";
import { mensajeErrorBD, registrarError } from "@/lib/errores";

// ============================================================
// Server actions de CONVERSACIONES (comentarios polimórficos).
//
// Autorización en dos capas:
//   - leer la conversación  → "<tipo>:ver"
//   - publicar / mencionar  → "<tipo>:comentar"
// (El alcance por cartera de cliente se añadirá por entidad cuando la
//  conversación cuelgue de datos de un cliente concreto.)
// ============================================================

export type ComentarioDTO = {
  id: number;
  body: string;
  authorId: number;
  authorName: string;
  authorInitials: string;
  isAI: boolean;
  createdAt: string;
  mine: boolean;
  mentions: { userId: number; name: string }[];
};

export type UsuarioMencionable = { id: number; name: string; initials: string; role: string };

export type ListarResult =
  | { ok: true; comentarios: ComentarioDTO[]; puedeComentar: boolean }
  | { ok: false; message: string };

export type PublicarResult = { ok: true; comentario: ComentarioDTO } | { ok: false; message: string };

function stamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${MESES[d.getMonth()]}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Usuarios activos cuyo ROL puede ver el módulo (candidatos a mención). */
async function mencionablesInternos(tipo: string): Promise<UsuarioMencionable[]> {
  const [usuarios, matriz] = await Promise.all([
    prisma.user.findMany({
      where: { active: true },
      select: { id: true, name: true, initials: true, role: true },
      orderBy: { name: "asc" },
    }),
    getMatriz(),
  ]);
  return usuarios.filter((u) => tienePermiso(matriz, u.role, `${tipo}:ver`));
}

/** Lista la conversación de un registro. `anchor` filtra dentro del registro. */
export async function listarComentarios(
  tipo: string,
  entityId: number,
  anchor?: string | null,
): Promise<ListarResult> {
  if (!esEntidadComentable(tipo) || !Number.isSafeInteger(entityId)) {
    return { ok: false, message: "Entidad inválida." };
  }
  const ver = await authorizePermiso(`${tipo}:ver`);
  if (!ver.ok) return { ok: false, message: ver.message };
  const comentar = await authorizePermiso(`${tipo}:comentar`);

  try {
    const rows = await prisma.comment.findMany({
      where: {
        entityType: tipo,
        entityId,
        ...(anchor != null ? { anchor } : { anchor: null }),
      },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        body: true,
        authorId: true,
        isAI: true,
        createdAt: true,
        author: { select: { name: true, initials: true } },
        mentions: { select: { userId: true, user: { select: { name: true } } } },
      },
    });

    const comentarios: ComentarioDTO[] = rows.map((r) => ({
      id: r.id,
      body: r.body,
      authorId: r.authorId,
      authorName: r.author.name,
      authorInitials: r.author.initials,
      isAI: r.isAI,
      createdAt: stamp(r.createdAt),
      mine: r.authorId === ver.userId,
      mentions: r.mentions.map((m) => ({ userId: m.userId, name: m.user.name })),
    }));

    return { ok: true, comentarios, puedeComentar: comentar.ok };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("listarComentarios", e) };
  }
}

/** Candidatos a mención (@) para la conversación, excluyendo al autor. */
export async function usuariosMencionables(tipo: string): Promise<UsuarioMencionable[]> {
  if (!esEntidadComentable(tipo)) return [];
  const ver = await authorizePermiso(`${tipo}:ver`);
  if (!ver.ok) return [];
  try {
    const lista = await mencionablesInternos(tipo);
    return lista.filter((u) => u.id !== ver.userId);
  } catch (e) {
    // Degradación elegante: si la BD falla, el selector de menciones queda vacío.
    registrarError("usuariosMencionables", e);
    return [];
  }
}

/** Publica un comentario y registra sus menciones (+ notificación). */
export async function publicarComentario(input: {
  tipo: string;
  entityId: number;
  anchor?: string | null;
  body: string;
  menciones?: number[];
}): Promise<PublicarResult> {
  const { tipo, entityId } = input;
  if (!esEntidadComentable(tipo) || !Number.isSafeInteger(entityId)) {
    return { ok: false, message: "Entidad inválida." };
  }
  const authz = await authorizePermiso(`${tipo}:comentar`);
  if (!authz.ok) return { ok: false, message: authz.message };

  const body = (input.body ?? "").trim();
  if (!body) return { ok: false, message: "El comentario está vacío." };
  if (body.length > 5000) return { ok: false, message: "El comentario es demasiado largo." };

  try {
    // Solo se puede arrobar a quien puede ver el módulo (y no a uno mismo).
    const idsValidos = new Set((await mencionablesInternos(tipo)).map((u) => u.id));
    const menciones = [...new Set(input.menciones ?? [])].filter(
      (id) => idsValidos.has(id) && id !== authz.userId,
    );

    const actor = await getCurrentUser();

    const creado = await prisma.comment.create({
      data: {
        entityType: tipo,
        entityId,
        anchor: input.anchor ?? null,
        authorId: authz.userId,
        body,
        mentions: menciones.length ? { create: menciones.map((userId) => ({ userId })) } : undefined,
      },
      select: {
        id: true,
        body: true,
        authorId: true,
        isAI: true,
        createdAt: true,
        author: { select: { name: true, initials: true } },
        mentions: { select: { userId: true, user: { select: { name: true } } } },
      },
    });

    // Rastro en el feed de notificaciones por cada mención.
    if (menciones.length) {
      const etiqueta = etiquetaEntidad(tipo);
      const quien = actor?.name ?? "Alguien";
      await prisma.notification.createMany({
        data: menciones.map(() => ({
          kind: "comment",
          who: quien,
          text: `${quien} te mencionó en ${etiqueta} #${entityId}`,
          target: `${tipo}:${entityId}`,
          time: stamp(creado.createdAt),
        })),
      });
    }

    return {
      ok: true,
      comentario: {
        id: creado.id,
        body: creado.body,
        authorId: creado.authorId,
        authorName: creado.author.name,
        authorInitials: creado.author.initials,
        isAI: creado.isAI,
        createdAt: stamp(creado.createdAt),
        mine: true,
        mentions: creado.mentions.map((m) => ({ userId: m.userId, name: m.user.name })),
      },
    };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("publicarComentario", e) };
  }
}
