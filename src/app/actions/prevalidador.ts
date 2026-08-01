"use server";

import { revalidatePath, updateTag } from "next/cache";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/dal";
import { logAudit } from "@/lib/audit";
import { authorizePermiso } from "@/lib/rbac";
import { mensajeErrorBD } from "@/lib/errores";
import {
  CuentaClientePrevalidadorSchema,
  FilaPrevalidadorSchema,
  type ActionState,
} from "@/lib/definitions";
import { PREVALIDADOR_CACHE_TAG } from "@/lib/parametros/prevalidador";
import { normalizarPrefijo } from "@/lib/balance/prevalidador/catalogo";

const PATH_CONFIG = "/config/prevalidador";
// La cuenta propia del cliente aplica a TODOS sus balances y el informe se
// recalcula al leer, así que hay que revalidar el listado además del detalle.
const PATH_BALANCE = "/balance";

// Homologar y prevalidar es el mismo trabajo: quien mapea las cuentas es quien
// descubre que «este cliente maneja propiedad, planta y equipo en la 17». Mismo
// permiso que `asignarCuentaEstandar`.
const PERMISO_CUENTA_CLIENTE = "balance:crear";
// El catálogo es un criterio de la FIRMA (qué se prevalida y con qué base de
// cálculo), no un dato de cliente: lo fija quien administra la herramienta.
const PERMISO_CATALOGO = "parametros:administrar";

/**
 * Guarda la cuenta del CLIENTE contra la que se compara una fila del prevalidador.
 * Es una preferencia POR CLIENTE: aplica a todos sus períodos, para no reescribirla
 * en cada cargue mensual. Si la cuenta que se guarda es la misma de Russell, se
 * borra el registro en vez de dejar una fila inerte.
 */
export async function guardarCuentaClientePrevalidador(formData: FormData): Promise<ActionState> {
  const authz = await authorizePermiso(PERMISO_CUENTA_CLIENTE);
  if (!authz.ok) return { ok: false, message: authz.message };

  const parsed = CuentaClientePrevalidadorSchema.safeParse({
    balanceId: formData.get("balanceId"),
    catalogoId: formData.get("catalogoId"),
    cuentaCliente: formData.get("cuentaCliente"),
  });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Datos inválidos." };

  const { balanceId, catalogoId, cuentaCliente } = parsed.data;

  try {
    const encabezado = await prisma.balancePruebaEncabezado.findUnique({
      where: { id: balanceId },
      select: { id: true, clienteId: true },
    });
    if (!encabezado) return { ok: false, message: "El balance ya no existe." };

    // Alcance de escritura sobre el cliente del balance (cartera).
    const alcance = await authorizePermiso(PERMISO_CUENTA_CLIENTE, { clientId: encabezado.clienteId });
    if (!alcance.ok) return { ok: false, message: alcance.message };

    const fila = await prisma.prevalidadorCuenta.findUnique({
      where: { id: catalogoId },
      select: { cuentaRussell: true, activa: true, module: { select: { name: true } } },
    });
    if (!fila || !fila.activa) return { ok: false, message: "Esa cuenta ya no está en el prevalidador." };

    const cuentaRussell = normalizarPrefijo(fila.cuentaRussell);
    const user = await getCurrentUser();
    const restablece = cuentaCliente === cuentaRussell;

    if (restablece) {
      await prisma.prevalidadorCuentaCliente.deleteMany({
        where: { clienteId: encabezado.clienteId, catalogoId },
      });
    } else {
      await prisma.prevalidadorCuentaCliente.upsert({
        where: { clienteId_catalogoId: { clienteId: encabezado.clienteId, catalogoId } },
        create: { clienteId: encabezado.clienteId, catalogoId, cuentaCliente, actualizadoPor: user?.name ?? null },
        update: { cuentaCliente, actualizadoPor: user?.name ?? null },
      });
    }

    await logAudit({
      user: user?.name ?? "Sistema",
      action: restablece ? "RESTABLECIÓ CUENTA DEL PREVALIDADOR" : "AJUSTÓ CUENTA DEL PREVALIDADOR",
      entity: `${fila.module.name} · ${cuentaRussell}`,
      detail: restablece
        ? `La cuenta ${cuentaRussell} vuelve a compararse contra la ${cuentaRussell} del cliente`
        : `La cuenta ${cuentaRussell} de Russell se compara contra la ${cuentaCliente} del cliente`,
      clientId: encabezado.clienteId,
    });
    revalidatePath(`/balance/${balanceId}`);
    revalidatePath(PATH_BALANCE, "layout");
    return {
      ok: true,
      message: restablece
        ? `Se restableció la comparación contra la cuenta ${cuentaRussell}.`
        : `La cuenta ${cuentaRussell} se comparará contra la ${cuentaCliente} del cliente.`,
    };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("guardarCuentaClientePrevalidador", e) };
  }
}

