"use server";

import * as z from "zod";
import { revalidatePath } from "next/cache";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/dal";
import { logAudit } from "@/lib/audit";
import { authorizePermiso } from "@/lib/rbac";
import { clienteDeCuentaCliente } from "@/lib/rbac/contexto";
import { mensajeErrorBD } from "@/lib/errores";
import { esExcepcionCuenta, ORIGEN_MANUAL_CUENTA, ORIGEN_MANUAL_GRUPO } from "@/lib/balance/mapeo-cliente-config";
import { cruzaClaseContable } from "@/lib/balance/clase-contable";
import type { ActionState } from "@/lib/definitions";

// CRUD de la MEMORIA de mapeo del balance, que vive en `cuentas_cliente`: la
// parametrización cuenta_6 del cliente → cuenta estándar Russell que se reaplica
// en cada importación. Editar/crear marca el origen como `manual` (no lo pisa el
// mapeo automático). NO modifica balances ya cargados; aplica a futuras cargas.
// "Eliminar" sólo limpia el mapeo del balance (no borra la fila: puede sostener
// el mapeo de conciliación). Gate: `balance:crear` (Staff y Admin), por cliente.
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
    const cliente = await prisma.client.findUnique({ where: { id: clienteId }, select: { name: true, nit: true } });
    if (!cliente) return { ok: false, message: "El cliente seleccionado ya no existe." };
    // Si la fila ya tiene mapeo de balance, es una edición, no una creación.
    const existe = await prisma.clientAccount.findUnique({
      where: { clienteId_code: { clienteId, code: cuenta6 } },
      select: { cuenta6Russell: true },
    });
    if (existe?.cuenta6Russell) return { ok: false, message: `Ya hay una regla de mapeo para la cuenta ${cuenta6} de este cliente.` };
    const user = await getCurrentUser();
    await prisma.clientAccount.upsert({
      where: { clienteId_code: { clienteId, code: cuenta6 } },
      create: { clientName: cliente.name, clienteId, nit: cliente.nit, code: cuenta6, level: 6, name: cuenta6, cuenta6Russell: codigo, coincidencia: 100, origenMapeo: ORIGEN_MANUAL_GRUPO, actualizadoPor: user?.name ?? null, actualizadoEn: new Date() },
      update: { clientName: cliente.name, nit: cliente.nit, cuenta6Russell: codigo, coincidencia: 100, origenMapeo: ORIGEN_MANUAL_GRUPO, actualizadoPor: user?.name ?? null, actualizadoEn: new Date() },
    });
    await prisma.clientAccount.updateMany({
      where: { clienteId, code: { startsWith: cuenta6 }, NOT: { code: cuenta6 } },
      data: { cuenta6Russell: codigo, coincidencia: 100, origenMapeo: ORIGEN_MANUAL_GRUPO, actualizadoPor: user?.name ?? null, actualizadoEn: new Date() },
    });
    await logAudit({ user: user?.name ?? "Sistema", action: "CREÓ MAPEO CLIENTE", entity: cuenta6, detail: `${cuenta6} → ${codigo}`, clientId: clienteId });
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
    const row = await prisma.clientAccount.findUnique({ where: { id }, select: { code: true, clienteId: true, origenMapeo: true } });
    if (!row) return { ok: false, message: "La regla de mapeo ya no existe." };
    const scope = await authorizePermiso("balance:crear", { clientId: await clienteDeCuentaCliente(id) });
    if (!scope.ok) return { ok: false, message: scope.message };
    if (!(await existeEstandar(codigo))) return { ok: false, message: "La cuenta estándar seleccionada no existe." };
    // Editar una EXCEPCIÓN por cuenta la mantiene como excepción: promoverla a
    // regla de grupo movería en silencio a todas sus cuentas hermanas.
    const esExcepcion = esExcepcionCuenta(row.origenMapeo);
    const origen = esExcepcion ? ORIGEN_MANUAL_CUENTA : ORIGEN_MANUAL_GRUPO;
    const user = await getCurrentUser();
    const ahora = new Date();
    await prisma.clientAccount.update({
      where: { id },
      data: { cuenta6Russell: codigo, coincidencia: 100, origenMapeo: origen, actualizadoPor: user?.name ?? null, actualizadoEn: ahora },
    });
    // Propaga a las imputables del mismo grupo de 6 díg (display consistente).
    if (row.clienteId != null && !esExcepcion) {
      await prisma.clientAccount.updateMany({
        where: { clienteId: row.clienteId, code: { startsWith: row.code }, NOT: { id } },
        data: { cuenta6Russell: codigo, coincidencia: 100, origenMapeo: origen, actualizadoPor: user?.name ?? null, actualizadoEn: ahora },
      });
    }
    await logAudit({ user: user?.name ?? "Sistema", action: "EDITÓ MAPEO CLIENTE", entity: row.code, detail: `${row.code} → ${codigo}${esExcepcion ? " · solo esta cuenta" : ""}`, clientId: row.clienteId });
    revalidatePath(PATH);
    return { ok: true };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("editarMapeoCliente", e) };
  }
}

/**
 * Confirma manualmente el mapeo estándar de una cuenta cuando la coincidencia no
 * es 100% (homologación por descripción/IA): fija TODO el grupo de 6 díg como
 * `manual` al 100%, para que ya no se recalcule en próximas cargas.
 */
