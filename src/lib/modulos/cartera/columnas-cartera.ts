// Columnas de la tabla de detalle cuando el módulo tiene columnas DINÁMICAS — puro.
//
// Casi todos los módulos pintan las columnas de su descriptor y con eso basta. Cartera no:
// los rangos de vencimiento son entre 4 y 9 columnas cuyos rótulos pone cada ERP («De 1 a
// 90», «POR VENCER», «<== 90-»), así que la tabla tiene que construirse por cargue, con los
// rótulos que se congelaron al leer el archivo.
//
// Se muestra el rótulo LITERAL del archivo, no uno normalizado: es el que el auditor
// reconoce cuando compara la pantalla contra el papel que le entregó el cliente.
import type { DescriptorModulo } from "../descriptores";
import { CLAVE_EDADES } from "./detalle-cartera";

export type ColumnaDetalle = {
  /** Clave única de la columna; para las de familia no es un rol del descriptor. */
  nombre: string;
  etiqueta: string;
  tipo: string;
  /** La columna del valor del descriptor: su celda muestra el saldo con que suma la fila. */
  esValor?: boolean;
  /** Dónde leer el valor dentro de `datos` cuando la columna la puso el archivo. */
  familia?: { clave: string; etiqueta: string };
  /** Columna que no está en el archivo: la calcula la tabla (`conColumnaDiferencia`). */
  calculada?: ColumnaCalculada;
};

/** Valor total − cantidad × valor unitario: `resultado` − `producto[0]` × `producto[1]`. */
export type ColumnaCalculada = { resultado: string; producto: [string, string] };

/** Clave de la columna de la diferencia: no choca con ningún rol del descriptor. */
export const COLUMNA_DIFERENCIA = "_diferencia";

/**
 * Detalle del borrador: «Diferencia» junto a la columna del valor, en los módulos que derivan el
 * valor como cantidad × valor unitario (Inventarios). Muestra cuánto no cuadra cada ítem para
 * poder ordenarlos y filtrarlos por eso sin salir de la tabla.
 */
export function conColumnaDiferencia<C extends ColumnaDetalle>(descriptor: DescriptorModulo, columnas: readonly C[]): (C | ColumnaDetalle)[] {
  const regla = descriptor.derivar?.[descriptor.valor];
  if (!regla || !("producto" in regla)) return [...columnas];
  const diferencia: ColumnaDetalle = { nombre: COLUMNA_DIFERENCIA, etiqueta: "Diferencia", tipo: "moneda", calculada: { resultado: descriptor.valor, producto: regla.producto } };
  const i = columnas.findIndex((c) => c.esValor);
  return i < 0 ? [...columnas, diferencia] : [...columnas.slice(0, i + 1), diferencia, ...columnas.slice(i + 1)];
}

/** Prefijo de las columnas de familia, para que no choquen con el nombre de un rol. */
export const PREFIJO_COLUMNA_EDAD = "_edades:";

/**
 * Rótulos de edades utilizables de un encabezado. Tolerante a propósito: la columna es JSON
 * libre y los cargues anteriores a cartera la traen vacía o nula.
 */
export function rotulosEdadesDeEncabezado(rangosEdades: unknown): string[] {
  if (!Array.isArray(rangosEdades)) return [];
  const vistos = new Set<string>();
  const salida: string[] = [];
  for (const r of rangosEdades) {
    if (typeof r !== "string") continue;
    const etiqueta = r.trim();
    if (!etiqueta || vistos.has(etiqueta)) continue;
    vistos.add(etiqueta);
    salida.push(etiqueta);
  }
  return salida;
}

/**
 * Columnas de la tabla: las del descriptor y, detrás, una por cada balde que trajo el
 * archivo. Un módulo sin familias —o un cargue sin rangos— devuelve exactamente las de
 * siempre, de modo que nada cambia para Inventarios y compañía.
 */
export function columnasDetalleModulo(
  descriptor: DescriptorModulo,
  rangosEdades: unknown,
): ColumnaDetalle[] {
  const delDescriptor = descriptor.columnas.map((c) => ({
    nombre: c.nombre,
    etiqueta: c.etiqueta,
    tipo: c.tipo as string,
    ...(c.nombre === descriptor.valor ? { esValor: true } : {}),
  }));
  if (!descriptor.familiasDinamicas?.length) return delDescriptor;

  const rotulos = rotulosEdadesDeEncabezado(rangosEdades);
  return [
    ...delDescriptor,
    ...rotulos.map((etiqueta) => ({
      nombre: `${PREFIJO_COLUMNA_EDAD}${etiqueta}`,
      etiqueta,
      tipo: "moneda",
      familia: { clave: CLAVE_EDADES, etiqueta },
    })),
  ];
}
