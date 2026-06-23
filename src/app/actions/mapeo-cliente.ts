"use server";

import * as z from "zod";
import { revalidatePath } from "next/cache";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/dal";
import { logAudit } from "@/lib/audit";
import { authorizePermiso } from "@/lib/rbac";
import { mensajeErrorBD } from "@/lib/errores";
import type { ActionState } from "@/lib/definitions";

// CRUD de la MEMORIA de mapeo por cliente (`mapeo_balance_cliente`): la
// parametrización cuenta_6 del cliente → cuenta estándar Russell que se reaplica
// en cada importación. Editar aquí marca el origen como `manual` (no lo pisa el
// mapeo automático). NO modifica balances ya cargados; aplica a futuras cargas.
// Gate: `balance:crear` (Staff y Admin), scoped por cliente.
const PATH = "/config/mapeo";

async function existeEstandar(codigo: string): Promise<boolean> {
  return (await prisma.standardAccount.findUnique({ where: { code: codigo }, select: { code: true } })) != null;
}

const CrearSchema = z.object({
  clienteId: z.coerce.number().int().positive(),
  cuenta6: z.string().trim().regex(/^\d{6}$/, { error: "La cuenta del cliente debe tener 6 dígitos." }),
  codigo: z.string().trim().regex(/^\d{6}$/, { error: "Selecciona una cuenta estándar (6 dígitos)." }),
});

export async function crearMapeoCliente(_prev: ActionState | undefined, formData: FormData): Promise<ActionState> {
  const authz = await authorizePermiso("balance:crear");
  if (!authz.ok) return { ok: false, message: authz.message };
  const parsed = CrearSchema.safeParse({
    clienteId: formData.get("clienteId"),
    cuenta6: formData.get("cuenta6"),
    codigo: formData.get("codigo"),
  });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  const { clienteId, cuenta6, codigo } = parsed.data;
  const scope = await authorizePermiso("balance:crear", { clientId: clienteId });
  if (!scope.ok) return { ok: false, message: scope.message };
  try {
    if (!(await existeEstandar(codigo))) return { ok: false, message: "La cuenta estándar seleccionada no existe." };
    const existe = await prisma.mapeoBalanceCliente.findUnique({ where: { clienteId_cuenta6: { clienteId, cuenta6 } }, select: { id: true } });
    if (existe) return { ok: false, message: `Ya hay una regla para la cuenta ${cuenta6} de este cliente.` };
    const user = await getCurrentUser();
    await prisma.mapeoBalanceCliente.create({
      data: { clienteId, cuenta6, cuenta6Russell: codigo, coincidencia: 100, origen: "manual", actualizadoPor: user?.name ?? null },
    });
    await logAudit({ user: user?.name ?? "Sistema", action: "CREÓ MAPEO CLIENTE", entity: cuenta6, detail: `${cuenta6} → ${codigo}` });
    revalidatePath(PATH);
    return { ok: true };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("crearMapeoCliente", e) };
  }
}

const EditarSchema = z.object({
  id: z.coerce.number().int().positive(),
  codigo: z.string().trim().regex(/^\d{6}$/, { error: "Selecciona una cuenta estándar (6 dígitos)." }),
});

export async function editarMapeoCliente(_prev: ActionState | undefined, formData: FormData): Promise<ActionState> {
  const authz = await authorizePermiso("balance:crear");
  if (!authz.ok) return { ok: false, message: authz.message };
  const parsed = EditarSchema.safeParse({ id: formData.get("id"), codigo: formData.get("codigo") });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  const { id, codigo } = parsed.data;
  try {
    const row = await prisma.mapeoBalanceCliente.findUnique({ where: { id }, select: { clienteId: true, cuenta6: true } });
    if (!row) return { ok: false, message: "La regla de mapeo ya no existe." };
    const scope = await authorizePermiso("balance:crear", { clientId: row.clienteId });
    if (!scope.ok) return { ok: false, message: scope.message };
    if (!(await existeEstandar(codigo))) return { ok: false, message: "La cuenta estándar seleccionada no existe." };
    const user = await getCurrentUser();
    await prisma.mapeoBalanceCliente.update({
      where: { id },
      data: { cuenta6Russell: codigo, coincidencia: 100, origen: "manual", actualizadoPor: user?.name ?? null },
    });
    await logAudit({ user: user?.name ?? "Sistema", action: "EDITÓ MAPEO CLIENTE", entity: row.cuenta6, detail: `${row.cuenta6} → ${codigo}` });
    revalidatePath(PATH);
    return { ok: true };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("editarMapeoCliente", e) };
  }
}

export async function eliminarMapeoCliente(_prev: ActionState | undefined, formData: FormData): Promise<ActionState> {
  const authz = await authorizePermiso("balance:crear");
  if (!authz.ok) return { ok: false, message: authz.message };
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id) || id <= 0) return { ok: false, message: "Regla inexistente." };
  try {
    const row = await prisma.mapeoBalanceCliente.findUnique({ where: { id }, select: { clienteId: true, cuenta6: true, cuenta6Russell: true } });
    if (!row) return { ok: false, message: "La regla de mapeo ya no existe." };
    const scope = await authorizePermiso("balance:crear", { clientId: row.clienteId });
    if (!scope.ok) return { ok: false, message: scope.message };
    await prisma.mapeoBalanceCliente.delete({ where: { id } });
    const user = await getCurrentUser();
    await logAudit({ user: user?.name ?? "Sistema", action: "ELIMINÓ MAPEO CLIENTE", entity: row.cuenta6, detail: `${row.cuenta6} → ${row.cuenta6Russell}` });
    revalidatePath(PATH);
    return { ok: true };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("eliminarMapeoCliente", e) };
  }
}
