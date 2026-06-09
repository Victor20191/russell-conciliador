"use server";

import * as z from "zod";
import { revalidatePath } from "next/cache";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/dal";
import { logAudit } from "@/lib/audit";
import { ModuleFieldSchema, type ActionState } from "@/lib/definitions";
import { parseId } from "@/lib/ids";
import { requirePermiso, authorizePermiso } from "@/lib/rbac";
import { mensajeErrorBD, registrarError } from "@/lib/errores";

const PATH = "/config/modulos";

export async function createModuleField(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const authz = await authorizePermiso("modulos:configurar");
  if (!authz.ok) return { ok: false, message: authz.message };
  const parsed = ModuleFieldSchema.safeParse({
    moduleId: formData.get("moduleId"),
    key: formData.get("key"),
    label: formData.get("label"),
    type: formData.get("type"),
    required: formData.get("required") === "on",
    hint: (formData.get("hint") as string) ?? "",
  });
  if (!parsed.success) {
    return { ok: false, errors: z.flattenError(parsed.error).fieldErrors };
  }
  const { moduleId, key, label, type, required, hint } = parsed.data;

  // Operaciones de base de datos envueltas en try-catch
  try {
    const dup = await prisma.moduleField.findUnique({
      where: { moduleId_key: { moduleId, key } },
    });
    if (dup) return { ok: false, message: "Ya existe un campo con esa clave en el módulo." };

    const order = await prisma.moduleField.count({ where: { moduleId } });
    await prisma.moduleField.create({
      data: { moduleId, key, label, type, required, hint: hint?.trim() || null, order },
    });

    const user = await getCurrentUser();
    await logAudit({
      user: user?.name ?? "Sistema",
      action: "AGREGÓ CAMPO",
      entity: `Módulo ${moduleId}`,
      detail: `${key} · ${label}`,
    });
    revalidatePath(PATH);
    return { ok: true };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("createModuleField", e) };
  }
}

export async function updateModuleField(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const authz = await authorizePermiso("modulos:configurar");
  if (!authz.ok) return { ok: false, message: authz.message };
  const id = parseId(formData.get("id"));
  if (!id) return { ok: false, message: "Campo inexistente." };

  const parsed = ModuleFieldSchema.safeParse({
    moduleId: formData.get("moduleId"),
    key: formData.get("key"),
    label: formData.get("label"),
    type: formData.get("type"),
    required: formData.get("required") === "on",
    hint: (formData.get("hint") as string) ?? "",
  });
  if (!parsed.success) {
    return { ok: false, errors: z.flattenError(parsed.error).fieldErrors };
  }
  const { key, label, type, required, hint } = parsed.data;

  // Operaciones de base de datos envueltas en try-catch
  try {
    await prisma.moduleField.update({
      where: { id },
      data: { key, label, type, required, hint: hint?.trim() || null },
    });
    revalidatePath(PATH);
    return { ok: true };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("updateModuleField", e) };
  }
}

export async function deleteModuleField(formData: FormData): Promise<void> {
  await requirePermiso("modulos:configurar");
  const id = parseId(formData.get("id"));
  if (!id) return;
  // Operaciones de base de datos envueltas en try-catch
  try {
    await prisma.moduleField.delete({ where: { id } });
    revalidatePath(PATH);
  } catch (e) {
    registrarError("deleteModuleField", e);
    throw e;
  }
}

export async function moveModuleField(formData: FormData): Promise<void> {
  await requirePermiso("modulos:configurar");
  const id = parseId(formData.get("id"));
  if (!id) return;
  const dir = formData.get("dir") as string; // "up" | "down"
  // Operaciones de base de datos envueltas en try-catch
  try {
    const field = await prisma.moduleField.findUnique({ where: { id } });
    if (!field) return;

    const neighbor = await prisma.moduleField.findFirst({
      where: {
        moduleId: field.moduleId,
        order: dir === "up" ? { lt: field.order } : { gt: field.order },
      },
      orderBy: { order: dir === "up" ? "desc" : "asc" },
    });
    if (!neighbor) return;

    await prisma.$transaction([
      prisma.moduleField.update({ where: { id: field.id }, data: { order: neighbor.order } }),
      prisma.moduleField.update({ where: { id: neighbor.id }, data: { order: field.order } }),
    ]);
    revalidatePath(PATH);
  } catch (e) {
    registrarError("moveModuleField", e);
    throw e;
  }
}
