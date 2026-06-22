"use server";

import * as z from "zod";
import { revalidatePath } from "next/cache";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/dal";
import { logAudit } from "@/lib/audit";
import { ClientSchema, ClientResponsablesSchema, type ActionState } from "@/lib/definitions";
import { parseId } from "@/lib/ids";
import { nextClientCode } from "@/lib/client-code";
import { authorizePermiso } from "@/lib/rbac";
import { ROL_POR_FUNCION, ROL_SOCIO } from "@/lib/rbac/jerarquia";
import { mensajeErrorBD } from "@/lib/errores";

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

/** Formatos DIAN (IVA F-300, Retención F-350, ICA F-CHIP…) que el cliente
 *  activa en la sección "Módulos del cliente". Lista vacía = DIAN desactivado. */
function parseDianFormIds(formData: FormData): { ok: true; dianFormIds: number[] } | { ok: false } {
  const parsed = formData.getAll("dianFormIds").map(parseId);
  if (parsed.some((id) => id == null)) return { ok: false };
  return {
    ok: true,
    dianFormIds: [...new Set(parsed.filter((id): id is number => id != null))],
  };
}

async function dianFormIdsExist(dianFormIds: number[]): Promise<boolean> {
  if (dianFormIds.length === 0) return true;
  const existing = await prisma.dianForm.findMany({
    where: { id: { in: dianFormIds } },
    select: { id: true },
  });
  return existing.length === dianFormIds.length;
}

/** ERP del catálogo maestro: debe existir y estar activo. */
async function erpValido(erpId: number): Promise<boolean> {
  const erp = await prisma.erp.findUnique({ where: { id: erpId }, select: { active: true } });
  return erp?.active === true;
}

/** Sector del catálogo maestro: debe existir y estar activo. */
async function sectorValido(sectorId: number): Promise<boolean> {
  const sector = await prisma.sector.findUnique({ where: { id: sectorId }, select: { active: true } });
  return sector?.active === true;
}

type Responsables = { gerenteId: number; seniorId: number; staffIds: number[] };
type ResponsablesValidados =
  | { ok: true; nombres: { gerente: string; senior: string; staffs: string[] } }
  | { ok: false; message: string };

/**
 * Valida los responsables del cliente: existen, están activos, tienen el rol
 * exacto de su función y respetan la jerarquía organizacional (el senior
 * reporta al gerente y CADA staff reporta al senior). Admite uno o varios
 * staff; el senior y el gerente son uno cada uno.
 */
async function validarResponsables({
  gerenteId,
  seniorId,
  staffIds,
}: Responsables): Promise<ResponsablesValidados> {
  const ids = [gerenteId, seniorId, ...staffIds];
  if (new Set(ids).size !== ids.length) {
    return { ok: false, message: "Los responsables deben ser personas distintas." };
  }

  const usuarios = await prisma.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true, role: true, active: true },
  });
  const porId = new Map(usuarios.map((u) => [u.id, u]));

  // Gerente y senior: uno cada uno, con su rol exacto.
  const unico: { funcion: "gerente" | "senior"; id: number }[] = [
    { funcion: "gerente", id: gerenteId },
    { funcion: "senior", id: seniorId },
  ];
  const nombres = { gerente: "", senior: "", staffs: [] as string[] };
  for (const { funcion, id } of unico) {
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

  // Staff: uno o varios, todos con rol Staff activo.
  for (const staffId of staffIds) {
    const u = porId.get(staffId);
    if (!u || !u.active || u.role !== ROL_POR_FUNCION.staff) {
      return { ok: false, message: "Uno de los staff seleccionados no es un Staff activo." };
    }
    nombres.staffs.push(u.name);
  }

  // Jerarquía: el senior reporta al gerente y cada staff reporta al senior.
  const [seniorDelGerente, staffsDelSenior] = await Promise.all([
    prisma.userHierarchy.findFirst({
      where: { superiorId: gerenteId, subordinateId: seniorId },
      select: { id: true },
    }),
    prisma.userHierarchy.findMany({
      where: { superiorId: seniorId, subordinateId: { in: staffIds } },
      select: { subordinateId: true },
    }),
  ]);
  if (!seniorDelGerente) {
    return { ok: false, message: "El senior no reporta al gerente seleccionado." };
  }
  if (staffsDelSenior.length !== staffIds.length) {
    return { ok: false, message: "Uno de los staff no reporta al senior seleccionado." };
  }

  return { ok: true, nombres };
}

