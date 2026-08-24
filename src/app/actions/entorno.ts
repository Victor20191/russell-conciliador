"use server";

import { revalidatePath, updateTag } from "next/cache";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/dal";
import { logAudit } from "@/lib/audit";
import { authorizePermiso } from "@/lib/rbac";
import { mensajeErrorBD } from "@/lib/errores";
import { encrypt } from "@/lib/crypto";
import { ENTORNO_CACHE_TAG } from "@/lib/entorno";

export type ActionState = {
  ok?: boolean;
  message?: string;
  errors?: Record<string, string[]>;
};

const PERMISO = "entorno:administrar";
const PATH = "/config/entorno";

/**
 * Crea o actualiza una variable de entorno.
 */
export async function actualizarVariableEntorno(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const authz = await authorizePermiso(PERMISO);
  if (!authz.ok) return { ok: false, message: authz.message };

  const key = String(formData.get("key") ?? "").trim();
  let value = String(formData.get("value") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const category = String(formData.get("category") ?? "SISTEMA").trim();
  const isSecret = formData.get("isSecret") === "true" || formData.get("isSecret") === "on";

  if (!key) return { ok: false, message: "La clave es obligatoria." };

  try {
    const user = await getCurrentUser();
    
    // Buscar existente para ver si ya era secreta y si se dejó intacta (********)
    const existente = await prisma.environmentVariable.findUnique({ where: { key } });
    
    // Si la interfaz envía los asteriscos, quiere decir que el administrador NO quiso cambiar el secreto.
    if (existente && existente.isSecret && value === "********") {
      value = existente.value ?? ""; // Retenemos el valor encriptado existente
    } else if (isSecret && value !== "") {
      value = encrypt(value);
    }

    await prisma.environmentVariable.upsert({
      where: { key },
      update: {
        value,
        isSecret,
        description,
        category,
        updatedBy: user?.name ?? null,
      },
      create: {
        key,
        value,
        isSecret,
        description,
        category,
        updatedBy: user?.name ?? null,
      },
    });

    await logAudit({
      user: user?.name ?? "Sistema",
      action: "EDITÓ VARIABLE DE ENTORNO",
      entity: `Configuración · ${key}`,
      detail: `Actualizó la variable ${key}`,
    });

    updateTag(ENTORNO_CACHE_TAG);
    revalidatePath(PATH);
    
    return { ok: true, message: "Variable de entorno actualizada." };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("actualizarVariableEntorno", e) };
  }
}

/**
 * Elimina (o blanquea) una variable de entorno, forzando a que se lea del process.env local.
 */
export async function eliminarVariableEntorno(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const authz = await authorizePermiso(PERMISO);
  if (!authz.ok) return { ok: false, message: authz.message };

  const key = String(formData.get("key") ?? "").trim();
  if (!key) return { ok: false, message: "La clave es obligatoria." };

  try {
    const user = await getCurrentUser();
    await prisma.environmentVariable.delete({
      where: { key },
    });

    await logAudit({
      user: user?.name ?? "Sistema",
      action: "ELIMINÓ VARIABLE DE ENTORNO",
      entity: `Configuración · ${key}`,
      detail: `Restauró el uso por defecto del sistema (.env físico) para ${key}`,
    });

    updateTag(ENTORNO_CACHE_TAG);
    revalidatePath(PATH);
    
    return { ok: true, message: "Variable de entorno restaurada." };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("eliminarVariableEntorno", e) };
  }
}
