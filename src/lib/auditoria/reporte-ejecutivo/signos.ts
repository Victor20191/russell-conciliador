/**
 * Triángulos de las variaciones del reporte en SVG (toman el color del texto). ▲ y ▼
 * no existen en Lato y, en el PDF que arma el servidor, el navegador los tomaría de
 * cualquier fuente instalada (§2 del Manual de Marca).
 */
export const TRIANGULO_SUBE = '<svg aria-hidden="true" width="9" height="8" viewBox="0 0 10 8" fill="currentColor"><path d="M5 0 10 8H0z"/></svg>';
export const TRIANGULO_BAJA = '<svg aria-hidden="true" width="9" height="8" viewBox="0 0 10 8" fill="currentColor"><path d="M0 0h10L5 8z"/></svg>';

/**
 * Los reportes guardados antes de este cambio escribían ▲, ▼ y los rangos «A → B»:
 * se llevan a la forma actual (triángulo SVG y raya «A – B»), solo en el texto.
 */
export function signosDeMarca(html: string): string {
  return html.replace(/(<(style|script|title)\b[\s\S]*?<\/\2>)|(<[^>]*>)|([^<]+)/gi, (todo, _b, _e, _t, texto: string) =>
    texto ? texto.replace(/▲/g, TRIANGULO_SUBE).replace(/▼/g, TRIANGULO_BAJA).replace(/ → /g, " – ") : todo,
  );
}
