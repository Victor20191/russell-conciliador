"use server";

import * as z from "zod";
import { revalidatePath } from "next/cache";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/dal";
import { logAudit } from "@/lib/audit";
import { ClientSchema, ClientResponsablesSchema, type ActionState } from "@/lib/definitions";
import { parseId } from "@/lib/ids";
import { nextClientCode } from "@/lib/client-code";
import { requirePermiso, authorizePermiso } from "@/lib/rbac";
import { ROL_POR_FUNCION, type FuncionAsignacion } from "@/lib/rbac/jerarquia";
import { mensajeErrorBD, registrarError } from "@/lib/errores";

const PATH = "/config/clientes";

function parseModuleIds(formData: FormData): { ok: true; moduleIds: number[] } | { ok: false } {
  const parsedModuleIds = formData.getAll("moduleIds").map(parseId);
  if (parsedModuleIds.some((id) => id == null)) return { ok: false };
  return {
    ok: true,
    moduleIds: [...new Set(parsedModuleIds.filter((id): id is number => id != null))],
  };
}

async function moduleIdsExist(moduleIds: number[]): Promise<boolean> {
  if (moduleIds.length === 0) return true;
  const existingModules = await prisma.module.findMany({
    where: { id: { in: moduleIds } },
    select: { id: true },
  });
  return existingModules.length === moduleIds.length;
}

type Responsables = { gerenteId: number; seniorId: number; staffId: number };
type ResponsablesValidados =
  | { ok: true; nombres: Record<FuncionAsignacion, string> }
  | { ok: false; message: string };

/**
 * Valida los 3 responsables del cliente: existen, están activos, tienen el
 * rol exacto de su función y respetan la jerarquía organizacional (el senior
 * reporta al gerente y el staff reporta al senior).
 */
async function validarResponsables({
  gerenteId,
  seniorId,
  staffId,
}: Responsables): Promise<ResponsablesValidados> {
  const ids = [gerenteId, seniorId, staffId];
  if (new Set(ids).size !== ids.length) {
    return { ok: false, message: "Los responsables deben ser personas distintas." };
  }

  const usuarios = await prisma.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true, role: true, active: true },
  });
  const porId = new Map(usuarios.map((u) => [u.id, u]));

  const esperados: { funcion: FuncionAsignacion; id: number }[] = [
    { funcion: "gerente", id: gerenteId },
    { funcion: "senior", id: seniorId },
    { funcion: "staff", id: staffId },
  ];
  const nombres = {} as Record<FuncionAsignacion, string>;
  for (const { funcion, id } of esperados) {
    const u = porId.get(id);
    const rolEsperado = ROL_POR_FUNCION[funcion];
    if (!u || !u.active || u.role !== rolEsperado) {
      return {
        ok: false,
        message: `El ${funcion} seleccionado no es un ${rolEsperado} activo.`,
      };
    }
    nombres[funcion] = u.name;
  }

  const [seniorDelGerente, staffDelSenior] = await Promise.all([
    prisma.userHierarchy.findFirst({
      where: { superiorId: gerenteId, subordinateId: seniorId },
      select: { id: true },
    }),
    prisma.userHierarchy.findFirst({
      where: { superiorId: seniorId, subordinateId: staffId },
      select: { id: true },
    }),
  ]);
  if (!seniorDelGerente) {
    return { ok: false, message: "El senior no reporta al gerente seleccionado." };
  }
  if (!staffDelSenior) {
    return { ok: false, message: "El staff no reporta al senior seleccionado." };
  }

  return { ok: true, nombres };
}

function parseResponsables(formData: FormData) {
  return ClientResponsablesSchema.safeParse({
    gerenteId: formData.get("gerenteId"),
    seniorId: formData.get("seniorId"),
    staffId: formData.get("staffId"),
  });
}

