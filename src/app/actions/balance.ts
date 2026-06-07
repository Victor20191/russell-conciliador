"use server";

import { revalidatePath } from "next/cache";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/dal";
import { logAudit } from "@/lib/audit";
import { requirePermiso } from "@/lib/rbac";
import { parseId } from "@/lib/ids";
import { createProcessNotification } from "@/lib/notifications";

export async function freezeBalance(formData: FormData): Promise<void> {
  await requirePermiso("balance:editar");
  const id = parseId(formData.get("id"));
  if (!id) return;

  const balance = await prisma.balance.findUnique({ where: { id } });
  if (!balance || balance.isFrozen) return;

  // La versión oficial es única por (cliente, período): se desmarca cualquier otra.
  await prisma.balance.updateMany({
    where: { clientName: balance.clientName, period: balance.period, isOfficial: true },
    data: { isOfficial: false },
  });
  await prisma.balance.update({
    where: { id },
    data: { isOfficial: true, isFrozen: true, status: "Congelado" },
  });

  const user = await getCurrentUser();
  await logAudit({
    user: user?.name ?? "Sistema",
    action: "CONGELÓ BALANCE",
    entity: `${balance.clientName} · ${balance.period}`,
    detail: `Versión ${balance.version} marcada como oficial`,
  });
  await createProcessNotification({
    actor: user?.name,
    text: "congeló el balance oficial de",
    target: `${balance.clientName} · ${balance.period} · ${balance.version}`,
  });
  revalidatePath("/", "layout");
  revalidatePath("/balance");
  revalidatePath(`/balance/${id}`);
}