/**
 * Valida el socio responsable (campo informativo del cliente): debe existir,
 * estar activo y tener exactamente el rol Socio. NO crea asignación ni otorga
 * alcance de lectura — el Socio sigue derivando su acceso por jerarquía.
 */
async function validarSocio(
  socioId: number,
): Promise<{ ok: true; nombre: string } | { ok: false; message: string }> {
  const u = await prisma.user.findUnique({
    where: { id: socioId },
    select: { name: true, role: true, active: true },
  });
  if (!u || !u.active || u.role !== ROL_SOCIO) {
    return { ok: false, message: "El socio seleccionado no es un Socio activo." };
  }
  return { ok: true, nombre: u.name };
}

function parseResponsables(formData: FormData) {
  return ClientResponsablesSchema.safeParse({
    gerenteId: formData.get("gerenteId"),
    seniorId: formData.get("seniorId"),
    staffIds: formData.getAll("staffIds").filter((v) => v !== ""),
  });
}

/** Filas de asignación para el cliente: cada staff ejecuta (escritura); el
 *  senior y el gerente solo consultan (lectura). */
function filasResponsables({
  gerenteId,
  seniorId,
  staffIds,
}: Responsables): { userId: number; role: string; writeScope: boolean }[] {
  return [
    ...staffIds.map((userId) => ({ userId, role: "staff", writeScope: true })),
    { userId: seniorId, role: "senior", writeScope: false },
    { userId: gerenteId, role: "gerente", writeScope: false },
  ];
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
      tipo: formData.get("tipo"),
      erpId: formData.get("erpId"),
      sectorId: formData.get("sectorId"),
      socioId: formData.get("socioId"),
    });
    if (!parsed.success) {
      return { ok: false, errors: z.flattenError(parsed.error).fieldErrors };
    }
    const { socioId, ...data } = parsed.data;

    // ERP y Sector son catálogos maestros: deben existir y estar activos.
    if (!(await erpValido(data.erpId))) {
      return { ok: false, message: "Selecciona un ERP válido." };
    }
    if (data.sectorId != null && !(await sectorValido(data.sectorId))) {
      return { ok: false, message: "Selecciona un sector válido." };
    }

    const responsables = parseResponsables(formData);
    if (!responsables.success) {
      return { ok: false, errors: z.flattenError(responsables.error).fieldErrors };
    }
    const validados = await validarResponsables(responsables.data);
    if (!validados.ok) return { ok: false, message: validados.message };

    const socio = await validarSocio(socioId);
    if (!socio.ok) return { ok: false, message: socio.message };

    // Parametrizar módulos/DIAN al crear exige el mismo permiso de configuración
    // que al editar (defensa en profundidad): el formulario de creación incluye
    // la sección "Módulos del cliente".
    const configAuthz = await authorizePermiso("clientes:configurar");
    if (!configAuthz.ok) return { ok: false, message: configAuthz.message };

    const modulesResult = parseModuleIds(formData);
    if (!modulesResult.ok) {
      return { ok: false, message: "Selecciona módulos válidos." };
    }
    const moduleIds = modulesResult.moduleIds;
    if (!(await moduleIdsExist(moduleIds))) {
      return { ok: false, message: "Selecciona módulos válidos." };
    }

    const dianResult = parseDianFormIds(formData);
    if (!dianResult.ok) {
      return { ok: false, message: "Selecciona formatos DIAN válidos." };
    }
    const dianFormIds = dianResult.dianFormIds;
    if (!(await dianFormIdsExist(dianFormIds))) {
      return { ok: false, message: "Selecciona formatos DIAN válidos." };
    }

    await prisma.$transaction(async (tx) => {
      const cliente = await tx.client.create({
        data: {
          ...data,
          socioId,
          modules: moduleIds.length
            ? {
                create: moduleIds.map((moduleId) => ({
                  moduleId,
                  status: "pending",
                })),
              }
            : undefined,
          dianForms: dianFormIds.length
            ? { create: dianFormIds.map((formId) => ({ formId })) }
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
      detail: `${data.name} · ${data.nit} · tipo ${data.tipo} · socio ${socio.nombre} · staff ${validados.nombres.staffs.join(", ")} / senior ${validados.nombres.senior} / gerente ${validados.nombres.gerente}${dianFormIds.length ? ` · formatos DIAN: ${dianFormIds.length}` : ""}`,
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

  // Alcance por cartera: el Senior solo edita los clientes donde es responsable
  // (modo "lectura" = membresía, pues su writeScope es false); Admin/Superadmin
  // tienen alcance global.
  const alcance = await authorizePermiso("clientes:editar", { clientId: id, modo: "lectura" });
  if (!alcance.ok) return { ok: false, message: alcance.message };

  try {
    const current = await prisma.client.findUnique({ where: { id } });
    if (!current) return { ok: false, message: "Cliente inexistente." };

    // El código no se edita: se conserva el ya asignado al cliente.
    const parsed = ClientSchema.safeParse({
      code: current.code,
      name: formData.get("name"),
      nit: formData.get("nit"),
      tipo: formData.get("tipo"),
      erpId: formData.get("erpId"),
      sectorId: formData.get("sectorId"),
      socioId: formData.get("socioId"),
    });
    if (!parsed.success) {
      return { ok: false, errors: z.flattenError(parsed.error).fieldErrors };
    }
    const { name, nit, tipo, erpId, sectorId, socioId } = parsed.data;

    // ERP y Sector son catálogos maestros: deben existir y estar activos.
    if (!(await erpValido(erpId))) {
      return { ok: false, message: "Selecciona un ERP válido." };
    }
    if (sectorId != null && !(await sectorValido(sectorId))) {
      return { ok: false, message: "Selecciona un sector válido." };
    }

    const responsables = parseResponsables(formData);
    if (!responsables.success) {
      return { ok: false, errors: z.flattenError(responsables.error).fieldErrors };
    }
    const validados = await validarResponsables(responsables.data);
    if (!validados.ok) return { ok: false, message: validados.message };

    const socio = await validarSocio(socioId);
    if (!socio.ok) return { ok: false, message: socio.message };

    const shouldSyncModules = formData.get("syncModules") === "1";
    let moduleIds: number[] | null = null;
    let dianFormIds: number[] | null = null;
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

      const dianResult = parseDianFormIds(formData);
      if (!dianResult.ok) {
        return { ok: false, message: "Selecciona formatos DIAN válidos." };
      }
      dianFormIds = dianResult.dianFormIds;
      if (!(await dianFormIdsExist(dianFormIds))) {
        return { ok: false, message: "Selecciona formatos DIAN válidos." };
      }
    }

    await prisma.$transaction(async (tx) => {
      await tx.client.update({ where: { id }, data: { name, nit, tipo, erpId, sectorId, socioId } });

      // Sincroniza los responsables conservando la vigencia de los que siguen:
      // el upsert por (cliente, función, usuario) reactiva o crea cada
      // responsable actual, y el deleteMany retira las filas que ya no
      // corresponden (gerente/senior reemplazados o staff removidos).
      const filas = filasResponsables(responsables.data);
      for (const r of filas) {
        await tx.clientAssignment.upsert({
          where: {
            clientId_role_userId: { clientId: id, role: r.role, userId: r.userId },
          },
          create: {
            clientId: id,
            userId: r.userId,
            role: r.role,
            readScope: true,
            writeScope: r.writeScope,
            assignedById: authz.userId,
          },
          update: { active: true, writeScope: r.writeScope, assignedById: authz.userId },
        });
      }
      await tx.clientAssignment.deleteMany({
        where: {
          clientId: id,
          NOT: { OR: filas.map((r) => ({ role: r.role, userId: r.userId })) },
        },
      });

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

      // Formatos DIAN: viven en la misma sección "Módulos del cliente" y se
      // sincronizan con el mismo flag. Se retiran los deseleccionados y se
      // crean los nuevos, conservando los que siguen activos.
      if (dianFormIds == null) return;
      await tx.clientDianForm.deleteMany({
        where: {
          clientId: id,
          ...(dianFormIds.length > 0 ? { formId: { notIn: dianFormIds } } : {}),
        },
      });
      if (dianFormIds.length > 0) {
        await tx.clientDianForm.createMany({
          data: dianFormIds.map((formId) => ({ clientId: id, formId })),
          skipDuplicates: true,
        });
      }
    });

    const user = await getCurrentUser();
    await logAudit({
      user: user?.name ?? "Sistema",
      action: "ACTUALIZÓ CLIENTE",
      entity: current.code,
      detail: `${name} · ${nit} · tipo ${tipo} · socio ${socio.nombre} · staff ${validados.nombres.staffs.join(", ")} / senior ${validados.nombres.senior} / gerente ${validados.nombres.gerente}${moduleIds != null ? ` · módulos asignados: ${moduleIds.length}` : ""}${dianFormIds != null ? ` · formatos DIAN: ${dianFormIds.length}` : ""}`,
    });
    revalidatePath(PATH);
    return { ok: true };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("updateClient", e) };
  }
}

export async function deleteClient(formData: FormData): Promise<ActionState> {
  const authz = await authorizePermiso("clientes:configurar");
  if (!authz.ok) return { ok: false, message: authz.message };
  const id = parseId(formData.get("id"));
  if (!id) return { ok: false, message: "Cliente inexistente." };
  // Alcance por cartera: solo el responsable del cliente (Senior) o un
  // administrador de plataforma puede eliminarlo ("configurar" infiere modo
  // lectura = membresía).
  const alcance = await authorizePermiso("clientes:configurar", { clientId: id });
  if (!alcance.ok) return { ok: false, message: alcance.message };
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
    return { ok: true, message: "Cliente eliminado." };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("deleteClient", e) };
  }
}

