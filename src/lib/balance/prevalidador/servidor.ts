import "server-only";

import prisma from "@/lib/prisma";
import { leerDatosPrevalidador, resolverContextoPrevalidador, type ContextoPrevalidador, type DbPrevalidador } from "./contexto";
import { SELECT_HISTORIAL_REVISION, type RevisionHistorialCruda } from "./historial";

export type { CatalogoCongeladoVM, ContextoPrevalidador, RevisionPrevalidadorVM } from "./contexto";
export type { RevisionHistorialVM } from "./historial";

/**
 * Cargador estricto y único del prevalidador. No usa caché ni catálogo de fábrica:
 * una lectura incompleta nunca puede autorizar una aprobación, exportación o
 * conciliación. Admite un cliente transaccional para revalidar la huella y crear la
 * conciliación dentro de la misma transacción serializable.
 *
 * Una aprobación vigente conserva el catálogo con que se aprobó: la lógica vive en
 * `contexto.ts`, sin `server-only`, para que también la use el script de mantenimiento.
 */
export async function cargarContextoPrevalidadorBalance(
  balanceId: number,
  db: DbPrevalidador = prisma,
): Promise<ContextoPrevalidador> {
  return resolverContextoPrevalidador(await leerDatosPrevalidador(db, balanceId));
}

/**
 * Todas las aprobaciones y revocaciones del prevalidador de un balance, tal como quedaron
 * (la tabla es append-only). Se rotulan con `construirHistorialRevisiones`.
 */
export async function cargarHistorialRevisionesPrevalidador(balanceId: number): Promise<RevisionHistorialCruda[]> {
  return prisma.prevalidadorRevisionBalance.findMany({
    where: { balanceId },
    select: SELECT_HISTORIAL_REVISION,
    orderBy: [{ creadoEn: "desc" }, { id: "desc" }],
  });
}
