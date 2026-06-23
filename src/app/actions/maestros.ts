"use server";

import * as z from "zod";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/dal";
import { logAudit } from "@/lib/audit";
import { authorizePermiso } from "@/lib/rbac";
import { esAristaValida, ROL_SUPERIOR } from "@/lib/rbac/jerarquia";
import {
  PasswordSchema,
  SuperioresSchema,
  type ActionState,
} from "@/lib/definitions";
import { parseId } from "@/lib/ids";
import { mensajeErrorBD } from "@/lib/errores";

const PATH = "/config/maestros";
const PATH_CLIENTES = "/config/clientes";
const PATH_USUARIOS = "/config/usuarios";

const ROLES_MAESTRO = ["Socio", "Gerente", "Senior", "Staff"] as const;
type RolMaestro = (typeof ROLES_MAESTRO)[number];

const TipoCatalogoSchema = z.enum(["erp", "sector"], {
  error: "Selecciona un tipo de maestro válido.",
});
type TipoCatalogo = z.infer<typeof TipoCatalogoSchema>;

function iniciales(name: string): string {
  const partes = name.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "NA";
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return `${partes[0][0] ?? ""}${partes[partes.length - 1][0] ?? ""}`.toUpperCase();
}

function normalizarCedula(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  const cedula = valor.replace(/[.\s-]/g, "").trim();
  return cedula === "" ? null : cedula;
}

const TextoOpcional = z.preprocess((valor) => {
  if (typeof valor !== "string") return null;
  const texto = valor.trim();
  return texto === "" ? null : texto;
}, z.string().max(160, { error: "El texto es demasiado largo." }).nullable());

const CedulaField = z.preprocess(
  normalizarCedula,
  z.string().min(1).max(40, { error: "La cédula es demasiado larga." }).nullable(),
);

const MaestroPersonaCreateSchema = z.object({
  email: z.email({ error: "Correo inválido." }).trim().toLowerCase(),
  name: z.string().min(1, { error: "El nombre es obligatorio." }).trim(),
  cedula: CedulaField,
  cargo: TextoOpcional,
  role: z.enum(ROLES_MAESTRO, { error: "Selecciona un rol maestro válido." }),
  active: z.boolean(),
  password: PasswordSchema,
});

const MaestroPersonaUpdateSchema = MaestroPersonaCreateSchema.omit({
  password: true,
}).extend({
  id: z.coerce.number().int().positive(),
  password: z.preprocess((valor) => (valor ? valor : undefined), PasswordSchema.optional()),
});

const CatalogoSchema = z.object({
  tipo: TipoCatalogoSchema,
  code: z.string().min(1, { error: "El código es obligatorio." }).trim().max(60),
  name: z.string().min(1, { error: "El nombre es obligatorio." }).trim().max(180),
  active: z.boolean(),
  order: z.coerce.number().int().min(0).max(9999).default(0),
});

const CatalogoUpdateSchema = CatalogoSchema.extend({
  id: z.coerce.number().int().positive(),
});

function normalizarCodigo(tipo: TipoCatalogo, code: string): string {
  const limpio = code.trim().replace(/\s+/g, " ");
  if (tipo === "erp") {
    return limpio
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase();
  }
  return limpio;
}

function etiquetaCatalogo(tipo: TipoCatalogo): string {
  return tipo === "erp" ? "ERP" : "Sector";
}

function parseSuperiores(
  formData: FormData,
): { ok: true; superiorIds: number[] } | { ok: false } {
  const parsed = SuperioresSchema.safeParse(formData.getAll("superiorIds"));
  if (!parsed.success) return { ok: false };
  return { ok: true, superiorIds: [...new Set(parsed.data)] };
}

async function validarRolActivo(role: RolMaestro): Promise<boolean> {
  const rol = await prisma.role.findFirst({
    where: { code: role, active: true },
    select: { id: true },
  });
  return rol != null;
}

async function validarSuperiores(
  role: string,
  superiorIds: number[],
): Promise<{ ok: true } | { ok: false; message: string }> {
  const rolEsperado = ROL_SUPERIOR[role];
  if (!rolEsperado) {
    return superiorIds.length === 0
      ? { ok: true }
      : { ok: false, message: "Este rol no reporta a superiores en la jerarquía." };
  }
  if (superiorIds.length === 0) return { ok: true };
  const superiores = await prisma.user.findMany({
    where: { id: { in: superiorIds }, active: true, role: rolEsperado },
    select: { id: true },
  });
  if (superiores.length !== superiorIds.length) {
    return {
      ok: false,
      message: `Los superiores seleccionados deben ser usuarios ${rolEsperado} activos.`,
    };
  }
  return { ok: true };
}

