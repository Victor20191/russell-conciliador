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
import { claveNit } from "@/lib/nit";
import {
  CODIGOS_ERP_BASE,
  PROCESOS_ERP,
  campoErpProceso,
  esCodigoProcesoErp,
  esProcesoErpBase,
  type CodigoProcesoErp,
} from "@/lib/erp-procesos";

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

type ErpProcesoFormulario = { codigo: CodigoProcesoErp; erpId: number | null };
type ErpProcesoPersistible = ErpProcesoFormulario & { processId: number };
type ErpProcesoExistente = { erpId: number | null; status: string; source: string | null };

/** Compatibilidad con consumidores anteriores al formulario por proceso. */
async function erpValido(erpId: number): Promise<boolean> {
  const erp = await prisma.erp.findUnique({
    where: { id: erpId },
    select: { active: true },
  });
  return erp?.active === true;
}

function parseErpsPorProceso(
  formData: FormData,
): { ok: true; asignaciones: ErpProcesoFormulario[]; retirados: CodigoProcesoErp[] } | { ok: false; errors: Record<string, string[]> } {
  const asignaciones: ErpProcesoFormulario[] = [];
  const errors: Record<string, string[]> = {};

  const codigosRaw = formData.getAll("erpProcesoCodigos").map((value) =>
    String(value).trim().toUpperCase(),
  );
  const codigosUnicos = [...new Set(codigosRaw)];

  if (codigosRaw.length !== codigosUnicos.length || codigosUnicos.some((codigo) => !esCodigoProcesoErp(codigo))) {
    return {
      ok: false,
      errors: { erpProcesoCodigos: ["La selección de procesos ERP no es válida."] },
    };
  }
  const codigos = codigosUnicos as CodigoProcesoErp[];
  if (CODIGOS_ERP_BASE.some((codigo) => !codigos.includes(codigo))) {
    return {
      ok: false,
      errors: { erpProcesoCodigos: ["Contabilidad, Nómina e Inventarios son procesos obligatorios."] },
    };
  }

  const retiradosRaw = formData.getAll("erpProcesoRetirados").map((value) =>
    String(value).trim().toUpperCase(),
  );
  const retiradosUnicos = [...new Set(retiradosRaw)];
  if (
    retiradosRaw.length !== retiradosUnicos.length
    || retiradosUnicos.some((codigo) =>
      !esCodigoProcesoErp(codigo) || esProcesoErpBase(codigo) || codigos.includes(codigo as CodigoProcesoErp),
    )
  ) {
    return {
      ok: false,
      errors: { erpProcesoCodigos: ["La lista de procesos retirados no es válida."] },
    };
  }
  const retirados = retiradosUnicos as CodigoProcesoErp[];

  for (const codigo of codigos) {
    const proceso = PROCESOS_ERP.find((item) => item.codigo === codigo)!;
    const campo = campoErpProceso(codigo);
    const raw = formData.get(campo);
    if (raw == null || raw === "") {
      if (!esProcesoErpBase(codigo)) {
        errors[campo] = [`Selecciona el ERP de ${proceso.nombre} o retira el proceso adicional.`];
        continue;
      }
      asignaciones.push({ codigo, erpId: null });
      continue;
    }
    const erpId = parseId(raw);
    if (erpId == null) {
      errors[campo] = [`Selecciona un ERP válido para ${proceso.nombre}.`];
      continue;
    }
    asignaciones.push({ codigo, erpId });
  }

  return Object.keys(errors).length > 0
    ? { ok: false, errors }
    : { ok: true, asignaciones, retirados };
}

async function validarErpsPorProceso(
  asignaciones: ErpProcesoFormulario[],
  opciones?: {
    existentes?: Map<CodigoProcesoErp, ErpProcesoExistente>;
    erpLegado?: number | null;
  },
): Promise<
  | { ok: true; asignaciones: ErpProcesoPersistible[] }
  | { ok: false; message: string }