export async function setClientModuleStatus(formData: FormData): Promise<ActionState> {
  const authz = await authorizePermiso("clientes:configurar");
  if (!authz.ok) return { ok: false, message: authz.message };
  const clientId = parseId(formData.get("clientId"));
  const moduleId = parseId(formData.get("moduleId"));
  const next = formData.get("next");
  if (!clientId || !moduleId) return { ok: false, message: "Cliente o módulo inválido." };
  // Validación de input: solo estados conocidos. `next` va directo a la columna
  // `estado`, así que no se confía en el valor del formulario.
  if (next !== "configured" && next !== "pending" && next !== "none") {
    return { ok: false, message: "Estado de módulo inválido." };
  }

  // Alcance por cartera: solo el responsable del cliente o un administrador.
  const alcance = await authorizePermiso("clientes:configurar", { clientId });
  if (!alcance.ok) return { ok: false, message: alcance.message };

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
    const user = await getCurrentUser();
    await logAudit({
      user: user?.name ?? "Sistema",
      action: "CAMBIÓ ESTADO DE MÓDULO",
      entity: `cliente ${clientId} · módulo ${moduleId}`,
      detail: `estado → ${next}`,
    });
    revalidatePath(PATH);
    return { ok: true, message: "Estado de módulo actualizado." };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("setClientModuleStatus", e) };
  }
}
