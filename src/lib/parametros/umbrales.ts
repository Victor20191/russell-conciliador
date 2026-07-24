// Carga de los umbrales de alertas en runtime: lee el valor VIGENTE de la BD
// (tabla umbrales_alertas, editable en /config/parametros) y cae al valor de
// fábrica del catálogo si no hay fila o la BD falla (nunca rompe el balance).
//
// El resultado se cachea en el Data Cache de Next y se invalida al editar con
// updateTag(UMBRALES_CACHE_TAG) desde la Server Action — mismo patrón que
// getMatriz() y getPromptContenido().
import "server-only";
import { unstable_cache } from "next/cache";
import prisma from "@/lib/prisma";
import {
  UMBRALES_CATALOGO,
  UMBRALES_ALERTAS_DEFECTO,
  CLAVES_UMBRAL,
  type ClaveUmbral,
  type UmbralesAlertas,
} from "@/lib/balance/umbrales-alertas";

export const UMBRALES_CACHE_TAG = "umbrales-alertas";

type FilaUmbral = {
  clave: string;
  valor: unknown; // Prisma.Decimal
  predeterminado: unknown;
  actualizadoPor: string | null;
  actualizadoEn: Date;
};

/** Decimal de Prisma → número. Descarta valores no finitos o negativos. */
function aMonto(valor: unknown): number | null {
  const n = Number(valor);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

async function leerFilas(): Promise<FilaUmbral[]> {
  try {
    return await prisma.umbralAlerta.findMany({ where: { clave: { in: CLAVES_UMBRAL } } });
  } catch {
    /* BD inaccesible: caemos a los valores de fábrica (no romper el balance). */
    return [];
  }
}

async function leerUmbrales(): Promise<UmbralesAlertas> {
  const porClave = new Map((await leerFilas()).map((f) => [f.clave, f]));
  const resuelto = { ...UMBRALES_ALERTAS_DEFECTO };
  for (const def of UMBRALES_CATALOGO) {
    const valor = aMonto(porClave.get(def.clave)?.valor);
    if (valor != null) resuelto[def.clave] = valor;
  }
  return resuelto;
}

/**
 * Umbrales vigentes (BD → fábrica), cacheados. Los consumen los loaders RSC del
 * borrador y del balance, las rutas de exportación y las Server Actions que
 * recalculan validaciones o diagnósticos.
 */
export function getUmbralesAlertas(): Promise<UmbralesAlertas> {
  return unstable_cache(leerUmbrales, ["umbrales-alertas-vigentes"], { tags: [UMBRALES_CACHE_TAG] })();
}

export type UmbralVista = {
  clave: ClaveUmbral;
  nombre: string;
  descripcion: string;
  dondeAplica: string;
  valor: number; // vigente (BD si existe; si no, el de fábrica)
  predeterminado: number; // valor de referencia para "restaurar"
  esPredeterminado: boolean;
  minimo: number;
  maximo: number;
  actualizadoPor: string | null;
  actualizadoEn: string | null; // ISO
};

/**
 * Vista de TODOS los umbrales del catálogo para la pantalla de administración:
 * fusiona el catálogo (nombre/descripción/fábrica) con lo guardado en BD. No
 * escribe nada: las filas las crea la migración o el primer guardado.
 */
export async function getUmbralesVista(): Promise<UmbralVista[]> {
  const porClave = new Map((await leerFilas()).map((f) => [f.clave, f]));
  return UMBRALES_CATALOGO.map((def) => {
    const fila = porClave.get(def.clave);
    const valor = aMonto(fila?.valor) ?? def.defecto;
    // La referencia de "predeterminado" es la guardada en BD; si no hay fila,
    // el valor de fábrica del catálogo.
    const predeterminado = aMonto(fila?.predeterminado) ?? def.defecto;
    return {
      clave: def.clave,
      nombre: def.nombre,
      descripcion: def.descripcion,
      dondeAplica: def.dondeAplica,
      valor,
      predeterminado,
      esPredeterminado: valor === predeterminado,
      minimo: def.minimo,
      maximo: def.maximo,
      actualizadoPor: fila?.actualizadoPor ?? null,
      actualizadoEn: fila?.actualizadoEn ? fila.actualizadoEn.toISOString() : null,
    };
  });
}