> {
  const erpIds = [...new Set(asignaciones.flatMap((item) => item.erpId == null ? [] : [item.erpId]))];
  const [procesos, erps] = await Promise.all([
    prisma.erpProcess.findMany({
      where: { active: true, code: { in: asignaciones.map((item) => item.codigo) } },
      select: { id: true, code: true },
    }),
    erpIds.length > 0
      ? prisma.erp.findMany({
          where: { id: { in: erpIds } },
          select: { id: true, active: true },
        })
      : Promise.resolve([]),
  ]);

  const procesoPorCodigo = new Map(procesos.map((item) => [item.code, item.id]));
  if (asignaciones.some((item) => !procesoPorCodigo.has(item.codigo))) {
    return { ok: false, message: "Uno de los procesos ERP seleccionados no existe o está inactivo." };
  }

  const erpPorId = new Map(erps.map((item) => [item.id, item]));
  for (const asignacion of asignaciones) {
    if (asignacion.erpId == null) continue;
    const erp = erpPorId.get(asignacion.erpId);
    if (!erp) return { ok: false, message: "Selecciona sistemas ERP válidos." };
    if (erp.active) continue;

    // Un sistema que fue inactivado en el catálogo puede conservarse, pero no
    // asignarse por primera vez ni trasladarse a otro proceso.
    const existente = opciones?.existentes?.get(asignacion.codigo);
    const heredadoLegado = asignacion.codigo === "CONT"
      && !opciones?.existentes?.has(asignacion.codigo)
      && opciones?.erpLegado === asignacion.erpId;
    if (existente?.erpId !== asignacion.erpId && !heredadoLegado) {
      return { ok: false, message: "No puedes asignar un ERP inactivo a un proceso nuevo." };
    }
  }

  return {
    ok: true,
    asignaciones: asignaciones.map((item) => ({
      ...item,
      processId: procesoPorCodigo.get(item.codigo)!,
    })),
  };
}

/** Sector del catálogo maestro: debe existir y estar activo. */
async function sectorValido(sectorId: number): Promise<boolean> {
  const sector = await prisma.sector.findUnique({ where: { id: sectorId }, select: { active: true } });
  return sector?.active === true;
}

async function clienteConMismoNit(
  nit: string,
  excluirId?: number,
): Promise<{ id: number; code: string; name: string; nit: string } | null> {
  const nitNormalizado = claveNit(nit);
  if (!nitNormalizado) return null;

  const rows = excluirId
    ? await prisma.$queryRaw<{ id: number; code: string; name: string; nit: string }[]>`
        SELECT id, codigo AS code, nombre AS name, nit
        FROM clientes
        WHERE regexp_replace(nit, '[^0-9]', '', 'g') = ${nitNormalizado}
          AND id <> ${excluirId}
        LIMIT 1
      `
    : await prisma.$queryRaw<{ id: number; code: string; name: string; nit: string }[]>`
        SELECT id, codigo AS code, nombre AS name, nit
        FROM clientes
        WHERE regexp_replace(nit, '[^0-9]', '', 'g') = ${nitNormalizado}
        LIMIT 1
      `;

  return rows[0] ?? null;
}

