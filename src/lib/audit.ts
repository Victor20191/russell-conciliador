import "server-only";
import prisma from "@/lib/prisma";
import { MESES } from "@/lib/format";

// Sello "DD/MMM/AAAA HH:MM:SS" consistente con el seed (AuditEntry.ts es String).
function stamp(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${MESES[d.getMonth()]}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export type AuditInput = {
  user: string;
  action: string;
  entity: string;
  detail: string;
};

// Registro inmutable en la bitácora del sistema. Lo invocan las Server Actions de negocio.
export async function logAudit({ user, action, entity, detail }: AuditInput): Promise<void> {
  await prisma.auditEntry.create({
    data: { ts: stamp(), user, action, entity, detail },
  });
}
