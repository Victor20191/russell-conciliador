import "server-only";

// Lectura del Consolidado de UN período: la memoria del cliente con la asignación del período
// encima (`asignacion-periodo.ts`). La usan la página del cargue, los insumos de los cruces
// (marcas, repartos, emparejamientos, cierre) y la exportación, para que todos vean las mismas
// cuentas. Los lectores de la memoria general (conceptos de Nómina) no pasan por aquí.
import prisma from "@/lib/prisma";
import { fusionarAsignaciones, type FilaAsignacionPeriodo } from "./asignacion-periodo";

export type FilaConsolidacionPeriodo = {
  clasificador: string;
  cuenta4: string;
  cuenta6: string;
  agrupador: string;
  descripcion: string | null;
  grupo: string | null;
  subcuentaPuc: string | null;
  cuentaCliente: string;
  /** La fila viene de la asignación del período, no de la memoria del cliente. */
  soloPeriodo: boolean;
};

const vacia = (fila: FilaAsignacionPeriodo): Omit<FilaConsolidacionPeriodo, "soloPeriodo"> => ({
  clasificador: fila.clasificador,
  cuenta4: fila.cuenta4,
  cuenta6: fila.cuenta6,
  agrupador: fila.agrupador,
  descripcion: null,
  grupo: null,
  subcuentaPuc: null,
  cuentaCliente: "",
});

/** Filas guardadas de la asignación del período. */
export async function filasAsignacionPeriodo(clienteId: number, moduloCodigo: string, periodo: string): Promise<FilaAsignacionPeriodo[]> {
  const filas = await prisma.asignacionPeriodoModulo.findMany({
    where: { clienteId, moduloCodigo, periodo },
    select: { clasificador: true, agrupador: true, cuenta4: true, cuenta6: true },
    orderBy: [{ clasificador: "asc" }, { agrupador: "asc" }, { cuenta4: "asc" }, { cuenta6: "asc" }],
  });
  return filas;
}

/** El Consolidado con que se concilia el período, y las filas de su asignación propia. */
export async function cargarConsolidacionDelPeriodo(
  clienteId: number,
  moduloCodigo: string,
  periodo: string,
): Promise<{ filas: FilaConsolidacionPeriodo[]; filasPeriodo: FilaAsignacionPeriodo[] }> {
  const [memoria, filasPeriodo] = await Promise.all([
    prisma.consolidacionModuloCliente.findMany({
      where: { clienteId, moduloCodigo },
      select: { clasificador: true, cuenta4: true, cuenta6: true, agrupador: true, descripcion: true, grupo: true, subcuentaPuc: true, cuentaCliente: true },
    }),
    filasAsignacionPeriodo(clienteId, moduloCodigo, periodo),
  ]);
  return { filas: fusionarAsignaciones(memoria, filasPeriodo, vacia), filasPeriodo };
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
