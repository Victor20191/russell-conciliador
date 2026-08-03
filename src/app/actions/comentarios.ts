"use server";

import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/dal";
import { authorizePermiso } from "@/lib/rbac";
import { getMatriz, clienteDeBalance, clienteDeConciliacion, clienteDeModuloDato, clienteDeLoteModulo } from "@/lib/rbac/contexto";
import { tienePermiso } from "@/lib/rbac/permisos";
import { esEntidadComentable, etiquetaEntidad } from "@/lib/comentarios";
import { fmtDateTime, fmtNum, fmtContable } from "@/lib/format";
import { descriptorModulo, type DescriptorModulo } from "@/lib/modulos/descriptores";
import { mensajeErrorBD, registrarError } from "@/lib/errores";

// ============================================================
// Server actions de CONVERSACIONES (comentarios polimórficos).
//
// Autorización en dos capas + alcance por cartera de la entidad padre:
//   - leer la conversación  → "<tipo>:ver"      (+ alcance de lectura)
//   - publicar / mencionar  → "<tipo>:comentar" (+ alcance de lectura)
// El alcance se resuelve por tipo (alcanceDeEntidad): balance/conciliación
// cuelgan de un cliente; DIAN es global (sin cliente, sin alcance extra).
// ============================================================

/**
 * Cliente al que pertenece la entidad comentada, para exigir alcance de
 * cartera (modo lectura = membresía). `scoped:false` = entidad global (DIAN):
 * basta el permiso de rol. `clientId:null` (no resuelto) → el gate deniega a
 * quien no tenga alcance global (fail-closed).
 */
async function alcanceDeEntidad(
  tipo: string,
  entityId: number,
): Promise<{ scoped: false } | { scoped: true; clientId: number | null }> {
  switch (tipo) {
    case "balance":
      return { scoped: true, clientId: await clienteDeBalance(entityId) };
    case "conciliaciones":
      return { scoped: true, clientId: await clienteDeConciliacion(entityId) };
    case "modulos_datos":
      return { scoped: true, clientId: await clienteDeModuloDato(entityId) };
    case "modulos_borrador":
      return { scoped: true, clientId: await clienteDeLoteModulo(entityId) };
    case "clientes":
      return { scoped: true, clientId: entityId };
    default: // "dian" y cualquier otra entidad global
      return { scoped: false };
  }
}

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
  return fmtDateTime(d);
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

  // Alcance por cartera de la entidad padre (DIAN es global, sin alcance extra).
  const alc = await alcanceDeEntidad(tipo, entityId);
  if (alc.scoped && !(await authorizePermiso(`${tipo}:ver`, { clientId: alc.clientId })).ok) {
    return { ok: false, message: "No tienes alcance sobre este cliente." };
  }
  // ¿Puede comentar ESTE cliente? (no solo a nivel de rol).
  const comentar = alc.scoped
    ? await authorizePermiso(`${tipo}:comentar`, { clientId: alc.clientId })
    : await authorizePermiso(`${tipo}:comentar`);

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

export type HiloComentarios = { anchor: string | null; count: number; contexto?: string };

// Contexto legible de una fila de módulo: referencia · descripción · cant X · $ Y.
function contextoFilaModulo(desc: DescriptorModulo | null, datos: Record<string, unknown>, valor: number): string {
  const refRol = desc?.columnas.find((c) => /ref/i.test(c.nombre))?.nombre;
  const cantRol = desc?.columnas.find((c) => c.tipo === "numero")?.nombre;
  const ref = refRol ? datos[refRol] : null;
  const descr = datos["descripcion"];
  const cant = cantRol ? datos[cantRol] : null;
  const cabeza = [ref, descr].filter((v) => v != null && v !== "").map(String).join(" · ");
  const meta: string[] = [];
  if (cant != null && cant !== "") meta.push(`cant ${fmtNum(Number(cant))}`);
  meta.push(fmtContable(valor));
  return [cabeza, meta.join(" · ")].filter(Boolean).join(" · ");
}

