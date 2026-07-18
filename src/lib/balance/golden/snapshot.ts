// Arnés de regresión "golden" — Fase 0 del rediseño por perfiles.
//
// `snapshotVista` produce una HUELLA determinista y estable del resultado de
// `construirVistaBorrador` para un conjunto de filas crudas (las del staging). El arnés
// congela el comportamiento ACTUAL: cualquier cambio futuro que regrese un caso ya resuelto
// hace fallar el runner (`golden.test.ts`). La huella se compara con `toEqual`, así que:
//  - los importes se redondean a centavos para evitar ruido de punto flotante, y
//  - solo se incluyen agregados estables (no el árbol completo, que es voluminoso).
//
// El fixture guarda las FILAS de entrada (auto-contenido, sin BD), de modo que el runner
// es puro y reproducible. La captura desde el staging vive en `capturar.ts` (dev-only).
import { construirVistaBorrador } from "../borrador-vm";
import type { FilaBorrador, NodoBorrador } from "../borrador";

/** Campos mínimos de una fila cruda que consume `construirVistaBorrador`. */
export type FilaGolden = Pick<
  FilaBorrador,
  "filaNum" | "codigo" | "codigoCrudo" | "nombre" | "nivel" | "tipoFila" | "desacoplada" | "omitida" | "padreManual" | "saldoInicial" | "debitos" | "creditos" | "saldoFinal"
>;

/** Huella estable del view-model del borrador. */
export type GoldenSnapshot = {
  partidaDoble: { diff: number; cuadra: boolean };
  ecuacion: { diff: number; cuadra: boolean };
  totalesCalculados: { activo: number; pasivo: number; patrimonio: number; ingresos: number; gastos: number; costos: number; resultado: number };
  totalesPorClase: Record<string, number>; // Σ saldoFinal de movimientos NO omitidos, por clase (1er dígito)
  conteos: {
    filasOcultas: number; nitTachados: number; relistadoGuiones: number; clasesCorregidas: number; porTercero: boolean;
    movimientos: number; agrupadoras: number; totales: number; terceros: number; huerfanas: number;
    repetidos: number; subtotalesDuplicados: number; descuadres: number; nodosArbol: number;
  };
};

/** Fixture golden auto-contenido: filas de entrada + huella esperada. */
export type GoldenFixture = {
  nombre: string;
  descripcion?: string;
  loteId?: string; // procedencia (informativa)
  filas: FilaGolden[];
  esperado: GoldenSnapshot;
};

// Redondea a centavos y NORMALIZA el cero negativo: `-0` se serializa como `0` en JSON, así
// que sin esto la captura (en memoria, `-0`) no casaría con el fixture releído (`0`).
const r2 = (n: number): number => {
  const v = Math.round((n + Number.EPSILON) * 100) / 100;
  return v === 0 ? 0 : v;
};

function aplanar(nodos: NodoBorrador[]): NodoBorrador[] {
  const out: NodoBorrador[] = [];
  const rec = (n: NodoBorrador) => { out.push(n); n.hijos.forEach(rec); };
  nodos.forEach(rec);
  return out;
}

/**
 * Corre el pipeline del borrador sobre una COPIA de las filas (el pipeline muta la entrada)
 * y devuelve la huella determinista. Puro: sin BD, sin IA.
 */
export function snapshotVista(filas: FilaGolden[]): GoldenSnapshot {
  const clon: FilaBorrador[] = filas.map((f) => ({ ...f }));
  const v = construirVistaBorrador(clon);
  const nodos = aplanar(v.arbol);

  const porClase: Record<string, number> = {};
  for (const n of nodos) {
    if (n.tipoFila !== "movimiento" || n.omitida || !/^\d/.test(n.codigo)) continue;
    const k = n.codigo[0];
    porClase[k] = r2((porClase[k] ?? 0) + n.saldoFinal);
  }

  return {
    partidaDoble: { diff: r2(v.partidaDoble.diff), cuadra: v.partidaDoble.cuadra },
    ecuacion: { diff: r2(v.validacion.ecuacionDiff), cuadra: v.validacion.ecuacionCuadra },
    totalesCalculados: {
      activo: r2(v.validacion.activo), pasivo: r2(v.validacion.pasivo), patrimonio: r2(v.validacion.patrimonio),
      ingresos: r2(v.validacion.ingresos), gastos: r2(v.validacion.gastos), costos: r2(v.validacion.costos), resultado: r2(v.validacion.resultado),
    },
    totalesPorClase: porClase,
    conteos: {
      filasOcultas: v.filasOcultas, nitTachados: v.nitTachados, relistadoGuiones: v.relistadoGuiones,
      clasesCorregidas: v.clasesCorregidas, porTercero: v.porTercero,
      movimientos: v.diagnostico.movimientos, agrupadoras: v.diagnostico.agrupadoras, totales: v.diagnostico.totales,
      terceros: v.diagnostico.terceros, huerfanas: v.diagnostico.huerfanas, repetidos: v.diagnostico.repetidos,
      subtotalesDuplicados: v.diagnostico.subtotalesDuplicados, descuadres: v.diagnostico.descuadres,
      nodosArbol: nodos.length,
    },
  };
}
