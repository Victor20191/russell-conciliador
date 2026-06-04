import "server-only";
import prisma from "@/lib/prisma";
import { MESES } from "@/lib/format";
import { getClientIp } from "@/lib/request";

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

export async function logAudit({ user, action, entity, detail }: AuditInput): Promise<void> {
  const ip = await getClientIp();
  await prisma.auditEntry.create({
    data: { ts: stamp(), user, action, entity, detail, ip },
  });
}
