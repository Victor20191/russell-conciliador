// Candados de transacción de PostgreSQL (`pg_advisory_xact_lock`) — sin `server-only`.
//
// La app los toma a través de `concurrency.ts` (server-only, que los reexporta) y los scripts de
// mantenimiento, que corren fuera de Next, directamente de aquí. Tiene que ser UNA sola
// implementación: un script que derivara la llave de otra forma no se excluiría con la app.
import { createHash } from "node:crypto";
import { Prisma, type PrismaClient } from "@/generated/prisma/client";

export const LOCK_NAMESPACE = 1_382_240_781;

export function advisoryKey(recurso: string): number {
  return createHash("sha256").update(recurso).digest().readInt32BE(0);
}

export async function tomarCandadoTransaccion(
  tx: Pick<PrismaClient, "$executeRaw">,
  recurso: string,
): Promise<void> {
  const key = advisoryKey(recurso);
  // `pg_advisory_xact_lock` devuelve `void`: con el driver adapter de Prisma 7
  // (@prisma/adapter-pg) `$queryRaw` no sabe deserializar una columna `void` y
  // lanza P2010. Usamos `$executeRaw` —no deserializa el resultado del SELECT,
  // que aquí no necesitamos— para tomar el candado sin romper la transacción.
  await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(${LOCK_NAMESPACE}, ${key})`);
}
