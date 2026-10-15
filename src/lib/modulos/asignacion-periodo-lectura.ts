// Lectura del Consolidado de UN período con el cliente de BD que se le pase, sin `server-only`: la
// usan la app (a través de `asignacion-periodo-servidor.ts`) y el script que respalda la copia
// congelada de los cierres anteriores, que corre fuera de Next. Una sola implementación, para que
// la copia del script sea exactamente lo que el cruce habría leído.
import type { PrismaClient } from "@/generated/prisma/client";
import { fusionarAsignaciones, type FilaAsignacionPeriodo } from "./asignacion-periodo";
import { AGRUPAR_POR_DEFECTO, type AgruparPorNomina } from "./nomina/agrupar-por";

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

type DbLectura = Pick<PrismaClient, "consolidacionModuloCliente" | "asignacionPeriodoModulo">;

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

/**
 * Filas guardadas de la asignación del período. Nómina: solo las de la dimensión con que se agrupa
 * el cargue («Agrupar por»); los demás módulos siempre son `codigo`.
 */
export async function leerAsignacionPeriodo(
  db: DbLectura,
  clienteId: number,
  moduloCodigo: string,
  periodo: string,
  agruparPor: AgruparPorNomina = AGRUPAR_POR_DEFECTO,
): Promise<FilaAsignacionPeriodo[]> {
  return db.asignacionPeriodoModulo.findMany({
    where: { clienteId, moduloCodigo, periodo, agruparPor },
    select: { clasificador: true, agrupador: true, cuenta4: true, cuenta6: true },
    orderBy: [{ clasificador: "asc" }, { agrupador: "asc" }, { cuenta4: "asc" }, { cuenta6: "asc" }],
  });
}

/**
 * El Consolidado con que se concilia el período (la memoria del cliente con la asignación del período
 * encima) y las filas de su asignación propia, leídos EN VIVO.
 */
export async function leerConsolidacionDelPeriodo(
  db: DbLectura,
  clienteId: number,
  moduloCodigo: string,
  periodo: string,
  agruparPor: AgruparPorNomina = AGRUPAR_POR_DEFECTO,
): Promise<{ filas: FilaConsolidacionPeriodo[]; filasPeriodo: FilaAsignacionPeriodo[] }> {
  const [memoria, filasPeriodo] = await Promise.all([
    db.consolidacionModuloCliente.findMany({
      where: { clienteId, moduloCodigo, agruparPor },
      select: { clasificador: true, cuenta4: true, cuenta6: true, agrupador: true, descripcion: true, grupo: true, subcuentaPuc: true, cuentaCliente: true },
    }),
    leerAsignacionPeriodo(db, clienteId, moduloCodigo, periodo, agruparPor),
  ]);
  return { filas: fusionarAsignaciones(memoria, filasPeriodo, vacia), filasPeriodo };
}
