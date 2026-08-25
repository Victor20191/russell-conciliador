import { unstable_cache } from "next/cache";
import prisma from "@/lib/prisma";
import { decrypt } from "@/lib/crypto";

export const ENTORNO_CACHE_TAG = "variables-entorno";

/**
 * Obtiene el valor de una variable operativa de la plataforma.
 * 1. Primero la busca en la base de datos (con caché).
 * 2. Si es secreta, la desencripta.
 * 3. Si no se encuentra en BD (o el valor es nulo), recurre a process.env.
 */
export async function getEnvVar(key: string): Promise<string | undefined> {
  const fetchDb = unstable_cache(
    async (clave: string) => {
      const reg = await prisma.environmentVariable.findUnique({
        where: { key: clave },
      });
      if (!reg?.value) return null;
      return reg.isSecret ? decrypt(reg.value) : reg.value;
    },
    [`env-${key}`],
    { tags: [ENTORNO_CACHE_TAG] }
  );

  const dbValue = await fetchDb(key);
  if (dbValue !== null && dbValue !== undefined && dbValue !== "") {
    return dbValue;
  }
  return process.env[key];
}
