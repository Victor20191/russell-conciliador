// Renglones del ARCHIVO que no son ítems, en la tabla del detalle de un módulo — puro.
//
// Los reportes intercalan entre sus ítems renglones que ordenan el papel: la cuenta con el total
// de sus terceros (SIESA), las filas de porcentajes, el pie del ERP, el encabezado de cada
// tercero. El motor ya los deja fuera del total, pero mostrarlos con el aspecto de un ítem hacía
// creer que sumaban. Aquí se decide cuáles se ocultan, cómo se rotulan y qué control aportan.
import { CLAVE_SALDO_DECLARADO } from "./cartera/detalle-cartera";

type FilaRenglon = { tipoFila?: string | null; motivo?: string | null };

const redondear = (v: number): number => Math.round(v * 100) / 100 + 0;

/** ¿Renglón que solo ordena el reporte (cuenta de SIESA, porcentajes, pie)? Se oculta de entrada. */
export function esRenglonEstructura(fila: FilaRenglon): boolean {
  return fila.tipoFila === "agrupadora" && (fila.motivo === "seccion_cuenta" || fila.motivo === "sin_identificador");
}

/** Rótulo, para la columna de acciones, de un renglón que no suma. */
export function etiquetaRenglonNoSuma(motivo: string | null | undefined): string {
  if (motivo === "seccion_cuenta") return "cuenta del archivo · no suma";
  if (motivo?.startsWith("subtotal_tercero")) return "encabezado del tercero · no suma";
  if (motivo === "sin_identificador") return "sin identificación · no suma";
  return "agrupadora · no suma";
}

/**
 * Total que el archivo imprime en el renglón de cada cuenta. Si la repite (al cambiar de página),
 * vale el primero: sumarlos duplicaría la cifra.
 */
export function totalesDeclaradosPorCuenta(
  filas: readonly (FilaRenglon & { clasificador?: string | null; datos: Record<string, unknown> })[],
  valorRol: string,
): Map<string, number> {
  const salida = new Map<string, number>();
  for (const fila of filas) {
    if (fila.tipoFila !== "agrupadora" || fila.motivo !== "seccion_cuenta") continue;
    const cuenta = fila.clasificador?.trim();
    const bruto = fila.datos[valorRol];
    const valor = typeof bruto === "number" ? bruto : typeof bruto === "string" && bruto.trim() !== "" ? Number(bruto) : Number.NaN;
    if (!cuenta || !Number.isFinite(valor) || salida.has(cuenta)) continue;
    salida.set(cuenta, valor);
  }
  return salida;
}

export type ControlSeccion = { declarado: number; diferencia: number; cuadra: boolean };

/**
 * Lo que suman los ítems de la cuenta contra lo que el archivo declara, con un peso de tolerancia.
 * Con el signo invertido también cuadra: es la convención de signo del reporte, no un faltante.
 */
export function controlSeccion(declarado: number, subtotal: number, tolerancia = 1): ControlSeccion {
  const diferencia = redondear(subtotal - declarado);
  return { declarado, diferencia, cuadra: Math.abs(diferencia) <= tolerancia || Math.abs(subtotal + declarado) <= tolerancia };
}

/** Encabezado de tercero ya cargado (Cartera, CxP): conserva el saldo que declara y no suma. */
export function esEncabezadoTercero(fila: { valor: number; datos: Record<string, unknown> }): boolean {
  return fila.valor === 0 && fila.datos[CLAVE_SALDO_DECLARADO] != null;
}

/** Posición de la columna del valor entre las visibles (-1 si está oculta o no existe). */
export function indiceColumnaValor<C extends { esValor?: boolean }>(columnas: readonly C[]): number {
  return columnas.findIndex((c) => c.esValor === true);
}
