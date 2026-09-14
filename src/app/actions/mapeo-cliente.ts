"use server";

import { procedenciaConfiguracion } from "@/lib/balance/procedencia-mapeo";
import * as z from "zod";
import { revalidatePath } from "next/cache";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/dal";
import { logAudit } from "@/lib/audit";
import { authorizePermiso } from "@/lib/rbac";
import { clienteDeCuentaCliente } from "@/lib/rbac/contexto";
import { mensajeErrorBD } from "@/lib/errores";
import { parseId } from "@/lib/ids";
import { esExcepcionCuenta, ORIGEN_MANUAL_CUENTA, ORIGEN_MANUAL_GRUPO } from "@/lib/balance/mapeo-cliente-config";
import { planAlinearConGrupo } from "@/lib/balance/anomalias-mapeo";
import { cruzaClaseContable } from "@/lib/balance/clase-contable";
import type { ActionState } from "@/lib/definitions";
import { bloqueoMemoriaHomologacion, registrarIntentoBloqueado } from "@/lib/conciliacion/verificar-bloqueo";

// CRUD de la MEMORIA de mapeo del balance, que vive en `cuentas_cliente`: la
// parametrización cuenta del cliente → cuenta estándar Russell que se reaplica
// en cada importación. Editar/crear una cuenta de 4/6 dígitos fija la regla del
// GRUPO (`manual`, propaga por prefijo); editar una AUXILIAR (8+ dígitos) deja una
// EXCEPCIÓN de esa sola cuenta (`manual_cuenta`), el mismo contrato que «solo esta
// cuenta» en el detalle del balance. Nada de esto lo pisa el mapeo automático.
// NO modifica balances ya cargados; aplica a futuras cargas (para lo ya cargado:
// `reaplicarMapeoBalancesCliente` en `balance.ts`). "Eliminar" sólo limpia el
// mapeo del balance (no borra la fila: puede sostener el mapeo de conciliación).
// Gate: `balance:crear` (Staff y Admin), por cliente.
const PATH = "/config/mapeo-cliente";

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
    const bloqueoFirme = await bloqueoMemoriaHomologacion({ clienteId, codigo: cuenta6, alcanceGrupo: true });
    if (bloqueoFirme) {
      await registrarIntentoBloqueado({ clienteId, entidad: cliente.name, operacion: `Crear regla de mapeo ${cuenta6} → ${codigo}`, cierres: bloqueoFirme.cierres });
      return { ok: false, message: bloqueoFirme.message };
    }
    const user = await getCurrentUser();
    await prisma.clientAccount.upsert({
      where: { clienteId_code: { clienteId, code: cuenta6 } },
      create: { clientName: cliente.name, clienteId, nit: cliente.nit, code: cuenta6, level: 6, name: cuenta6, cuenta6Russell: codigo, coincidencia: 100, origenMapeo: ORIGEN_MANUAL_GRUPO, actualizadoPor: user?.name ?? null, procedenciaMapeo: procedenciaConfiguracion(), actualizadoEn: new Date() },
      update: { clientName: cliente.name, nit: cliente.nit, cuenta6Russell: codigo, coincidencia: 100, origenMapeo: ORIGEN_MANUAL_GRUPO, actualizadoPor: user?.name ?? null, procedenciaMapeo: procedenciaConfiguracion(), actualizadoEn: new Date() },
    });
    await prisma.clientAccount.updateMany({
      where: { clienteId, code: { startsWith: cuenta6 }, NOT: { code: cuenta6 } },
      data: { cuenta6Russell: codigo, coincidencia: 100, origenMapeo: ORIGEN_MANUAL_GRUPO, actualizadoPor: user?.name ?? null, procedenciaMapeo: procedenciaConfiguracion(), actualizadoEn: new Date() },
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
    // regla de grupo movería en silencio a todas sus cuentas hermanas. Y cualquier
    // AUXILIAR (más de 6 dígitos) editada desde aquí es también una excepción: el
    // clic fue sobre esa cuenta, no sobre su grupo. Dejarla `manual` de grupo la
    // haría ganar la elección del grupo (manual > automático) y arrastrar a sus
    // hermanas en la próxima carga.
    const esExcepcion = esExcepcionCuenta(row.origenMapeo) || row.code.length > 6;
    const origen = esExcepcion ? ORIGEN_MANUAL_CUENTA : ORIGEN_MANUAL_GRUPO;
    if (row.clienteId != null) {
      const bloqueoFirme = await bloqueoMemoriaHomologacion({ clienteId: row.clienteId, codigo: row.code, alcanceGrupo: !esExcepcion });
      if (bloqueoFirme) {
        await registrarIntentoBloqueado({ clienteId: row.clienteId, entidad: row.code, operacion: `Editar regla de mapeo ${row.code} → ${codigo}`, cierres: bloqueoFirme.cierres });
        return { ok: false, message: bloqueoFirme.message };
      }
    }
    const user = await getCurrentUser();
    const ahora = new Date();
    await prisma.clientAccount.update({
      where: { id },
      data: { cuenta6Russell: codigo, coincidencia: 100, origenMapeo: origen, actualizadoPor: user?.name ?? null, procedenciaMapeo: procedenciaConfiguracion(), actualizadoEn: ahora },
    });
    // Propaga a las imputables del mismo grupo de 6 díg (display consistente).
    if (row.clienteId != null && !esExcepcion) {
      await prisma.clientAccount.updateMany({
        where: { clienteId: row.clienteId, code: { startsWith: row.code }, NOT: { id } },
        data: { cuenta6Russell: codigo, coincidencia: 100, origenMapeo: origen, actualizadoPor: user?.name ?? null, procedenciaMapeo: procedenciaConfiguracion(), actualizadoEn: ahora },
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
      data: { coincidencia: 100, origenMapeo: ORIGEN_MANUAL_GRUPO, actualizadoPor: user?.name ?? null, procedenciaMapeo: procedenciaConfiguracion(), actualizadoEn: new Date() },
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
    if (row.clienteId != null) {
      const bloqueoFirme = await bloqueoMemoriaHomologacion({ clienteId: row.clienteId, codigo: row.code, alcanceGrupo: row.code.length === 6 });
      if (bloqueoFirme) {
        await registrarIntentoBloqueado({ clienteId: row.clienteId, entidad: row.code, operacion: `Quitar regla de mapeo ${row.code}`, cierres: bloqueoFirme.cierres });
        return { ok: false, message: bloqueoFirme.message };
      }
    }
    // Sólo limpia el mapeo del balance; conserva la fila (puede tener conciliación).
    const user = await getCurrentUser();
    const ahora = new Date();
    await prisma.clientAccount.update({
      where: { id },
      data: { cuenta6Russell: null, coincidencia: null, origenMapeo: null, actualizadoPor: user?.name ?? null, procedenciaMapeo: procedenciaConfiguracion(), actualizadoEn: ahora },
    });
    // Solo una regla de seis dígitos representa un grupo. Retirar una cuenta
    // larga no debe borrar las reglas de códigos más largos que empiezan igual.
    if (row.clienteId != null && row.code.length === 6) {
      await prisma.clientAccount.updateMany({
        where: { clienteId: row.clienteId, code: { startsWith: row.code }, NOT: { id } },
        data: { cuenta6Russell: null, coincidencia: null, origenMapeo: null, actualizadoPor: user?.name ?? null, procedenciaMapeo: procedenciaConfiguracion(), actualizadoEn: ahora },
      });
    }
    await logAudit({ user: user?.name ?? "Sistema", action: "ELIMINÓ MAPEO CLIENTE", entity: row.code, detail: `${row.code} → ${row.cuenta6Russell ?? "—"}`, clientId: row.clienteId });
    revalidatePath(PATH);
    return { ok: true };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("eliminarMapeoCliente", e) };
  }
}

/**
 * «Alinear con el grupo»: una auxiliar cuya homologación difiere de la regla de su
 * grupo (lo que el filtro «Revisar» señala) vuelve a seguirla. Copia la regla
 * gobernante con su mismo origen (`planAlinearConGrupo`), así que nunca fabrica una
 * fila manual bajo un grupo automático. Solo toca ESA fila.
 */
export async function alinearMapeoConGrupo(formData: FormData): Promise<ActionState> {
  const authz = await authorizePermiso("balance:crear");
  if (!authz.ok) return { ok: false, message: authz.message };
  const id = parseId(formData.get("id"));
  if (!id) return { ok: false, message: "Cuenta inexistente." };
  try {
    const row = await prisma.clientAccount.findUnique({
      where: { id },
      select: { code: true, clienteId: true, cuenta6Russell: true, origenMapeo: true },
    });
    if (!row) return { ok: false, message: "La cuenta ya no existe." };
    if (row.clienteId == null) return { ok: false, message: "La cuenta no está ligada a un cliente." };
    if (row.code.length <= 6) {
      return { ok: false, message: "Solo una cuenta auxiliar se alinea con su grupo: las de 6 dígitos SON la regla del grupo." };
    }
    const scope = await authorizePermiso("balance:crear", { clientId: await clienteDeCuentaCliente(id) });
    if (!scope.ok) return { ok: false, message: scope.message };
    const cuenta6 = row.code.slice(0, 6);
    const grupo = await prisma.clientAccount.findMany({
      where: { clienteId: row.clienteId, code: { startsWith: cuenta6 } },
      select: { id: true, code: true, level: true, cuenta6Russell: true, coincidencia: true, origenMapeo: true, actualizadoEn: true },
    });
    const plan = planAlinearConGrupo(
      grupo.map((c) => ({ ...c, coincidencia: c.coincidencia != null ? Number(c.coincidencia) : null })),
      row.code,
    );
    if (!plan) {
      return { ok: false, message: `El grupo ${cuenta6} no tiene una regla vigente con la que alinear la cuenta ${row.code}.` };
    }
    if (plan.cuenta6Russell === row.cuenta6Russell && plan.origenMapeo === row.origenMapeo) {
      return { ok: true, message: `La cuenta ${row.code} ya sigue la regla de su grupo.` };
    }
    const bloqueoFirme = await bloqueoMemoriaHomologacion({ clienteId: row.clienteId, codigo: row.code, alcanceGrupo: false });
    if (bloqueoFirme) {
      await registrarIntentoBloqueado({ clienteId: row.clienteId, entidad: row.code, operacion: `Alinear mapeo ${row.code} con su grupo`, cierres: bloqueoFirme.cierres });
      return { ok: false, message: bloqueoFirme.message };
    }
    const user = await getCurrentUser();
    await prisma.clientAccount.update({
      where: { id },
      data: { cuenta6Russell: plan.cuenta6Russell, coincidencia: plan.coincidencia, origenMapeo: plan.origenMapeo, actualizadoPor: user?.name ?? null, procedenciaMapeo: procedenciaConfiguracion(), actualizadoEn: new Date() },
    });
    await logAudit({
      user: user?.name ?? "Sistema",
      action: "ALINEÓ MAPEO CON GRUPO",
      entity: row.code,
      detail: `${row.code}: ${row.cuenta6Russell ?? "—"} → ${plan.cuenta6Russell} (regla del grupo ${cuenta6}, fila ${plan.reglaCode}, ${plan.origenMapeo})`,
      clientId: row.clienteId,
    });
    revalidatePath(PATH);
    return { ok: true, message: `${row.code} vuelve a seguir a su grupo → ${plan.cuenta6Russell}. Aplica a las próximas cargas; para los balances ya cargados usa «Reaplicar a balances cargados».` };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("alinearMapeoConGrupo", e) };
  }
}

/**
 * «Mantener como excepción»: declara que la divergencia de una auxiliar es
 * intencional. La fila pasa a `manual_cuenta` al 100% con su estándar actual: deja
 * de contarse como anomalía, le gana a la regla de su grupo solo para ese código y
 * no participa en la elección del grupo. Mismo contrato que «solo esta cuenta» en
 * el detalle del balance.
 */
export async function declararExcepcionMapeo(formData: FormData): Promise<ActionState> {
  const authz = await authorizePermiso("balance:crear");
  if (!authz.ok) return { ok: false, message: authz.message };
  const id = parseId(formData.get("id"));
  if (!id) return { ok: false, message: "Cuenta inexistente." };
  try {
    const row = await prisma.clientAccount.findUnique({
      where: { id },
      select: { code: true, clienteId: true, cuenta6Russell: true, origenMapeo: true },
    });
    if (!row) return { ok: false, message: "La cuenta ya no existe." };
    if (!row.cuenta6Russell) {
      return { ok: false, message: "La cuenta no tiene estándar asignado: asígnalo antes de declararla excepción." };
    }
    if (row.code.length <= 6) return { ok: false, message: "Solo una cuenta auxiliar puede ser excepción de su grupo." };
    const scope = await authorizePermiso("balance:crear", { clientId: await clienteDeCuentaCliente(id) });
    if (!scope.ok) return { ok: false, message: scope.message };
    if (esExcepcionCuenta(row.origenMapeo)) return { ok: true, message: `${row.code} ya es una excepción de solo esta cuenta.` };
    if (row.clienteId != null) {
      const bloqueoFirme = await bloqueoMemoriaHomologacion({ clienteId: row.clienteId, codigo: row.code, alcanceGrupo: false });
      if (bloqueoFirme) {
        await registrarIntentoBloqueado({ clienteId: row.clienteId, entidad: row.code, operacion: `Declarar excepción de mapeo ${row.code}`, cierres: bloqueoFirme.cierres });
        return { ok: false, message: bloqueoFirme.message };
      }
    }
    const user = await getCurrentUser();
    await prisma.clientAccount.update({
      where: { id },
      data: { coincidencia: 100, origenMapeo: ORIGEN_MANUAL_CUENTA, actualizadoPor: user?.name ?? null, procedenciaMapeo: procedenciaConfiguracion(), actualizadoEn: new Date() },
    });
    await logAudit({
      user: user?.name ?? "Sistema",
      action: "DECLARÓ EXCEPCIÓN DE MAPEO",
      entity: row.code,
      detail: `${row.code} → ${row.cuenta6Russell} · solo esta cuenta`,
      clientId: row.clienteId,
    });
    revalidatePath(PATH);
    return { ok: true, message: `${row.code} queda como excepción de solo esta cuenta → ${row.cuenta6Russell}.` };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("declararExcepcionMapeo", e) };
  }
}
