"use server";

import { revalidatePath, updateTag } from "next/cache";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/dal";
import { logAudit } from "@/lib/audit";
import { authorizePermiso } from "@/lib/rbac";
import { mensajeErrorBD } from "@/lib/errores";
import { tomarCandadoTransaccion, transaccionSerializable, type TransactionClient } from "@/lib/concurrency";
import type { Prisma } from "@/generated/prisma/client";
import {
  CuentaClientePrevalidadorSchema,
  FilaPrevalidadorSchema,
  RevisionPrevalidadorSchema,
  type ActionState,
} from "@/lib/definitions";
import {
  MODULOS_PREVALIDADOR_APROBADOS,
  PREVALIDADOR_CACHE_TAG,
} from "@/lib/parametros/prevalidador";
import { normalizarPrefijo } from "@/lib/balance/prevalidador/catalogo";
import { cargarContextoPrevalidadorBalance } from "@/lib/balance/prevalidador/servidor";

const PATH_CONFIG = "/config/prevalidador";
const PATH_BALANCE = "/balance";
const PERMISO_CUENTA_BALANCE = "balance:crear";
const PERMISO_REVISION = "balance:revisar";
const PERMISO_CATALOGO = "parametros:administrar";

class ErrorDominioPrevalidador extends Error {}

type BalanceBloqueado = {
  id: number;
  clienteId: number;
  nombreCliente: string;
  periodo: string;
  version: string;
  estaCongelado: boolean;
};

/**
 * Comparte el candado que usa `freezeBalance`: después de tomarlo relee el
 * encabezado para que congelar y editar el prevalidador nunca puedan cruzarse.
 */
async function cargarBalanceConCandado(tx: TransactionClient, balanceId: number): Promise<BalanceBloqueado> {
  const referencia = await tx.balancePruebaEncabezado.findUnique({
    where: { id: balanceId },
    select: { clienteId: true, periodo: true },
  });
  if (!referencia) throw new ErrorDominioPrevalidador("El balance ya no existe.");
  await tomarCandadoTransaccion(tx, `balance-oficial:${referencia.clienteId}:${referencia.periodo}`);
  const balance = await tx.balancePruebaEncabezado.findUnique({
    where: { id: balanceId },
    select: {
      id: true,
      clienteId: true,
      nombreCliente: true,
      periodo: true,
      version: true,
      estaCongelado: true,
    },
  });
  if (!balance) throw new ErrorDominioPrevalidador("El balance ya no existe.");
  return balance;
}

async function autorizarBalance(balanceId: number, permiso: string): Promise<{ ok: true; clienteId: number } | { ok: false; message: string }> {
  const balance = await prisma.balancePruebaEncabezado.findUnique({
    where: { id: balanceId },
    select: { clienteId: true },
  });
  if (!balance) return { ok: false, message: "El balance ya no existe." };
  const alcance = await authorizePermiso(permiso, { clientId: balance.clienteId });
  if (!alcance.ok) return { ok: false, message: alcance.message };
  return { ok: true, clienteId: balance.clienteId };
}

function solapanPrefijos(a: string, b: string): boolean {
  return a.startsWith(b) || b.startsWith(a);
}

/**
 * Valida los prefijos ya RESUELTOS del cliente dentro de un módulo. No basta con
 * validar el catálogo Russell: un override `1330 → 2205` se solapa con la fila
 * `22` y haría que el total del módulo contara `2205` dos veces.
 */
