/**
 * Generación del código de cliente (p. ej. "C-1042").
 *
 * El código es de la forma `C-NNNN`. El siguiente se calcula a partir del
 * número más alto existente + 1. La misma función la usa la página (para
 * mostrar el preview en el modal) y el server action (como autoridad al
 * guardar), de modo que lo que ve el usuario coincide con lo que se persiste.
 */

const PREFIJO = "C-";
const BASE = 1000;

function formatear(n: number): string {
  return `${PREFIJO}${String(n).padStart(4, "0")}`;
}

export function nextClientCode(existingCodes: string[]): string {
  const tomados = new Set(existingCodes);
  let max = BASE;
  for (const code of existingCodes) {
    const m = /^C-(\d+)$/.exec(code);
    if (m) max = Math.max(max, Number(m[1]));
  }
  let n = max + 1;
  while (tomados.has(formatear(n))) n++;
  return formatear(n);
}
