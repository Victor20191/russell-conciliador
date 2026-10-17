import "server-only";

// Lectura del Consolidado de UN período: la memoria del cliente con la asignación del período
// encima (`asignacion-periodo.ts`). La usan la página del cargue, los insumos de los cruces
// (marcas, emparejamientos, cierre) y la exportación, para que todos vean las mismas
// cuentas. Los lectores de la memoria general (conceptos de Nómina) no pasan por aquí.
import prisma from "@/lib/prisma";
import type { FilaAsignacionPeriodo } from "./asignacion-periodo";
import { leerAsignacionPeriodo, leerConsolidacionDelPeriodo, type FilaConsolidacionPeriodo } from "./asignacion-periodo-lectura";
import { AGRUPAR_POR_DEFECTO, type AgruparPorNomina } from "./nomina/agrupar-por";

export type { FilaConsolidacionPeriodo };

/**
 * Filas guardadas de la asignación del período. Nómina: solo las de la dimensión con que se agrupa
 * el cargue («Agrupar por»); los demás módulos siempre son `codigo`.
 */
export async function filasAsignacionPeriodo(
  clienteId: number,
  moduloCodigo: string,
  periodo: string,
  agruparPor: AgruparPorNomina = AGRUPAR_POR_DEFECTO,
): Promise<FilaAsignacionPeriodo[]> {
  return leerAsignacionPeriodo(prisma, clienteId, moduloCodigo, periodo, agruparPor);
}

/**
 * El Consolidado con que se concilia el período, y las filas de su asignación propia, EN VIVO. Nómina
 * pasa la dimensión del cargue: lo asignado agrupando por código no se mezcla con lo asignado
 * agrupando por nombre o por cuenta. Con la conciliación del período en firme, el cruce y la página
 * leen la copia congelada del cierre (`cargarInsumosPeriodo`), no esto.
 */
export async function cargarConsolidacionDelPeriodo(
  clienteId: number,
  moduloCodigo: string,
  periodo: string,
  opciones?: { agruparPor?: AgruparPorNomina },
): Promise<{ filas: FilaConsolidacionPeriodo[]; filasPeriodo: FilaAsignacionPeriodo[] }> {
  return leerConsolidacionDelPeriodo(prisma, clienteId, moduloCodigo, periodo, opciones?.agruparPor ?? AGRUPAR_POR_DEFECTO);
}

/**
 * Nombres de cuentas Russell de cualquier nivel: las de 6 del plan estándar y los subgrupos de 4.
 * Sirve para las cuentas del período, que la cédula no carga.
 */
export async function nombresCuentasRussell(codigos: readonly string[]): Promise<{ codigo: string; nombre: string }[]> {
  const seis = [...new Set(codigos.filter((c) => c.length === 6))];
  const cuatro = [...new Set(codigos.filter((c) => c.length === 4))];
  const [cuentas, subgrupos] = await Promise.all([
    seis.length ? prisma.standardAccount.findMany({ where: { code: { in: seis } }, select: { code: true, name: true } }) : Promise.resolve([]),
    cuatro.length ? prisma.subgrupoEstandar.findMany({ where: { codigo: { in: cuatro } }, select: { codigo: true, nombre: true } }) : Promise.resolve([]),
  ]);
  return [
    ...cuentas.map((c) => ({ codigo: c.code.replace(/\D/g, ""), nombre: c.name })),
    ...subgrupos.map((s) => ({ codigo: s.codigo, nombre: s.nombre })),
  ].sort((a, b) => a.codigo.localeCompare(b.codigo));
}