async function asegurarCuentaClienteSinSolape(
  tx: TransactionClient,
  input: {
    balanceId: number;
    catalogoId: number;
    moduloId: number;
    moduloNombre: string;
    cuentaCliente: string;
  },
): Promise<void> {
  const otras = await tx.prevalidadorCuenta.findMany({
    where: { moduloId: input.moduloId, activa: true, NOT: { id: input.catalogoId } },
    select: { id: true, cuentaRussell: true },
  });
  if (otras.length === 0) return;
  const ids = otras.map((fila) => fila.id);
  const overrides = await tx.prevalidadorCuentaBalance.findMany({
    where: { balanceId: input.balanceId, catalogoId: { in: ids } },
    select: { catalogoId: true, cuentaCliente: true },
  });
  const overridePorFila = new Map(overrides.map((fila) => [fila.catalogoId, normalizarPrefijo(fila.cuentaCliente)]));
  const conflicto = otras.find((fila) => {
    const cuenta = overridePorFila.get(fila.id) ?? normalizarPrefijo(fila.cuentaRussell);
    return solapanPrefijos(input.cuentaCliente, cuenta);
  });
  if (!conflicto) return;
  const cuentaConflicto = overridePorFila.get(conflicto.id) ?? normalizarPrefijo(conflicto.cuentaRussell);
  throw new ErrorDominioPrevalidador(
    `La cuenta ${input.cuentaCliente} se solapa con ${cuentaConflicto} dentro de ${input.moduloNombre}; el total del módulo quedaría duplicado.`,
  );
}

/** Valida una mutación del catálogo contra defaults y overrides ya persistidos. */
async function asegurarCatalogoSinSolapesCliente(
  tx: TransactionClient,
  input: {
    catalogoId: number | null;
    moduloId: number;
    moduloNombre: string;
    cuentaRussell: string;
    activa: boolean;
  },
): Promise<void> {
  const otras = await tx.prevalidadorCuenta.findMany({
    where: {
      moduloId: input.moduloId,
      ...(input.catalogoId ? { NOT: { id: input.catalogoId } } : {}),
    },
    select: { id: true, cuentaRussell: true, activa: true },
  });
  const solapadaRussell = otras.find((fila) => solapanPrefijos(normalizarPrefijo(fila.cuentaRussell), input.cuentaRussell));
  if (solapadaRussell) {
    throw new ErrorDominioPrevalidador(
      `La cuenta ${input.cuentaRussell} se solapa con ${solapadaRussell.cuentaRussell} dentro de ${input.moduloNombre}.`,
    );
  }
  if (!input.activa) return;

  const otrasActivas = otras.filter((fila) => fila.activa);
  const ids = [
    ...otrasActivas.map((fila) => fila.id),
    ...(input.catalogoId ? [input.catalogoId] : []),
  ];
  if (ids.length === 0) return;
  const overrides = await tx.prevalidadorCuentaBalance.findMany({
    where: { catalogoId: { in: ids } },
    select: { balanceId: true, catalogoId: true, cuentaCliente: true },
  });
  const balances = new Set(overrides.map((fila) => fila.balanceId));
  for (const balanceId of balances) {
    const porFila = new Map(
      overrides
        .filter((fila) => fila.balanceId === balanceId)
        .map((fila) => [fila.catalogoId, normalizarPrefijo(fila.cuentaCliente)]),
    );
    const cuentaObjetivo = input.catalogoId
      ? porFila.get(input.catalogoId) ?? input.cuentaRussell
      : input.cuentaRussell;
    const conflicto = otrasActivas.find((fila) => {
      const cuenta = porFila.get(fila.id) ?? normalizarPrefijo(fila.cuentaRussell);
      return solapanPrefijos(cuentaObjetivo, cuenta);
    });
    if (!conflicto) continue;
    const cuentaConflicto = porFila.get(conflicto.id) ?? normalizarPrefijo(conflicto.cuentaRussell);
    throw new ErrorDominioPrevalidador(
      `El cambio dejaría las cuentas cliente ${cuentaObjetivo} y ${cuentaConflicto} solapadas dentro de ${input.moduloNombre} en el balance ${balanceId}.`,
    );
  }
}

function contextoAuditoria(balance: BalanceBloqueado, actor: string, fecha: Date): string {
  return `balance ${balance.id} · ${balance.periodo} · versión ${balance.version} · actor ${actor} · fecha ${fecha.toISOString()}`;
}

/**
 * Guarda la cuenta comparable únicamente para ESTE balance. La cuenta debe ser de
 * nivel 2/4, tener la misma longitud que la regla y existir realmente como prefijo
 * de `cuenta_8`. Un balance congelado falla tanto aquí como en el trigger SQL.
 */