/** Quita la cuenta propia: la fila vuelve a compararse contra el código de Russell. */
export async function restablecerCuentaClientePrevalidador(formData: FormData): Promise<ActionState> {
  const authz = await authorizePermiso(PERMISO_CUENTA_CLIENTE);
  if (!authz.ok) return { ok: false, message: authz.message };

  const balanceId = Number(formData.get("balanceId"));
  const catalogoId = Number(formData.get("catalogoId"));
  if (!Number.isInteger(balanceId) || balanceId <= 0) return { ok: false, message: "Balance inválido." };
  if (!Number.isInteger(catalogoId) || catalogoId <= 0) return { ok: false, message: "Fila inválida." };

  try {
    const encabezado = await prisma.balancePruebaEncabezado.findUnique({
      where: { id: balanceId },
      select: { clienteId: true },
    });
    if (!encabezado) return { ok: false, message: "El balance ya no existe." };

    const alcance = await authorizePermiso(PERMISO_CUENTA_CLIENTE, { clientId: encabezado.clienteId });
    if (!alcance.ok) return { ok: false, message: alcance.message };

    const fila = await prisma.prevalidadorCuenta.findUnique({
      where: { id: catalogoId },
      select: { cuentaRussell: true, module: { select: { name: true } } },
    });
    const borradas = await prisma.prevalidadorCuentaCliente.deleteMany({
      where: { clienteId: encabezado.clienteId, catalogoId },
    });
    if (borradas.count === 0) return { ok: true, message: "Esa fila ya usaba la cuenta de Russell." };

    const user = await getCurrentUser();
    await logAudit({
      user: user?.name ?? "Sistema",
      action: "RESTABLECIÓ CUENTA DEL PREVALIDADOR",
      entity: `${fila?.module.name ?? "Prevalidador"} · ${fila?.cuentaRussell ?? catalogoId}`,
      detail: "La fila vuelve a compararse contra la cuenta de Russell",
      clientId: encabezado.clienteId,
    });
    revalidatePath(`/balance/${balanceId}`);
    revalidatePath(PATH_BALANCE, "layout");
    return { ok: true, message: "Se restableció la cuenta de Russell." };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("restablecerCuentaClientePrevalidador", e) };
  }
}

/**
 * Alta o edición de una fila del catálogo (qué cuenta Russell se prevalida, bajo qué
 * módulo y con qué base de cálculo). Global: afecta a toda la plataforma y, como los
 * agregados se recalculan al leer, también a los balances ya cargados.
 */
