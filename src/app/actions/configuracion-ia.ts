"use server";

import { revalidatePath } from "next/cache";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/dal";
import { logAudit } from "@/lib/audit";
import { authorizePermiso } from "@/lib/rbac";
import { mensajeErrorBD } from "@/lib/errores";
import type { ActionState } from "@/lib/definitions";
import {
  CLAVE_MODELO_NOVEDADES,
  MODELOS_NOVEDADES,
  esModeloValido,
} from "@/lib/ia/modelos-novedades";

const PATH = "/config/prompts";
const PERMISO = "prompts:administrar";

/**
 * Guarda el modelo de IA que usará el hook que vuelca los commits del día a
 * /novedades. Upsert por clave en `configuracion_plataforma`. Mismo permiso que
 * los prompts (Superadministrador). El script del hook lee este valor de la BD.
 */
export async function actualizarModeloNovedades(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const authz = await authorizePermiso(PERMISO);
  if (!authz.ok) return { ok: false, message: authz.message };

  const modelo = String(formData.get("modelo") ?? "").trim();
  if (!esModeloValido(modelo)) return { ok: false, message: "Modelo de IA inválido." };

  try {
    const user = await getCurrentUser();
    await prisma.configuracionPlataforma.upsert({
      where: { clave: CLAVE_MODELO_NOVEDADES },
      create: { clave: CLAVE_MODELO_NOVEDADES, valor: modelo, actualizadoPor: user?.name ?? null },
      update: { valor: modelo, actualizadoPor: user?.name ?? null },
    });

    const def = MODELOS_NOVEDADES.find((m) => m.valor === modelo);
    await logAudit({
      user: user?.name ?? "Sistema",
      action: "CAMBIÓ MODELO IA",
      entity: "Configuración · Modelo de novedades",
      detail: `Modelo de IA para novedades: ${def?.etiqueta ?? modelo}`,
    });

    revalidatePath(PATH);
    return { ok: true, message: "Modelo de IA actualizado." };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("actualizarModeloNovedades", e) };
  }
}