export async function guardarCuentaClientePrevalidador(formData: FormData): Promise<ActionState> {
  const authz = await authorizePermiso(PERMISO_CUENTA_BALANCE);
  if (!authz.ok) return { ok: false, message: authz.message };

  const parsed = CuentaClientePrevalidadorSchema.safeParse({
    balanceId: formData.get("balanceId"),
    catalogoId: formData.get("catalogoId"),
    cuentaCliente: formData.get("cuentaCliente"),
  });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  const { balanceId, catalogoId, cuentaCliente } = parsed.data;

  const autorizado = await autorizarBalance(balanceId, PERMISO_CUENTA_BALANCE);
  if (!autorizado.ok) return { ok: false, message: autorizado.message };
  const user = await getCurrentUser();
  const actor = user?.name ?? "Sistema";
  const fecha = new Date();

  try {
    const resultado = await transaccionSerializable(async (tx) => {
      await tomarCandadoTransaccion(tx, "prevalidador-catalogo");
      const balance = await cargarBalanceConCandado(tx, balanceId);
      if (balance.estaCongelado) {
        throw new ErrorDominioPrevalidador("El balance está congelado: no se puede cambiar su prevalidador.");
      }

      const fila = await tx.prevalidadorCuenta.findUnique({
        where: { id: catalogoId },
        select: { cuentaRussell: true, moduloId: true, activa: true, module: { select: { name: true } } },
      });
      if (!fila || !fila.activa) throw new ErrorDominioPrevalidador("Esa cuenta ya no está en el prevalidador.");
      const cuentaRussell = normalizarPrefijo(fila.cuentaRussell);
      if (cuentaCliente.length !== cuentaRussell.length) {
        throw new ErrorDominioPrevalidador(
          `La cuenta del cliente debe tener ${cuentaRussell.length} dígitos, igual que la cuenta ${cuentaRussell} de Russell.`,
        );
      }

      const existe = await tx.balancePruebaDetalle.count({
        where: { encabezadoId: balanceId, cuenta8: { startsWith: cuentaCliente } },
      });
      if (existe === 0) {
        throw new ErrorDominioPrevalidador(`La cuenta ${cuentaCliente} no existe en este balance.`);
      }

      await asegurarCuentaClienteSinSolape(tx, {
        balanceId,
        catalogoId,
        moduloId: fila.moduloId,
        moduloNombre: fila.module.name,
        cuentaCliente,
      });

      const previa = await tx.prevalidadorCuentaBalance.findUnique({
        where: { balanceId_catalogoId: { balanceId, catalogoId } },
        select: { cuentaCliente: true },
      });
      const anterior = previa?.cuentaCliente ?? cuentaRussell;
      const restablece = cuentaCliente === cuentaRussell;
      if (anterior === cuentaCliente) {
        return { balance, fila, cuentaRussell, anterior, nuevo: cuentaCliente, restablece, cambio: false };
      }

      if (restablece) {
        await tx.prevalidadorCuentaBalance.deleteMany({ where: { balanceId, catalogoId } });
      } else {
        await tx.prevalidadorCuentaBalance.upsert({
          where: { balanceId_catalogoId: { balanceId, catalogoId } },
          create: { balanceId, catalogoId, cuentaCliente, actualizadoPor: actor },
          update: { cuentaCliente, actualizadoPor: actor },
        });
      }
      return { balance, fila, cuentaRussell, anterior, nuevo: cuentaCliente, restablece, cambio: true };
    });

    if (resultado.cambio) {
      await logAudit({
        user: actor,
        action: resultado.restablece ? "RESTABLECIÓ CUENTA DEL PREVALIDADOR" : "AJUSTÓ CUENTA DEL PREVALIDADOR",
        entity: `${resultado.balance.nombreCliente} · ${resultado.fila.module.name} · ${resultado.cuentaRussell}`,
        detail: `${contextoAuditoria(resultado.balance, actor, fecha)} · anterior ${resultado.anterior} · nuevo ${resultado.nuevo}`,
        clientId: resultado.balance.clienteId,
      });
    }
    revalidatePath(`/balance/${balanceId}`);
    revalidatePath(PATH_BALANCE, "layout");
    return {
      ok: true,
      message: resultado.restablece
        ? `Se restableció la comparación contra la cuenta ${resultado.cuentaRussell}.`
        : `La cuenta ${resultado.cuentaRussell} se comparará contra la ${cuentaCliente} en este balance.`,
    };
  } catch (e) {
    if (e instanceof ErrorDominioPrevalidador) return { ok: false, message: e.message };
    return { ok: false, message: mensajeErrorBD("guardarCuentaClientePrevalidador", e) };
  }
}

