"use server";

import { redirect } from "next/navigation";
import { Prisma } from "@/generated/prisma/client";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/dal";
import { logAudit } from "@/lib/audit";
import { requirePermiso } from "@/lib/rbac";
import { registrarError } from "@/lib/errores";

export async function createPresentation(): Promise<void> {
  await requirePermiso("presentaciones:crear");
  // El id se calcula dentro del try; el redirect se ejecuta fuera del try.
  let createdId: number | undefined;
  try {
    const base = await prisma.reqPresentation.findUnique({ where: { code: "PRES-2025-009" } });
    if (!base) return;
    const count = await prisma.reqPresentation.count();
    const code = `PRES-2025-${100 + count}`;
    const user = await getCurrentUser();
    await prisma.reqPresentation.create({
      data: {
        code, clientName: base.clientName, nit: base.nit, title: base.title, year: base.year, presented: base.presented, preparedBy: base.preparedBy,
        slides: base.slides, author: user?.name ?? "Auditor", date: "hoy", status: "Borrador", positives: base.positives,
        observed: (base.observed ?? Prisma.JsonNull) as Prisma.InputJsonValue, evaluated: (base.evaluated ?? Prisma.JsonNull) as Prisma.InputJsonValue,
      },
    });
    await logAudit({ user: user?.name ?? "Sistema", action: "CREÓ PRESENTACIÓN", entity: code, detail: base.title });
    const created = await prisma.reqPresentation.findUniqueOrThrow({ where: { code } });
    createdId = created.id;
  } catch (e) {
    // Registramos el error y lo relanzamos: la acción retorna void y el error
    // sube al error boundary para mostrar una pantalla controlada.
    registrarError("createPresentation", e);
    throw e;
  }
  // redirect() funciona lanzando una excepción especial: debe quedar FUERA del try.
  // Si la presentación base no existía, createdId es undefined y se sale arriba (return).
  if (createdId === undefined) return;
  redirect(`/requerimientos/presentaciones/${createdId}`);
}
