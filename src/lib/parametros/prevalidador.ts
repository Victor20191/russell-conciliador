// Persistencia/lectura del PREVALIDADOR. Todos los loaders fallan CERRADO: un
// catálogo vacío es un éxito vacío y un error de BD se propaga; nunca se reemplaza
// estado persistente por valores de fábrica ni se confunde un fallo con «sin datos».
//
// El catálogo se cachea en el Data Cache de Next y se invalida al editar con
// updateTag(PREVALIDADOR_CACHE_TAG) desde la Server Action — mismo patrón que
// getUmbralesAlertas() y getMatriz().
import "server-only";
import { unstable_cache } from "next/cache";
import prisma from "@/lib/prisma";
import {
  esBaseCalculo,
  normalizarPrefijo,
  ordenModulo,
  PREVALIDADOR_MODULOS_ORDEN,
  type FilaCatalogoPrevalidador,
  type OverridePrevalidador,
} from "@/lib/balance/prevalidador/catalogo";

export const PREVALIDADOR_CACHE_TAG = "prevalidador-catalogo";
export const MODULOS_PREVALIDADOR_APROBADOS = new Set(PREVALIDADOR_MODULOS_ORDEN);

type FilaBD = {
  id: number;
  cuentaRussell: string;
  etiqueta: string | null;
  baseCalculo: string;
  orden: number;
  activa: boolean;
  actualizadoPor: string | null;
  actualizadoEn: Date;
  module: { code: string; name: string };
};

const SELECT_FILA = {
  id: true,
  cuentaRussell: true,
  etiqueta: true,
  baseCalculo: true,
  orden: true,
  activa: true,
  actualizadoPor: true,
  actualizadoEn: true,
  module: { select: { code: true, name: true } },
} as const;

function aFilaCatalogo(f: FilaBD): FilaCatalogoPrevalidador {
  const cuentaRussell = normalizarPrefijo(f.cuentaRussell);
  if (!MODULOS_PREVALIDADOR_APROBADOS.has(f.module.code)) {
    throw new Error(`El módulo ${f.module.code} no pertenece al prevalidador aprobado.`);
  }
  if (cuentaRussell.length !== 2 && cuentaRussell.length !== 4) {
    throw new Error(`La cuenta ${cuentaRussell || "vacía"} del prevalidador no tiene nivel 2/4.`);
  }
  if (!esBaseCalculo(f.baseCalculo)) {
    throw new Error(`La cuenta ${cuentaRussell} tiene una base de cálculo inválida.`);
  }
  return {
    id: f.id,
    moduloCodigo: f.module.code,
    moduloNombre: f.module.name,
    moduloOrden: ordenModulo(f.module.code),
    cuentaRussell,
    etiqueta: f.etiqueta,
    baseCalculo: f.baseCalculo,
    orden: f.orden,
    activa: f.activa,
  };
}

/**
 * Lee el catálogo activo. NO atrapa el error a propósito: si la consulta falla,
 * `unstable_cache` no guarda nada y el siguiente request reintenta. Atraparlo aquí
 * podría congelar un estado sintético en la caché hasta que alguien invalidara el
 * tag a mano — justo lo que no debe pasar si la app arranca sin su migración.
 */
async function leerCatalogoActivo(): Promise<FilaCatalogoPrevalidador[]> {
  const filas = await prisma.prevalidadorCuenta.findMany({
    where: { activa: true },
    select: SELECT_FILA,
    orderBy: [{ orden: "asc" }, { cuentaRussell: "asc" }],
  });
  return filas.map(aFilaCatalogo);
}

const catalogoCacheado = unstable_cache(leerCatalogoActivo, ["prevalidador-catalogo-vigente"], {
  tags: [PREVALIDADOR_CACHE_TAG],
});

/** Catálogo ACTIVO persistido. `[]` significa vacío real; un fallo se propaga. */
export async function getCatalogoPrevalidador(): Promise<FilaCatalogoPrevalidador[]> {
  return catalogoCacheado();
}

export type FilaCatalogoVista = FilaCatalogoPrevalidador & {
  moduloId: number;
  /** Cuántos balances tienen una cuenta propia colgada de esta fila. */
  balancesConCuentaPropia: number;
  actualizadoPor: string | null;
  actualizadoEn: string | null; // ISO
};

/**
 * Vista COMPLETA para la pantalla de administración: incluye las filas inactivas y
 * el número de balances afectados por cada una (lo necesita la confirmación de
 * borrado, que arrastra las cuentas propias por cascada). Sin caché, como
 * `getUmbralesVista()`.
 */
export async function getCatalogoPrevalidadorVista(): Promise<FilaCatalogoVista[]> {
  // Lectura directa (sin el helper cacheado): la pantalla de administración necesita
  // ver también las filas inactivas.
  const [filas, porFila] = await Promise.all([
    prisma.prevalidadorCuenta.findMany({
      select: { ...SELECT_FILA, moduloId: true },
      orderBy: [{ orden: "asc" }, { cuentaRussell: "asc" }],
    }),
    prisma.prevalidadorCuentaBalance.groupBy({ by: ["catalogoId"], _count: { _all: true } }),
  ]);
  const conteo = new Map(porFila.map((g) => [g.catalogoId, g._count._all]));
  return filas
    .map((f) => ({
      ...aFilaCatalogo(f),
      moduloId: f.moduloId,
      balancesConCuentaPropia: conteo.get(f.id) ?? 0,
      actualizadoPor: f.actualizadoPor,
      actualizadoEn: f.actualizadoEn ? f.actualizadoEn.toISOString() : null,
    }))
    .sort((a, b) => a.moduloOrden - b.moduloOrden || a.orden - b.orden || a.cuentaRussell.localeCompare(b.cuentaRussell));
}

/** Overrides propios de UN balance. `[]` es éxito vacío; un fallo se propaga. */
export async function getOverridesPrevalidadorBalance(balanceId: number): Promise<OverridePrevalidador[]> {
  const filas = await prisma.prevalidadorCuentaBalance.findMany({
    where: { balanceId },
    select: { catalogoId: true, cuentaCliente: true },
    orderBy: { catalogoId: "asc" },
  });
  return filas.map((f) => ({ catalogoId: f.catalogoId, cuentaCliente: normalizarPrefijo(f.cuentaCliente) }));
}

/** Último evento append-only de aprobación/revocación del balance. */
export async function getUltimaRevisionPrevalidadorBalance(balanceId: number) {
  return prisma.prevalidadorRevisionBalance.findFirst({
    where: { balanceId },
    orderBy: [{ creadoEn: "desc" }, { id: "desc" }],
  });
}
