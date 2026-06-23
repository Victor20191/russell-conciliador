"use server";

import * as z from "zod";
import { revalidatePath } from "next/cache";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/dal";
import { logAudit } from "@/lib/audit";
import { authorizePermiso } from "@/lib/rbac";
import { mensajeErrorBD } from "@/lib/errores";
import type { ActionState } from "@/lib/definitions";

// CRUD del catálogo de SUBGRUPOS del plan estándar (nivel 4). Da nombre a los
// niveles 4 y 2 de la vista de balance. SOLO Administrador (`mapeo:administrar`).
// El `grupo` (2 díg.) se deriva del código para garantizar consistencia. Cada
// cambio queda en la auditoría global (/auditoria).
const PATH = "/config/mapeo";
const PERMISO = "mapeo:administrar";

const FormSchema = z.object({
  codigo: z.string().trim().regex(/^\d{4}$/, { error: "El código del subgrupo debe tener 4 dígitos." }),
  nombre: z.string().trim().min(1, { error: "Indica el nombre del subgrupo." }),
  nombreGrupo: z.string().trim().min(1, { error: "Indica el nombre del grupo (nivel 2)." }),
  naturaleza: z.enum(["D", "C"]).catch("D"),
});

function datos(formData: FormData) {
  return {
    codigo: String(formData.get("codigo") ?? ""),
    nombre: String(formData.get("nombre") ?? ""),
    nombreGrupo: String(formData.get("nombreGrupo") ?? ""),
    naturaleza: String(formData.get("naturaleza") ?? "D"),
  };
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
    const user = await getCurrentUser();
    await logAudit({ user: user?.name ?? "Sistema", action: "CREÓ SUBGRUPO", entity: codigo, detail: `${codigo} · ${nombre}` });
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
      const choca = await prisma.subgrupoEstandar.findUnique({ where: { codigo }, select: { id: true } });
      if (choca) return { ok: false, message: `Ya existe un subgrupo con el código ${codigo}.` };
    }
    await prisma.subgrupoEstandar.update({ where: { id }, data: { codigo, nombre, grupo: codigo.slice(0, 2), nombreGrupo, naturaleza } });
    const user = await getCurrentUser();
    await logAudit({ user: user?.name ?? "Sistema", action: "EDITÓ SUBGRUPO", entity: codigo, detail: `${codigo} · ${nombre}` });
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
    await prisma.subgrupoEstandar.delete({ where: { id } });
    const user = await getCurrentUser();
    await logAudit({ user: user?.name ?? "Sistema", action: "ELIMINÓ SUBGRUPO", entity: s.codigo, detail: `${s.codigo} · ${s.nombre}` });
    revalidatePath(PATH);
    return { ok: true };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("eliminarSubgrupo", e) };
  }
}
