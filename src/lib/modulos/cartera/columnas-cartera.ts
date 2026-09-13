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
  /** Dónde leer el valor dentro de `datos` cuando la columna la puso el archivo. */
  familia?: { clave: string; etiqueta: string };
};

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
