export type ResultadoCopiaPrompt = "clipboard" | "legacy";

type DependenciasPortapapeles = {
  escribirTexto?: ((texto: string) => Promise<void>) | null;
  copiarLegacy?: ((texto: string) => boolean) | null;
};

/**
 * Fallback para navegadores o contextos donde Clipboard API no está disponible
 * o deniega el permiso. El textarea vive fuera de la pantalla y se elimina en el
 * mismo evento de usuario; se restaura después el foco previo.
 */
export function copiarTextoLegacy(texto: string): boolean {
  if (typeof document === "undefined" || !document.body || typeof document.execCommand !== "function") {
    return false;
  }

  const activo = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const textarea = document.createElement("textarea");
  textarea.value = texto;
  textarea.setAttribute("readonly", "");
  textarea.setAttribute("aria-hidden", "true");
  textarea.style.position = "fixed";
  textarea.style.inset = "0 auto auto -9999px";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);

  try {
    textarea.focus();
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    textarea.remove();
    try {
      activo?.focus();
    } catch {
      // El elemento previo pudo desmontarse durante la copia; no invalida el resultado.
    }
  }
}

/**
 * Copia texto plano priorizando Clipboard API. Si el navegador la bloquea o no
 * la ofrece, intenta el fallback síncrono de `execCommand("copy")` mientras el
 * gesto de clic sigue activo. Lanza únicamente cuando ambos caminos fallan.
 */
export async function copiarPromptAlPortapapeles(
  texto: string,
  dependencias: DependenciasPortapapeles = {},
): Promise<ResultadoCopiaPrompt> {
  const escribirTexto = dependencias.escribirTexto === undefined
    ? typeof navigator !== "undefined" && navigator.clipboard?.writeText
      ? (contenido: string) => navigator.clipboard.writeText(contenido)
      : null
    : dependencias.escribirTexto;
  const copiarLegacy = dependencias.copiarLegacy === undefined
    ? copiarTextoLegacy
    : dependencias.copiarLegacy;

  if (escribirTexto) {
    try {
      await escribirTexto(texto);
      return "clipboard";
    } catch {
      // El permiso puede fallar aun cuando la API exista; continúa al fallback.
    }
  }

  if (copiarLegacy?.(texto)) return "legacy";

  throw new Error("El navegador no permitió acceder al portapapeles. Selecciona el texto y usa Cmd+C o Ctrl+C.");
}
