import type { RolLecturaInventario } from "@/lib/modulos/extraccion/lectura-estructurada";

/** Tipo MIME del dato que se arrastra de la grilla a un campo. */
export const MIME_DATO = "application/x-russell-dato";

/** Cada campo con su color y su letra: la letra evita depender solo del color. */
export const COLOR_ROL: Record<RolLecturaInventario, string> = {
  tipo: "border-ai-500 bg-ai-100 text-ai-700",
  referencia: "border-blue-500 bg-blue-100 text-navy-700",
  descripcion: "border-ink-400 bg-ink-100 text-ink-700",
  cantidad: "border-warn-500 bg-warn-100 text-warn-700",
  valorUnitario: "border-ok-500 bg-ok-100 text-ok-700",
  valorTotal: "border-ok-700 bg-ok-100 text-ok-700",
};

export const claseBoton = "rounded-md border border-ink-200 bg-white px-2.5 py-1.5 text-[11.5px] font-semibold text-ink-700 hover:bg-ink-50 disabled:opacity-50";
export const claseBotonPrimario = "rounded-md bg-navy-700 px-3.5 py-2 text-[12px] font-semibold text-white hover:bg-navy-600 disabled:opacity-50";
export const claseCampo = "w-full min-w-0 rounded-md border border-ink-200 bg-white px-2.5 py-1.5 text-[12px] text-ink-700 outline-none focus:border-blue-400";

export function letraColumna(numero: number): string {
  let letras = "";
  for (let n = numero; n > 0; n = Math.floor((n - 1) / 26)) letras = String.fromCharCode(65 + ((n - 1) % 26)) + letras;
  return letras;
}
