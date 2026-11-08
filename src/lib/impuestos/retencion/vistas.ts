import { calcularTotal, renglonDe } from "../formularios/definicion";
import { CONCEPTOS_RETENCION_F350, F350 } from "../formularios/f350";
import { NOMBRES_MES } from "../calendario";
import type { PeriodoRevision } from "./periodos-revision";

/**
 * Vistas de una revisión de Retención en la fuente (puro).
 *
 * «Por meses» (Vista 1): cada renglón del 350 por mes, con persona jurídica y natural, y el bloque
 * de pagos del 490. «Acumulado» (Vista 2): la suma de los meses hasta el corte. Los valores salen
 * del 350 VIGENTE de cada mes (la última corrección) y los totales (130, 134, 136, 138) se
 * RECALCULAN con la definición del formulario, nunca se copian de otra celda.
 */

export type MesVista = {
  periodo: number;
  etiqueta: string;
  /** El 350 vigente del mes; null si no hay (falta o mes sin formulario). */
  formulario: { id: number; numero: string; esCorreccion: boolean } | null;
  causal: string | null;
};

export type ValorMes = { pj: number | null; pn: number | null; valor: number | null };

export type FilaVista = {
  clave: string;
  seccion: string;
  etiqueta: string;
  /** `concepto`: dos columnas (P. jurídica y P. natural); `unico`: un solo valor; `total`: recalculado. */
  tipo: "concepto" | "unico" | "total";
  renglonPj: number | null;
  renglonPn: number | null;
  /** Un valor por mes, en el orden de `meses`. */
  meses: ValorMes[];
  /** Σ de los meses (las dos personas sumadas). */
  total: number;
  /** Σ por persona (en los conceptos). */
  totalPj: number;
  totalPn: number;
};

export type FilaPago = { clave: string; etiqueta: string; meses: (number | null)[]; total: number };

export type VistaRevision = { meses: MesVista[]; filas: FilaVista[]; pagos: FilaPago[] };

/** Renglones de un solo valor, en el orden del formulario; el 980 (pago total) es informativo. */
const RENGLONES_UNICOS = [129, 130, 131, 132, 133, 134, 135, 136, 137, 138, 980] as const;

export function vistasRevision(periodos: readonly PeriodoRevision[]): VistaRevision {
  const meses: MesVista[] = periodos.map((p) => ({
    periodo: p.periodo,
    etiqueta: NOMBRES_MES[p.periodo - 1] ?? `Período ${p.periodo}`,
    formulario: p.cadena.vigente ? { id: p.cadena.vigente.id, numero: p.cadena.vigente.numero, esCorreccion: p.cadena.cadena.length > 1 || p.cadena.faltaOriginal != null } : null,
    causal: p.causal,
  }));
  const valoresMes = periodos.map((p) => (p.cadena.vigente ? new Map(Object.entries(p.cadena.vigente.valores).map(([r, v]) => [Number(r), v])) : null));
  const valor = (i: number, r: number | null | undefined) => (r == null || !valoresMes[i] ? null : (valoresMes[i]!.get(r) ?? 0));

  const filas: FilaVista[] = CONCEPTOS_RETENCION_F350.map((c) => {
    const pjR = c.pj?.[1] ?? null;
    const pnR = c.pn?.[1] ?? null;
    const porMes = periodos.map((_, i) => {
      const pj = valor(i, pjR);
      const pn = valor(i, pnR);
      return { pj, pn, valor: valoresMes[i] ? (pj ?? 0) + (pn ?? 0) : null };
    });
    return {
      clave: c.concepto,
      seccion: c.seccion,
      etiqueta: c.etiqueta,
      tipo: "concepto" as const,
      renglonPj: pjR,
      renglonPn: pnR,
      meses: porMes,
      total: suma(porMes.map((m) => m.valor)),
      totalPj: suma(porMes.map((m) => m.pj)),
      totalPn: suma(porMes.map((m) => m.pn)),
    };
  });
  for (const r of RENGLONES_UNICOS) {
    const def = renglonDe(F350, r);
    if (!def) continue;
    const porMes = periodos.map((_, i) => {
      const v = !valoresMes[i] ? null : def.tipo === "total" ? calcularTotal(F350, r, valoresMes[i]!) : (valoresMes[i]!.get(r) ?? 0);
      return { pj: null, pn: null, valor: v };
    });
    filas.push({
      clave: def.concepto,
      seccion: def.seccion,
      etiqueta: def.etiqueta,
      tipo: def.tipo === "total" ? "total" : "unico",
      renglonPj: r,
      renglonPn: null,
      meses: porMes,
      total: suma(porMes.map((m) => m.valor)),
      totalPj: 0,
      totalPn: 0,
    });
  }

  const fila = (clave: string, etiqueta: string, valorMes: (p: PeriodoRevision) => number): FilaPago => {
    const porMes = periodos.map((p) => (p.pagos.some((x) => x.formularios.length > 0) ? valorMes(p) : null));
    return { clave, etiqueta, meses: porMes, total: suma(porMes) };
  };
  const delConcepto = (p: PeriodoRevision, c: string) => p.pagos.find((x) => x.concepto === c)?.impuesto ?? 0;
  const pagos: FilaPago[] = [
    fila("sancion", "Valor pago sanciones (34)", (p) => p.pagos.reduce((s, x) => s + x.sancion, 0)),
    fila("intereses", "Valor pago intereses de mora (35)", (p) => p.pagos.reduce((s, x) => s + x.intereses, 0)),
    fila("pago_61", "Pago retención renta · concepto 61 (36)", (p) => delConcepto(p, "61")),
    fila("pago_62", "Pago reteIVA · concepto 62 (36)", (p) => delConcepto(p, "62")),
    fila("pago_63", "Pago timbre · concepto 63 (36)", (p) => delConcepto(p, "63")),
    fila("total_pagado", "Total pagado", (p) => p.pagos.reduce((s, x) => s + x.sancion + x.intereses + x.impuesto, 0)),
  ];
  return { meses, filas, pagos };
}

function suma(valores: readonly (number | null)[]): number {
  return valores.reduce<number>((s, v) => s + Math.round((v ?? 0) * 100), 0) / 100;
}

/** ¿La fila tiene algún valor distinto de cero? (para «Ocultar los renglones en cero»). */
export function filaConValores(f: FilaVista | FilaPago): boolean {
  return f.total !== 0 || ("tipo" in f && f.tipo === "total");
}
