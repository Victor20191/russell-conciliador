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

/** Las tres alertas de costo de una referencia de inventario. */
export type TipoAlertaCosto = "costo_cero_con_existencias" | "sin_existencias_con_costo" | "costo_uno";

/** Orden en que se presentan (y nombre legible de cada una). */
export const ALERTAS_COSTO: readonly { tipo: TipoAlertaCosto; etiqueta: string }[] = [
  { tipo: "costo_cero_con_existencias", etiqueta: "Costo cero con existencias" },
  { tipo: "sin_existencias_con_costo", etiqueta: "Sin existencias y con costo" },
  { tipo: "costo_uno", etiqueta: "Costo unitario 1" },
];

// Un importe «en cero» o «igual a 1» se mide al centavo; la cantidad no, porque puede traer
// fracciones (kilos, metros) y 0,001 unidades siguen siendo existencias.
const CENTAVO = 0.005;

/**
 * Alertas de costo de UNA referencia. Un dato vacío no dispara nada: sin la cantidad no se sabe
 * si hay existencias, y sin el costo no se sabe si es cero.
 *  - costo cero con existencias: cantidad mayor que cero y costo unitario o valor total en cero.
 *  - sin existencias y con costo: cantidad en cero (escrita, no vacía) y valor total distinto de cero.
 *  - costo 1: costo unitario igual a 1, el costo de relleno típico de un ítem sin costear.
 */
export function alertasCostoDeFila(v: { cantidad: number | null; unitario: number | null; total: number | null }): TipoAlertaCosto[] {
  const { cantidad, unitario, total } = v;
  const salida: TipoAlertaCosto[] = [];
  const enCero = (n: number | null) => n != null && Math.abs(n) < CENTAVO;
  if (cantidad != null && cantidad > 0 && (enCero(unitario) || enCero(total))) salida.push("costo_cero_con_existencias");
  if (cantidad === 0 && total != null && !enCero(total)) salida.push("sin_existencias_con_costo");
  if (unitario != null && Math.abs(unitario - 1) < CENTAVO) salida.push("costo_uno");
  return salida;
}

export type ItemAlertaCosto = {
  tipo: TipoAlertaCosto;
  filaNum: number;
  clasificador: string | null;
  referencia: string | null;
  cantidad: number | null;
  unitario: number | null;
  total: number | null;
};

/**
 * Referencias con alertas de costo, según las columnas que nombra `descriptor.alertasCosto`.
 * Una referencia puede tener dos (sin existencias, con costo y costo unitario 1).
 */
export function detectarAlertasCosto(descriptor: DescriptorModulo, filas: FilaValidable[]): ItemAlertaCosto[] {
  const roles = descriptor.alertasCosto;
  if (!roles) return [];
  const refRol = descriptor.columnas.find((c) => /ref/i.test(c.nombre))?.nombre;
  const salida: ItemAlertaCosto[] = [];
  for (const f of filas) {
    const valores = { cantidad: num(f.datos[roles.cantidad]), unitario: num(f.datos[roles.unitario]), total: num(f.datos[roles.total]) };
    for (const tipo of alertasCostoDeFila(valores)) {
      salida.push({
        tipo,
        filaNum: f.filaNum,
        clasificador: f.clasificador,
        referencia: refRol ? (f.datos[refRol] != null ? String(f.datos[refRol]) : null) : null,
        ...valores,
      });
    }
  }
  return salida;
}

export type ResumenAlertaCosto = {
  tipo: TipoAlertaCosto;
  etiqueta: string;
  /** Cuántas referencias la tienen. */
  referencias: number;
  /** Σ de su valor total (en «costo cero» suele ser 0). */
  valorTotal: number;
  /** Primeras filas, para que la pantalla las nombre. */
  filas: number[];
};

/** Conteo y valor de cada alerta, en el orden de `ALERTAS_COSTO` (incluidas las que están en cero). */
export function resumirAlertasCosto(
  items: readonly Pick<ItemAlertaCosto, "tipo" | "filaNum" | "total">[],
  maxFilas = 8,
): ResumenAlertaCosto[] {
  return ALERTAS_COSTO.map(({ tipo, etiqueta }) => {
    const propias = items.filter((i) => i.tipo === tipo);
    return {
      tipo,
      etiqueta,
      referencias: propias.length,
      valorTotal: round2(propias.reduce((s, i) => s + (i.total ?? 0), 0)),
      filas: propias.slice(0, maxFilas).map((i) => i.filaNum),
    };
  });
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
