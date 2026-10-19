// Recálculo de las comparaciones de saldos finales de un corte (18/Oct/2026).
//
// SIN `server-only`: lo comparte el script de migración (`scripts/migrar-balances-por-corte.ts`),
// que corre fuera de Next. Recibe el cliente de Prisma (o la transacción) como parámetro y toma el
// candado del corte con la misma implementación que la app (`candados.ts`).
//
// No es pegajoso: cada recálculo deja exactamente un registro por par de VIGENTES del corte, con
// el resultado de hoy. Los pares de balances que dejaron de ser vigentes (llegó una versión nueva
// de su línea) se borran; los de balances eliminados ya cayeron en cascada.
//
// La columna `inconsistente` dice si el par difiere en ALGÚN saldo final a centavos. Si eso lo
// vuelve inconsistente para cerrar lo decide el umbral «Diferencia entre balances del mismo corte»
// (`corte_saldo_final`), que se aplica al leer el resultado (`resumenDeComparacion`).
import type { PrismaClient } from "@/generated/prisma/client";
import { tomarCandadoTransaccion } from "@/lib/candados";
import { ESTADO_CIERRE_FIRME } from "@/lib/conciliacion/cuentas-bloqueo";
import { compararSaldosFinales, resumenDiferenciasCorte, snapshotComparacion, SnapshotComparacionCorteSchema, type FilaSaldoFinal, type ResumenDiferenciasCorte } from "./comparacion-corte";
import { balancesVigentesDelCorte, fechaCorteISO, lineasDelCorte, nombreLinea, paresEsperados } from "./corte";
import type { OtroBalanceCierre } from "./cierre-balance";

export type DbCorte = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">;

export const SELECT_ENCABEZADO_CORTE = {
  id: true, clienteId: true, periodo: true, periodoFin: true, aperturaBalance: true,
  creadoEn: true, estaCongelado: true, version: true,
} as const;

export type BalanceComparado = { id: number; version: string; periodo: string; aperturaBalance: string | null };

/** Resumen de un par guardado con el umbral vigente; un resultado ilegible cuenta como inconsistente. */
export function resumenDeComparacion(par: { inconsistente: boolean; resultado: unknown }, umbral: number): ResumenDiferenciasCorte {
  const snapshot = SnapshotComparacionCorteSchema.safeParse(par.resultado);
  if (!snapshot.success) return { inconsistente: par.inconsistente, materiales: 0, menores: 0 };
  return resumenDiferenciasCorte(snapshot.data.diferencias, umbral);
}

export type ResultadoRecalculoCorte = {
  vigentes: number[];
  pares: number;
  /** Pares que hoy difieren desde el umbral y antes no (para la bitácora y las notificaciones). */
  nuevasInconsistencias: { a: BalanceComparado; b: BalanceComparado; cuentas: number }[];
  retirados: number;
};

export function candadoCorte(clienteId: number, periodoFin: Date | string): string {
  return `balance-corte:${clienteId}:${fechaCorteISO(periodoFin)}`;
}

/** Encabezados del corte (cliente + fecha fin exacta). */
export function encabezadosDelCorte(db: DbCorte, clienteId: number, periodoFin: Date) {
  return db.balancePruebaEncabezado.findMany({ where: { clienteId, periodoFin }, select: SELECT_ENCABEZADO_CORTE });
}

/** Saldos finales del detalle de cada balance, agrupados por encabezado. */
export async function saldosFinalesDe(db: DbCorte, ids: readonly number[]): Promise<Map<number, FilaSaldoFinal[]>> {
  const porBalance = new Map<number, FilaSaldoFinal[]>(ids.map((id) => [id, []]));
  if (ids.length === 0) return porBalance;
  const filas = await db.balancePruebaDetalle.findMany({
    where: { encabezadoId: { in: [...ids] } },
    select: { encabezadoId: true, cuenta8: true, nombreCuenta: true, saldoFinal: true },
  });
  for (const f of filas) porBalance.get(f.encabezadoId)?.push({ cuenta8: f.cuenta8, nombreCuenta: f.nombreCuenta, saldoFinal: Number(f.saldoFinal) });
  return porBalance;
}

/**
 * Recalcula y guarda las comparaciones del corte. Debe correr dentro de una transacción: toma el
 * candado `balance-corte:{cliente}:{AAAA-MM-DD}`, que en el orden global va siempre al final.
 * `umbral` (`corte_saldo_final`) solo decide qué pares se reportan como inconsistencias nuevas.
 */
