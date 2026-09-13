// VALIDACIONES propias de Nómina (RF-NOM §8), recalculadas al leer sobre el detalle cargado.
// Puro: sin BD. Pruebas en `validaciones-nomina.test.ts`.

import { digitosCuenta } from "./homologacion";
import type { RenglonConsolidadoNomina } from "./consolidado-nomina";

export type FilaDetalleValidacion = {
  filaNum: number;
  valor: number;
  datos: Record<string, unknown>;
};

export type NetoDescuadrado = { filaNum: number; cedula: string | null; devengo: number; deduccion: number; neto: number; esperado: number };
export type CedulaConVariosNombres = { cedula: string; nombres: string[]; filas: number };

export type ValidacionesNomina = {
  /** devengo − deducción ≠ neto en la misma fila (solo cuando la fila trae los tres). */
  netos: NetoDescuadrado[];
  /** Conceptos de gasto sin cuenta Russell resuelta (no cruzan). */
  sinCuenta: { clasificador: string; descripcion: string | null; total: number }[];
  /** Conceptos que cruzan por reparto o quedaron con varias cuentas. */
  multi: { clasificador: string; descripcion: string | null; total: number; cuentas: string[] }[];
  /** Deducciones que van al control (Σ, negativa). */
  control: { conceptos: number; total: number };
  /** Cédulas normalizadas que aparecen con más de un nombre. */
  cedulas: CedulaConVariosNombres[];
  /** Meses distintos que trae el detalle (períodoDesde de cada fila). */
  meses: string[];
  total: number;
};

const num = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : null;
};

export function validarNomina(input: { detalle: readonly FilaDetalleValidacion[]; renglones: readonly RenglonConsolidadoNomina[]; tolerancia?: number }): ValidacionesNomina {
  const tolerancia = input.tolerancia ?? 1;
  const netos: NetoDescuadrado[] = [];
  const nombresPorCedula = new Map<string, Map<string, number>>();
  const meses = new Set<string>();
  for (const f of input.detalle) {
    const devengo = num(f.datos.devengo);
    const deduccion = num(f.datos.deduccion);
    const neto = num(f.datos.neto);
    if (devengo != null && deduccion != null && neto != null && (devengo !== 0 || deduccion !== 0)) {
      const esperado = devengo - Math.abs(deduccion);
      if (Math.abs(esperado - neto) > tolerancia) {
        netos.push({ filaNum: f.filaNum, cedula: f.datos.cedula == null ? null : String(f.datos.cedula), devengo, deduccion, neto, esperado });
      }
    }
    const cedula = digitosCuenta(f.datos.cedula);
    const nombre = f.datos.empleado == null ? "" : String(f.datos.empleado).replace(/\s+/g, " ").trim().toUpperCase();
    if (cedula && nombre) {
      const m = nombresPorCedula.get(cedula) ?? new Map<string, number>();
      m.set(nombre, (m.get(nombre) ?? 0) + 1);
      nombresPorCedula.set(cedula, m);
    }
    const mes = f.datos.periodoDesde;
    if (typeof mes === "string" && /^\d{4}-\d{2}$/.test(mes)) meses.add(mes);
  }
  const cedulas: CedulaConVariosNombres[] = [...nombresPorCedula.entries()]
    .filter(([, m]) => m.size > 1)
    .map(([cedula, m]) => ({ cedula, nombres: [...m.keys()].sort(), filas: [...m.values()].reduce((a, b) => a + b, 0) }))
    .sort((a, b) => b.filas - a.filas);

  const sinCuenta: ValidacionesNomina["sinCuenta"] = [];
  const multi: ValidacionesNomina["multi"] = [];
  let controlConceptos = 0;
  let controlTotal = 0;
  for (const r of input.renglones) {
    const s = r.sugerencia;
    if (s.destino === "control") { controlConceptos++; controlTotal += r.total; continue; }
    if (s.destino !== "gasto") continue;
    if (s.via === "multi") multi.push({ clasificador: r.clasificador, descripcion: r.descripcion, total: r.total, cuentas: [...s.cuentas] });
    else if (s.via === "sin_cuenta" || s.via === "sugerido_nombre") sinCuenta.push({ clasificador: r.clasificador, descripcion: r.descripcion, total: r.total });
  }
  return {
    netos,
    sinCuenta: sinCuenta.sort((a, b) => Math.abs(b.total) - Math.abs(a.total)),
    multi: multi.sort((a, b) => Math.abs(b.total) - Math.abs(a.total)),
    control: { conceptos: controlConceptos, total: Math.round(controlTotal * 100) / 100 },
    cedulas,
    meses: [...meses].sort(),
    total: netos.length + sinCuenta.length + cedulas.length,
  };
}