async function hayDuplicadosPersona({
  id,
  email,
  cedula,
}: {
  id?: number;
  email: string;
  cedula: string | null;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const emailDup = await prisma.user.findFirst({
    where: { email, ...(id ? { NOT: { id } } : {}) },
    select: { id: true },
  });
  if (emailDup) return { ok: false, message: "Ya existe un usuario con ese correo." };

  if (cedula) {
    const cedulaDup = await prisma.user.findFirst({
      where: { cedula, ...(id ? { NOT: { id } } : {}) },
      select: { id: true },
    });
    if (cedulaDup) return { ok: false, message: "Ya existe un usuario con esa cédula." };
  }
  return { ok: true };
}

async function bloqueosPersona(
  userId: number,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const [responsabilidades, clientesSocio] = await Promise.all([
    prisma.clientAssignment.count({ where: { userId, active: true } }),
    prisma.client.count({ where: { socioId: userId } }),
  ]);
  if (responsabilidades > 0) {
    return {
      ok: false,
      message: `Este maestro es responsable de ${responsabilidades} cliente(s). Reasigna esos clientes antes de cambiar su rol o eliminarlo.`,
    };
  }
  if (clientesSocio > 0) {
    return {
      ok: false,
      message: `Este socio figura en ${clientesSocio} cliente(s). Reasigna el socio de firma antes de cambiar su rol o eliminarlo.`,
    };
  }
  return { ok: true };
}

function revalidarMaestros(): void {
  revalidatePath(PATH);
  revalidatePath(PATH_CLIENTES);
  revalidatePath(PATH_USUARIOS);
}

export async function createMaestroPersona(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  const authz = await authorizePermiso("maestros:administrar");
  if (!authz.ok) return { ok: false, message: authz.message };

  const parsed = MaestroPersonaCreateSchema.safeParse({
    email: formData.get("email"),
    name: formData.get("name"),
    cedula: formData.get("cedula"),
    cargo: formData.get("cargo"),
    role: formData.get("role"),
    active: formData.get("active") === "on" || formData.get("active") === "true",
    password: formData.get("password"),
  });
  if (!parsed.success) return { ok: false, errors: z.flattenError(parsed.error).fieldErrors };

  try {
    if (!(await validarRolActivo(parsed.data.role))) {
      return { ok: false, message: "El rol maestro seleccionado no existe o está inactivo." };
    }
    const duplicados = await hayDuplicadosPersona(parsed.data);
    if (!duplicados.ok) return duplicados;

    const superiores = parseSuperiores(formData);
    if (!superiores.ok) return { ok: false, message: "Selecciona superiores válidos." };
    const superioresValidos = await validarSuperiores(parsed.data.role, superiores.superiorIds);
    if (!superioresValidos.ok) return superioresValidos;

    const password = await bcrypt.hash(parsed.data.password, 10);
    await prisma.$transaction(async (tx) => {
      const usuario = await tx.user.create({
        data: {
          email: parsed.data.email,
          name: parsed.data.name,
          cedula: parsed.data.cedula,
          cargo: parsed.data.cargo,
          role: parsed.data.role,
          initials: iniciales(parsed.data.name),
          password,
          active: parsed.data.active,
          mustChangePassword: true,
        },
      });
      if (superiores.superiorIds.length > 0) {
        await tx.userHierarchy.createMany({
          data: superiores.superiorIds.map((superiorId) => ({
            superiorId,
            subordinateId: usuario.id,
          })),
        });
      }
    });

    const actor = await getCurrentUser();
    await logAudit({
      user: actor?.name ?? "Sistema",
      action: "CREÓ MAESTRO PERSONA",
      entity: parsed.data.email,
      detail: `${parsed.data.role} · superiores: ${superiores.superiorIds.length}`,
    });
    revalidarMaestros();
    return { ok: true };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("createMaestroPersona", e) };
  }
}

