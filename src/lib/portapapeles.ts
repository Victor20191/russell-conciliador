/**
 * Portapapeles con respaldo para contextos NO seguros.
 *
 * `navigator.clipboard` solo existe en un contexto seguro (https o localhost).
 * En despliegues servidos por IP sobre http —como el servidor de pruebas— el
 * objeto es `undefined`, así que cualquier acceso directo a
 * `navigator.clipboard.writeText` revienta con «Cannot read properties of
 * undefined». Aquí siempre se resuelve la escritura de forma defensiva y se cae
 * al camino legado (`document.execCommand("copy")`), que sigue funcionando sin
 * contexto seguro.
 */

export type ResultadoCopia = "clipboard" | "legacy";

type EscritorTexto = ((texto: string) => Promise<void>) | null;
type EscritorRico = ((html: string, texto: string) => Promise<void>) | null;
type CopiaLegado = ((contenido: string) => boolean) | null;

/** `true` si el navegador expone la Clipboard API (necesita contexto seguro). */
export function clipboardApiDisponible(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.clipboard?.writeText === "function";
}

function escritorTextoPredeterminado(): EscritorTexto {
  if (!clipboardApiDisponible()) return null;
  return (texto: string) => navigator.clipboard.writeText(texto);
}

function escritorRicoPredeterminado(): EscritorRico {
  if (typeof navigator === "undefined" || typeof navigator.clipboard?.write !== "function") return null;
  if (typeof ClipboardItem === "undefined") return null;
  return (html: string, texto: string) =>
    navigator.clipboard.write([
      new ClipboardItem({
        "text/html": new Blob([html], { type: "text/html" }),
        "text/plain": new Blob([texto], { type: "text/plain" }),
      }),
    ]);
}

function ejecutarCopiaLegado(preparar: () => HTMLElement, seleccionar: (nodo: HTMLElement) => void): boolean {
  if (typeof document === "undefined" || !document.body || typeof document.execCommand !== "function") {
    return false;
  }

  const activo = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const nodo = preparar();
  nodo.setAttribute("aria-hidden", "true");
  nodo.style.position = "fixed";
  nodo.style.top = "0";
  nodo.style.left = "-9999px";
  nodo.style.opacity = "0";
  nodo.style.pointerEvents = "none";
  document.body.appendChild(nodo);

  try {
    seleccionar(nodo);
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    nodo.remove();
    try {
      activo?.focus();
    } catch {
      // El elemento previo pudo desmontarse durante la copia; no invalida el resultado.
    }
  }
}

/**
 * Fallback de texto plano. El textarea vive fuera de la pantalla y se elimina en
 * el mismo evento de usuario; se restaura después el foco previo.
 */
export function copiarTextoLegacy(texto: string): boolean {
  return ejecutarCopiaLegado(
    () => {
      const textarea = document.createElement("textarea");
      textarea.value = texto;
      textarea.setAttribute("readonly", "");
      return textarea;
    },
    (nodo) => {
      const textarea = nodo as HTMLTextAreaElement;
      textarea.focus();
      textarea.select();
      textarea.setSelectionRange(0, textarea.value.length);
    },
  );
}

/**
 * Fallback CON formato: monta el HTML en un contenedor editable, lo selecciona y
 * copia. `execCommand("copy")` sobre una selección de HTML deja en el
 * portapapeles tanto `text/html` como su versión en texto plano, así que el
 * pegado en Gmail/Outlook conserva el diseño aunque no haya contexto seguro.
 */
export function copiarHtmlLegacy(html: string): boolean {
  const seleccion = typeof window !== "undefined" ? window.getSelection?.() ?? null : null;
  if (!seleccion) return false;

  return ejecutarCopiaLegado(
    () => {
      const contenedor = document.createElement("div");
      contenedor.setAttribute("contenteditable", "true");
      contenedor.innerHTML = html;
      return contenedor;
    },
    (nodo) => {
      const rango = document.createRange();
      rango.selectNodeContents(nodo);
      seleccion.removeAllRanges();
      seleccion.addRange(rango);
    },
  );
}

/**
 * Copia texto plano priorizando la Clipboard API y cayendo al camino legado.
 * Lanza únicamente cuando ambos fallan.
 */
export async function copiarTextoAlPortapapeles(
  texto: string,
  dependencias: { escribirTexto?: EscritorTexto; copiarLegacy?: CopiaLegado } = {},
): Promise<ResultadoCopia> {
  const escribirTexto =
    dependencias.escribirTexto === undefined ? escritorTextoPredeterminado() : dependencias.escribirTexto;
  const copiarLegacy = dependencias.copiarLegacy === undefined ? copiarTextoLegacy : dependencias.copiarLegacy;

  if (escribirTexto) {
    try {
      await escribirTexto(texto);
      return "clipboard";
    } catch {
      // El permiso puede fallar aun cuando la API exista; continúa al fallback.
    }
  }

  if (copiarLegacy?.(texto)) return "legacy";

  throw new Error(MENSAJE_COPIA_MANUAL);
}

export const MENSAJE_COPIA_MANUAL =
  "El navegador no permitió acceder al portapapeles. Selecciona el texto y usa Cmd+C o Ctrl+C.";

export type ResultadoCopiaRica = { via: ResultadoCopia; conFormato: boolean };

/**
 * Copia HTML + texto plano. Intenta, en orden: Clipboard API con `ClipboardItem`
 * (formato), `execCommand` sobre el HTML (formato, funciona sin contexto
 * seguro), `writeText` y por último `execCommand` sobre el texto. Lanza solo si
 * ningún camino copió algo.
 */
export async function copiarHtmlAlPortapapeles(
  html: string,
  textoPlano: string,
  dependencias: {
    escribirRico?: EscritorRico;
    escribirTexto?: EscritorTexto;
    legadoHtml?: CopiaLegado;
    legadoTexto?: CopiaLegado;
  } = {},
): Promise<ResultadoCopiaRica> {
  const escribirRico =
    dependencias.escribirRico === undefined ? escritorRicoPredeterminado() : dependencias.escribirRico;
  const escribirTexto =
    dependencias.escribirTexto === undefined ? escritorTextoPredeterminado() : dependencias.escribirTexto;
  const legadoHtml = dependencias.legadoHtml === undefined ? copiarHtmlLegacy : dependencias.legadoHtml;
  const legadoTexto = dependencias.legadoTexto === undefined ? copiarTextoLegacy : dependencias.legadoTexto;

  if (escribirRico) {
    try {
      await escribirRico(html, textoPlano);
      return { via: "clipboard", conFormato: true };
    } catch {
      // Algunos navegadores rechazan `text/html` en ClipboardItem; sigue el fallback.
    }
  }

  if (legadoHtml?.(html)) return { via: "legacy", conFormato: true };

  if (escribirTexto) {
    try {
      await escribirTexto(textoPlano);
      return { via: "clipboard", conFormato: false };
    } catch {
      // Sin permiso para la API; queda el camino legado en texto plano.
    }
  }

  if (legadoTexto?.(textoPlano)) return { via: "legacy", conFormato: false };

  throw new Error(MENSAJE_COPIA_MANUAL);
}
