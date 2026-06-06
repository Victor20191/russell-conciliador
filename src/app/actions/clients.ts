"use server";

import * as z from "zod";
import { revalidatePath } from "next/cache";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/dal";
import { logAudit } from "@/lib/audit";
import { ClientSchema, type ActionState } from "@/lib/definitions";
import { parseId } from "@/lib/ids";
import { requirePermiso, authorizePermiso } from "@/lib/rbac";

const PATH = "/config/clientes";

export async function createClient(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const authz = await authorizePermiso("clientes:crear");
  if (!authz.ok) return { ok: false, message: authz.message };
  const parsed = ClientSchema.safeParse({
    code: formData.get("code"),
    name: formData.get("name"),
    nit: formData.get("nit"),
    erp: formData.get("erp"),
    sector: formData.get("sector"),
  });
  if (!parsed.success) {
    return { ok: false, errors: z.flattenError(parsed.error).fieldErrors };
  }
  const data = parsed.data;

  const dup = await prisma.client.findUnique({ where: { code: data.code } });
  if (dup) return { ok: false, message: "Ya existe un cliente con ese código." };

  await prisma.client.create({ data });

  const user = await getCurrentUser();
  await logAudit({
    user: user?.name ?? "Sistema",
    action: "CREÓ CLIENTE",
    entity: data.code,
    detail: `${data.name} · ${data.nit}`,
  });
  revalidatePath(PATH);
  return { ok: true };
}

export async function updateClient(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const authz = await authorizePermiso("clientes:editar");
  if (!authz.ok) return { ok: false, message: authz.message };
  const parsed = ClientSchema.safeParse({
    code: formData.get("code"),
    name: formData.get("name"),
    nit: formData.get("nit"),
    erp: formData.get("erp"),
    sector: formData.get("sector"),
  });
  if (!parsed.success) {
    return { ok: false, errors: z.flattenError(parsed.error).fieldErrors };
  }
  const id = parseId(formData.get("id"));
  if (!id) return { ok: false, message: "Cliente inexistente." };
  const { code, name, nit, erp, sector } = parsed.data;
  const dup = await prisma.client.findFirst({ where: { code, NOT: { id } } });
  if (dup) return { ok: false, message: "Ya existe un cliente con ese código." };
  await prisma.client.update({ where: { id }, data: { code, name, nit, erp, sector } });
  revalidatePath(PATH);
  return { ok: true };
}

export async function deleteClient(formData: FormData): Promise<void> {
  await requirePermiso("clientes:configurar");
  const id = parseId(formData.get("id"));
  if (!id) return;
  await prisma.client.delete({ where: { id } });
  const user = await getCurrentUser();
  await logAudit({
    user: user?.name ?? "Sistema",
    action: "ELIMINÓ CLIENTE",
    entity: String(id),
    detail: "Cliente y sus parametrizaciones",
  });
  revalidatePath(PATH);
}

export async function setClientModuleStatus(formData: FormData): Promise<void> {
  await requirePermiso("clientes:configurar");
  const clientId = parseId(formData.get("clientId"));
  const moduleId = parseId(formData.get("moduleId"));
  const next = formData.get("next") as string; // configured | pending | none
  if (!clientId || !moduleId) return;

  if (next === "none") {
    await prisma.clientModule.deleteMany({ where: { clientId, moduleId } });
  } else {
    await prisma.clientModule.upsert({
      where: { clientId_moduleId: { clientId, moduleId } },
      create: { clientId, moduleId, status: next },
      update: { status: next },
    });
  }
  revalidatePath(PATH);
}
