"use server";

import * as z from "zod";
import { revalidatePath } from "next/cache";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/dal";
import { logAudit } from "@/lib/audit";
import { authorizePermiso } from "@/lib/rbac";
import { getClientIp } from "@/lib/request";
import { mensajeErrorBD, registrarError } from "@/lib/errores";
import { usoDeSubgrupo } from "@/lib/balance/asociacion";
import { motivoSubgrupoEnUso } from "@/lib/balance/subgrupo-en-uso";
import type { ActionState } from "@/lib/definitions";

// CRUD del catálogo de SUBGRUPOS del plan estándar (nivel 4). Da nombre a los
// niveles 4 y 2 de la vista de balance. Gerente, Socio y administradores (`mapeo:administrar`).
// El `grupo` (2 díg.) se deriva del código para garantizar consistencia. Como las subcuentas de
// 6 dígitos: una cuenta EN USO (balances, memoria o filtros de los módulos) no cambia de código ni
// se elimina, y cada movimiento queda en la bitácora del plan y en la auditoría global (/auditoria).
const PATH = "/config/mapeo";
const PERMISO = "mapeo:administrar";

const FormSchema = z.object({
  codigo: z.string().trim().regex(/^\d{4}$/, { error: "El código del subgrupo debe tener 4 dígitos." }),
  nombre: z.string().trim().min(1, { error: "Indica el nombre del subgrupo." }),
  nombreGrupo: z.string().trim().min(1, { error: "Indica el nombre del grupo (nivel 2)." }),
  naturaleza: z.enum(["D", "C"]).catch("D"),
});

type DatosSubgrupo = z.infer<typeof FormSchema>;

function datos(formData: FormData) {
  return {
    codigo: String(formData.get("codigo") ?? ""),
    nombre: String(formData.get("nombre") ?? ""),
    nombreGrupo: String(formData.get("nombreGrupo") ?? ""),
    naturaleza: String(formData.get("naturaleza") ?? "D"),
  };
}

const snapshot = (s: DatosSubgrupo) => ({ codigo: s.codigo, nombre: s.nombre, nombreGrupo: s.nombreGrupo, naturaleza: s.naturaleza });

const ETIQUETA_CAMPO: Record<keyof ReturnType<typeof snapshot>, string> = {
  codigo: "código",
  nombre: "nombre",
  nombreGrupo: "nombre del grupo",
  naturaleza: "naturaleza",
};

/**
 * Deja el movimiento en la bitácora del plan (`bitacora_cuentas_estandar`, la misma de las
 * subcuentas; `cuenta_id` nulo porque no es una cuenta estándar) y en la auditoría global. Es un
 * efecto secundario: si falla, no tumba la operación ya hecha.
 */
async function registrarBitacoraSubgrupo(args: {
  codigo: string;
  accion: "CREÓ" | "EDITÓ" | "ELIMINÓ";
  detalle: string;
  antes?: ReturnType<typeof snapshot>;
  despues?: ReturnType<typeof snapshot>;
}): Promise<void> {
  try {
    const user = await getCurrentUser();
    const ip = await getClientIp();
    await prisma.standardAccountLog.create({
      data: {
        accountId: null,
        code: args.codigo,
        action: args.accion,
        user: user?.name ?? "Sistema",
        userId: user?.id ?? null,
        detail: args.detalle,
        ...(args.antes ? { before: args.antes } : {}),
        ...(args.despues ? { after: args.despues } : {}),
        ip,
      },
    });
    await logAudit({ user: user?.name ?? "Sistema", action: `${args.accion} SUBGRUPO`, entity: args.codigo, detail: args.detalle });
  } catch (e) {
    registrarError("registrarBitacoraSubgrupo", e);
  }
}

