"use server";

import * as z from "zod";
import { revalidatePath } from "next/cache";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/dal";
import { logAudit } from "@/lib/audit";
import { ClientSchema, type ActionState } from "@/lib/definitions";
import { parseId } from "@/lib/ids";
import { nextClientCode } from "@/lib/client-code";
import { requirePermiso, authorizePermiso } from "@/lib/rbac";
import { mensajeErrorBD, registrarError } from "@/lib/errores";

const PATH = "/config/clientes";

export async function createClient(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const authz = await authorizePermiso("clientes:crear");
  if (!authz.ok) return { ok: false, message: authz.message };

  try {
    // El código se asigna automáticamente en el servidor (autoridad), por lo que
    // se ignora cualquier valor enviado desde el formulario.
    const existing = await prisma.client.findMany({ select: { code: true } });
    const code = nextClientCode(existing.map((c) => c.code));

    const parsed = ClientSchema.safeParse({
      code,
      name: formData.get("name"),
      nit: formData.get("nit"),
      erp: formData.get("erp"),
      sector: formData.get("sector"),
    });
    if (!parsed.success) {
      return { ok: false, errors: z.flattenError(parsed.error).fieldErrors };
    }
    const data = parsed.data;

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
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("createClient", e) };
  }
}

export async function updateClient(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const authz = await authorizePermiso("clientes:editar");
  if (!authz.ok) return { ok: false, message: authz.message };
  const id = parseId(formData.get("id"));
  if (!id) return { ok: false, message: "Cliente inexistente." };

  try {
    const current = await prisma.client.findUnique({ where: { id } });
    if (!current) return { ok: false, message: "Cliente inexistente." };

    // El código no se edita: se conserva el ya asignado al cliente.
    const parsed = ClientSchema.safeParse({
      code: current.code,
      name: formData.get("name"),
      nit: formData.get("nit"),
      erp: formData.get("erp"),
      sector: formData.get("sector"),
    });
    if (!parsed.success) {
      return { ok: false, errors: z.flattenError(parsed.error).fieldErrors };
    }
    const { name, nit, erp, sector } = parsed.data;
    await prisma.client.update({ where: { id }, data: { name, nit, erp, sector } });
    revalidatePath(PATH);
    return { ok: true };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("updateClient", e) };
  }
}

export async function deleteClient(formData: FormData): Promise<void> {
  await requirePermiso("clientes:configurar");
  const id = parseId(formData.get("id"));
  if (!id) return;
  try {
    await prisma.client.delete({ where: { id } });
    const user = await getCurrentUser();
    await logAudit({
      user: user?.name ?? "Sistema",
      action: "ELIMINÓ CLIENTE",
      entity: String(id),
      detail: "Cliente y sus parametrizaciones",
    });
    revalidatePath(PATH);
  } catch (e) {
    // Sube al error boundary (p. ej. FK si el cliente tiene datos vinculados).
    registrarError("deleteClient", e);
    throw e;
  }
}

export async function setClientModuleStatus(formData: FormData): Promise<void> {
  await requirePermiso("clientes:configurar");
  const clientId = parseId(formData.get("clientId"));
  const moduleId = parseId(formData.get("moduleId"));
  const next = formData.get("next") as string; // configured | pending | none
  if (!clientId || !moduleId) return;

  try {
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
  } catch (e) {
    registrarError("setClientModuleStatus", e);
    throw e;
  }
}
