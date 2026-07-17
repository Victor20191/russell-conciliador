// Huella del LAYOUT de un archivo de balance + detección determinista de NIT.
//
// La huella identifica la ESTRUCTURA del archivo (hoja + fila de encabezado
// normalizada) para reutilizar el perfil de carga guardado del cliente sin
// llamar a la IA: mismo export del mismo ERP ⇒ misma huella ⇒ mismo MappingSpec.
// Puro salvo `node:crypto` (sha256); testeable en Vitest (entorno node).
//
// OJO indexación: las grillas de `ingesta.ts` vienen SIN filas vacías
// (`includeEmpty: false` + filtro), y tanto la vista previa que ve el modelo
// como `spec.filaEncabezado` numeran 1-based sobre esa grilla filtrada — las
// huellas calculadas aquí usan la misma numeración.
import { createHash } from "node:crypto";
import type { CeldaCruda, GridHoja } from "./ingesta";

/** Texto normalizado de una celda: minúsculas, sin tildes, espacios colapsados. */
function textoNormalizado(c: CeldaCruda): string {
  if (c == null) return "";
  return String(c)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Fila de encabezado normalizada: celdas NO vacías unidas con "|" ("" si no hay). */
export function normalizarEncabezado(celdas: CeldaCruda[]): string {
  return celdas.map(textoNormalizado).filter((s) => s !== "").join("|");
}

/**
 * Huella del layout: sha256 hex corto (16) de `hoja normalizada + "\n" +
 * encabezado normalizado`. `null` si la fila no tiene contenido utilizable.
 */
export function calcularHuella(nombreHoja: string, filaEncabezado: CeldaCruda[]): string | null {
  const encabezado = normalizarEncabezado(filaEncabezado);
  if (!encabezado) return null;
  return createHash("sha256").update(`${textoNormalizado(nombreHoja)}\n${encabezado}`).digest("hex").slice(0, 16);
}

export type HuellaCandidata = { hoja: string; fila: number; huella: string };

/**
 * Huellas candidatas para buscar un perfil guardado SIN conocer aún la fila de
 * encabezado: se calculan sobre las primeras `maxFilas` de cada hoja (deduplicadas
 * por huella, conservando la primera aparición). El lookup en BD es `huella IN (...)`.
 */
export function huellasCandidatas(hojas: GridHoja[], maxFilas = 15): HuellaCandidata[] {
  const vistas = new Set<string>();
  const candidatas: HuellaCandidata[] = [];
  for (const hoja of hojas) {
    const filas = hoja.filas.slice(0, maxFilas);
    filas.forEach((fila, i) => {
      const huella = calcularHuella(hoja.nombre, fila);
      if (!huella || vistas.has(huella)) return;
      vistas.add(huella);
      candidatas.push({ hoja: hoja.nombre, fila: i + 1, huella });
    });
  }
  return candidatas;
}

// ---------------- Detección determinista de NIT ----------------

// Label + número en la MISMA celda: «NIT: 890.903.938-8», «N.I.T 800123456»,
// «Nit 900451227-3». Exige el label — nunca adivina por números sueltos.
const NIT_EN_CELDA = /\bn\.?\s*i\.?\s*t\.?\b[\s.:;#°-]*([0-9][\d.\s]{4,14}\d)(?:\s*-\s*\d)?/i;

// Celda que ES el label (el número viene en una celda siguiente de la fila).
const NIT_SOLO_LABEL = /^n\.?\s*i\.?\s*t\.?\s*[.:;#]?$/i;

// Número de identificación plausible: 6-15 dígitos con puntos/espacios de miles,
// DV opcional con guion.
const NUMERO_NIT = /^([0-9][\d.\s]{4,14}\d)(?:\s*-\s*\d)?$/;

function soloDigitos(s: string): string {
  return s.replace(/\D/g, "");
}

/**
 * Busca el NIT del cliente en las primeras filas del archivo de forma
 * DETERMINISTA (sin IA): celda «NIT: <número>» o celda-label «NIT» seguida del
 * número. Devuelve solo los dígitos del número principal (sin el DV separado
 * por guion), o `null` si no hay un label explícito.
 */
export function detectarNit(hojas: GridHoja[], maxFilas = 15, maxCols = 12): string | null {
  for (const hoja of hojas) {
    for (const fila of hoja.filas.slice(0, maxFilas)) {
      const celdas = fila.slice(0, maxCols);
      for (let j = 0; j < celdas.length; j++) {
        const s = celdas[j] == null ? "" : String(celdas[j]).trim();
        if (!s) continue;
        const enCelda = NIT_EN_CELDA.exec(s);
        if (enCelda) {
          const digitos = soloDigitos(enCelda[1]);
          if (digitos.length >= 6) return digitos;
        }
        if (NIT_SOLO_LABEL.test(s)) {
          // El número está en la siguiente celda NO vacía de la fila.
          for (let k = j + 1; k < celdas.length; k++) {
            const v = celdas[k] == null ? "" : String(celdas[k]).trim();
            if (!v) continue;
            const num = NUMERO_NIT.exec(v);
            if (num) {
              const digitos = soloDigitos(num[1]);
              if (digitos.length >= 6) return digitos;
            }
            break; // la celda contigua no era un número → no seguir barriendo
          }
        }
      }
    }
  }
  return null;
}
