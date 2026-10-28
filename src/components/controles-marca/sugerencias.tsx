"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { filtrarSugerencias, type Sugerencia } from "@/lib/marca/emergentes";
import { ATRIBUTO_EMERGENTE, CLASE_EMERGENTE, fijarValor, seguirAlControl, ubicarJunto } from "./comun";

/**
 * Sugerencias de un campo con `<datalist>` con la marca. El navegador las muestra
 * en una lista suya (fuente y colores del sistema): aquí el campo deja de apuntar
 * a su `datalist` (el id queda en `data-rb-lista`) y la plataforma muestra las
 * mismas opciones, filtradas por lo escrito.
 */

const LISTA = "data-rb-lista";

type Abiertas = { campo: HTMLInputElement; opciones: Sugerencia[]; resaltada: number };

function desligar(campo: Element) {
  const id = campo.getAttribute("list");
  if (!id) return;
  campo.setAttribute(LISTA, id);
  campo.removeAttribute("list");
}

function opcionesDe(campo: HTMLInputElement): Sugerencia[] {
  const id = campo.getAttribute(LISTA);
  const datalist = id ? document.getElementById(id) : null;
  if (!(datalist instanceof HTMLDataListElement)) return [];
  return [...datalist.options].map((o) => ({ valor: o.value, texto: o.label && o.label !== o.value ? o.label : "" }));
}

export function SugerenciasDeMarca() {
  const [abiertas, setAbiertas] = useState<Abiertas | null>(null);
  const actual = useRef<Abiertas | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    actual.current = abiertas;
  }, [abiertas]);

  useEffect(() => {
    document.querySelectorAll("input[list]").forEach(desligar);
    const observador = new MutationObserver((cambios) => {
      for (const cambio of cambios) {
        if (cambio.type === "attributes") desligar(cambio.target as Element);
        cambio.addedNodes.forEach((nodo) => {
          if (!(nodo instanceof Element)) return;
          if (nodo.matches("input[list]")) desligar(nodo);
          nodo.querySelectorAll("input[list]").forEach(desligar);
        });
      }
    });
    observador.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["list"] });

    const mostrar = (campo: HTMLInputElement) => {
      const opciones = filtrarSugerencias(opcionesDe(campo), campo.value);
      if (opciones.length === 0) return setAbiertas(null);
      setAbiertas({ campo, opciones, resaltada: -1 });
    };
    const alEnfocarOEscribir = (evento: Event) => {
      const campo = evento.target;
      if (campo instanceof HTMLInputElement && campo.hasAttribute(LISTA) && !campo.disabled && !campo.readOnly) mostrar(campo);
    };
    const alSalir = (evento: FocusEvent) => {
      const a = actual.current;
      if (!a || evento.target !== a.campo) return;
      if (evento.relatedTarget instanceof Node && panel.current?.contains(evento.relatedTarget)) return;
      setAbiertas(null);
    };
    const alTeclear = (evento: KeyboardEvent) => {
      const a = actual.current;
      if (!a || evento.target !== a.campo) return;
      const ultima = a.opciones.length - 1;
      if (evento.key === "ArrowDown" || evento.key === "ArrowUp") {
        evento.preventDefault();
        const paso = evento.key === "ArrowDown" ? 1 : -1;
        setAbiertas({ ...a, resaltada: Math.max(0, Math.min(ultima, a.resaltada + paso)) });
      } else if (evento.key === "Enter" && a.resaltada >= 0) {
        evento.preventDefault();
        fijarValor(a.campo, a.opciones[a.resaltada].valor);
        setAbiertas(null);
      } else if (evento.key === "Escape") {
        evento.preventDefault();
        evento.stopPropagation();
        setAbiertas(null);
      }
    };
    const cerrar = (evento: Event) => {
      const a = actual.current;
      if (!a) return;
      if (evento.type === "resize") return setAbiertas(null);
      seguirAlControl(evento, panel.current, a.campo, () => panel.current && ubicarJunto(panel.current, a.campo, 180), () => setAbiertas(null));
    };

    document.addEventListener("focusin", alEnfocarOEscribir, true);
    document.addEventListener("input", alEnfocarOEscribir, true);
    document.addEventListener("focusout", alSalir, true);
    document.addEventListener("keydown", alTeclear, true);
    window.addEventListener("scroll", cerrar, true);
    window.addEventListener("resize", cerrar);
    return () => {
      observador.disconnect();
      document.removeEventListener("focusin", alEnfocarOEscribir, true);
      document.removeEventListener("input", alEnfocarOEscribir, true);
      document.removeEventListener("focusout", alSalir, true);
      document.removeEventListener("keydown", alTeclear, true);
      window.removeEventListener("scroll", cerrar, true);
      window.removeEventListener("resize", cerrar);
    };
  }, []);

  useLayoutEffect(() => {
    const el = panel.current;
    if (!abiertas || !el) return;
    ubicarJunto(el, abiertas.campo, 180);
    el.querySelector<HTMLElement>(`[data-indice="${abiertas.resaltada}"]`)?.scrollIntoView({ block: "nearest" });
  }, [abiertas]);

  if (!abiertas) return null;
  return createPortal(
    <div
      ref={panel}
      {...{ [ATRIBUTO_EMERGENTE]: "sugerencias" }}
      role="listbox"
      style={{ top: 0, left: 0, visibility: "hidden" }}
      className={`${CLASE_EMERGENTE} max-h-[280px] max-w-[min(520px,calc(100vw-16px))] overflow-y-auto py-1`}
    >
      {abiertas.opciones.map((o, i) => (
        <div
          key={`${o.valor}-${i}`}
          role="option"
          data-indice={i}
          aria-selected={i === abiertas.resaltada}
          onMouseDown={(e) => e.preventDefault()}
          onMouseEnter={() => setAbiertas((a) => (a ? { ...a, resaltada: i } : a))}
          onClick={() => {
            fijarValor(abiertas.campo, o.valor);
            setAbiertas(null);
          }}
          className={`flex cursor-default items-baseline gap-2 px-3 py-1.5 ${i === abiertas.resaltada ? "bg-blue-50 text-navy-800" : ""}`}
        >
          <span className="tabular-nums font-semibold text-navy-800">{o.valor}</span>
          {o.texto && <span className="truncate text-ink-600">{o.texto}</span>}
        </div>
      ))}
    </div>,
    document.body,
  );
}