/** Enriquece los hilos `fila:N` de un módulo con el contexto del ítem (ref/desc/cant/costo). */
async function enriquecerHilosModulo(tipo: string, entityId: number, hilos: HiloComentarios[]): Promise<HiloComentarios[]> {
  const filaNums = hilos.map((h) => h.anchor).filter((a): a is string => !!a && a.startsWith("fila:")).map((a) => Number(a.slice(5))).filter(Number.isInteger);
  if (filaNums.length === 0) return hilos;
  let moduloCodigo = "";
  const ctx = new Map<number, { valor: number; datos: Record<string, unknown> }>();
  if (tipo === "modulos_datos") {
    const enc = await prisma.moduloDatoEncabezado.findUnique({ where: { id: entityId }, select: { moduloCodigo: true } });
    if (!enc) return hilos;
    moduloCodigo = enc.moduloCodigo;
    const filas = await prisma.moduloDatoDetalle.findMany({ where: { encabezadoId: entityId, filaNum: { in: filaNums } }, select: { filaNum: true, valor: true, datos: true } });
    for (const f of filas) ctx.set(f.filaNum, { valor: Number(f.valor), datos: (f.datos ?? {}) as Record<string, unknown> });
  } else {
    const lote = await prisma.moduloImportacionLote.findUnique({ where: { id: entityId }, select: { moduloCodigo: true, loteId: true } });
    if (!lote) return hilos;
    moduloCodigo = lote.moduloCodigo;
    const filas = await prisma.moduloImportacionStaging.findMany({ where: { loteId: lote.loteId, filaNum: { in: filaNums } }, select: { filaNum: true, valor: true, datos: true } });
    for (const f of filas) ctx.set(f.filaNum, { valor: Number(f.valor), datos: (f.datos ?? {}) as Record<string, unknown> });
  }
  const desc = descriptorModulo(moduloCodigo);
  return hilos.map((h) => {
    if (!h.anchor?.startsWith("fila:")) return h;
    const fila = ctx.get(Number(h.anchor.slice(5)));
    return fila ? { ...h, contexto: contextoFilaModulo(desc, fila.datos, fila.valor) } : h;
  });
}

/** Hilos (anclas) con comentarios de una entidad + su conteo. Para el modal «ver todas
 *  las conversaciones» del listado. `anchor: null` = conversación general. */
export async function resumenComentarios(tipo: string, entityId: number): Promise<HiloComentarios[]> {
  if (!esEntidadComentable(tipo) || !Number.isSafeInteger(entityId)) return [];
  const ver = await authorizePermiso(`${tipo}:ver`);
  if (!ver.ok) return [];
  const alc = await alcanceDeEntidad(tipo, entityId);
  if (alc.scoped && !(await authorizePermiso(`${tipo}:ver`, { clientId: alc.clientId })).ok) return [];
  try {
    const grp = await prisma.comment.groupBy({ by: ["anchor"], where: { entityType: tipo, entityId }, _count: { _all: true } });
    let hilos: HiloComentarios[] = grp.map((g) => ({ anchor: g.anchor, count: g._count._all }));
    if (tipo === "modulos_datos" || tipo === "modulos_borrador") hilos = await enriquecerHilosModulo(tipo, entityId, hilos);
    return hilos.sort((a, b) => (a.anchor === null ? -1 : b.anchor === null ? 1 : a.anchor.localeCompare(b.anchor, "es", { numeric: true })));
  } catch (e) {
    registrarError("resumenComentarios", e);
    return [];
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

  // Alcance por cartera de la entidad padre (DIAN es global, sin alcance extra).
  const alc = await alcanceDeEntidad(tipo, entityId);
  if (alc.scoped && !(await authorizePermiso(`${tipo}:comentar`, { clientId: alc.clientId })).ok) {
    return { ok: false, message: "No tienes alcance sobre este cliente." };
  }

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
