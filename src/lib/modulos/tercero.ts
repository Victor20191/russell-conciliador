// Normalizador PURO (sin BD) del campo "tercero" de los módulos CAR/CXP: texto libre
// que puede traer "NIT nombre", solo nombre o solo NIT. Extrae el NIT (si lo hay) y lo
// deja en su clave CANÓNICA (núcleo sin dígito de verificación) para que dos informes
// con distinto DV para el mismo tercero crucen bajo la misma clave. Reúsa `nucleoNit`
// de `src/lib/nit.ts`: NO duplica la lógica de comparación de NIT.
import { nucleoNit } from "@/lib/nit";

export type TerceroNormalizado = { nitCanonico: string | null; nombre: string | null };

// Prefijo/label habitual delante del NIT ("NIT:", "NIT", "C.C.", "Cc", "Cedula"…).
const LABEL_NIT = /^(nit|c\.?c\.?|cedula|c[eé]dula)\s*[:\-]?\s*/i;

// Un NIT/cédula plausible: solo dígitos (con o sin puntos/guiones de miles/DV) y al
// menos 5 dígitos en total (mismo mínimo que `nitCoincide`). Se busca como TOKEN
// aislado (no pegado a letras) para no capturar un código que forme parte del nombre.
const TOKEN_NIT = /(?<![A-Za-zÁÉÍÓÚÑ0-9])(\d[\d.]*-?\d?)(?![A-Za-zÁÉÍÓÚÑ0-9])/;

/**
 * Extrae el NIT (clave canónica vía `nucleoNit`, sin DV) y el nombre de un texto libre
 * de tercero. No lanza: entrada vacía/no reconocible → `{ nitCanonico: null, nombre: null }`.
 */
export function normalizarTerceroModulo(terceroRaw: string | number | null | undefined): TerceroNormalizado {
  if (terceroRaw === null || terceroRaw === undefined) return { nitCanonico: null, nombre: null };
  const texto = String(terceroRaw).trim();
  if (!texto) return { nitCanonico: null, nombre: null };

  const match = TOKEN_NIT.exec(texto);
  if (!match) {
    // No hay ningún token numérico plausible: todo el texto es el nombre.
    return { nitCanonico: null, nombre: texto || null };
  }

  const nucleo = nucleoNit(match[1]);
  if (nucleo.length < 5) {
    // Token numérico demasiado corto para ser un NIT (p. ej. un año o un consecutivo):
    // se trata como parte del nombre, no se extrae nada.
    return { nitCanonico: null, nombre: texto || null };
  }

  // Quita el token del NIT y cualquier label/separadores sobrantes alrededor.
  const resto = (texto.slice(0, match.index) + texto.slice(match.index + match[0].length))
    .replace(LABEL_NIT, "")
    .replace(/^[\s:\-]+|[\s:\-]+$/g, "")
    .trim();

  return { nitCanonico: nucleo, nombre: resto || null };
}
