"use server";

import { revalidatePath } from "next/cache";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/dal";
import { logAudit } from "@/lib/audit";
import { requirePermiso } from "@/lib/rbac";
import { parseId } from "@/lib/ids";

export async function updateAccountMapping(formData: FormData): Promise<void> {
  await requirePermiso("mapeo:editar");
  const id = parseId(formData.get("id"));
  const russell = (formData.get("russell") as string) || null;
  if (!id) return;
  const option = russell
    ? await prisma.russellOption.findUnique({ where: { code: russell }, select: { id: true } })
    : null;
  await prisma.clientAccount.update({
    where: { id },
    data: { russellOptionId: option?.id ?? null },
  });
  revalidatePath("/balance/mapeo");
}

// IA simulada: asigna a las cuentas sin mapear el RussellOption cuyo código sea
// el prefijo más largo del código de la cuenta (similitud por plan de cuentas).
export async function suggestMappingsAI(formData: FormData): Promise<void> {
  await requirePermiso("mapeo:editar");
  const clientName = formData.get("clientName") as string;
  if (!clientName) return;

  const [accounts, options] = await Promise.all([
    prisma.clientAccount.findMany({ where: { clientName, russellOptionId: null } }),
    prisma.russellOption.findMany(),
  ]);
  const codes = options.map((o) => o.code).sort((a, b) => b.length - a.length); // más largo primero

  let suggested = 0;
  for (const a of accounts) {
    const match = codes.find((c) => a.code.startsWith(c));
    if (match) {
      const option = options.find((o) => o.code === match);
      if (!option) continue;
      await prisma.clientAccount.update({
        where: { id: a.id },
        data: { russellOptionId: option.id },
      });
      suggested += 1;
    }
  }

  const user = await getCurrentUser();
  await logAudit({
    user: user?.name ?? "Sistema",
    action: "SUGIRIÓ MAPEO (IA)",
    entity: `Mapeo · ${clientName}`,
    detail: `${suggested} cuenta(s) mapeadas por similitud`,
  });
  revalidatePath("/balance/mapeo");
}
