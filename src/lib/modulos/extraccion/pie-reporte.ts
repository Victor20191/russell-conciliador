// Pie de página que el ERP imprime al final de cada hoja del reporte — puro.
//
// «Siesa Enterprise Net 1.25.0 · Pág. 1 / 1» (SIESA) o «SBS 1.25.0 · 1 / 1» (Mineralin). Su texto
// puede caer en la columna del identificador y el número de página en la del saldo: leído como una
// fila más era un tercero «Siesa Enterprise Net» que sumaba $1 al módulo (CxP de Aceros Mapa y de
// Mineralin). Se reconoce por la versión del software y porque todo lo demás de la fila son marcas
// de página: un tercero con importes nunca cumple las dos cosas.

/** Nombre de producto con versión de tres partes: «Siesa Enterprise Net 1.25.0», «SBS 1.25.0». */
const VERSION_SOFTWARE = /[a-z]{2,}.*\b\d+\.\d+\.\d+\b/i;
/** Lo único que acompaña a la versión en el pie: «Pág.», «Página», «de», «/» y números de página. */
const MARCA_PAGINA = /^(?:p[aá]g(?:ina)?\.?|de|\/|\d{1,4})$/i;

export function esPieDeReporte(celdas: readonly unknown[]): boolean {
  const textos = celdas
    .map((celda) => (celda == null ? "" : String(celda).trim()))
    .filter((texto) => texto !== "");
  if (!textos.some((texto) => VERSION_SOFTWARE.test(texto))) return false;
  return textos.every((texto) => VERSION_SOFTWARE.test(texto) || MARCA_PAGINA.test(texto));
}