export async function crearSubgrupo(_prev: ActionState | undefined, formData: FormData): Promise<ActionState> {
  const authz = await authorizePermiso(PERMISO);
  if (!authz.ok) return { ok: false, message: authz.message };
  const parsed = FormSchema.safeParse(datos(formData));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  const { codigo, nombre, nombreGrupo, naturaleza } = parsed.data;
  try {
    const existe = await prisma.subgrupoEstandar.findUnique({ where: { codigo }, select: { id: true } });
    if (existe) return { ok: false, message: `Ya existe un subgrupo con el código ${codigo}.` };
    await prisma.subgrupoEstandar.create({ data: { codigo, nombre, grupo: codigo.slice(0, 2), nombreGrupo, naturaleza } });
    await registrarBitacoraSubgrupo({
      codigo,
      accion: "CREÓ",
      detalle: `Creó la cuenta ${codigo} · ${nombre} (4 dígitos)`,
      despues: snapshot(parsed.data),
    });
    revalidatePath(PATH);
    return { ok: true };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("crearSubgrupo", e) };
  }
}

export async function editarSubgrupo(_prev: ActionState | undefined, formData: FormData): Promise<ActionState> {
  const authz = await authorizePermiso(PERMISO);
  if (!authz.ok) return { ok: false, message: authz.message };
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id) || id <= 0) return { ok: false, message: "Subgrupo inexistente." };
  const parsed = FormSchema.safeParse(datos(formData));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  const { codigo, nombre, nombreGrupo, naturaleza } = parsed.data;
  try {
    const actual = await prisma.subgrupoEstandar.findUnique({ where: { id } });
    if (!actual) return { ok: false, message: "El subgrupo ya no existe." };
    if (codigo !== actual.codigo) {
      const enUso = motivoSubgrupoEnUso(actual.codigo, await usoDeSubgrupo(actual.codigo), "cambiar el código de");
      if (enUso) return { ok: false, message: enUso };
      const choca = await prisma.subgrupoEstandar.findUnique({ where: { codigo }, select: { id: true } });
      if (choca) return { ok: false, message: `Ya existe un subgrupo con el código ${codigo}.` };
    }
    await prisma.subgrupoEstandar.update({ where: { id }, data: { codigo, nombre, grupo: codigo.slice(0, 2), nombreGrupo, naturaleza } });
    const antes = snapshot({ codigo: actual.codigo, nombre: actual.nombre, nombreGrupo: actual.nombreGrupo, naturaleza: actual.naturaleza as "D" | "C" });
    const despues = snapshot(parsed.data);
    const cambios = (Object.keys(despues) as (keyof typeof despues)[]).filter((k) => antes[k] !== despues[k]).map((k) => ETIQUETA_CAMPO[k]);
    await registrarBitacoraSubgrupo({
      codigo,
      accion: "EDITÓ",
      detalle: cambios.length > 0 ? `Editó la cuenta ${codigo} (4 dígitos): ${cambios.join(", ")}` : `Editó la cuenta ${codigo} (sin cambios efectivos)`,
      antes,
      despues,
    });
    revalidatePath(PATH);
    return { ok: true };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("editarSubgrupo", e) };
  }
}

export async function eliminarSubgrupo(_prev: ActionState | undefined, formData: FormData): Promise<ActionState> {
  const authz = await authorizePermiso(PERMISO);
  if (!authz.ok) return { ok: false, message: authz.message };
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id) || id <= 0) return { ok: false, message: "Subgrupo inexistente." };
  try {
    const s = await prisma.subgrupoEstandar.findUnique({ where: { id } });
    if (!s) return { ok: false, message: "El subgrupo ya no existe." };
    const enUso = motivoSubgrupoEnUso(s.codigo, await usoDeSubgrupo(s.codigo), "eliminar");
    if (enUso) return { ok: false, message: enUso };
    await prisma.subgrupoEstandar.delete({ where: { id } });
    await registrarBitacoraSubgrupo({
      codigo: s.codigo,
      accion: "ELIMINÓ",
      detalle: `Eliminó la cuenta ${s.codigo} · ${s.nombre} (4 dígitos)`,
      antes: snapshot({ codigo: s.codigo, nombre: s.nombre, nombreGrupo: s.nombreGrupo, naturaleza: s.naturaleza as "D" | "C" }),
    });
    revalidatePath(PATH);
    return { ok: true };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("eliminarSubgrupo", e) };
  }
}
