/**
 * El reporte ejecutivo de uso y adopción se construye ENTERO en código: cifras,
 * tablas y la lectura editorial (`elegirLecturaConsistente`). Ya no llama a
 * ningún proveedor de IA —lo hacía con OpenCode Go/Kimi K3— porque el modelo
 * elegía la frase editorial entre un vocabulario cerrado y, aun con
 * temperatura 0, cambiaba entre generaciones del MISMO período.
 *
 * Las constantes de OpenCode se conservan para no romper configuraciones ni
 * otros usos del cliente, pero este flujo ya no las usa.
 */

/** Queda en la instantánea, en lugar del modelo, para saber cómo se produjo. */
export const MODELO_REPORTE_DETERMINISTA = "determinista";

export const MODELO_REPORTE_EJECUTIVO_USO =
  process.env.OPENCODE_MODEL?.trim() || "kimi-k3";
const TEMPERATURA_ENV = Number(process.env.OPENCODE_TEMPERATURE ?? "0");
export const TEMPERATURA_REPORTE_EJECUTIVO_USO =
  Number.isFinite(TEMPERATURA_ENV) && TEMPERATURA_ENV >= 0 && TEMPERATURA_ENV <= 2
    ? TEMPERATURA_ENV
    : 0;
export const VERSION_PROMPT_REPORTE_EJECUTIVO_USO =
  "reporte-para-gerencia-claro-v13";

/**
 * Tope de salida por intento (el reintento usa el reducido). La respuesta final
 * es un JSON breve de lectura editorial; este margen contempla también el
 * razonamiento del modelo. El HTML factual se construye en la aplicación.
 */
const MAX_TOKENS_ENV = Number(process.env.OPENCODE_MAX_TOKENS ?? "16000");
export const MAX_TOKENS_REPORTE_EJECUTIVO_USO =
  Number.isFinite(MAX_TOKENS_ENV) && MAX_TOKENS_ENV >= 4_000 ? Math.floor(MAX_TOKENS_ENV) : 16_000;
export const MAX_TOKENS_REPORTE_EJECUTIVO_USO_REINTENTO = Math.floor(
  MAX_TOKENS_REPORTE_EJECUTIVO_USO * 0.75,
);

export type ReporteEjecutivoUso = {
  titulo: string;
  html: string;
};