export async function updateMaestroPersona(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  const authz = await authorizePermiso("maestros:administrar");
  if (!authz.ok) return { ok: false, message: authz.message };

  const parsed = MaestroPersonaUpdateSchema.safeParse({
    id: formData.get("id"),
    email: formData.get("email"),
    name: formData.get("name"),
    cedula: formData.get("cedula"),
    cargo: formData.get("cargo"),
    role: formData.get("role"),
    active: formData.get("active") === "on" || formData.get("active") === "true",
    password: formData.get("password"),
  });
  if (!parsed.success) return { ok: false, errors: z.flattenError(parsed.error).fieldErrors };

  try {
    if (!(await validarRolActivo(parsed.data.role))) {
      return { ok: false, message: "El rol maestro seleccionado no existe o está inactivo." };
    }
    const target = await prisma.user.findUnique({
      where: { id: parsed.data.id },
      select: { id: true, role: true, active: true, email: true },
    });
    if (!target || !ROLES_MAESTRO.includes(target.role as RolMaestro)) {
      return { ok: false, message: "El maestro no existe." };
    }
    if (
      parsed.data.id === authz.userId &&
      (!parsed.data.active || parsed.data.role !== authz.role)
    ) {
      return { ok: false, message: "No puedes desactivar ni cambiar el rol de tu propia cuenta." };
    }

    const duplicados = await hayDuplicadosPersona(parsed.data);
    if (!duplicados.ok) return duplicados;

    const cambiaRol = target.role !== parsed.data.role;
    if (cambiaRol) {
      const bloqueos = await bloqueosPersona(parsed.data.id);
      if (!bloqueos.ok) return bloqueos;
    }

    const superiores = parseSuperiores(formData);
    if (!superiores.ok) return { ok: false, message: "Selecciona superiores válidos." };
    const superioresValidos = await validarSuperiores(parsed.data.role, superiores.superiorIds);
    if (!superioresValidos.ok) return superioresValidos;

    const resetPassword = parsed.data.password
      ? {
          password: await bcrypt.hash(parsed.data.password, 10),
          mustChangePassword: true,
          failedLoginAttempts: 0,
          lastFailedLoginAt: null,
          blockedUntil: null,
        }
      : {};
    const bump =
      (target.active && !parsed.data.active) || parsed.data.password
        ? { sessionVersion: { increment: 1 } }
        : {};

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: parsed.data.id },
        data: {
          email: parsed.data.email,
          name: parsed.data.name,
          cedula: parsed.data.cedula,
          cargo: parsed.data.cargo,
          role: parsed.data.role,
          active: parsed.data.active,
          ...resetPassword,
          ...bump,
        },
      });

      await tx.userHierarchy.deleteMany({ where: { subordinateId: parsed.data.id } });
      if (superiores.superiorIds.length > 0) {
        await tx.userHierarchy.createMany({
          data: superiores.superiorIds.map((superiorId) => ({
            superiorId,
            subordinateId: parsed.data.id,
          })),
        });
      }

      if (cambiaRol) {
        const comoSuperior = await tx.userHierarchy.findMany({
          where: { superiorId: parsed.data.id },
          select: { id: true, subordinateId: true },
        });
        if (comoSuperior.length > 0) {
          const subordinados = await tx.user.findMany({
            where: { id: { in: comoSuperior.map((a) => a.subordinateId) } },
            select: { id: true, role: true },
          });
          const rolPorId = new Map(subordinados.map((u) => [u.id, u.role]));
          const invalidas = comoSuperior
            .filter((a) => !esAristaValida(parsed.data.role, rolPorId.get(a.subordinateId) ?? ""))
            .map((a) => a.id);
          if (invalidas.length > 0) {
            await tx.userHierarchy.deleteMany({ where: { id: { in: invalidas } } });
          }
        }
      }
    });

    const actor = await getCurrentUser();
    await logAudit({
      user: actor?.name ?? "Sistema",
      action: "EDITÓ MAESTRO PERSONA",
      entity: parsed.data.email,
      detail: `${parsed.data.role} · ${parsed.data.active ? "activo" : "inactivo"} · superiores: ${superiores.superiorIds.length}${parsed.data.password ? " · contraseña restablecida" : ""}`,
    });
    revalidarMaestros();
    return { ok: true };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("updateMaestroPersona", e) };
  }
}

export async function deleteMaestroPersona(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  const authz = await authorizePermiso("maestros:administrar");
  if (!authz.ok) return { ok: false, message: authz.message };

  const id = parseId(formData.get("id"));
  if (!id) return { ok: false, message: "El maestro no existe." };
  if (id === authz.userId) return { ok: false, message: "No puedes eliminar tu propia cuenta." };

  try {
    const target = await prisma.user.findUnique({
      where: { id },
      select: { email: true, role: true },
    });
    if (!target || !ROLES_MAESTRO.includes(target.role as RolMaestro)) {
      return { ok: false, message: "El maestro no existe." };
    }
    const bloqueos = await bloqueosPersona(id);
    if (!bloqueos.ok) return bloqueos;

    await prisma.$transaction([
      prisma.userHierarchy.deleteMany({
        where: { OR: [{ superiorId: id }, { subordinateId: id }] },
      }),
      prisma.clientAssignment.deleteMany({ where: { userId: id } }),
      prisma.clientAssignment.updateMany({ where: { assignedById: id }, data: { assignedById: null } }),
      prisma.user.delete({ where: { id } }),
    ]);

    const actor = await getCurrentUser();
    await logAudit({
      user: actor?.name ?? "Sistema",
      action: "ELIMINÓ MAESTRO PERSONA",
      entity: target.email,
      detail: target.role,
    });
    revalidarMaestros();
    return { ok: true };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("deleteMaestroPersona", e) };
  }
}

