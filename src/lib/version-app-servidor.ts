// Lectura de la versión actual de la plataforma (BD + fallback package.json).
// Solo servidor: el layout/login la consumen para mostrar "v1.4.0" en el cascarón.
import "server-only";

import { cache } from "react";
import { unstable_cache } from "next/cache";
import prisma from "@/lib/prisma";
import packageJson from "../../package.json";

/** Tag del Data Cache: invalidar con updateTag al crear/editar/borrar versiones. */
export const VERSION_APP_CACHE_TAG = "version-app-publicada-v1";

export type VersionApp = {
  /** Número legible (p. ej. "1.4.0"), sin prefijo "v". */
  number: string;
  /** Título de la release en /novedades, si viene de la plataforma. */
  title: string | null;
  /** Origen: última versión PUBLICADA en BD, o package.json como respaldo. */
  source: "plataforma" | "paquete";
};

/** Versión del paquete Node (package.json). Fuente de build / fallback. */
export function versionPaquete(): string {
  return typeof packageJson.version === "string" && packageJson.version.trim()
    ? packageJson.version.trim()
    : "0.0.0";
}

function versionDesdePaquete(): VersionApp {
  return { number: versionPaquete(), title: null, source: "paquete" };
}

/**
 * Última versión con estado `publicada` en `versiones_plataforma`.
 * Orden: fecha de publicación → orden manual → id (todos desc).
 * Si no hay ninguna o la BD falla, cae a package.json (nunca lanza).
 */
async function leerVersionPublicada(): Promise<VersionApp> {
  try {
    const v = await prisma.platformVersion.findFirst({
      where: { status: "publicada" },
      orderBy: [{ releasedAt: "desc" }, { order: "desc" }, { id: "desc" }],
      select: { number: true, title: true },
    });
    if (v?.number?.trim()) {
      return {
        number: v.number.trim(),
        title: v.title?.trim() || null,
        source: "plataforma",
      };
    }
  } catch {
    // Fail-soft: el cascarón no debe tumbarse por un fallo de changelog.
  }
  return versionDesdePaquete();
}

const getVersionAppCached = unstable_cache(
  leerVersionPublicada,
  ["version-app-publicada-v1"],
  {
    tags: [VERSION_APP_CACHE_TAG],
    revalidate: 3600,
  },
);

/**
 * Versión actual de la app (memoizada por request + Data Cache).
 * Preferencia: última PlatformVersion publicada → package.json.
 */
export const getVersionApp = cache(async (): Promise<VersionApp> => {
  try {
    return await getVersionAppCached();
  } catch {
    return versionDesdePaquete();
  }
});
