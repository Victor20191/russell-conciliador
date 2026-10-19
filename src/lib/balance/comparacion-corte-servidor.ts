import "server-only";
// Comparación de balances por fecha de corte (18/Oct/2026): recálculo desde las mutaciones y
// lectura para las pantallas. Las pantallas (RSC) NUNCA escriben: un corte «sin comparar» solo se
// resuelve con una mutación (cargar, eliminar, cerrar o «Revisar comparación»).
import prisma from "@/lib/prisma";
import { transaccionSerializable, type TransactionClient } from "@/lib/concurrency";
import { registrarError } from "@/lib/errores";
import { logAudit } from "@/lib/audit";
import { createProcessNotification } from "@/lib/notifications";
import { fmtDateTime } from "@/lib/format";
import { estadoBalance, type EstadoBalance } from "./estado-balance";
import { getUmbralesAlertas } from "@/lib/parametros/umbrales";
import { diferenciasDesde, resumenDiferenciasCorte, SnapshotComparacionCorteSchema, type DiferenciaCorte } from "./comparacion-corte";
import { estadoDelCorte, etiquetaCorte, fechaCorteISO, lineasDelCorte, nombreLinea, type EstadoCorte } from "./corte";
import { recalcularComparacionesDelCorteEn, resumenDeComparacion, SELECT_ENCABEZADO_CORTE, type ResultadoRecalculoCorte } from "./comparacion-corte-datos";

/** Umbral «Diferencia entre balances del mismo corte» vigente (/config/parametros). */
export async function umbralCorteSaldoFinal(): Promise<number> {
  return (await getUmbralesAlertas()).corte_saldo_final;
}

/** Recalcula las comparaciones del corte, dentro de `tx` si se da o en una transacción propia. */
export async function recalcularComparacionesDelCorte(
  clienteId: number,
  periodoFin: Date,
  opciones: { tx?: TransactionClient; umbral?: number } = {},
): Promise<ResultadoRecalculoCorte> {
  const umbral = opciones.umbral ?? (await umbralCorteSaldoFinal());
  if (opciones.tx) return recalcularComparacionesDelCorteEn(opciones.tx, clienteId, periodoFin, umbral);
  return transaccionSerializable((tx) => recalcularComparacionesDelCorteEn(tx, clienteId, periodoFin, umbral), { timeoutMs: 60_000 });
}

/** Deja en la bitácora y en las notificaciones cada par que pasó a tener diferencias. */
export async function auditarInconsistenciasCorte(
  clienteId: number,
  periodoFin: Date,
  nuevas: ResultadoRecalculoCorte["nuevasInconsistencias"],
  actor = "Sistema",
): Promise<void> {
  const corte = fechaCorteISO(periodoFin);
  for (const par of nuevas) {
    const nombre = (b: typeof par.a) => `${nombreLinea(b)} ${b.version} (#${b.id})`;
    await logAudit({
      user: actor,
      action: "DETECTÓ DIFERENCIAS ENTRE BALANCES DEL CORTE",
      entity: `Balances #${par.a.id} / #${par.b.id}`,
      detail: `${nombre(par.a)} y ${nombre(par.b)} · corte ${corte} · ${par.cuentas} cuenta(s) con saldo final distinto desde el umbral del corte. Se resuelve eliminando uno de los dos.`,
      clientId: clienteId,
    });
    await createProcessNotification({
      actor,
      text: "detectó diferencias de saldo final entre balances del mismo corte",
      target: `${nombre(par.a)} y ${nombre(par.b)} · ${par.cuentas} cuenta(s). Revisar en /balance/${par.a.id}#corte`,
    });
  }
}

/** Un fallo de este control NO revierte la mutación que lo disparó; la pantalla permite reintentar. */
export async function recalcularComparacionesDelCorteSeguro(clienteId: number, periodoFin: Date, actor = "Sistema"): Promise<boolean> {
  try {
    const resultado = await recalcularComparacionesDelCorte(clienteId, periodoFin);
    await auditarInconsistenciasCorte(clienteId, periodoFin, resultado.nuevasInconsistencias, actor);
    return true;
  } catch (error) {
    registrarError("recalcularComparacionesDelCorte", error);
    return false;
  }
}

