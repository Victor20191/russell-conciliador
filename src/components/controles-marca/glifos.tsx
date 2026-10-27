"use client";

import { useEffect } from "react";
import { glifosDeEntrada, glifosDeMarca, necesitaGlifos } from "@/lib/marca/glifos";

/**
 * Glifos de la marca en todo lo que se muestra y se escribe (§2): un emoji o un
 * símbolo que no tengan Lato ni Arial —el texto de un ticket, un comentario, un
 * nombre traído de un archivo— lo dibujaría una fuente del sistema. Al mostrarse
 * se cambia por su equivalente o se retira (`glifosDeMarca`); el texto guardado no
 * cambia. Al escribir, el campo no los recibe (`glifosDeEntrada`).
 */

// Lo que la persona está editando no se toca al mostrar (se filtra al escribir).
const NO_TOCAR = "textarea, input, select, [contenteditable], script, style, noscript";
const CAMPOS_DE_TEXTO = new Set(["text", "search", ""]);

const tieneClave = (objeto: object, prefijo: string) => Object.keys(objeto).find((k) => k.startsWith(prefijo));

type PropsReact = { children?: unknown; dangerouslySetInnerHTML?: unknown } | undefined;

/**
 * React ya tomó este texto (hidratación): cambiarlo antes sería un desajuste entre lo
 * que pintó el servidor y lo que espera React. React marca cada nodo que toma con una
 * propiedad interna `__reactFiber$…`. Hay dos casos sin marca propia: el texto que es
 * el único hijo de un elemento (React lo pone como contenido del elemento) y lo que va
 * dentro de `dangerouslySetInnerHTML`; ahí vale el elemento que lo declara.
 */
function hidratado(nodo: Text): boolean {
  if (tieneClave(nodo, "__reactFiber$")) return true;
  for (let el = nodo.parentElement, primero = true; el; el = el.parentElement, primero = false) {
    const clave = tieneClave(el, "__reactProps$");
    if (!clave) continue;
    const props = (el as unknown as Record<string, PropsReact>)[clave];
    if (props?.dangerouslySetInnerHTML) return true;
    return primero && (typeof props?.children === "string" || typeof props?.children === "number");
  }
  return false;
}

// Textos que esperan a que React los tome: se revisan cada 50 ms (hasta 15 s), para que
// queden ajustados apenas se hidratan, sin que se alcance a ver el glifo ajeno.
const pendientes = new Map<Text, number>();
let revision: number | null = null;
const ESPERA_MAXIMA_MS = 15_000;

function programarRevision(): void {
  if (revision != null) return;
  revision = window.setTimeout(() => {
    revision = null;
    const ahora = Date.now();
    for (const [nodo, desde] of pendientes) {
      if (!nodo.isConnected || ahora - desde > ESPERA_MAXIMA_MS) pendientes.delete(nodo);
      else ajustarTexto(nodo);
    }
    if (pendientes.size) programarRevision();
  }, 50);
}

function ajustarTexto(nodo: Text): void {
  const valor = nodo.nodeValue;
  if (!valor || !necesitaGlifos(valor)) {
    pendientes.delete(nodo);
    return;
  }
  const padre = nodo.parentElement;
  if (!padre || padre.closest(NO_TOCAR)) return;
  if (!hidratado(nodo)) {
    if (!pendientes.has(nodo)) pendientes.set(nodo, Date.now());
    programarRevision();
    return;
  }
  pendientes.delete(nodo);
  const nuevo = glifosDeMarca(valor);
  if (nuevo !== valor) nodo.nodeValue = nuevo;
}

function recorrer(raiz: Node): void {
  if (raiz.nodeType === Node.TEXT_NODE) {
    ajustarTexto(raiz as Text);
    return;
  }
  if (raiz.nodeType !== Node.ELEMENT_NODE && raiz.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) return;
  const caminante = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT);
  for (let nodo = caminante.nextNode(); nodo; nodo = caminante.nextNode()) ajustarTexto(nodo as Text);
}

export function GlifosDeMarca() {
  useEffect(() => {
    // Lo que React pinta después (navegación, datos nuevos) se ajusta al aparecer.
    const observador = new MutationObserver((cambios) => {
      for (const cambio of cambios) {
        if (cambio.type === "characterData") ajustarTexto(cambio.target as Text);
        else cambio.addedNodes.forEach(recorrer);
      }
    });
    observador.observe(document.body, { subtree: true, childList: true, characterData: true });
    // Lo que llegó del servidor: ya (lo que React aún no tomó queda pendiente y se ajusta
    // apenas se hidrata) y otra vez al terminar la carga.
    recorrer(document.body);
    const repasar = () => recorrer(document.body);
    window.addEventListener("load", repasar, { once: true });

    const alEscribir = (evento: Event) => {
      const campo = evento.target;
      const esTexto = campo instanceof HTMLTextAreaElement || (campo instanceof HTMLInputElement && CAMPOS_DE_TEXTO.has(campo.getAttribute("type")?.toLowerCase() ?? ""));
      if (!esTexto || (evento as InputEvent).isComposing) return;
      const valor = campo.value;
      if (!necesitaGlifos(valor)) return;
      const nuevo = glifosDeEntrada(valor);
      if (nuevo === valor) return;
      const cursor = glifosDeEntrada(valor.slice(0, campo.selectionStart ?? valor.length)).length;
      // Antes de que React lea el evento (fase de captura en la ventana): React recibe el valor ya limpio.
      Object.getOwnPropertyDescriptor(campo instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, "value")?.set?.call(campo, nuevo);
      try {
        campo.setSelectionRange(cursor, cursor);
      } catch {
        // algunos tipos no admiten selección
      }
    };
    window.addEventListener("input", alEscribir, true);
    window.addEventListener("compositionend", alEscribir, true);
    return () => {
      if (revision != null) window.clearTimeout(revision);
      revision = null;
      pendientes.clear();
      window.removeEventListener("load", repasar);
      observador.disconnect();
      window.removeEventListener("input", alEscribir, true);
      window.removeEventListener("compositionend", alEscribir, true);
    };
  }, []);
  return null;
}
