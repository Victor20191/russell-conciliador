"use server";

import * as z from "zod";
import { revalidatePath } from "next/cache";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/dal";
import { logAudit } from "@/lib/audit";
import { authorizePermiso } from "@/lib/rbac";
import { getClientIp } from "@/lib/request";
import { mensajeErrorBD, registrarError } from "@/lib/errores";
import {
  StandardAccountCreateSchema,
  StandardAccountUpdateSchema,
  StandardAccountDeleteSchema,
  type ActionState,
} from "@/lib/definitions";

// CRUD del PLAN ESTÁNDAR Russell (catálogo global de cuentas estándar).
// SOLO Administrador: el gate es `mapeo:administrar` (distinto de `mapeo:editar`,
// que es del Staff para mapear el PUC de un cliente). Cada movimiento deja una
// fila en la bitácora DEDICADA (`bitacora_cuentas_estandar`) y, además, en el
// registro GLOBAL de auditoría (`/auditoria`).
const PATH = "/config/mapeo";
const PERMISO = "mapeo:administrar";

// Campos auditables de la cuenta (con su etiqueta legible para el resumen).
const ETIQUETA_CAMPO = {
  code: "código",
  name: "nombre",
  level: "nivel",
  nature: "naturaleza",
  critical: "crítica",
  parent: "padre",
  russellAccount: "cuenta Russell",
  categoryType: "tipo rubro",
  includes: "incluye",
  excludes: "no incluye",
  possibleAccounts: "cuentas posibles",
  supportingDocuments: "soportes terceros",
  controlSupports: "soportes control",
  mappingNotes: "observaciones",
} as const;

type Campo = keyof typeof ETIQUETA_CAMPO;
type Snapshot = Record<Campo, string | number | boolean | null>;

/** Estado plano y serializable de una cuenta estándar (para before/after). */
function snapshot(a: Record<Campo, unknown>): Snapshot {
  const s = {} as Snapshot;
  for (const k of Object.keys(ETIQUETA_CAMPO) as Campo[]) {
    s[k] = (a[k] ?? null) as string | number | boolean | null;
  }
  return s;
}

/** Resumen legible de los campos que cambiaron entre dos estados. */
function resumenCambios(before: Snapshot, after: Snapshot): string {
  const cambios = (Object.keys(ETIQUETA_CAMPO) as Campo[])
    .filter((k) => before[k] !== after[k])
    .map((k) => ETIQUETA_CAMPO[k]);
  return cambios.length > 0
    ? `Editó ${after.code}: ${cambios.join(", ")}`
    : `Editó ${after.code} (sin cambios efectivos)`;
}

/**
 * Registra el movimiento en la bitácora DEDICADA y, en espejo, en la auditoría
 * GLOBAL. Es un EFECTO SECUNDARIO: si falla, no debe tumbar la operación
 * principal (ya exitosa); se registra el error y se continúa. Idéntico criterio
 * que `logAudit`.
 */
async function registrarBitacora(args: {
  accountId: number | null;
  code: string;
  action: "CREÓ" | "EDITÓ" | "ELIMINÓ";
  detail: string;
  before?: Snapshot;
  after?: Snapshot;
}): Promise<void> {
  try {
    const user = await getCurrentUser();
    const ip = await getClientIp();
    await prisma.standardAccountLog.create({
      data: {
        accountId: args.accountId,
        code: args.code,
        action: args.action,
        user: user?.name ?? "Sistema",
        userId: user?.id ?? null,
        detail: args.detail,
        ...(args.before ? { before: args.before } : {}),
        ...(args.after ? { after: args.after } : {}),
        ip,
      },
    });
    await logAudit({
      user: user?.name ?? "Sistema",
      action: `${args.action} CUENTA ESTÁNDAR`,
      entity: `Plan estándar · ${args.code}`,
      detail: args.detail,
    });
  } catch (e) {
    registrarError("registrarBitacora", e);
  }
}