export async function createMaestroCatalogo(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  const authz = await authorizePermiso("maestros:administrar");
  if (!authz.ok) return { ok: false, message: authz.message };

  const parsed = CatalogoSchema.safeParse({
    tipo: formData.get("tipo"),
    code: formData.get("code"),
    name: formData.get("name"),
    active: formData.get("active") === "on" || formData.get("active") === "true",
    order: formData.get("order") || 0,
  });
  if (!parsed.success) return { ok: false, errors: z.flattenError(parsed.error).fieldErrors };

  const data = {
    code: normalizarCodigo(parsed.data.tipo, parsed.data.code),
    name: parsed.data.name,
    active: parsed.data.active,
    order: parsed.data.order,
  };

  try {
    if (parsed.data.tipo === "erp") {
      await prisma.erp.create({ data });
    } else {
      await prisma.sector.create({ data });
    }

    const actor = await getCurrentUser();
    await logAudit({
      user: actor?.name ?? "Sistema",
      action: `CREÓ ${etiquetaCatalogo(parsed.data.tipo)}`,
      entity: data.code,
      detail: data.name,
    });
    revalidarMaestros();
    return { ok: true };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("createMaestroCatalogo", e) };
  }
}

export async function updateMaestroCatalogo(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  const authz = await authorizePermiso("maestros:administrar");
  if (!authz.ok) return { ok: false, message: authz.message };

  const parsed = CatalogoUpdateSchema.safeParse({
    id: formData.get("id"),
    tipo: formData.get("tipo"),
    code: formData.get("code"),
    name: formData.get("name"),
    active: formData.get("active") === "on" || formData.get("active") === "true",
    order: formData.get("order") || 0,
  });
  if (!parsed.success) return { ok: false, errors: z.flattenError(parsed.error).fieldErrors };

  const data = {
    code: normalizarCodigo(parsed.data.tipo, parsed.data.code),
    name: parsed.data.name,
    active: parsed.data.active,
    order: parsed.data.order,
  };

  try {
    if (parsed.data.tipo === "erp") {
      await prisma.erp.update({ where: { id: parsed.data.id }, data });
    } else {
      await prisma.sector.update({ where: { id: parsed.data.id }, data });
    }

    const actor = await getCurrentUser();
    await logAudit({
      user: actor?.name ?? "Sistema",
      action: `EDITÓ ${etiquetaCatalogo(parsed.data.tipo)}`,
      entity: data.code,
      detail: `${data.name} · ${data.active ? "activo" : "inactivo"}`,
    });
    revalidarMaestros();
    return { ok: true };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("updateMaestroCatalogo", e) };
  }
}

export async function deleteMaestroCatalogo(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  const authz = await authorizePermiso("maestros:administrar");
  if (!authz.ok) return { ok: false, message: authz.message };

  const tipoParsed = TipoCatalogoSchema.safeParse(formData.get("tipo"));
  const id = parseId(formData.get("id"));
  if (!tipoParsed.success || !id) return { ok: false, message: "El maestro no existe." };

  try {
    if (tipoParsed.data === "erp") {
      const [erp, clientes] = await Promise.all([
        prisma.erp.findUnique({ where: { id }, select: { code: true, name: true } }),
        prisma.client.count({ where: { erpId: id } }),
      ]);
      if (!erp) return { ok: false, message: "El ERP no existe." };
      if (clientes > 0) {
        return { ok: false, message: `Este ERP está asignado a ${clientes} cliente(s). Desactívalo o reasigna esos clientes antes de eliminarlo.` };
      }
      await prisma.erp.delete({ where: { id } });
      const actor = await getCurrentUser();
      await logAudit({
        user: actor?.name ?? "Sistema",
        action: "ELIMINÓ ERP",
        entity: erp.code,
        detail: erp.name,
      });
    } else {
      const [sector, clientes] = await Promise.all([
        prisma.sector.findUnique({ where: { id }, select: { code: true, name: true } }),
        prisma.client.count({ where: { sectorId: id } }),
      ]);
      if (!sector) return { ok: false, message: "El sector no existe." };
      if (clientes > 0) {
        return { ok: false, message: `Este sector está asignado a ${clientes} cliente(s). Desactívalo o reasigna esos clientes antes de eliminarlo.` };
      }
      await prisma.sector.delete({ where: { id } });
      const actor = await getCurrentUser();
      await logAudit({
        user: actor?.name ?? "Sistema",
        action: "ELIMINÓ SECTOR",
        entity: sector.code,
        detail: sector.name,
      });
    }
    revalidarMaestros();
    return { ok: true };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("deleteMaestroCatalogo", e) };
  }
}