export async function recalcularComparacionesDelCorteEn(db: DbCorte, clienteId: number, periodoFin: Date, umbral: number): Promise<ResultadoRecalculoCorte> {
  await tomarCandadoTransaccion(db, candadoCorte(clienteId, periodoFin));
  const encabezados = await encabezadosDelCorte(db, clienteId, periodoFin);
  const vigentes = balancesVigentesDelCorte(encabezados);
  const esperados = paresEsperados(vigentes);
  const clave = (p: { balanceAId: number; balanceBId: number }) => `${p.balanceAId}|${p.balanceBId}`;
  const claves = new Set(esperados.map(clave));

  const previos = await db.balanceComparacionCorte.findMany({
    where: { clienteId, periodoFin },
    select: { id: true, balanceAId: true, balanceBId: true, inconsistente: true, resultado: true },
  });
  const sobran = previos.filter((p) => !claves.has(clave(p)));
  if (sobran.length > 0) await db.balanceComparacionCorte.deleteMany({ where: { id: { in: sobran.map((p) => p.id) } } });
  const previoPorClave = new Map(previos.map((p) => [clave(p), p]));

  const saldos = await saldosFinalesDe(db, vigentes.map((v) => v.id));
  const porId = new Map(vigentes.map((v) => [v.id, v]));
  const comparado = (id: number): BalanceComparado => {
    const v = porId.get(id)!;
    return { id: v.id, version: v.version, periodo: v.periodo, aperturaBalance: v.aperturaBalance };
  };
  const nuevasInconsistencias: ResultadoRecalculoCorte["nuevasInconsistencias"] = [];
  for (const par of esperados) {
    const resultado = compararSaldosFinales(saldos.get(par.balanceAId) ?? [], saldos.get(par.balanceBId) ?? []);
    const datos = {
      inconsistente: !resultado.coincide,
      cuentasComparadas: resultado.cuentasComparadas,
      resultado: snapshotComparacion(resultado),
    };
    await db.balanceComparacionCorte.upsert({
      where: { balanceAId_balanceBId: par },
      create: { clienteId, periodoFin, ...par, ...datos },
      update: datos,
    });
    const hoy = resumenDiferenciasCorte(resultado.diferencias, umbral);
    const previo = previoPorClave.get(clave(par));
    if (hoy.inconsistente && !(previo && resumenDeComparacion(previo, umbral).inconsistente)) {
      nuevasInconsistencias.push({ a: comparado(par.balanceAId), b: comparado(par.balanceBId), cuentas: hoy.materiales });
    }
  }
  return { vigentes: vigentes.map((v) => v.id), pares: esperados.length, nuevasInconsistencias, retirados: sobran.length };
}

/** Lo que `evaluarCierreBalance` necesita saber del corte, leído de la BD (o de la transacción). */
export type InsumosCierreBalance = {
  vigenteDeMiLinea: { id: number; version: string } | null;
  anterioresCerradas: { id: number; version: string }[];
  otros: OtroBalanceCierre[];
};

/**
 * Insumos del cierre de un balance a partir de lo GUARDADO: encabezados del corte, comparaciones y
 * cierres en firme. Para que las comparaciones estén al día, el llamador recalcula antes
 * (`recalcularComparacionesDelCorteEn`) en la misma transacción.
 */
export async function insumosCierreBalanceEn(
  db: DbCorte,
  balance: { id: number; clienteId: number; periodoFin: Date },
  /** `corte_saldo_final`: solo una diferencia desde este monto impide cerrar. */
  umbral: number,
): Promise<InsumosCierreBalance> {
  const { clienteId, periodoFin } = balance;
  const encabezados = await encabezadosDelCorte(db, clienteId, periodoFin);
  const [pares, cierres] = await Promise.all([
    db.balanceComparacionCorte.findMany({
      where: { clienteId, periodoFin },
      select: { balanceAId: true, balanceBId: true, inconsistente: true, resultado: true },
    }),
    db.conciliacionModuloCierre.findMany({
      where: { clienteId, estado: ESTADO_CIERRE_FIRME, balanceEncabezadoId: { in: encabezados.map((e) => e.id) } },
      select: { balanceEncabezadoId: true },
    }),
  ]);
  const enFirme = new Set(cierres.map((c) => c.balanceEncabezadoId));
  const lineas = lineasDelCorte(encabezados);
  const miLinea = lineas.find((l) => l.versiones.some((v) => v.id === balance.id)) ?? null;
  const lineaDe = new Map(lineas.flatMap((l) => l.versiones.map((v) => [v.id, l] as const)));
  const vigentes = lineas.map((l) => l.vigente).filter((v) => v.id !== balance.id);
  return {
    vigenteDeMiLinea: miLinea ? { id: miLinea.vigente.id, version: miLinea.vigente.version } : null,
    anterioresCerradas: (miLinea?.versiones ?? [])
      .filter((v) => v.id !== miLinea?.vigente.id && v.estaCongelado)
      .map((v) => ({ id: v.id, version: v.version })),
    otros: vigentes.map((v) => {
      const par = pares.find((p) => (p.balanceAId === balance.id && p.balanceBId === v.id) || (p.balanceBId === balance.id && p.balanceAId === v.id));
      const resumen = par ? resumenDeComparacion(par, umbral) : null;
      return {
        id: v.id,
        version: v.version,
        nombre: nombreLinea({ periodo: v.periodo, apertura: lineaDe.get(v.id)?.apertura ?? null }),
        estaCongelado: v.estaCongelado,
        enFirme: enFirme.has(v.id),
        comparacion: resumen ? { inconsistente: resumen.inconsistente, cuentas: resumen.materiales } : null,
      };
    }),
  };
}
