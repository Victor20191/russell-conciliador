"use server";

import { redirect } from "next/navigation";
import { Prisma } from "@/generated/prisma/client";
import prisma from "@/lib/prisma";
import { verifySession, getCurrentUser } from "@/lib/dal";
import { logAudit } from "@/lib/audit";

export async function createPresentation(): Promise<void> {
  await verifySession();
  const base = await prisma.reqPresentation.findUnique({ where: { id: "PRES-2025-009" } });
  if (!base) return;
  const count = await prisma.reqPresentation.count();
  const id = `PRES-2025-${100 + count}`;
  const user = await getCurrentUser();
  await prisma.reqPresentation.create({
    data: {
      id, clientName: base.clientName, nit: base.nit, title: base.title, year: base.year, presented: base.presented, preparedBy: base.preparedBy,
      slides: base.slides, author: user?.name ?? "Auditor", date: "hoy", status: "Borrador", positives: base.positives,
      observed: (base.observed ?? Prisma.JsonNull) as Prisma.InputJsonValue, evaluated: (base.evaluated ?? Prisma.JsonNull) as Prisma.InputJsonValue,
    },
  });
  await logAudit({ user: user?.name ?? "Sistema", action: "CREÓ PRESENTACIÓN", entity: id, detail: base.title });
  redirect(`/requerimientos/presentaciones/${id}`);
}
