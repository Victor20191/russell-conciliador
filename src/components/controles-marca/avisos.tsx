"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { posicionAviso } from "@/lib/marca/emergentes";
import { CAPA_AVISO, vista } from "./comun";

/**
 * Avisos de `title` con la marca. El navegador los dibuja con la fuente y los
 * colores del sistema operativo; aquí, al pasar el mouse o llegar con el teclado,
 * el texto se muestra en un aviso Space Blue con Lato. El atributo se aparta
 * mientras tanto (si no, aparecerían los dos) y vuelve al salir.
 */

const GUARDADO = "data-rb-aviso";
const DEMORA_MS = 450;

type Aviso = { texto: string; ancla: DOMRect };

export function AvisosDeMarca() {
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const caja = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let actual: Element | null = null;
    let reloj: number | undefined;

    const devolver = () => {
      window.clearTimeout(reloj);
      if (actual) {
        const texto = actual.getAttribute(GUARDADO);
        if (texto != null && !actual.hasAttribute("title")) actual.setAttribute("title", texto);
        actual.removeAttribute(GUARDADO);
        actual = null;
      }
      setAviso(null);
    };

    const tomar = (elemento: Element) => {
      if (elemento === actual) return;
      devolver();
      const texto = elemento.getAttribute("title");
      if (!texto?.trim()) return;
      elemento.setAttribute(GUARDADO, texto);
      elemento.removeAttribute("title");
      actual = elemento;
      reloj = window.setTimeout(() => {
        if (actual === elemento && elemento.isConnected) setAviso({ texto: texto.trim(), ancla: elemento.getBoundingClientRect() });
      }, DEMORA_MS);
    };

    const alEntrar = (evento: Event) => {
      if (evento instanceof PointerEvent && evento.pointerType === "touch") return;
      const objetivo = evento.target instanceof Element ? evento.target : null;
      const elemento = objetivo?.closest(`[title], [${GUARDADO}]`);
      if (!elemento) {
        if (actual && !(objetivo && actual.contains(objetivo))) devolver();
        return;
      }
      if (elemento === actual) return;
      tomar(elemento);
    };

    const alSalir = (evento: PointerEvent) => {
      if (!actual) return;
      const hacia = evento.relatedTarget;
      if (hacia instanceof Node && actual.contains(hacia)) return;
      devolver();
    };

    const alTeclear = (evento: KeyboardEvent) => {
      if (evento.key === "Escape") devolver();
    };

    document.addEventListener("pointerover", alEntrar, true);
    document.addEventListener("pointerout", alSalir, true);
    document.addEventListener("focusin", alEntrar, true);
    document.addEventListener("focusout", devolver, true);
    document.addEventListener("pointerdown", devolver, true);
    document.addEventListener("keydown", alTeclear, true);
    window.addEventListener("scroll", devolver, true);
    return () => {
      devolver();
      document.removeEventListener("pointerover", alEntrar, true);
      document.removeEventListener("pointerout", alSalir, true);
      document.removeEventListener("focusin", alEntrar, true);
      document.removeEventListener("focusout", devolver, true);
      document.removeEventListener("pointerdown", devolver, true);
      document.removeEventListener("keydown", alTeclear, true);
      window.removeEventListener("scroll", devolver, true);
    };
  }, []);

  useLayoutEffect(() => {
    const el = caja.current;
    if (!aviso || !el) return;
    const { top, left } = posicionAviso(aviso.ancla, { ancho: el.offsetWidth, alto: el.offsetHeight }, vista());
    el.style.top = `${top}px`;
    el.style.left = `${left}px`;
    el.style.visibility = "visible";
  }, [aviso]);

  if (!aviso) return null;
  return createPortal(
    <div
      ref={caja}
      role="tooltip"
      style={{ top: 0, left: 0, visibility: "hidden" }}
      className={`pointer-events-none fixed ${CAPA_AVISO} max-w-[320px] whitespace-pre-line rounded-md bg-navy-800 px-2.5 py-1.5 text-[11.5px] leading-snug text-white shadow-md`}
    >
      {aviso.texto}
    </div>,
    document.body,
  );
}