/** Filas de asignación por función para el cliente (staff: única con escritura). */
function filasResponsables({ gerenteId, seniorId, staffId }: Responsables) {
  return [
    { userId: staffId, role: "staff", writeScope: true },
    { userId: seniorId, role: "senior", writeScope: false },
    { userId: gerenteId, role: "gerente", writeScope: false },
  ] as const;
}

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

    const responsables = parseResponsables(formData);
    if (!responsables.success) {
      return { ok: false, errors: z.flattenError(responsables.error).fieldErrors };
    }
    const validados = await validarResponsables(responsables.data);
    if (!validados.ok) return { ok: false, message: validados.message };

    const modulesResult = parseModuleIds(formData);
    if (!modulesResult.ok) {
      return { ok: false, message: "Selecciona módulos válidos." };
    }
    const moduleIds = modulesResult.moduleIds;
    if (!(await moduleIdsExist(moduleIds))) {
      return { ok: false, message: "Selecciona módulos válidos." };
    }

    await prisma.$transaction(async (tx) => {
      const cliente = await tx.client.create({
        data: {
          ...data,
          modules: moduleIds.length
            ? {
                create: moduleIds.map((moduleId) => ({
                  moduleId,
                  status: "pending",
                })),
              }
            : undefined,
        },
      });
      await tx.clientAssignment.createMany({
        data: filasResponsables(responsables.data).map((r) => ({
          clientId: cliente.id,
          userId: r.userId,
          role: r.role,
          readScope: true,
          writeScope: r.writeScope,
          assignedById: authz.userId,
        })),
      });
    });

    const user = await getCurrentUser();
    await logAudit({
      user: user?.name ?? "Sistema",
      action: "CREÓ CLIENTE",
      entity: data.code,
      detail: `${data.name} · ${data.nit} · staff ${validados.nombres.staff} / senior ${validados.nombres.senior} / gerente ${validados.nombres.gerente}`,
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

    const responsables = parseResponsables(formData);
    if (!responsables.success) {
      return { ok: false, errors: z.flattenError(responsables.error).fieldErrors };
    }
    const validados = await validarResponsables(responsables.data);
    if (!validados.ok) return { ok: false, message: validados.message };

    const shouldSyncModules = formData.get("syncModules") === "1";
    let moduleIds: number[] | null = null;
    if (shouldSyncModules) {
      const configAuthz = await authorizePermiso("clientes:configurar");
      if (!configAuthz.ok) return { ok: false, message: configAuthz.message };

      const modulesResult = parseModuleIds(formData);
      if (!modulesResult.ok) {
        return { ok: false, message: "Selecciona módulos válidos." };
      }
      moduleIds = modulesResult.moduleIds;
      if (!(await moduleIdsExist(moduleIds))) {
        return { ok: false, message: "Selecciona módulos válidos." };
      }
    }

    await prisma.$transaction(async (tx) => {
      await tx.client.update({ where: { id }, data: { name, nit, erp, sector } });

      // Upsert por función: si el responsable no cambia se conserva su
      // vigencia (validFrom); si cambia, la fila pasa al nuevo usuario.
      for (const r of filasResponsables(responsables.data)) {
        await tx.clientAssignment.upsert({
          where: { clientId_role: { clientId: id, role: r.role } },
          create: {
            clientId: id,
            userId: r.userId,
            role: r.role,
            readScope: true,
            writeScope: r.writeScope,
            assignedById: authz.userId,
          },
          update: { userId: r.userId, active: true, assignedById: authz.userId },
        });
      }

      if (moduleIds == null) return;

      await tx.clientModule.deleteMany({
        where: {
          clientId: id,
          ...(moduleIds.length > 0 ? { moduleId: { notIn: moduleIds } } : {}),
        },
      });
      for (const moduleId of moduleIds) {
        await tx.clientModule.upsert({
          where: { clientId_moduleId: { clientId: id, moduleId } },
          create: { clientId: id, moduleId, status: "pending" },
          update: {},
        });
      }
    });

    const user = await getCurrentUser();
    await logAudit({
      user: user?.name ?? "Sistema",
      action: "ACTUALIZÓ CLIENTE",
      entity: current.code,
      detail: `${name} · ${nit} · staff ${validados.nombres.staff} / senior ${validados.nombres.senior} / gerente ${validados.nombres.gerente}${moduleIds != null ? ` · módulos asignados: ${moduleIds.length}` : ""}`,
    });
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
    // Las asignaciones de responsables son FK suaves: se limpian a mano
    // en la misma transacción para no dejar filas huérfanas.
    await prisma.$transaction([
      prisma.clientAssignment.deleteMany({ where: { clientId: id } }),
      prisma.client.delete({ where: { id } }),
    ]);
    const user = await getCurrentUser();
    await logAudit({
      user: user?.name ?? "Sistema",
      action: "ELIMINÓ CLIENTE",
      entity: String(id),
      detail: "Cliente, responsables y parametrizaciones",
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
