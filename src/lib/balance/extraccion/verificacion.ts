// Verificación CRUZADA determinista del mapping spec (sin IA, sin BD).
//
// El cuadre de partida doble no detecta columnas débito↔crédito intercambiadas
// (Σdéb = Σcré se cumple igual por simetría). Estas señales sí:
//  - la VOTACIÓN de orientación por fila (`orientacionControl` de
//    `transformarTabular`): con saldo inicial + movimientos, cada fila cuadra
//    solo en una orientación salvo que db=cr;
//  - la NATURALEZA de las clases PUC sobre el saldo final (solo convención
//    «firmado»): activo/gastos/costos con saldo ≥ 0, pasivo/patrimonio/ingresos
//    con saldo ≤ 0. Si casi ninguna hoja respeta su naturaleza, el mapeo de
//    saldos está mal — es señal para ESCALAR, nunca para corregir solo (las
//    cuentas correctoras —depreciaciones, provisiones— violan la naturaleza
//    legítimamente).
import type { CuentaCruda } from "@/lib/balance/calcular";
import type { MappingSpec } from "./esquema";
import type { OrientacionControl } from "./transformar";

// Mínimo de filas votantes para emitir veredicto (menos = sin evidencia).
const MIN_VOTOS_ORIENTACION = 5;
// Fracción de votos hacia un lado para declarar la orientación.
const UMBRAL_ORIENTACION = 0.8;

export type VeredictoOrientacion = "directa" | "invertida" | "indeterminada";

/**
 * Veredicto de la votación de orientación débito/crédito: «invertida» si ≥80%
 * de al menos 5 filas votantes cuadran SOLO con las columnas intercambiadas
 * (las ambiguas no votan). «indeterminada» sin evidencia suficiente.
 */
export function veredictoOrientacion(o: OrientacionControl | undefined): VeredictoOrientacion {
  if (!o) return "indeterminada";
  const votantes = o.directa + o.invertida;
  if (votantes < MIN_VOTOS_ORIENTACION) return "indeterminada";
  if (o.invertida / votantes >= UMBRAL_ORIENTACION) return "invertida";
  if (o.directa / votantes >= UMBRAL_ORIENTACION) return "directa";
  return "indeterminada";
}

/**
 * Devuelve el spec con las columnas de MOVIMIENTO intercambiadas
 * (débitos ↔ créditos). El intercambio va EN EL SPEC — no en los datos — para
 * que el editor de estructura, el perfil guardado y la huella queden coherentes
 * con la transformación aplicada.
 */
export function invertirColumnasMovimiento(spec: MappingSpec): MappingSpec {
  return {
    ...spec,
    columnas: { ...spec.columnas, debitos: spec.columnas.creditos, creditos: spec.columnas.debitos },
  };
}

// Naturaleza PUC por clase (primer dígito): débito (saldo ≥ 0) o crédito (≤ 0).
const CLASES_DEBITO = new Set(["1", "5", "6", "7", "8"]);
const CLASES_CREDITO = new Set(["2", "3", "4", "9"]);
// Mínimo de hojas con saldo para que la fracción sea significativa.
const MIN_HOJAS_NATURALEZA = 10;

/**
 * Fracción de hojas cuyo saldo final respeta la naturaleza de su clase PUC.
 * SOLO aplica con convención «firmado» (en «magnitud» todos los saldos van en
 * positivo y la señal no existe). Devuelve `null` si no aplica o no hay muestra
 * suficiente. Una fracción muy baja (< 0.3) delata columnas de saldo corridas o
 * un signo mal mapeado — el llamador la usa como señal de escalado.
 */
export function fraccionNaturalezaPUC(importReady: CuentaCruda[], signoCredito: string): number | null {
  if (signoCredito !== "firmado") return null;
  let muestra = 0;
  let conformes = 0;
  for (const c of importReady) {
    const clase = c.code[0];
    const saldo = c.balance;
    if (saldo === 0) continue;
    if (CLASES_DEBITO.has(clase)) {
      muestra++;
      if (saldo > 0) conformes++;
    } else if (CLASES_CREDITO.has(clase)) {
      muestra++;
      if (saldo < 0) conformes++;
    }
  }
  if (muestra < MIN_HOJAS_NATURALEZA) return null;
  return conformes / muestra;
}

// Umbral de escalado por naturaleza: por debajo, el mapeo de saldos es sospechoso.
export const UMBRAL_NATURALEZA_PUC = 0.3;
