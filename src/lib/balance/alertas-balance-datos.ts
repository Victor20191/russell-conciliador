// Alertas del balance cargado y su estado «En proceso / En proceso con alertas», leídos de la BD
// (20/Oct/2026).
//
// SIN `server-only`: lo comparte el script `scripts/recalcular-estado-balances.ts`, que corre fuera de
// Next. Recibe Prisma (o la transacción), el plan estándar y los umbrales como parámetros (los
// cargadores cacheados de la app no sirven fuera de Next).
//
// El estado de una versión abierta lo deciden las alertas PENDIENTES (`alertas-naturaleza.ts`): saldos
// contrarios a la naturaleza sin «Dar OK» y cuentas sin mapeo. Antes se fijaba al cargar con cualquier
// validación en alerta —variaciones > 25% incluidas— y no cambiaba nunca, así que todos los abiertos
// decían «con alertas». La columna `estado` se recalcula tras cada cambio que mueve esos números; el
// detalle del balance lo calcula al leer.
import type { PrismaClient } from "@/generated/prisma/client";
import { reconstruirBalance, type CuentaEstandar } from "./calcular";
import { resumenAlertasBalance, validadosNaturaleza, type ResumenAlertasBalance } from "./alertas-naturaleza";
import { ESTADO_EN_PROCESO, ESTADO_EN_PROCESO_CON_ALERTAS } from "./estado-balance";
import type { UmbralesAlertas } from "./umbrales-alertas";

export type DbAlertas = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">;

/** Lo que la regla necesita además de la BD: el plan estándar (naturalezas) y los umbrales vigentes. */
export type ContextoAlertas = { cuentasEstandar: CuentaEstandar[]; umbrales: UmbralesAlertas };

/** Balances por lectura: acota la memoria al recalcular todos los abiertos. */
const LOTE = 40;

/** Resumen de alertas de cada balance pedido (con sus OK). Un balance sin detalle queda sin alertas. */
export async function resumenAlertasDeBalances(
  db: DbAlertas,
  ids: readonly number[],
  ctx: ContextoAlertas,
): Promise<Map<number, ResumenAlertasBalance>> {
  const out = new Map<number, ResumenAlertasBalance>();
  for (let i = 0; i < ids.length; i += LOTE) {
    const lote = ids.slice(i, i + LOTE);
    const [filas, validaciones] = await Promise.all([
      db.balancePruebaDetalle.findMany({
        where: { encabezadoId: { in: lote } },
        select: { encabezadoId: true, cuenta8: true, nombreCuenta: true, cuenta6Russell: true, saldoInicial: true, debitos: true, creditos: true, saldoFinal: true },
      }),
      db.validacionAlerta.findMany({ where: { balanceId: { in: lote } }, select: { balanceId: true, anchor: true, tipoAlerta: true } }),
    ]);
    for (const id of lote) {
      const cuentas = reconstruirBalance(
        filas.filter((f) => f.encabezadoId === id).map((f) => ({
          cuenta8: f.cuenta8, nombreCuenta: f.nombreCuenta, cuenta6Russell: f.cuenta6Russell,
          saldoInicial: Number(f.saldoInicial), debitos: Number(f.debitos), creditos: Number(f.creditos), saldoFinal: Number(f.saldoFinal),
        })),
        ctx.cuentasEstandar,
        ctx.umbrales,
      ).breakdown.flatMap((g) => g.items);
      const validados = validadosNaturaleza(validaciones.filter((v) => v.balanceId === id));
      out.set(id, resumenAlertasBalance(cuentas, validados, ctx.umbrales));
    }
  }
  return out;
}

export async function resumenAlertasDeBalance(db: DbAlertas, id: number, ctx: ContextoAlertas): Promise<ResumenAlertasBalance> {
  const resumen = (await resumenAlertasDeBalances(db, [id], ctx)).get(id);
  return resumen ?? resumenAlertasBalance([], new Set(), ctx.umbrales);
}

export type ResultadoEstados = { conAlertas: number[]; enProceso: number[] };

/**
 * Recalcula y guarda el estado de los balances ABIERTOS de la lista (los cerrados no se tocan). Con
 * `aplicar: false` solo calcula (simulación del script).
 */
export async function recalcularEstadoBalances(
  db: DbAlertas,
  ids: readonly number[],
  ctx: ContextoAlertas,
  opciones: { aplicar?: boolean } = {},
): Promise<ResultadoEstados> {
  const abiertos = (await db.balancePruebaEncabezado.findMany({
    where: { id: { in: [...ids] }, estaCongelado: false },
    select: { id: true },
    orderBy: { id: "asc" },
  })).map((b) => b.id);
  const resumenes = await resumenAlertasDeBalances(db, abiertos, ctx);
  const conAlertas = abiertos.filter((id) => (resumenes.get(id)?.pendientes ?? 0) > 0);
  const enProceso = abiertos.filter((id) => (resumenes.get(id)?.pendientes ?? 0) === 0);
  if (opciones.aplicar !== false) {
    // `estaCongelado: false` también en la escritura: un cierre concurrente no se pisa.
    if (conAlertas.length > 0) {
      await db.balancePruebaEncabezado.updateMany({ where: { id: { in: conAlertas }, estaCongelado: false }, data: { estado: ESTADO_EN_PROCESO_CON_ALERTAS } });
    }
    if (enProceso.length > 0) {
      await db.balancePruebaEncabezado.updateMany({ where: { id: { in: enProceso }, estaCongelado: false }, data: { estado: ESTADO_EN_PROCESO } });
    }
  }
  return { conAlertas, enProceso };
}

/** Atajo para un balance (tras dar o revertir un OK, homologar, eliminar una cuenta…). */
export async function recalcularEstadoBalance(db: DbAlertas, id: number, ctx: ContextoAlertas): Promise<void> {
  await recalcularEstadoBalances(db, [id], ctx);
}

/** Ids de los balances abiertos (para recalcularlos todos al cambiar un umbral). */
export async function idsBalancesAbiertos(db: DbAlertas, clienteId?: number): Promise<number[]> {
  return (await db.balancePruebaEncabezado.findMany({
    where: { estaCongelado: false, ...(clienteId != null ? { clienteId } : {}) },
    select: { id: true },
  })).map((b) => b.id);
}