/** Quita el override de ESTE balance y vuelve al código de Russell. */
export async function restablecerCuentaClientePrevalidador(formData: FormData): Promise<ActionState> {
  const authz = await authorizePermiso(PERMISO_CUENTA_BALANCE);
  if (!authz.ok) return { ok: false, message: authz.message };
  const balanceId = Number(formData.get("balanceId"));
  const catalogoId = Number(formData.get("catalogoId"));
  if (!Number.isInteger(balanceId) || balanceId <= 0) return { ok: false, message: "Balance inválido." };
  if (!Number.isInteger(catalogoId) || catalogoId <= 0) return { ok: false, message: "Fila inválida." };

  const autorizado = await autorizarBalance(balanceId, PERMISO_CUENTA_BALANCE);
  if (!autorizado.ok) return { ok: false, message: autorizado.message };
  const user = await getCurrentUser();
  const actor = user?.name ?? "Sistema";
  const fecha = new Date();

  try {
    const resultado = await transaccionSerializable(async (tx) => {
      await tomarCandadoTransaccion(tx, "prevalidador-catalogo");
      const balance = await cargarBalanceConCandado(tx, balanceId);
      if (balance.estaCongelado) {
        throw new ErrorDominioPrevalidador("El balance está congelado: no se puede cambiar su prevalidador.");
      }
      const fila = await tx.prevalidadorCuenta.findUnique({
        where: { id: catalogoId },
        select: { cuentaRussell: true, moduloId: true, activa: true, module: { select: { name: true } } },
      });
      if (!fila) throw new ErrorDominioPrevalidador("Esa fila del prevalidador ya no existe.");
      const previa = await tx.prevalidadorCuentaBalance.findUnique({
        where: { balanceId_catalogoId: { balanceId, catalogoId } },
        select: { cuentaCliente: true },
      });
      if (!previa) return { balance, fila, anterior: fila.cuentaRussell, cambio: false };
      if (fila.activa) {
        await asegurarCuentaClienteSinSolape(tx, {
          balanceId,
          catalogoId,
          moduloId: fila.moduloId,
          moduloNombre: fila.module.name,
          cuentaCliente: normalizarPrefijo(fila.cuentaRussell),
        });
      }
      await tx.prevalidadorCuentaBalance.delete({
        where: { balanceId_catalogoId: { balanceId, catalogoId } },
      });
      return { balance, fila, anterior: previa.cuentaCliente, cambio: true };
    });

    if (resultado.cambio) {
      await logAudit({
        user: actor,
        action: "RESTABLECIÓ CUENTA DEL PREVALIDADOR",
        entity: `${resultado.balance.nombreCliente} · ${resultado.fila.module.name} · ${resultado.fila.cuentaRussell}`,
        detail: `${contextoAuditoria(resultado.balance, actor, fecha)} · anterior ${resultado.anterior} · nuevo ${resultado.fila.cuentaRussell}`,
        clientId: resultado.balance.clienteId,
      });
    }
    revalidatePath(`/balance/${balanceId}`);
    revalidatePath(PATH_BALANCE, "layout");
    return { ok: true, message: resultado.cambio ? "Se restableció la cuenta de Russell." : "Esa fila ya usaba la cuenta de Russell." };
  } catch (e) {
    if (e instanceof ErrorDominioPrevalidador) return { ok: false, message: e.message };
    return { ok: false, message: mensajeErrorBD("restablecerCuentaClientePrevalidador", e) };
  }
}