export type EnFirmeVm = { moduloCodigo: string; periodo: string; cerradoPor: string };

export type ComparacionCorteVm = {
  /** Alguna cuenta difiere desde el umbral `corte_saldo_final`: impide cerrar. */
  inconsistente: boolean;
  /** Cuentas que difieren desde el umbral. */
  materiales: number;
  /** Cuentas que difieren por debajo del umbral: se muestran, no impiden cerrar. */
  menores: number;
  cuentasComparadas: number;
  actualizadoEn: string;
  /** Todas las diferencias a centavos, vistas desde ESTE balance: saldoA = este, saldoB = el otro. */
  diferencias: DiferenciaCorte[];
};

export type BalanceCorteVm = {
  id: number;
  periodo: string;
  version: string;
  apertura: string | null;
  nombre: string;
  estado: EstadoBalance;
  estaCongelado: boolean;
  /** Versiones de su línea (texto de período + apertura). */
  versiones: number;
  ultimaCarga: string;
  enFirme: EnFirmeVm[];
  /** Comparación contra este balance; null = sin comparar (o este no es vigente). */
  comparacion: ComparacionCorteVm | null;
};

export type VistaCorte = {
  disponible: boolean;
  motivo: string | null;
  fechaCorte: string;
  etiqueta: string;
  /** Umbral `corte_saldo_final` con que se juzgan las diferencias. */
  tolerancia: number;
  estado: EstadoCorte;
  /** ¿Este balance es la versión vigente de su línea? Solo los vigentes entran a la comparación. */
  esVigente: boolean;
  vigenteDeMiLinea: { id: number; version: string } | null;
  /** Los demás balances vigentes del corte. */
  otros: BalanceCorteVm[];
  /** Cierres en firme contra este balance. */
  enFirme: EnFirmeVm[];
  /** Versiones anteriores de la línea de este balance que todavía tienen una conciliación en firme. */
  anterioresEnFirme: (Omit<BalanceCorteVm, "comparacion">)[];
  /** Versiones anteriores de la línea de este balance que siguen cerradas (datos anteriores al 18/Oct/2026). */
  anterioresCerradas: { id: number; version: string }[];
};

const vistaNoDisponible = (periodoFin: Date, tolerancia: number): VistaCorte => ({
  disponible: false,
  motivo: "No fue posible consultar los balances del mismo corte. No se puede asegurar que sus saldos finales coincidan.",
  fechaCorte: fechaCorteISO(periodoFin),
  etiqueta: etiquetaCorte(periodoFin),
  tolerancia,
  estado: "sin_comparar",
  esVigente: false,
  vigenteDeMiLinea: null,
  otros: [],
  enFirme: [],
  anterioresEnFirme: [],
  anterioresCerradas: [],
});

