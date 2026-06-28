// Carga de los prompts de IA en runtime: lee el CONTENIDO vigente de la BD
// (tabla prompts_ia, editable por el Superadministrador) y cae al valor de
// fábrica del catálogo si no hay fila o la BD falla (nunca rompe la IA).
//
// El resultado se cachea en el Data Cache de Next y se invalida al editar con
// updateTag(PROMPTS_CACHE_TAG) desde la Server Action — mismo patrón que getMatriz().
import "server-only";
import { unstable_cache } from "next/cache";
import prisma from "@/lib/prisma";
import { PROMPTS_CATALOGO, getPromptDefecto, CLAVES_PROMPT } from "./prompts-catalogo";

export { CLAVE_EXTRACCION, CLAVE_MAPEO } from "./prompts-catalogo";

export const PROMPTS_CACHE_TAG = "prompts-ia";

async function leerContenido(clave: string): Promise<string> {
  try {
    const row = await prisma.promptIA.findUnique({ where: { clave }, select: { contenido: true } });
    if (row?.contenido && row.contenido.trim()) return row.contenido;
  } catch {
    /* BD inaccesible: caemos al valor de fábrica conocido (no romper la IA). */
  }
  return getPromptDefecto(clave);
}

/**
 * Contenido vigente del prompt `clave` (BD → fábrica), cacheado. Lo usan el
 * pipeline de extracción (`extraer.ts`) y el de mapeo (`mapeo-ia.ts`).
 */
export function getPromptContenido(clave: string): Promise<string> {
  return unstable_cache(() => leerContenido(clave), ["prompt-ia-contenido", clave], {
    tags: [PROMPTS_CACHE_TAG],
  })();
}

export type PromptVista = {
  clave: string;
  nombre: string;
  descripcion: string;
  contenido: string; // vigente (BD si existe; si no, el de fábrica)
  esPredeterminado: boolean; // el contenido vigente coincide con el de fábrica
  actualizadoPor: string | null;
  actualizadoEn: string | null; // ISO
};

/**
 * Vista de TODOS los prompts del catálogo para la pantalla de administración:
 * fusiona el catálogo (nombre/descripción/fábrica) con lo guardado en BD. No
 * escribe nada: las filas se crean al editar/restaurar.
 */
export async function getPromptsVista(): Promise<PromptVista[]> {
  let rows: { clave: string; contenido: string; predeterminado: string; actualizadoPor: string | null; actualizadoEn: Date }[] = [];
  try {
    rows = await prisma.promptIA.findMany({ where: { clave: { in: CLAVES_PROMPT } } });
  } catch {
    rows = [];
  }
  const porClave = new Map(rows.map((r) => [r.clave, r]));
  return PROMPTS_CATALOGO.map((def) => {
    const row = porClave.get(def.clave);
    const defecto = def.defecto();
    const contenido = row?.contenido?.trim() ? row.contenido : defecto;
    // El "predeterminado" de referencia es el guardado en BD (Vercel-safe) o el
    // de fábrica del código si aún no hay fila.
    const referencia = row?.predeterminado?.trim() ? row.predeterminado : defecto;
    return {
      clave: def.clave,
      nombre: def.nombre,
      descripcion: def.descripcion,
      contenido,
      esPredeterminado: contenido.trim() === referencia.trim(),
      actualizadoPor: row?.actualizadoPor ?? null,
      actualizadoEn: row?.actualizadoEn ? row.actualizadoEn.toISOString() : null,
    };
  });
}
