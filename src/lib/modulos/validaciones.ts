// Validaciones AUTOMÁTICAS de un dato de módulo (puras, sin BD). Se recalculan al leer,
// igual que las alertas del balance: nada de contadores persistidos que puedan quedar viejos.
import type { DescriptorModulo } from "./descriptores";

export type ItemNegativo = {
  filaNum: number;
  clasificador: string | null;
  referencia: string | null;
  campo: string; // rol de la columna en negativo (p. ej. "cantidad")
  etiqueta: string; // etiqueta legible de esa columna
  valor: number;
};

export type FilaValidable = {
  filaNum: number;
  clasificador: string | null;
  datos: Record<string, unknown>;
};

const num = (v: unknown): number | null => {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v.replace(/[^\d.,-]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  return null;
};

const round2 = (v: number) => Math.round(v * 100) / 100;
// Tolerancia del cuadre producto: absorbe el redondeo del unitario (2 decimales ⇒ ~0,005/unidad).
// 1% de la cantidad (1 céntimo por unidad) con piso de 1 peso. Un error real (unitario mal
// tecleado, total inconsistente) supera esto de sobra.
const toleranciaProducto = (cantidad: number) => Math.max(1, Math.abs(cantidad) * 0.01);
/** ¿`total` NO cuadra con `cantidad × unitario`? (para validar cuando el archivo trae el unitario). */
export function esDescuadreProducto(total: number, cantidad: number, unitario: number): boolean {
  return Math.abs(total - cantidad * unitario) > toleranciaProducto(cantidad);
}

export type ItemDescuadre = {
  filaNum: number;
  clasificador: string | null;
  referencia: string | null;
  resultadoEtiqueta: string; // p. ej. "Valor total"
  declarado: number; // el valor del archivo (valorTotal)
  esperado: number; // cantidad × unitario
};

/**
 * Descuadres producto: cuando el archivo TRAE el unitario (y la cantidad y el total), verifica
 * que `total = cantidad × unitario`. Si no cuadra (fuera de la tolerancia de redondeo) → novedad.
 * Se apoya en las reglas `derivar: { <resultado>: { producto: [a, b] } }` del descriptor.
 */
export function detectarDescuadres(descriptor: DescriptorModulo, filas: FilaValidable[]): ItemDescuadre[] {
  const reglas = Object.entries(descriptor.derivar ?? {}).filter(([, r]) => "producto" in r) as [string, { producto: [string, string] }][];
  if (reglas.length === 0) return [];
  const etiquetaDe = new Map(descriptor.columnas.map((c) => [c.nombre, c.etiqueta]));
  const refRol = descriptor.columnas.find((c) => /ref/i.test(c.nombre))?.nombre;
  const out: ItemDescuadre[] = [];
  for (const f of filas) {
    for (const [resultado, regla] of reglas) {
      const total = num(f.datos[resultado]);
      const a = num(f.datos[regla.producto[0]]); // cantidad
      const b = num(f.datos[regla.producto[1]]); // unitario (debe venir en el archivo)
      if (total == null || a == null || b == null || a === 0 || b === 0) continue;
      if (esDescuadreProducto(total, a, b)) {
        out.push({
          filaNum: f.filaNum,
          clasificador: f.clasificador,
          referencia: refRol ? (f.datos[refRol] != null ? String(f.datos[refRol]) : null) : null,
          resultadoEtiqueta: etiquetaDe.get(resultado) ?? resultado,
          declarado: total,
          esperado: round2(a * b),
        });
      }
    }
  }
  return out;
}

/**
 * Ítems con existencias o costos NEGATIVOS en las columnas que el descriptor marca como
 * `noNegativos`. Un ítem puede aparecer varias veces si tiene más de una columna negativa.
 */
export function detectarNegativos(descriptor: DescriptorModulo, filas: FilaValidable[]): ItemNegativo[] {
  const cols = descriptor.noNegativos ?? [];
  if (cols.length === 0) return [];
  const etiquetaDe = new Map(descriptor.columnas.map((c) => [c.nombre, c.etiqueta]));
  const refRol = descriptor.columnas.find((c) => /ref/i.test(c.nombre))?.nombre;
  const salida: ItemNegativo[] = [];
  for (const f of filas) {
    for (const campo of cols) {
      const v = num(f.datos[campo]);
      if (v != null && v < 0) {
        salida.push({
          filaNum: f.filaNum,
          clasificador: f.clasificador,
          referencia: refRol ? (f.datos[refRol] != null ? String(f.datos[refRol]) : null) : null,
          campo,
          etiqueta: etiquetaDe.get(campo) ?? campo,
          valor: v,
        });
      }
    }
  }
  return salida;
}