/** Alta o edición del catálogo global aprobado. */
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
    const user = await getCurrentUser();
    const resultado = await transaccionSerializable(async (tx) => {
      await tomarCandadoTransaccion(tx, "prevalidador-catalogo");
      const [modulo, previa] = await Promise.all([
        tx.module.findUnique({ where: { id: moduloId }, select: { code: true, name: true } }),
        id
          ? tx.prevalidadorCuenta.findUnique({
              where: { id },
              select: { id: true, moduloId: true, cuentaRussell: true, _count: { select: { overrides: true } } },
            })
          : Promise.resolve(null),
      ]);
      if (!modulo) throw new ErrorDominioPrevalidador("El módulo seleccionado no existe.");
      if (!MODULOS_PREVALIDADOR_APROBADOS.has(modulo.code)) {
        throw new ErrorDominioPrevalidador(
          "El prevalidador solo admite Ingresos, Cartera, Inventarios, Activos fijos, Cuentas por pagar y Nómina.",
        );
      }
      if (id && !previa) throw new ErrorDominioPrevalidador("Esa fila del prevalidador ya no existe.");
      if (
        previa &&
        previa._count.overrides > 0 &&
        (previa.moduloId !== moduloId || normalizarPrefijo(previa.cuentaRussell) !== cuentaRussell)
      ) {
        throw new ErrorDominioPrevalidador(
          "No se puede cambiar el módulo o prefijo mientras existan balances con una cuenta propia asociada.",
        );
      }

      await asegurarCatalogoSinSolapesCliente(tx, {
        catalogoId: id,
        moduloId,
        moduloNombre: modulo.name,
        cuentaRussell,
        activa,
      });

      const datos = { moduloId, cuentaRussell, etiqueta, baseCalculo, orden, activa, actualizadoPor: user?.name ?? null };
      if (id) await tx.prevalidadorCuenta.update({ where: { id }, data: datos });
      else await tx.prevalidadorCuenta.create({ data: datos });
      return { modulo };
    });

    await logAudit({
      user: user?.name ?? "Sistema",
      action: id ? "EDITÓ CUENTA DEL PREVALIDADOR" : "CREÓ CUENTA DEL PREVALIDADOR",
      entity: `${resultado.modulo.name} · ${cuentaRussell}`,
      detail: `${baseCalculo === "movimiento" ? "Movimiento del período" : "Saldo final"}${activa ? "" : " · inactiva"}`,
    });
    updateTag(PREVALIDADOR_CACHE_TAG);
    revalidatePath(PATH_CONFIG);
    revalidatePath(PATH_BALANCE, "layout");
    return { ok: true, message: id ? "Cuenta actualizada." : "Cuenta agregada al prevalidador." };
  } catch (e) {
    if (e instanceof ErrorDominioPrevalidador) return { ok: false, message: e.message };
    return { ok: false, message: mensajeErrorBD("guardarFilaPrevalidador", e) };
  }
}

/** Elimina una fila y sus overrides por balance mediante la FK en cascada. */
export async function eliminarFilaPrevalidador(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const authz = await authorizePermiso(PERMISO_CATALOGO);
  if (!authz.ok) return { ok: false, message: authz.message };
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id) || id <= 0) return { ok: false, message: "Fila inválida." };

  try {
    const resultado = await transaccionSerializable(async (tx) => {
      await tomarCandadoTransaccion(tx, "prevalidador-catalogo");
      const fila = await tx.prevalidadorCuenta.findUnique({
        where: { id },
        select: { cuentaRussell: true, module: { select: { name: true } }, _count: { select: { overrides: true } } },
      });
      if (!fila) throw new ErrorDominioPrevalidador("Esa fila del prevalidador ya no existe.");
      await tx.prevalidadorCuenta.delete({ where: { id } });
      return { fila, arrastradas: fila._count.overrides };
    });
    const user = await getCurrentUser();
    const { fila, arrastradas } = resultado;
    await logAudit({
      user: user?.name ?? "Sistema",
      action: "ELIMINÓ CUENTA DEL PREVALIDADOR",
      entity: `${fila.module.name} · ${fila.cuentaRussell}`,
      detail: arrastradas > 0 ? `Arrastró ${arrastradas} override(s) de balance` : "Sin overrides de balance asociados",
    });
    updateTag(PREVALIDADOR_CACHE_TAG);
    revalidatePath(PATH_CONFIG);
    revalidatePath(PATH_BALANCE, "layout");
    return {
      ok: true,
      message: arrastradas > 0 ? `Cuenta eliminada junto con ${arrastradas} override(s) de balance.` : "Cuenta eliminada del prevalidador.",
    };
  } catch (e) {
    if (e instanceof ErrorDominioPrevalidador) return { ok: false, message: e.message };
    return { ok: false, message: mensajeErrorBD("eliminarFilaPrevalidador", e) };
  }
}

