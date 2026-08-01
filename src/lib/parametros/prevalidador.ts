// Carga del catálogo del PREVALIDADOR en runtime: lee las filas VIGENTES de la BD
// (tabla `prevalidador_cuentas`, editable en /config/prevalidador) y cae al catálogo
// de fábrica si no hay filas o la BD falla (nunca rompe la pantalla del balance).
//
// El catálogo se cachea en el Data Cache de Next y se invalida al editar con
// updateTag(PREVALIDADOR_CACHE_TAG) desde la Server Action — mismo patrón que
// getUmbralesAlertas() y getMatriz().
import "server-only";
import { unstable_cache } from "next/cache";
import prisma from "@/lib/prisma";
import {
  catalogoPrevalidadorDeFabrica,
  esBaseCalculo,
  normalizarPrefijo,
  ordenModulo,
  type FilaCatalogoPrevalidador,
  type OverridePrevalidador,
} from "@/lib/balance/prevalidador/catalogo";

export const PREVALIDADOR_CACHE_TAG = "prevalidador-catalogo";

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
  return {
    id: f.id,
    moduloCodigo: f.module.code,
    moduloNombre: f.module.name,
    moduloOrden: ordenModulo(f.module.code),
    cuentaRussell: normalizarPrefijo(f.cuentaRussell),
    etiqueta: f.etiqueta,
    // Una base desconocida en BD (edición manual) no debe tumbar el informe.
    baseCalculo: esBaseCalculo(f.baseCalculo) ? f.baseCalculo : "saldo",
    orden: f.orden,
    activa: f.activa,
  };
}

/**
 * Lee el catálogo activo. NO atrapa el error a propósito: si la consulta falla,
 * `unstable_cache` no guarda nada y el siguiente request reintenta. Atraparlo aquí
 * congelaría el fallback de fábrica en la caché hasta que alguien invalidara el tag
 * a mano — que es justo lo que pasa si la app arranca antes de aplicar la migración.
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

/**
 * Catálogo ACTIVO (BD → fábrica). Lo consume el loader RSC de /balance/[id].
 *
 * El fallback se resuelve FUERA de la caché: sin filas (tabla vacía) o con la BD
 * caída, el informe se sigue viendo con las cuentas de fábrica. Esas van con
 * `id: 0`, así que la UI no ofrece guardarles cuentas propias de cliente —no habría
 * a qué colgarlas— y avisa de que el catálogo no está en base de datos.
 */
export async function getCatalogoPrevalidador(): Promise<FilaCatalogoPrevalidador[]> {
  try {
    const filas = await catalogoCacheado();
    return filas.length > 0 ? filas : catalogoPrevalidadorDeFabrica();
  } catch {
    return catalogoPrevalidadorDeFabrica();
  }
}

export type FilaCatalogoVista = FilaCatalogoPrevalidador & {
  moduloId: number;
  /** Cuántos clientes tienen una cuenta propia colgada de esta fila. */
  clientesConCuentaPropia: number;
  actualizadoPor: string | null;
  actualizadoEn: string | null; // ISO
};

/**
 * Vista COMPLETA para la pantalla de administración: incluye las filas inactivas y
 * el número de clientes afectados por cada una (lo necesita la confirmación de
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
    prisma.prevalidadorCuentaCliente.groupBy({ by: ["catalogoId"], _count: { _all: true } }),
  ]);
  const conteo = new Map(porFila.map((g) => [g.catalogoId, g._count._all]));
  return filas
    .map((f) => ({
      ...aFilaCatalogo(f),
      moduloId: f.moduloId,
      clientesConCuentaPropia: conteo.get(f.id) ?? 0,
      actualizadoPor: f.actualizadoPor,
      actualizadoEn: f.actualizadoEn ? f.actualizadoEn.toISOString() : null,
    }))
    .sort((a, b) => a.moduloOrden - b.moduloOrden || a.orden - b.orden || a.cuentaRussell.localeCompare(b.cuentaRussell));
}

/**
 * Cuentas propias del cliente, por fila del catálogo. SIN caché a propósito: son
 * por cliente, así que cachearlas exigiría un tag por cliente (o invalidar el
 * catálogo entero en cada guardado) para ahorrar un `findMany` de ≤11 filas sobre
 * un índice. No compensa.
 */
export async function getOverridesPrevalidadorCliente(clienteId: number): Promise<OverridePrevalidador[]> {
  try {
    const filas = await prisma.prevalidadorCuentaCliente.findMany({
      where: { clienteId },
      select: { catalogoId: true, cuentaCliente: true },
    });
    return filas.map((f) => ({ catalogoId: f.catalogoId, cuentaCliente: normalizarPrefijo(f.cuentaCliente) }));
  } catch {
    return [];
  }
}
