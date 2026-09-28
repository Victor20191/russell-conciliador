import "server-only";

import prisma from "@/lib/prisma";
import { Prisma, type PrismaClient } from "@/generated/prisma/client";

// Los candados viven en `candados.ts` (sin server-only) para que los scripts de mantenimiento
// tomen exactamente la misma llave que la app.
export { tomarCandadoTransaccion } from "@/lib/candados";

export type TransactionClient = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends"
>;

const DEFAULT_MAX_ATTEMPTS = 3;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function prismaCode(e: unknown): string | undefined {
  if (e && typeof e === "object" && "code" in e) {
    const code = (e as { code?: unknown }).code;
    if (typeof code === "string") return code;
  }
  return undefined;
}

function esErrorConcurrencia(e: unknown): boolean {
  const code = prismaCode(e);
  return code === "P2002" || code === "P2034";
}

export async function transaccionSerializable<T>(
  operacion: (tx: TransactionClient) => Promise<T>,
  options: { maxAttempts?: number; timeoutMs?: number } = {},
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await prisma.$transaction(operacion, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 5_000,
        timeout: options.timeoutMs ?? 20_000,
      });
    } catch (e) {
      lastError = e;
      if (!esErrorConcurrencia(e) || attempt >= maxAttempts) throw e;
      await sleep(50 * attempt);
    }
  }

  throw lastError;
}
