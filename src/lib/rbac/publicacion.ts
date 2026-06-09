import "server-only";
import { cache } from "react";
import { unstable_cache } from "next/cache";
import prisma from "@/lib/prisma";
import {
  MODULOS_PLATAFORMA,
  MODULOS_PLATAFORMA_KEYS,
  moduloPublicadoParaRol,
  type PlatformModuleState,
} from "@/lib/rbac/modulos-plataforma";

export const PUBLICACION_MODULOS_CACHE_TAG = "publicacion-modulos";

async function leerPublicacionBD(): Promise<PlatformModuleState[]> {
  const filas = await prisma.platformModule.findMany({
    orderBy: [{ order: "asc" }, { label: "asc" }],
  });
  const porClave = new Map(filas.map((m) => [m.key, m]));

  return MODULOS_PLATAFORMA.map((def) => {
    const fila = porClave.get(def.key);
    return {
      ...def,
      id: fila?.id,
      label: fila?.label ?? def.label,
      description: fila?.description ?? def.description,
      group: (fila?.group as PlatformModuleState["group"] | undefined) ?? def.group,
      icon: (fila?.icon as PlatformModuleState["icon"] | undefined) ?? def.icon,
      order: fila?.order ?? def.order,
      enabledForNonAdmins: fila?.enabledForNonAdmins ?? def.enabledForNonAdmins,
      configurableForNonAdmins:
        fila?.configurableForNonAdmins ?? def.configurableForNonAdmins,
    };
  }).sort((a, b) => a.order - b.order || a.label.localeCompare(b.label));
}

const getPublicacionCached = unstable_cache(
  leerPublicacionBD,
  ["publicacion-modulos"],
  { tags: [PUBLICACION_MODULOS_CACHE_TAG], revalidate: 3600 },
);

export const getPublicacionModulos = cache(async (): Promise<PlatformModuleState[]> => {
  try {
    return await getPublicacionCached();
  } catch {
    return MODULOS_PLATAFORMA;
  }
});

export async function moduloDisponibleParaRol(
  role: string,
  moduleKey: string,
): Promise<boolean> {
  if (!MODULOS_PLATAFORMA_KEYS.has(moduleKey)) return true;
  const estados = await getPublicacionModulos();
  return moduloPublicadoParaRol(role, moduleKey, estados);
}

export async function modulosVisiblesParaRol(role: string): Promise<string[]> {
  const estados = await getPublicacionModulos();
  return estados
    .filter((m) => moduloPublicadoParaRol(role, m.key, estados))
    .map((m) => m.key);
}