/** Lee del FormData los campos de la cuenta para validarlos con Zod. */
function leerCampos(formData: FormData) {
  return {
    code: formData.get("code"),
    name: formData.get("name"),
    level: formData.get("level"),
    nature: formData.get("nature"),
    critical: formData.get("critical") === "on" || formData.get("critical") === "true",
    parent: formData.get("parent"),
    russellAccount: formData.get("russellAccount"),
    categoryType: formData.get("categoryType"),
    includes: formData.get("includes"),
    excludes: formData.get("excludes"),
    possibleAccounts: formData.get("possibleAccounts"),
    supportingDocuments: formData.get("supportingDocuments"),
    controlSupports: formData.get("controlSupports"),
    mappingNotes: formData.get("mappingNotes"),
  };
}

export async function createStandardAccount(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  const authz = await authorizePermiso(PERMISO);
  if (!authz.ok) return { ok: false, message: authz.message };

  const parsed = StandardAccountCreateSchema.safeParse(leerCampos(formData));
  if (!parsed.success)
    return { ok: false, errors: z.flattenError(parsed.error).fieldErrors };

  try {
    const dup = await prisma.standardAccount.findUnique({
      where: { code: parsed.data.code },
      select: { id: true },
    });
    if (dup) {
      return { ok: false, message: `Ya existe una cuenta estándar con el código ${parsed.data.code}.` };
    }

    const created = await prisma.standardAccount.create({ data: parsed.data });

    await registrarBitacora({
      accountId: created.id,
      code: created.code,
      action: "CREÓ",
      detail: `Creó la cuenta estándar ${created.code} · ${created.name}`,
      after: snapshot(created),
    });
    revalidatePath(PATH);
    return { ok: true, message: "Cuenta estándar creada." };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("createStandardAccount", e) };
  }
}

export async function updateStandardAccount(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  const authz = await authorizePermiso(PERMISO);
  if (!authz.ok) return { ok: false, message: authz.message };

  const parsed = StandardAccountUpdateSchema.safeParse({
    id: formData.get("id"),
    ...leerCampos(formData),
  });
  if (!parsed.success)
    return { ok: false, errors: z.flattenError(parsed.error).fieldErrors };

  try {
    const before = await prisma.standardAccount.findUnique({
      where: { id: parsed.data.id },
    });
    if (!before) return { ok: false, message: "La cuenta estándar no existe." };

    // El código es la llave de negocio (@unique): si cambió, no debe chocar
    // con otra cuenta existente.
    if (parsed.data.code !== before.code) {
      const dup = await prisma.standardAccount.findFirst({
        where: { code: parsed.data.code, NOT: { id: parsed.data.id } },
        select: { id: true },
      });
      if (dup) {
        return { ok: false, message: `Ya existe otra cuenta estándar con el código ${parsed.data.code}.` };
      }
    }

    const { id, ...data } = parsed.data;
    const after = await prisma.standardAccount.update({ where: { id }, data });

    const antes = snapshot(before);
    const despues = snapshot(after);
    await registrarBitacora({
      accountId: after.id,
      code: after.code,
      action: "EDITÓ",
      detail: resumenCambios(antes, despues),
      before: antes,
      after: despues,
    });
    revalidatePath(PATH);
    return { ok: true, message: "Cuenta estándar actualizada." };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("updateStandardAccount", e) };
  }
}

export async function deleteStandardAccount(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  const authz = await authorizePermiso(PERMISO);
  if (!authz.ok) return { ok: false, message: authz.message };

  const parsed = StandardAccountDeleteSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success)
    return { ok: false, errors: z.flattenError(parsed.error).fieldErrors };

  try {
    const before = await prisma.standardAccount.findUnique({
      where: { id: parsed.data.id },
    });
    if (!before) return { ok: false, message: "La cuenta estándar no existe." };

    await prisma.standardAccount.delete({ where: { id: parsed.data.id } });

    await registrarBitacora({
      accountId: before.id, // se conserva el id aunque la fila ya no exista
      code: before.code,
      action: "ELIMINÓ",
      detail: `Eliminó la cuenta estándar ${before.code} · ${before.name}`,
      before: snapshot(before),
    });
    revalidatePath(PATH);
    return { ok: true, message: "Cuenta estándar eliminada." };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("deleteStandardAccount", e) };
  }
}
