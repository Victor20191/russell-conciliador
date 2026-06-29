import "server-only";

import { createHash } from "node:crypto";
import prisma from "@/lib/prisma";
import { Prisma, type PrismaClient } from "@/generated/prisma/client";

export type TransactionClient = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends"
>;

const LOCK_NAMESPACE = 1_382_240_781;
const DEFAULT_MAX_ATTEMPTS = 3;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function advisoryKey(recurso: string): number {
  return createHash("sha256").update(recurso).digest().readInt32BE(0);
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

export async function tomarCandadoTransaccion(
  tx: TransactionClient,
  recurso: string,
): Promise<void> {
  const key = advisoryKey(recurso);
  await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(${LOCK_NAMESPACE}, ${key})`);
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
