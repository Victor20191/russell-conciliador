import { calcularTotal, esImporte, renglonDe, type DefinicionFormulario } from "../formularios/definicion";
import { CONCEPTOS_RETENCION_F350 } from "../formularios/f350";
import { conceptosPagoDe, impuestoPorClave, RETENCION, type ClaveImpuesto } from "../impuestos-dian";
import { etiquetaPeriodo } from "../periodicidad";
import type { PeriodoRevision } from "./periodos-revision";

/**
 * Vistas de una revisión de Impuestos · DIAN (puro).
 *
 * «Por meses» o «Por períodos» (Vista 1): cada renglón de la declaración por período y el bloque de
 * pagos del 490. En Retención (350) los conceptos van por persona jurídica y natural; en IVA (300)
 * cada renglón tiene un solo valor. «Acumulado» (Vista 2): la suma de los períodos hasta el corte.
 * Los valores salen de la declaración VIGENTE de cada período (la última corrección) y los totales
 * se RECALCULAN con la definición del formulario, nunca se copian de otra celda.
 */

export type MesVista = {
  periodo: number;
  /** «Enero» en Retención; «Bimestre 01 · Enero-Febrero», «Cuatrimestre 02 · Mayo-Agosto» o «Año» en IVA. */
  etiqueta: string;
  /** La declaración vigente del período; null si no hay (falta o período sin formulario). */
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
  /** Un valor por período, en el orden de `meses`. */
  meses: ValorMes[];
  /** Σ de los períodos (las dos personas sumadas). */
  total: number;
  /** Σ por persona (en los conceptos). */
  totalPj: number;
  totalPn: number;
};

export type FilaPago = { clave: string; etiqueta: string; meses: (number | null)[]; total: number };

export type VistaRevision = {
  meses: MesVista[];
  filas: FilaVista[];
  pagos: FilaPago[];
  /** Los conceptos de Retención llevan columnas por persona; los renglones del 300, no. Las vistas viejas no lo traen (son de Retención). */
  conPersonas?: boolean;
  /** El formulario de la declaración (350 o 300). */
  codigo?: string;
  /** «mes» con periodicidad mensual; «período» con las demás. */
  unidad?: "mes" | "período";
};

/** Renglones de un solo valor del 350, en el orden del formulario; el 980 (pago total) es informativo. */
const RENGLONES_UNICOS_350 = [129, 130, 131, 132, 133, 134, 135, 136, 137, 138, 980] as const;

/** Lo que pagaron los 490 de Retención por concepto, con su nombre de siempre. */
const PAGO_RETENCION: Readonly<Record<string, string>> = {
  "61": "Pago retención renta · concepto 61 (36)",
  "62": "Pago reteIVA · concepto 62 (36)",
  "63": "Pago timbre · concepto 63 (36)",
};

