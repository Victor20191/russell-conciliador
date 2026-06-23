"use server";

import * as z from "zod";
import { revalidatePath } from "next/cache";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/dal";
import { logAudit } from "@/lib/audit";
import { authorizePermiso } from "@/lib/rbac";
import { mensajeErrorBD } from "@/lib/errores";
import {
  VersionCreateSchema,
  VersionUpdateSchema,
  VersionDeleteSchema,
  ChangeCreateSchema,
  ChangeUpdateSchema,
  ChangeDeleteSchema,
  type ActionState,
} from "@/lib/definitions";

// CRUD del módulo de NOVEDADES (changelog + control de versiones). Admin-only:
// el gate es `novedades:administrar`. Una VERSIÓN (encabezado) agrupa varios
// CAMBIOS (detalle). Cada movimiento queda en el registro GLOBAL de auditoría
// (/auditoria) vía logAudit (no necesita bitácora dedicada). Patrón de Server
// Action idéntico a src/app/actions/standard-accounts.ts.
const PATH = "/novedades";
const PERMISO = "novedades:administrar";

/** Lee del FormData los campos de una versión para validarlos con Zod. */
function leerVersion(formData: FormData) {
  return {
    number: formData.get("number"),
    title: formData.get("title"),
    summary: formData.get("summary"),
    status: formData.get("status"),
    order: formData.get("order"),
  };
}

/** Lee del FormData los campos de un cambio para validarlos con Zod. */
function leerCambio(formData: FormData) {
  return {
    versionId: formData.get("versionId"),
    type: formData.get("type"),
    title: formData.get("title"),
    description: formData.get("description"),
    moduleKey: formData.get("moduleKey"),
    route: formData.get("route"),
    howTo: formData.get("howTo"),
    example: formData.get("example"),
    featureStatus: formData.get("featureStatus"),
    order: formData.get("order"),
  };
}

// ============================================================
// ===== Versiones (encabezado / control de versiones) =====
// ============================================================

export async function createVersion(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  const authz = await authorizePermiso(PERMISO);
  if (!authz.ok) return { ok: false, message: authz.message };

  const parsed = VersionCreateSchema.safeParse(leerVersion(formData));
  if (!parsed.success) return { ok: false, errors: z.flattenError(parsed.error).fieldErrors };

  try {
    const dup = await prisma.platformVersion.findUnique({
      where: { number: parsed.data.number },
      select: { id: true },
    });
    if (dup) return { ok: false, message: `Ya existe una versión con el número ${parsed.data.number}.` };

    const user = await getCurrentUser();
    const { number, title, summary, status, order } = parsed.data;
    const created = await prisma.platformVersion.create({
      data: {
        number,
        title,
        summary,
        status,
        order,
        // Al publicar, sella la fecha de lanzamiento; en borrador queda sin fecha.
        releasedAt: status === "publicada" ? new Date() : null,
        createdById: user?.id ?? null,
      },
    });

    await logAudit({
      user: user?.name ?? "Sistema",
      action: "CREÓ VERSIÓN",
      entity: `Novedades · v${created.number}`,
      detail: `Creó la versión ${created.number} · ${created.title}`,
    });
    revalidatePath(PATH);
    return { ok: true, message: "Versión creada." };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("createVersion", e) };
  }
}

export async function updateVersion(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  const authz = await authorizePermiso(PERMISO);
  if (!authz.ok) return { ok: false, message: authz.message };

  const parsed = VersionUpdateSchema.safeParse({ id: formData.get("id"), ...leerVersion(formData) });
  if (!parsed.success) return { ok: false, errors: z.flattenError(parsed.error).fieldErrors };

  try {
    const before = await prisma.platformVersion.findUnique({ where: { id: parsed.data.id } });
    if (!before) return { ok: false, message: "La versión no existe." };

    if (parsed.data.number !== before.number) {
      const dup = await prisma.platformVersion.findFirst({
        where: { number: parsed.data.number, NOT: { id: parsed.data.id } },
        select: { id: true },
      });
      if (dup) return { ok: false, message: `Ya existe otra versión con el número ${parsed.data.number}.` };
    }

    const { id, number, title, summary, status, order } = parsed.data;
    // Conserva la fecha si ya estaba publicada; la sella al publicar por 1ª vez;
    // la limpia si vuelve a borrador.
    const releasedAt = status === "publicada" ? before.releasedAt ?? new Date() : null;
    const after = await prisma.platformVersion.update({
      where: { id },
      data: { number, title, summary, status, order, releasedAt },
    });

    const user = await getCurrentUser();
    await logAudit({
      user: user?.name ?? "Sistema",
      action: "EDITÓ VERSIÓN",
      entity: `Novedades · v${after.number}`,
      detail: `Editó la versión ${after.number} · ${after.title}`,
    });
    revalidatePath(PATH);
    return { ok: true, message: "Versión actualizada." };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("updateVersion", e) };
  }
}

