/**
 * Orden por columna de las tablas de los cruces de un módulo (cédula contable y cruce por
 * tercero). Puro, para poder probarlo.
 *
 * Tres reglas:
 *  - El clic recorre: dirección inicial → la contraria → orden del sistema (`null`), que es el que
 *    pone las diferencias arriba y lo demás después; así siempre se puede volver a él.
 *  - Las columnas de DIFERENCIA ordenan por su tamaño, sin importar el signo: «de mayor a menor»
 *    tiene que traer arriba un −14 millones igual que un +14 millones. Los importes (contabilidad,
 *    auxiliar, cada cuenta) ordenan por su valor con signo.
 *  - Estable: a igual valor se conserva el orden del sistema.
 */
import type { FilaCruceContable } from "./cruce-contable";
import type { FilaCruceTerceroCartera } from "./cartera/cruce-tercero-cartera";

export type DireccionOrdenCruce = "asc" | "desc";
export type OrdenCruce<C extends string> = { columna: C; direccion: DireccionOrdenCruce } | null;

/** Siguiente estado del orden al hacer clic en `columna`. */
export function siguienteOrdenCruce<C extends string>(
  actual: OrdenCruce<C>,
  columna: C,
  inicial: DireccionOrdenCruce,
): OrdenCruce<C> {
  if (!actual || actual.columna !== columna) return { columna, direccion: inicial };
  if (actual.direccion === inicial) return { columna, direccion: inicial === "asc" ? "desc" : "asc" };
  return null;
}

type Valor = number | string | null;

function ordenarPorValor<T>(filas: readonly T[], valor: (fila: T) => Valor, direccion: DireccionOrdenCruce): T[] {
  const dir = direccion === "asc" ? 1 : -1;
  return filas
    .map((fila, i) => ({ fila, i, v: valor(fila) }))
    .sort((a, b) => {
      // Sin valor (un nombre vacío) siempre al final, en cualquier dirección.
      if (a.v == null || b.v == null) return a.v == null && b.v == null ? a.i - b.i : a.v == null ? 1 : -1;
      const cmp = typeof a.v === "number" && typeof b.v === "number"
        ? a.v - b.v
        : String(a.v).localeCompare(String(b.v), "es", { sensitivity: "base", numeric: true });
      return cmp * dir || a.i - b.i;
    })
    .map((x) => x.fila);
}

// ---------------------------------------------------------------- cruce por tercero

/** `c:<cuenta>` = la columna de una cuenta Russell de seis dígitos. */
export type ColumnaCruceTercero = "clave" | "nombre" | "contable" | "modulo" | "diferencia" | `c:${string}`;

export const direccionInicialCruceTercero = (columna: ColumnaCruceTercero): DireccionOrdenCruce =>
  columna === "clave" || columna === "nombre" ? "asc" : "desc";

type FilaOrdenTercero = Pick<FilaCruceTerceroCartera, "clave" | "nombre" | "contable" | "modulo" | "diferencia">;

function valorCruceTercero(fila: FilaOrdenTercero, columna: ColumnaCruceTercero): Valor {
  if (columna === "clave") return fila.clave;
  if (columna === "nombre") return fila.nombre?.trim() || null;
  if (columna === "contable") return fila.contable.total;
  if (columna === "modulo") return fila.modulo.total;
  if (columna === "diferencia") return Math.abs(fila.diferencia);
  return fila.contable.porCuenta[columna.slice(2)] ?? 0;
}

export function ordenarCruceTercero<T extends FilaOrdenTercero>(filas: readonly T[], orden: OrdenCruce<ColumnaCruceTercero>): T[] {
  if (!orden) return [...filas];
  return ordenarPorValor(filas, (f) => valorCruceTercero(f, orden.columna), orden.direccion);
}

// ---------------------------------------------------------------- cédula del cruce contable

export type ColumnaCruceContable = "cuenta" | "contable" | "modulo" | "diferenciaBruta" | "noModular" | "diferencia";

export const direccionInicialCruceContable = (columna: ColumnaCruceContable): DireccionOrdenCruce =>
  columna === "cuenta" ? "asc" : "desc";

type FilaOrdenContable = Pick<FilaCruceContable, "cuenta4" | "contable" | "inventario" | "diferenciaBruta" | "noModular" | "noModularModulo" | "diferencia">;

function valorCruceContable(fila: FilaOrdenContable, columna: ColumnaCruceContable): Valor {
  if (columna === "cuenta") return fila.cuenta4;
  if (columna === "contable") return fila.contable;
  if (columna === "modulo") return fila.inventario;
  if (columna === "diferenciaBruta") return Math.abs(fila.diferenciaBruta);
  // Efecto de lo no modular en la diferencia (contable excluido y módulo excluido), por tamaño.
  if (columna === "noModular") return Math.abs(fila.noModular) + Math.abs(fila.noModularModulo);
  return Math.abs(fila.diferencia);
}

export function ordenarCruceContable<T extends FilaOrdenContable>(filas: readonly T[], orden: OrdenCruce<ColumnaCruceContable>): T[] {
  if (!orden) return [...filas];
  return ordenarPorValor(filas, (f) => valorCruceContable(f, orden.columna), orden.direccion);
}