export function vistasRevision(periodos: readonly PeriodoRevision[], impuestoClave: ClaveImpuesto = "RET", periodicidad = "Mensual"): VistaRevision {
  const impuesto = impuestoPorClave(impuestoClave) ?? RETENCION;
  const def = impuesto.declaracion;
  const meses: MesVista[] = periodos.map((p) => ({
    periodo: p.periodo,
    etiqueta: etiquetaPeriodo(periodicidad, p.periodo),
    formulario: p.cadena.vigente ? { id: p.cadena.vigente.id, numero: p.cadena.vigente.numero, esCorreccion: p.cadena.cadena.length > 1 || p.cadena.faltaOriginal != null } : null,
    causal: p.causal,
  }));
  const valoresMes = periodos.map((p) => (p.cadena.vigente ? new Map(Object.entries(p.cadena.vigente.valores).map(([r, v]) => [Number(r), v])) : null));
  const valor = (i: number, r: number | null | undefined) => (r == null || !valoresMes[i] ? null : (valoresMes[i]!.get(r) ?? 0));

  const filas: FilaVista[] = [];
  if (impuesto.columnasPersona) {
    for (const c of CONCEPTOS_RETENCION_F350) {
      const pjR = c.pj?.[1] ?? null;
      const pnR = c.pn?.[1] ?? null;
      const porMes = periodos.map((_, i) => {
        const pj = valor(i, pjR);
        const pn = valor(i, pnR);
        return { pj, pn, valor: valoresMes[i] ? (pj ?? 0) + (pn ?? 0) : null };
      });
      filas.push({
        clave: c.concepto,
        seccion: c.seccion,
        etiqueta: c.etiqueta,
        tipo: "concepto",
        renglonPj: pjR,
        renglonPn: pnR,
        meses: porMes,
        total: suma(porMes.map((m) => m.valor)),
        totalPj: suma(porMes.map((m) => m.pj)),
        totalPn: suma(porMes.map((m) => m.pn)),
      });
    }
  }
  // Los renglones de un solo valor: en el 350, del 129 al 138 y el 980; en el 300, todos los que se guardan con importe.
  const unicos = impuesto.columnasPersona ? [...RENGLONES_UNICOS_350] : def.renglones.filter((r) => r.guardar && esImporte(r)).map((r) => r.renglon);
  for (const r of unicos) filas.push(filaUnica(def, r, periodos.length, valoresMes));

  const fila = (clave: string, etiqueta: string, valorMes: (p: PeriodoRevision) => number): FilaPago => {
    const porMes = periodos.map((p) => (p.pagos.some((x) => x.formularios.length > 0) ? valorMes(p) : null));
    return { clave, etiqueta, meses: porMes, total: suma(porMes) };
  };
  const delConcepto = (p: PeriodoRevision, c: string) => p.pagos.find((x) => x.concepto === c)?.impuesto ?? 0;
  const pagos: FilaPago[] = [
    fila("sancion", "Valor pago sanciones (34)", (p) => p.pagos.reduce((s, x) => s + x.sancion, 0)),
    fila("intereses", "Valor pago intereses de mora (35)", (p) => p.pagos.reduce((s, x) => s + x.intereses, 0)),
    ...conceptosPagoDe(impuesto, periodicidad).map(({ concepto }) =>
      fila(`pago_${concepto}`, PAGO_RETENCION[concepto] ?? `Valor pago impuesto · concepto ${concepto} (36)`, (p) => delConcepto(p, concepto)),
    ),
    fila("total_pagado", "Total pagado", (p) => p.pagos.reduce((s, x) => s + x.sancion + x.intereses + x.impuesto, 0)),
  ];
  return { meses, filas, pagos, conPersonas: impuesto.columnasPersona, codigo: def.codigo, unidad: periodicidad === "Mensual" ? "mes" : "período" };
}

/** Un renglón de un solo valor por período; los totales se recalculan con la definición. */
function filaUnica(def: DefinicionFormulario, r: number, periodos: number, valoresMes: (Map<number, number> | null)[]): FilaVista {
  const d = renglonDe(def, r)!;
  const porMes = Array.from({ length: periodos }, (_, i) => {
    const valores = valoresMes[i];
    const v = !valores ? null : d.tipo === "total" ? calcularTotal(def, r, valores) : (valores.get(r) ?? 0);
    return { pj: null, pn: null, valor: v };
  });
  return {
    clave: d.concepto,
    seccion: d.seccion,
    etiqueta: d.etiqueta,
    tipo: d.tipo === "total" ? "total" : "unico",
    renglonPj: r,
    renglonPn: null,
    meses: porMes,
    total: suma(porMes.map((m) => m.valor)),
    totalPj: 0,
    totalPn: 0,
  };
}

function suma(valores: readonly (number | null)[]): number {
  return valores.reduce<number>((s, v) => s + Math.round((v ?? 0) * 100), 0) / 100;
}

/** ¿La fila tiene algún valor distinto de cero? (para «Ocultar los renglones en cero»). */
export function filaConValores(f: FilaVista | FilaPago): boolean {
  return f.total !== 0 || ("tipo" in f && f.tipo === "total");
}

/** «Falta el 350» / «Falta el 300»; las vistas viejas son de Retención. */
export const faltaDeclaracion = (v: Pick<VistaRevision, "codigo">) => `Falta el ${v.codigo ?? "350"}`;

/** «meses» o «períodos», para los textos de las vistas. */
export const unidadPlural = (v: Pick<VistaRevision, "unidad">) => (v.unidad === "período" ? "períodos" : "meses");

/** ¿La vista lleva columnas por persona? Las vistas viejas no traen `conPersonas` y son de Retención. */
export const vistaConPersonas = (v: Pick<VistaRevision, "conPersonas">) => v.conPersonas ?? true;
