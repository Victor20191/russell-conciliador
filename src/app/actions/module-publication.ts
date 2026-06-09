"use server";

import { revalidatePath, updateTag } from "next/cache";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/dal";
import { logAudit } from "@/lib/audit";
import { authorizePermiso } from "@/lib/rbac";
import {
  MODULOS_PLATAFORMA,
  type PlatformModuleKey,
} from "@/lib/rbac/modulos-plataforma";
import { PUBLICACION_MODULOS_CACHE_TAG } from "@/lib/rbac/publicacion";
import { mensajeErrorBD } from "@/lib/errores";

export type CambioPublicacionModulo = {
  key: string;
  enabledForNonAdmins: boolean;
};

export type GuardarPublicacionResult = {
  ok: boolean;
  message?: string;
  guardados?: number;
};

const PATH = "/config/publicacion-modulos";

export async function guardarPublicacionModulos(
  cambios: CambioPublicacionModulo[],
): Promise<GuardarPublicacionResult> {
  const authz = await authorizePermiso("publicacion_modulos:configurar");
  if (!authz.ok) return { ok: false, message: authz.message };

  if (!Array.isArray(cambios) || cambios.length === 0) {
    return { ok: false, message: "No hay cambios para guardar." };
  }

  const catalogo = new Map(MODULOS_PLATAFORMA.map((m) => [m.key, m]));
  const normalizados: CambioPublicacionModulo[] = [];
  for (const cambio of cambios) {
    const modulo = catalogo.get(cambio.key as PlatformModuleKey);
    if (!modulo) return { ok: false, message: "Módulo inexistente." };
    if (!modulo.configurableForNonAdmins) {
      return { ok: false, message: `${modulo.label} no se puede marcar en desarrollo.` };
    }
    normalizados.push({
      key: modulo.key,
      enabledForNonAdmins: Boolean(cambio.enabledForNonAdmins),
    });
  }

  try {
    const actor = await getCurrentUser();
    let guardados = 0;
    await prisma.$transaction(async (tx) => {
      for (const cambio of normalizados) {
        const modulo = catalogo.get(cambio.key as PlatformModuleKey)!;
        await tx.platformModule.upsert({
          where: { key: modulo.key },
          update: { enabledForNonAdmins: cambio.enabledForNonAdmins },
          create: {
            key: modulo.key,
            label: modulo.label,
            description: modulo.description,
            group: modulo.group,
            icon: modulo.icon,
            order: modulo.order,
            enabledForNonAdmins: cambio.enabledForNonAdmins,
            configurableForNonAdmins: modulo.configurableForNonAdmins,
          },
        });
        guardados += 1;
      }
    });

    for (const cambio of normalizados) {
      const modulo = catalogo.get(cambio.key as PlatformModuleKey)!;
      await logAudit({
        user: actor?.name ?? "Sistema",
        action: cambio.enabledForNonAdmins ? "PUBLICÓ MÓDULO" : "MARCÓ MÓDULO EN DESARROLLO",
        entity: modulo.label,
        detail: "Usuarios no superadministradores",
      });
    }

    updateTag(PUBLICACION_MODULOS_CACHE_TAG);
    revalidatePath(PATH);
    revalidatePath("/", "layout");
    return { ok: true, guardados };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("guardarPublicacionModulos", e) };
  }
}
