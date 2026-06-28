"use server";

import { revalidatePath, updateTag } from "next/cache";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/dal";
import { logAudit } from "@/lib/audit";
import { authorizePermiso } from "@/lib/rbac";
import { mensajeErrorBD } from "@/lib/errores";
import { ActualizarPromptSchema, type ActionState } from "@/lib/definitions";
import { PROMPTS_CACHE_TAG } from "@/lib/ia/prompts";
import { getPromptDef } from "@/lib/ia/prompts-catalogo";

const PATH = "/config/prompts";
const PERMISO = "prompts:administrar";

/**
 * Edita el contenido de un prompt de IA. Upsert por `clave`: al crear la fila
 * congela el valor de fábrica en `predeterminado` (para poder restaurar luego).
 * Invalida la caché de prompts para que la IA use el nuevo texto de inmediato.
 */
export async function actualizarPrompt(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const authz = await authorizePermiso(PERMISO);
  if (!authz.ok) return { ok: false, message: authz.message };

  const parsed = ActualizarPromptSchema.safeParse({
    clave: formData.get("clave"),
    contenido: formData.get("contenido"),
  });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Datos inválidos." };

  const { clave, contenido } = parsed.data;
  const def = getPromptDef(clave);
  if (!def) return { ok: false, message: "Prompt desconocido." };

  try {
    const user = await getCurrentUser();
    await prisma.promptIA.upsert({
      where: { clave },
      create: { clave, contenido, predeterminado: def.defecto(), actualizadoPor: user?.name ?? null },
      update: { contenido, actualizadoPor: user?.name ?? null },
    });

    await logAudit({
      user: user?.name ?? "Sistema",
      action: "EDITÓ PROMPT IA",
      entity: `Prompts · ${def.nombre}`,
      detail: `Editó el prompt «${def.nombre}» (${contenido.length} caracteres)`,
    });
    // Invalida la caché de prompts para que la IA use el nuevo texto en la
    // siguiente petición (read-your-own-writes). `updateTag` es la API de Next 16
    // para expiración inmediata desde Server Actions (invalida unstable_cache).
    updateTag(PROMPTS_CACHE_TAG);
    revalidatePath(PATH);
    return { ok: true, message: "Prompt actualizado." };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("actualizarPrompt", e) };
  }
}

/**
 * Restaura un prompt a su valor predeterminado. Usa el `predeterminado` guardado
 * en BD (Vercel-safe) y, si no hay fila, el de fábrica del catálogo.
 */
export async function restaurarPrompt(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const authz = await authorizePermiso(PERMISO);
  if (!authz.ok) return { ok: false, message: authz.message };

  const clave = String(formData.get("clave") ?? "").trim();
  const def = getPromptDef(clave);
  if (!def) return { ok: false, message: "Prompt desconocido." };

  try {
    const user = await getCurrentUser();
    const fila = await prisma.promptIA.findUnique({ where: { clave }, select: { predeterminado: true } });
    const defecto = fila?.predeterminado?.trim() ? fila.predeterminado : def.defecto();
    await prisma.promptIA.upsert({
      where: { clave },
      create: { clave, contenido: defecto, predeterminado: def.defecto(), actualizadoPor: user?.name ?? null },
      update: { contenido: defecto, actualizadoPor: user?.name ?? null },
    });

    await logAudit({
      user: user?.name ?? "Sistema",
      action: "RESTAURÓ PROMPT IA",
      entity: `Prompts · ${def.nombre}`,
      detail: `Restauró el prompt «${def.nombre}» al valor predeterminado`,
    });
    // Invalida la caché de prompts para que la IA use el nuevo texto en la
    // siguiente petición (read-your-own-writes). `updateTag` es la API de Next 16
    // para expiración inmediata desde Server Actions (invalida unstable_cache).
    updateTag(PROMPTS_CACHE_TAG);
    revalidatePath(PATH);
    return { ok: true, message: "Prompt restaurado al valor predeterminado." };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("restaurarPrompt", e) };
  }
}
