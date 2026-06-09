import "server-only";
import prisma from "@/lib/prisma";
import { MESES } from "@/lib/format";
import { getClientIp } from "@/lib/request";
import { registrarError } from "@/lib/errores";

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
  // La auditoría es un efecto secundario: si falla, NO debe tumbar la
  // operación principal (que ya tuvo éxito). Se registra el error en el
  // servidor y se continúa.
  try {
    const ip = await getClientIp();
    await prisma.auditEntry.create({
      data: { ts: stamp(), user, action, entity, detail, ip },
    });
  } catch (e) {
    registrarError("logAudit", e);
  }
}
