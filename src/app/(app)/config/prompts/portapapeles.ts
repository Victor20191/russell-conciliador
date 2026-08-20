/**
 * La copia de prompts reutiliza el portapapeles compartido de `@/lib/portapapeles`,
 * que además de la Clipboard API mantiene el respaldo con `execCommand("copy")`
 * para los despliegues servidos sobre http (donde `navigator.clipboard` no existe).
 */
import { copiarTextoAlPortapapeles, copiarTextoLegacy, type ResultadoCopia } from "@/lib/portapapeles";

export type ResultadoCopiaPrompt = ResultadoCopia;

export { copiarTextoLegacy };

type DependenciasPortapapeles = {
  escribirTexto?: ((texto: string) => Promise<void>) | null;
  copiarLegacy?: ((texto: string) => boolean) | null;
};

export function copiarPromptAlPortapapeles(
  texto: string,
  dependencias: DependenciasPortapapeles = {},
): Promise<ResultadoCopiaPrompt> {
  return copiarTextoAlPortapapeles(texto, dependencias);
}
