"use server";

import * as z from "zod";
import { revalidatePath } from "next/cache";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/dal";
import { logAudit } from "@/lib/audit";
import { ModuleFieldSchema, type ActionState } from "@/lib/definitions";
import { parseId } from "@/lib/ids";
import { authorizePermiso } from "@/lib/rbac";
import { mensajeErrorBD } from "@/lib/errores";
import { MODULOS_IMPORT } from "@/lib/modulos/descriptores";

const PATH = "/config/modulos";

// Los campos de estos módulos los define el MOTOR de importación (descriptores en código):
// esta acción reCarga `campos_modulo` para reflejar exactamente esas columnas (una sola
// fuente de verdad = código). No es edición manual; es un espejo regenerable.
const tipoBD = (t: string) => (t === "numero" || t === "moneda" ? "number" : t === "fecha" ? "date" : "string");

export async function sincronizarCamposDesdeDescriptores(): Promise<ActionState> {
  const authz = await authorizePermiso("modulos:configurar");
  if (!authz.ok) return { ok: false, message: authz.message };
  try {
    let modulos = 0;
    let campos = 0;
    for (const d of Object.values(MODULOS_IMPORT)) {
      const mod = await prisma.module.upsert({
        where: { code: d.codigo },
        create: { code: d.codigo, name: d.label, icon: "box" },
        update: {},
        select: { id: true },
      });
      await prisma.$transaction([
        prisma.moduleField.deleteMany({ where: { moduleId: mod.id } }),
        prisma.moduleField.createMany({
          data: d.columnas.map((c, i) => ({
            moduleId: mod.id,
            key: c.nombre,
            label: c.etiqueta,
            type: tipoBD(c.tipo),
            required: c.requerido,
            hint: c.sinonimos?.length ? `Sinónimos: ${c.sinonimos.join(", ")}` : null,
            order: i,
          })),
        }),
      ]);
      modulos++;
      campos += d.columnas.length;
    }
    const user = await getCurrentUser();
    await logAudit({ user: user?.name ?? "Sistema", action: "SINCRONIZÓ CAMPOS DE MÓDULOS", entity: "Módulos y campos", detail: `${modulos} módulos · ${campos} campos desde el motor` });
    revalidatePath(PATH);
    return { ok: true, message: `Sincronizados ${campos} campos en ${modulos} módulos desde el motor.` };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("sincronizarCamposDesdeDescriptores", e) };
  }
}

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
    const updated = await prisma.moduleField.update({
      where: { id },
      data: { key, label, type, required, hint: hint?.trim() || null },
    });
    const user = await getCurrentUser();
    await logAudit({
      user: user?.name ?? "Sistema",
      action: "EDITÓ CAMPO",
      entity: `Módulo ${updated.moduleId}`,
      detail: `${updated.key} · ${updated.label}`,
    });
    revalidatePath(PATH);
    return { ok: true };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("updateModuleField", e) };
  }
}

export async function deleteModuleField(formData: FormData): Promise<ActionState> {
  const authz = await authorizePermiso("modulos:configurar");
  if (!authz.ok) return { ok: false, message: authz.message };
  const id = parseId(formData.get("id"));
  if (!id) return { ok: false, message: "Campo inexistente." };
  // Operaciones de base de datos envueltas en try-catch
  try {
    const deleted = await prisma.moduleField.delete({ where: { id } });
    const user = await getCurrentUser();
    await logAudit({
      user: user?.name ?? "Sistema",
      action: "ELIMINÓ CAMPO",
      entity: `Módulo ${deleted.moduleId}`,
      detail: `${deleted.key} · ${deleted.label}`,
    });
    revalidatePath(PATH);
    return { ok: true, message: "Campo eliminado." };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("deleteModuleField", e) };
  }
}

export async function moveModuleField(formData: FormData): Promise<ActionState> {
  const authz = await authorizePermiso("modulos:configurar");
  if (!authz.ok) return { ok: false, message: authz.message };
  const id = parseId(formData.get("id"));
  if (!id) return { ok: false, message: "Campo inexistente." };
  const dir = formData.get("dir"); // "up" | "down"
  if (dir !== "up" && dir !== "down") return { ok: false, message: "Dirección inválida." };
  // Operaciones de base de datos envueltas en try-catch
  try {
    const field = await prisma.moduleField.findUnique({ where: { id } });
    if (!field) return { ok: false, message: "Campo inexistente." };

    const neighbor = await prisma.moduleField.findFirst({
      where: {
        moduleId: field.moduleId,
        order: dir === "up" ? { lt: field.order } : { gt: field.order },
      },
      orderBy: { order: dir === "up" ? "desc" : "asc" },
    });
    if (!neighbor) return { ok: true, message: "El campo ya está en el límite de la lista." };

    await prisma.$transaction([
      prisma.moduleField.update({ where: { id: field.id }, data: { order: neighbor.order } }),
      prisma.moduleField.update({ where: { id: neighbor.id }, data: { order: field.order } }),
    ]);
    const user = await getCurrentUser();
    await logAudit({
      user: user?.name ?? "Sistema",
      action: "REORDENÓ CAMPO",
      entity: `Módulo ${field.moduleId}`,
      detail: `${field.key} · ${dir === "up" ? "subió" : "bajó"}`,
    });
    revalidatePath(PATH);
    return { ok: true, message: "Campo reordenado." };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("moveModuleField", e) };
  }
}