export async function guardarFilaPrevalidador(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const authz = await authorizePermiso(PERMISO_CATALOGO);
  if (!authz.ok) return { ok: false, message: authz.message };

  const parsed = FilaPrevalidadorSchema.safeParse({
    id: formData.get("id"),
    moduloId: formData.get("moduloId"),
    cuentaRussell: formData.get("cuentaRussell"),
    etiqueta: formData.get("etiqueta"),
    baseCalculo: formData.get("baseCalculo"),
    orden: formData.get("orden"),
    activa: formData.get("activa"),
  });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Datos inválidos." };

  const { id, moduloId, cuentaRussell, etiqueta, baseCalculo, orden, activa } = parsed.data;

  try {
    const modulo = await prisma.module.findUnique({ where: { id: moduloId }, select: { name: true } });
    if (!modulo) return { ok: false, message: "El módulo seleccionado no existe." };

    // El @@unique es (módulo, cuenta): se traduce a un mensaje legible en vez de
    // dejar salir el error crudo de Prisma.
    const choque = await prisma.prevalidadorCuenta.findUnique({
      where: { moduloId_cuentaRussell: { moduloId, cuentaRussell } },
      select: { id: true },
    });
    if (choque && choque.id !== id) {
      return { ok: false, message: `El módulo ${modulo.name} ya tiene la cuenta ${cuentaRussell}.` };
    }

    const user = await getCurrentUser();
    const datos = { moduloId, cuentaRussell, etiqueta, baseCalculo, orden, activa, actualizadoPor: user?.name ?? null };
    if (id) {
      const previa = await prisma.prevalidadorCuenta.findUnique({ where: { id }, select: { id: true } });
      if (!previa) return { ok: false, message: "Esa fila del prevalidador ya no existe." };
      await prisma.prevalidadorCuenta.update({ where: { id }, data: datos });
    } else {
      await prisma.prevalidadorCuenta.create({ data: datos });
    }

    await logAudit({
      user: user?.name ?? "Sistema",
      action: id ? "EDITÓ CUENTA DEL PREVALIDADOR" : "CREÓ CUENTA DEL PREVALIDADOR",
      entity: `${modulo.name} · ${cuentaRussell}`,
      detail: `${baseCalculo === "movimiento" ? "Movimiento del período" : "Saldo final"}${activa ? "" : " · inactiva"}`,
    });
    updateTag(PREVALIDADOR_CACHE_TAG);
    revalidatePath(PATH_CONFIG);
    revalidatePath(PATH_BALANCE, "layout");
    return { ok: true, message: id ? "Cuenta actualizada." : "Cuenta agregada al prevalidador." };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("guardarFilaPrevalidador", e) };
  }
}

/**
 * Elimina una fila del catálogo. Arrastra por cascada las cuentas propias que los
 * clientes tuvieran colgadas de ella, así que se deja constancia de cuántas eran.
 * Para retirarla del informe sin perder esa configuración, la pantalla ofrece
 * desactivarla en vez de borrarla.
 */
export async function eliminarFilaPrevalidador(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const authz = await authorizePermiso(PERMISO_CATALOGO);
  if (!authz.ok) return { ok: false, message: authz.message };

  const id = Number(formData.get("id"));
  if (!Number.isInteger(id) || id <= 0) return { ok: false, message: "Fila inválida." };

  try {
    const fila = await prisma.prevalidadorCuenta.findUnique({
      where: { id },
      select: { cuentaRussell: true, module: { select: { name: true } }, _count: { select: { overrides: true } } },
    });
    if (!fila) return { ok: false, message: "Esa fila del prevalidador ya no existe." };

    await prisma.prevalidadorCuenta.delete({ where: { id } });

    const user = await getCurrentUser();
    const arrastradas = fila._count.overrides;
    await logAudit({
      user: user?.name ?? "Sistema",
      action: "ELIMINÓ CUENTA DEL PREVALIDADOR",
      entity: `${fila.module.name} · ${fila.cuentaRussell}`,
      detail:
        arrastradas > 0
          ? `Arrastró ${arrastradas} cuenta(s) propia(s) de cliente`
          : "Sin cuentas propias de cliente asociadas",
    });
    updateTag(PREVALIDADOR_CACHE_TAG);
    revalidatePath(PATH_CONFIG);
    revalidatePath(PATH_BALANCE, "layout");
    return {
      ok: true,
      message:
        arrastradas > 0
          ? `Cuenta eliminada junto con ${arrastradas} cuenta(s) propia(s) de cliente.`
          : "Cuenta eliminada del prevalidador.",
    };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("eliminarFilaPrevalidador", e) };
  }
}
