import "server-only";
import prisma from "@/lib/prisma";
import { getClientIp } from "@/lib/request";
import { registrarError } from "@/lib/errores";

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
      data: { user, action, entity, detail, ip },
    });
  } catch (e) {
    registrarError("logAudit", e);
  }
}