async function registrarRevisionPrevalidador(
  estado: "aprobada" | "revocada",
  formData: FormData,
): Promise<ActionState> {
  const authz = await authorizePermiso(PERMISO_REVISION);
  if (!authz.ok) return { ok: false, message: authz.message };
  const parsed = RevisionPrevalidadorSchema.safeParse({
    balanceId: formData.get("balanceId"),
    justificacion: formData.get("justificacion"),
  });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  const { balanceId, justificacion } = parsed.data;
  const autorizado = await autorizarBalance(balanceId, PERMISO_REVISION);
  if (!autorizado.ok) return { ok: false, message: autorizado.message };
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: "Sesión no válida." };
  const fecha = new Date();

  try {
    const resultado = await transaccionSerializable(async (tx) => {
      await tomarCandadoTransaccion(tx, "prevalidador-catalogo");
      const balance = await cargarBalanceConCandado(tx, balanceId);
      const contexto = await cargarContextoPrevalidadorBalance(balanceId, tx);

      if (estado === "aprobada") {
        if (contexto.prevalidador.estado === "sin_catalogo") {
          throw new ErrorDominioPrevalidador("No hay cuentas activas configuradas para aprobar el prevalidador.");
        }
        if (contexto.prevalidador.estado === "bloqueado") {
          throw new ErrorDominioPrevalidador(
            `Quedan ${contexto.prevalidador.sinHomologar.cuentas} cuenta(s) sin homologar.`,
          );
        }
        if (contexto.prevalidador.estado === "no_disponible") {
          throw new ErrorDominioPrevalidador(contexto.prevalidador.mensaje);
        }
        if (contexto.prevalidador.estado !== "listo") {
          throw new ErrorDominioPrevalidador("El prevalidador no está listo para aprobación.");
        }
        if (contexto.revision.vigente) {
          return { balance, huella: contexto.huella, creada: false };
        }
      } else if (contexto.revision.estado === "pendiente" || contexto.revision.estado === "revocada") {
        return { balance, huella: contexto.huella, creada: false };
      }

      await tx.prevalidadorRevisionBalance.create({
        data: {
          balanceId,
          estado,
          justificacion,
          huella: contexto.huella,
          instantanea: contexto.prevalidador as Prisma.InputJsonValue,
          actor: user.name,
          actorId: user.id,
        },
      });
      return { balance, huella: contexto.huella, creada: true };
    });

    if (resultado.creada) {
      await logAudit({
        user: user.name,
        action: estado === "aprobada" ? "APROBÓ PREVALIDADOR" : "REVOCÓ APROBACIÓN DEL PREVALIDADOR",
        entity: `${resultado.balance.nombreCliente} · ${resultado.balance.periodo} · ${resultado.balance.version}`,
        detail: `${contextoAuditoria(resultado.balance, user.name, fecha)} · huella ${resultado.huella} · justificación ${justificacion}`,
        clientId: resultado.balance.clienteId,
      });
    }
    revalidatePath(`/balance/${balanceId}`);
    return {
      ok: true,
      message: resultado.creada
        ? estado === "aprobada" ? "Prevalidador aprobado." : "Aprobación del prevalidador revocada."
        : estado === "aprobada" ? "El prevalidador ya estaba aprobado y vigente." : "El prevalidador no tenía una aprobación vigente.",
    };
  } catch (e) {
    if (e instanceof ErrorDominioPrevalidador) return { ok: false, message: e.message };
    return { ok: false, message: mensajeErrorBD("registrarRevisionPrevalidador", e) };
  }
}

/** Registra una aprobación append-only con la huella exacta del estado leído. */
export async function aprobarPrevalidadorBalance(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return registrarRevisionPrevalidador("aprobada", formData);
}

/** Revoca la última aprobación vigente sin borrar su historial. */
export async function revocarAprobacionPrevalidadorBalance(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return registrarRevisionPrevalidador("revocada", formData);
}