export async function confirmarMapeoCliente(formData: FormData): Promise<ActionState> {
  const authz = await authorizePermiso("balance:crear");
  if (!authz.ok) return { ok: false, message: authz.message };
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id) || id <= 0) return { ok: false, message: "Cuenta inexistente." };
  try {
    const row = await prisma.clientAccount.findUnique({ where: { id }, select: { code: true, clienteId: true, cuenta6Russell: true } });
    if (!row) return { ok: false, message: "La cuenta ya no existe." };
    if (!row.cuenta6Russell) return { ok: false, message: "La cuenta no tiene mapeo estándar para confirmar." };
    const scope = await authorizePermiso("balance:crear", { clientId: await clienteDeCuentaCliente(id) });
    if (!scope.ok) return { ok: false, message: scope.message };
    // Confirmar es aceptar la sugerencia AUTOMÁTICA tal cual, no elegir destino:
    // si esa sugerencia cambia de clase contable casi siempre es un error de la
    // cascada (un gasto de depreciación aceptado contra el activo depreciado) y
    // confirmarlo lo blindaría —lo `manual` gobierna sobre todo lo demás y ya no
    // se recalcula—. Para reubicar una cuenta a propósito está «Cambiar cuenta
    // estándar», que sí es una elección explícita.
    if (cruzaClaseContable(row.code, row.cuenta6Russell)) {
      return {
        ok: false,
        message: `${row.code} está mapeada a ${row.cuenta6Russell}, de otra clase contable. Reasigna la cuenta estándar correcta antes de confirmarla.`,
      };
    }
    const cuenta6 = row.code.slice(0, 6);
    // `todas=1` → confirma TODAS las cuentas del cliente que mapean al mismo
    // estándar (varios grupos de 6 díg a la vez); si no, solo el grupo de la fila.
    const todas = formData.get("todas") === "1";
    const user = await getCurrentUser();
    const where =
      row.clienteId == null
        ? { id }
        : todas && row.cuenta6Russell
          ? { clienteId: row.clienteId, cuenta6Russell: row.cuenta6Russell }
          : { clienteId: row.clienteId, code: { startsWith: cuenta6 } };
    // El lote puede arrastrar cuentas de OTRAS clases (el filtro es por estándar
    // o por prefijo, no por clase): se excluyen una a una para que una
    // confirmación masiva no blinde de rebote lo que la guarda acaba de rechazar.
    const candidatas = await prisma.clientAccount.findMany({ where, select: { id: true, code: true, cuenta6Russell: true } });
    const confirmables = candidatas.filter((c) => !cruzaClaseContable(c.code, c.cuenta6Russell));
    const omitidas = candidatas.length - confirmables.length;
    const res = await prisma.clientAccount.updateMany({
      where: { id: { in: confirmables.map((c) => c.id) } },
      data: { coincidencia: 100, origenMapeo: ORIGEN_MANUAL_GRUPO, actualizadoPor: user?.name ?? null, actualizadoEn: new Date() },
    });
    await logAudit({ user: user?.name ?? "Sistema", action: "CONFIRMÓ MAPEO CLIENTE", entity: todas ? (row.cuenta6Russell ?? cuenta6) : cuenta6, detail: `→ ${row.cuenta6Russell} · manual 100% (${res.count} cuenta(s)${todas ? ", todas las del estándar" : ""}${omitidas > 0 ? `; ${omitidas} omitida(s) por cambiar de clase contable` : ""})`, clientId: row.clienteId });
    revalidatePath(PATH);
    return {
      ok: true,
      ...(omitidas > 0
        ? { message: `${res.count} cuenta(s) confirmada(s). Se omitieron ${omitidas} que están mapeadas a otra clase contable: reasígnalas antes de confirmarlas.` }
        : {}),
    };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("confirmarMapeoCliente", e) };
  }
}

export async function eliminarMapeoCliente(_prev: ActionState | undefined, formData: FormData): Promise<ActionState> {
  const authz = await authorizePermiso("balance:crear");
  if (!authz.ok) return { ok: false, message: authz.message };
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id) || id <= 0) return { ok: false, message: "Regla inexistente." };
  try {
    const row = await prisma.clientAccount.findUnique({ where: { id }, select: { code: true, cuenta6Russell: true, clienteId: true } });
    if (!row) return { ok: false, message: "La regla de mapeo ya no existe." };
    const scope = await authorizePermiso("balance:crear", { clientId: await clienteDeCuentaCliente(id) });
    if (!scope.ok) return { ok: false, message: scope.message };
    // Sólo limpia el mapeo del balance; conserva la fila (puede tener conciliación).
    const user = await getCurrentUser();
    const ahora = new Date();
    await prisma.clientAccount.update({
      where: { id },
      data: { cuenta6Russell: null, coincidencia: null, origenMapeo: null, actualizadoPor: user?.name ?? null, actualizadoEn: ahora },
    });
    // Limpia también las imputables del mismo grupo de 6 díg.
    if (row.clienteId != null) {
      await prisma.clientAccount.updateMany({
        where: { clienteId: row.clienteId, code: { startsWith: row.code }, NOT: { id } },
        data: { cuenta6Russell: null, coincidencia: null, origenMapeo: null, actualizadoPor: user?.name ?? null, actualizadoEn: ahora },
      });
    }
    await logAudit({ user: user?.name ?? "Sistema", action: "ELIMINÓ MAPEO CLIENTE", entity: row.code, detail: `${row.code} → ${row.cuenta6Russell ?? "—"}`, clientId: row.clienteId });
    revalidatePath(PATH);
    return { ok: true };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("eliminarMapeoCliente", e) };
  }
}