/** Requiere que el llamador haya verificado `balance:ver` + alcance del cliente. Fail-closed. */
export async function cargarVistaCorte(balance: { id: number; clienteId: number; periodoFin: Date }): Promise<VistaCorte> {
  const { clienteId, periodoFin } = balance;
  const tolerancia = await umbralCorteSaldoFinal();
  try {
    const encabezados = await prisma.balancePruebaEncabezado.findMany({
      where: { clienteId, periodoFin },
      select: { ...SELECT_ENCABEZADO_CORTE, estado: true, ultimaCarga: true },
    });
    const [pares, cierres] = await Promise.all([
      prisma.balanceComparacionCorte.findMany({
        where: { clienteId, periodoFin },
        select: { balanceAId: true, balanceBId: true, inconsistente: true, cuentasComparadas: true, resultado: true, actualizadoEn: true },
      }),
      prisma.conciliacionModuloCierre.findMany({
        where: { clienteId, estado: "firme", balanceEncabezadoId: { in: encabezados.map((e) => e.id) } },
        select: { balanceEncabezadoId: true, moduloCodigo: true, periodo: true, cerradoPor: true },
      }),
    ]);
    const enFirmeDe = (id: number): EnFirmeVm[] => cierres
      .filter((c) => c.balanceEncabezadoId === id)
      .map((c) => ({ moduloCodigo: c.moduloCodigo, periodo: c.periodo, cerradoPor: c.cerradoPor }));

    const lineas = lineasDelCorte(encabezados);
    const vigentes = lineas.map((l) => l.vigente);
    const miLinea = lineas.find((l) => l.versiones.some((v) => v.id === balance.id)) ?? null;
    const esVigente = miLinea?.vigente.id === balance.id;

    const comparacionCon = (otroId: number): ComparacionCorteVm | null => {
      if (!esVigente) return null;
      const par = pares.find((p) => (p.balanceAId === balance.id && p.balanceBId === otroId) || (p.balanceBId === balance.id && p.balanceAId === otroId));
      if (!par) return null;
      const snapshot = SnapshotComparacionCorteSchema.parse(par.resultado);
      const resumen = resumenDiferenciasCorte(snapshot.diferencias, tolerancia);
      return {
        inconsistente: resumen.inconsistente,
        materiales: resumen.materiales,
        menores: resumen.menores,
        cuentasComparadas: par.cuentasComparadas,
        actualizadoEn: par.actualizadoEn.toISOString(),
        diferencias: diferenciasDesde(snapshot.diferencias, par.balanceAId === balance.id),
      };
    };
    const lineaDe = new Map(lineas.flatMap((l) => l.versiones.map((v) => [v.id, l] as const)));
    const vm = (e: (typeof encabezados)[number]): Omit<BalanceCorteVm, "comparacion"> => ({
      id: e.id,
      periodo: e.periodo,
      version: e.version,
      apertura: lineaDe.get(e.id)?.apertura ?? null,
      nombre: nombreLinea({ periodo: e.periodo, apertura: lineaDe.get(e.id)?.apertura ?? null }),
      estado: estadoBalance(e),
      estaCongelado: e.estaCongelado,
      versiones: lineaDe.get(e.id)?.versiones.length ?? 1,
      ultimaCarga: e.ultimaCarga ? fmtDateTime(e.ultimaCarga) : "—",
      enFirme: enFirmeDe(e.id),
    });

    return {
      disponible: true,
      motivo: null,
      fechaCorte: fechaCorteISO(periodoFin),
      etiqueta: etiquetaCorte(periodoFin),
      tolerancia,
      estado: estadoDelCorte(vigentes, pares.map((p) => ({ ...p, inconsistente: resumenDeComparacion(p, tolerancia).inconsistente }))),
      esVigente,
      vigenteDeMiLinea: miLinea ? { id: miLinea.vigente.id, version: miLinea.vigente.version } : null,
      otros: vigentes.filter((v) => v.id !== balance.id).map((v) => ({ ...vm(v), comparacion: comparacionCon(v.id) })),
      enFirme: enFirmeDe(balance.id),
      anterioresEnFirme: (miLinea?.versiones ?? [])
        .filter((v) => v.id !== balance.id && v.id !== miLinea?.vigente.id && enFirmeDe(v.id).length > 0)
        .map(vm),
      anterioresCerradas: (miLinea?.versiones ?? [])
        .filter((v) => v.id !== miLinea?.vigente.id && v.estaCongelado)
        .map((v) => ({ id: v.id, version: v.version })),
    };
  } catch (error) {
    registrarError("cargarVistaCorte", error);
    return vistaNoDisponible(periodoFin, tolerancia);
  }
}

/**
 * Pares guardados de los clientes del listado, con `inconsistente` juzgado con el umbral vigente;
 * null si la consulta falló (nunca un falso OK).
 */
export async function cargarComparacionesDeClientes(whereCliente: { clienteId?: { in: number[] } }) {
  try {
    const [tolerancia, pares] = await Promise.all([
      umbralCorteSaldoFinal(),
      prisma.balanceComparacionCorte.findMany({
        where: whereCliente,
        select: { balanceAId: true, balanceBId: true, inconsistente: true, resultado: true },
      }),
    ]);
    return pares.map((p) => ({ balanceAId: p.balanceAId, balanceBId: p.balanceBId, inconsistente: resumenDeComparacion(p, tolerancia).inconsistente }));
  } catch (error) {
    registrarError("cargarComparacionesDeClientes", error);
    return null;
  }
}