function errorNitDuplicado(cliente: { code: string; name: string }): ActionState {
  return {
    ok: false,
    errors: {
      nit: [`Ya existe un cliente con este NIT (${cliente.code} - ${cliente.name}).`],
    },
  };
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

    const syncErpsPorProceso = formData.get("syncErpsPorProceso") === "1";
    const erpsProceso = syncErpsPorProceso ? parseErpsPorProceso(formData) : null;
    if (erpsProceso && !erpsProceso.ok) return { ok: false, errors: erpsProceso.errors };
    const erpContable = erpsProceso?.asignaciones.find((item) => item.codigo === "CONT")?.erpId;

    const parsed = ClientSchema.safeParse({
      code,
      name: formData.get("name"),
      nit: formData.get("nit"),
      tipo: formData.get("tipo"),
      erpId: syncErpsPorProceso ? erpContable : formData.get("erpId"),
      sectorId: formData.get("sectorId"),
      socioId: formData.get("socioId"),
    });
    if (!parsed.success) {
      return { ok: false, errors: z.flattenError(parsed.error).fieldErrors };
    }
    const { socioId, ...data } = parsed.data;

    const duplicado = await clienteConMismoNit(data.nit);
    if (duplicado) return errorNitDuplicado(duplicado);

    const erpsValidados = erpsProceso
      ? await validarErpsPorProceso(erpsProceso.asignaciones)
      : null;
    if (erpsValidados && !erpsValidados.ok) return { ok: false, message: erpsValidados.message };
    if (!syncErpsPorProceso && data.erpId != null && !(await erpValido(data.erpId))) {
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
      if (erpsValidados?.ok) {
        await tx.clientErpProcess.createMany({
          data: erpsValidados.asignaciones.map((asignacion) => ({
            clientId: cliente.id,
            processId: asignacion.processId,
            erpId: asignacion.erpId,
            status: asignacion.erpId == null ? "pendiente" : "confirmado",
            source: "manual",
          })),
        });
      }
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
    const current = await prisma.client.findUnique({
      where: { id },
      include: {
        erpsPorProceso: {
          select: {
            processId: true,
            erpId: true,
            status: true,
            source: true,
            process: { select: { code: true } },
          },
        },
      },
    });
    if (!current) return { ok: false, message: "Cliente inexistente." };

    // El código no se edita: se conserva el ya asignado al cliente.
    const syncErpsPorProceso = formData.get("syncErpsPorProceso") === "1";
    if (syncErpsPorProceso) {
      const configAuthz = await authorizePermiso("clientes:configurar", { clientId: id });
      if (!configAuthz.ok) return { ok: false, message: configAuthz.message };
    }
    const erpsProceso = syncErpsPorProceso ? parseErpsPorProceso(formData) : null;
    if (erpsProceso && !erpsProceso.ok) return { ok: false, errors: erpsProceso.errors };
    const erpContable = erpsProceso?.asignaciones.find((item) => item.codigo === "CONT")?.erpId;

    const parsed = ClientSchema.safeParse({
      code: current.code,
      name: formData.get("name"),
      nit: formData.get("nit"),
      tipo: formData.get("tipo"),
      erpId: syncErpsPorProceso ? erpContable : formData.get("erpId"),
      sectorId: formData.get("sectorId"),
      socioId: formData.get("socioId"),
    });
    if (!parsed.success) {
      return { ok: false, errors: z.flattenError(parsed.error).fieldErrors };
    }
    const { name, nit, tipo, erpId, sectorId, socioId } = parsed.data;

    const duplicado = await clienteConMismoNit(nit, id);
    if (duplicado) return errorNitDuplicado(duplicado);

    const existentes = new Map<CodigoProcesoErp, ErpProcesoExistente>();
    for (const asignacion of current.erpsPorProceso) {
      const codigo = asignacion.process.code as CodigoProcesoErp;
      if (PROCESOS_ERP.some((item) => item.codigo === codigo)) {
        existentes.set(codigo, {
          erpId: asignacion.erpId,
          status: asignacion.status,
          source: asignacion.source,
        });
      }
    }
    const erpsValidados = erpsProceso
      ? await validarErpsPorProceso(erpsProceso.asignaciones, {
          existentes,
          erpLegado: current.erpId,
        })
      : null;
    if (erpsValidados && !erpsValidados.ok) return { ok: false, message: erpsValidados.message };
    const processIdsRetirados = syncErpsPorProceso
      ? current.erpsPorProceso
          .filter((asignacion) =>
            !esProcesoErpBase(asignacion.process.code)
            && erpsProceso?.retirados.includes(asignacion.process.code as CodigoProcesoErp),
          )
          .map((asignacion) => asignacion.processId)
      : [];
    if (!syncErpsPorProceso && erpId != null && !(await erpValido(erpId))) {
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
      // erpId/sectorId con `?? null` para poder DEJARLOS vacíos (opcionales):
      // undefined no actualizaría la columna; null la limpia explícitamente.
      await tx.client.update({ where: { id }, data: { name, nit, tipo, erpId: erpId ?? null, sectorId: sectorId ?? null, socioId } });

      if (erpsValidados?.ok) {
        for (const asignacion of erpsValidados.asignaciones) {
          const existente = existentes.get(asignacion.codigo);
          const sinCambio = existente?.erpId === asignacion.erpId;
          const status = sinCambio
            ? existente.status
            : asignacion.erpId == null ? "pendiente" : "confirmado";
          const source = sinCambio ? existente.source : "manual";
          await tx.clientErpProcess.upsert({
            where: {
              clientId_processId: { clientId: id, processId: asignacion.processId },
            },
            create: {
              clientId: id,
              processId: asignacion.processId,
              erpId: asignacion.erpId,
              status,
              source,
            },
            update: {
              erpId: asignacion.erpId,
              status,
              source,
            },
          });
        }
        if (processIdsRetirados.length > 0) {
          await tx.clientErpProcess.deleteMany({
            where: { clientId: id, processId: { in: processIdsRetirados } },
          });
        }
      }

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
      detail: `${name} · ${nit} · tipo ${tipo} · socio ${socio.nombre} · staff ${validados.nombres.staffs.join(", ")} / senior ${validados.nombres.senior} / gerente ${validados.nombres.gerente}${erpsValidados?.ok ? ` · sistemas por proceso: ${erpsValidados.asignaciones.length}` : ""}${processIdsRetirados.length ? ` · procesos retirados: ${processIdsRetirados.length}` : ""}${moduleIds != null ? ` · módulos asignados: ${moduleIds.length}` : ""}${dianFormIds != null ? ` · formatos DIAN: ${dianFormIds.length}` : ""}`,
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