export async function deleteVersion(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  const authz = await authorizePermiso(PERMISO);
  if (!authz.ok) return { ok: false, message: authz.message };

  const parsed = VersionDeleteSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return { ok: false, errors: z.flattenError(parsed.error).fieldErrors };

  try {
    const before = await prisma.platformVersion.findUnique({
      where: { id: parsed.data.id },
      include: { _count: { select: { changes: true } } },
    });
    if (!before) return { ok: false, message: "La versión no existe." };

    // FK ON DELETE CASCADE: borrar la versión arrastra todos sus cambios.
    await prisma.platformVersion.delete({ where: { id: parsed.data.id } });

    const user = await getCurrentUser();
    await logAudit({
      user: user?.name ?? "Sistema",
      action: "ELIMINÓ VERSIÓN",
      entity: `Novedades · v${before.number}`,
      detail: `Eliminó la versión ${before.number} · ${before.title} (${before._count.changes} cambios)`,
    });
    revalidatePath(PATH);
    return { ok: true, message: "Versión eliminada." };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("deleteVersion", e) };
  }
}

// ============================================================
// ===== Cambios (detalle de una versión) =====
// ============================================================

export async function createChange(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  const authz = await authorizePermiso(PERMISO);
  if (!authz.ok) return { ok: false, message: authz.message };

  const parsed = ChangeCreateSchema.safeParse(leerCambio(formData));
  if (!parsed.success) return { ok: false, errors: z.flattenError(parsed.error).fieldErrors };

  try {
    const version = await prisma.platformVersion.findUnique({
      where: { id: parsed.data.versionId },
      select: { id: true, number: true },
    });
    if (!version) return { ok: false, message: "La versión indicada no existe." };

    const created = await prisma.versionChange.create({ data: parsed.data });

    const user = await getCurrentUser();
    await logAudit({
      user: user?.name ?? "Sistema",
      action: "CREÓ CAMBIO",
      entity: `Novedades · v${version.number}`,
      detail: `Agregó el cambio "${created.title}" a la versión ${version.number}`,
    });
    revalidatePath(PATH);
    return { ok: true, message: "Cambio agregado." };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("createChange", e) };
  }
}

export async function updateChange(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  const authz = await authorizePermiso(PERMISO);
  if (!authz.ok) return { ok: false, message: authz.message };

  const parsed = ChangeUpdateSchema.safeParse({ id: formData.get("id"), ...leerCambio(formData) });
  if (!parsed.success) return { ok: false, errors: z.flattenError(parsed.error).fieldErrors };

  try {
    const before = await prisma.versionChange.findUnique({
      where: { id: parsed.data.id },
      select: { id: true },
    });
    if (!before) return { ok: false, message: "El cambio no existe." };

    const version = await prisma.platformVersion.findUnique({
      where: { id: parsed.data.versionId },
      select: { id: true, number: true },
    });
    if (!version) return { ok: false, message: "La versión indicada no existe." };

    const { id, ...data } = parsed.data;
    const after = await prisma.versionChange.update({ where: { id }, data });

    const user = await getCurrentUser();
    await logAudit({
      user: user?.name ?? "Sistema",
      action: "EDITÓ CAMBIO",
      entity: `Novedades · v${version.number}`,
      detail: `Editó el cambio "${after.title}" (versión ${version.number})`,
    });
    revalidatePath(PATH);
    return { ok: true, message: "Cambio actualizado." };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("updateChange", e) };
  }
}

export async function deleteChange(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  const authz = await authorizePermiso(PERMISO);
  if (!authz.ok) return { ok: false, message: authz.message };

  const parsed = ChangeDeleteSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return { ok: false, errors: z.flattenError(parsed.error).fieldErrors };

  try {
    const before = await prisma.versionChange.findUnique({
      where: { id: parsed.data.id },
      select: { id: true, title: true, versionId: true },
    });
    if (!before) return { ok: false, message: "El cambio no existe." };

    await prisma.versionChange.delete({ where: { id: parsed.data.id } });

    const user = await getCurrentUser();
    const version = await prisma.platformVersion.findUnique({
      where: { id: before.versionId },
      select: { number: true },
    });
    await logAudit({
      user: user?.name ?? "Sistema",
      action: "ELIMINÓ CAMBIO",
      entity: `Novedades · v${version?.number ?? "?"}`,
      detail: `Eliminó el cambio "${before.title}"`,
    });
    revalidatePath(PATH);
    return { ok: true, message: "Cambio eliminado." };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("deleteChange", e) };
  }
}
