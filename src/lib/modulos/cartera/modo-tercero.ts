// «¿Cómo viene el NIT del tercero?» en el editor del mapeo (Cartera y CxP). Puro: lo usa la
// pantalla.
//
// Hasta ahora solo la SUGERENCIA automática decidía si el reporte es de cabecera (una fila trae el
// tercero y sus documentos van debajo, sin NIT). Si el mapeo se armaba a mano, o la sugerencia
// tomaba otra columna como NIT, no había cómo decirlo y los documentos quedaban sin tercero
// (INDAER, 27/Nov/2026: los 65 documentos sin NIT).
import type { CeldaCruda } from "@/lib/balance/extraccion/ingesta";
import type { SpecModulo } from "../extraccion/esquema";
import { detectarTerceroModo } from "../extraccion/sugerir";

export type ModoTercero = "columna" | "cabecera";

/** Los roles del tercero en Cartera y CxP (`crucePorTercero.rolClave` / `rolNombre`). */
const ROL_CLAVE = "nit";
const ROL_NOMBRE = "nombre";

export function modoTerceroDe(spec: Pick<SpecModulo, "terceroModo">): ModoTercero {
  return spec.terceroModo === "cabecera" ? "cabecera" : "columna";
}

/**
 * El mapeo con el modo elegido. En «cabecera» los documentos heredan el NIT y el nombre de la
 * fila del cliente (arrastre); en «columna» cada fila trae el suyo y el arrastre que ya tuviera el
 * mapeo no se toca: solo actúa cuando una celda viene vacía.
 */
export function conModoTercero(spec: SpecModulo, modo: ModoTercero): SpecModulo {
  if (modo === "columna") return { ...spec, terceroModo: "columna" };
  const heredados = [ROL_CLAVE, ROL_NOMBRE].filter((rol) => (spec.columnas[rol] ?? 0) >= 1);
  return { ...spec, terceroModo: "cabecera", arrastrarRoles: [...new Set([...(spec.arrastrarRoles ?? []), ...heredados])] };
}

/**
 * ¿Las primeras filas de datos parecen de cabecera? El mismo criterio que la sugerencia
 * (`detectarTerceroModo`): filas con NIT y sin documento, y documentos sin NIT.
 */
export function muestraPareceCabecera(muestraFilas: readonly (readonly CeldaCruda[])[], columnas: SpecModulo["columnas"]): boolean {
  if ((columnas[ROL_CLAVE] ?? 0) < 1 || (columnas.documento ?? 0) < 1) return false;
  return detectarTerceroModo({ nombre: "muestra", filas: muestraFilas.map((f) => [...f]) }, { primeraFilaDatos: 1, columnas }, ROL_CLAVE) === "cabecera";
}
