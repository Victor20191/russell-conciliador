"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/icons";
import { ATRIBUTO_EMERGENTE, CLASE_EMERGENTE, fijarValor, seguirAlControl, ubicarJunto } from "./comun";

/**
 * La lista de un `<select>` con la marca. El navegador la abre en una ventana del
 * sistema operativo (su fuente, sus colores, su resaltado azul); aquí se cancela
 * esa ventana y la misma lista se muestra en la paleta y en Lato. El `<select>`
 * sigue siendo el control: elegir cambia su valor y dispara sus eventos.
 */

type Opcion = { valor: string; texto: string; desactivada: boolean; grupo: string | null };
type Abierta = { select: HTMLSelectElement; opciones: Opcion[]; resaltada: number };

function aplica(elemento: Element | null): elemento is HTMLSelectElement {
  return elemento instanceof HTMLSelectElement && !elemento.multiple && elemento.size <= 1 && !elemento.disabled;
}

function opcionesDe(select: HTMLSelectElement): Opcion[] {
  return [...select.options]
    .filter((o) => !o.hidden)
    .map((o) => {
      const grupo = o.parentElement instanceof HTMLOptGroupElement ? o.parentElement : null;
      return { valor: o.value, texto: o.label || o.text, desactivada: o.disabled || Boolean(grupo?.disabled), grupo: grupo?.label ?? null };
    });
}

function siguienteHabilitada(opciones: Opcion[], desde: number, paso: number): number {
  for (let i = desde + paso; i >= 0 && i < opciones.length; i += paso) if (!opciones[i].desactivada) return i;
  return desde;
}

export function DesplegablesDeMarca() {
  const [abierta, setAbierta] = useState<Abierta | null>(null);
  const actual = useRef<Abierta | null>(null);
  const lista = useRef<HTMLDivElement>(null);
  const busqueda = useRef({ texto: "", hasta: 0 });
  useLayoutEffect(() => {
    actual.current = abierta;
  }, [abierta]);

  useEffect(() => {
    const abrir = (select: HTMLSelectElement) => {
      const opciones = opcionesDe(select);
      const elegida = opciones.findIndex((o) => o.valor === select.value);
      setAbierta({ select, opciones, resaltada: elegida >= 0 ? elegida : siguienteHabilitada(opciones, -1, 1) });
    };
    const cerrar = (volverAlControl: boolean) => {
      const a = actual.current;
      setAbierta(null);
      if (volverAlControl && a) a.select.focus({ preventScroll: true });
    };
    const elegir = (a: Abierta, indice: number) => {
      const opcion = a.opciones[indice];
      if (!opcion || opcion.desactivada) return;
      if (a.select.value !== opcion.valor) fijarValor(a.select, opcion.valor);
      cerrar(true);
    };

    const alPresionar = (evento: MouseEvent | TouchEvent) => {
      if (evento instanceof MouseEvent && evento.button !== 0) return;
      const objetivo = evento.target instanceof Element ? evento.target : null;
      if (objetivo?.closest(`[${ATRIBUTO_EMERGENTE}="desplegable"]`)) return;
      const select = objetivo?.closest("select") ?? null;
      if (aplica(select)) {
        evento.preventDefault(); // no abre la ventana del sistema
        if (evento instanceof MouseEvent) select.focus({ preventScroll: true });
        if (actual.current?.select === select) cerrar(false);
        else abrir(select);
        return;
      }
      if (actual.current) cerrar(false);
    };

    const alTeclear = (evento: KeyboardEvent) => {
      const a = actual.current;
      if (a) {
        const ultima = a.opciones.length - 1;
        const mover = (i: number) => {
          evento.preventDefault();
          setAbierta({ ...a, resaltada: Math.max(0, Math.min(ultima, i)) });
        };
        switch (evento.key) {
          case "ArrowDown": return mover(siguienteHabilitada(a.opciones, a.resaltada, 1));
          case "ArrowUp": return mover(siguienteHabilitada(a.opciones, a.resaltada, -1));
          case "PageDown": return mover(Math.min(ultima, a.resaltada + 8));
          case "PageUp": return mover(Math.max(0, a.resaltada - 8));
          case "Home": return mover(siguienteHabilitada(a.opciones, -1, 1));
          case "End": return mover(siguienteHabilitada(a.opciones, a.opciones.length, -1));
          case "Enter":
          case " ":
            evento.preventDefault();
            return elegir(a, a.resaltada);
          case "Escape":
            evento.preventDefault();
            evento.stopPropagation();
            return cerrar(true);
          case "Tab":
            return cerrar(false);
          default:
            if (evento.key.length === 1 && !evento.ctrlKey && !evento.metaKey && !evento.altKey) {
              // Búsqueda por las primeras letras, como la lista nativa.
              const ahora = Date.now();
              busqueda.current = { texto: (ahora < busqueda.current.hasta ? busqueda.current.texto : "") + evento.key.toLowerCase(), hasta: ahora + 700 };
              const i = a.opciones.findIndex((o) => !o.desactivada && o.texto.toLowerCase().startsWith(busqueda.current.texto));
              if (i >= 0) mover(i);
            }
            return;
        }
      }
      const select = evento.target instanceof Element ? evento.target : null;
      if (!aplica(select)) return;
      const abre = evento.key === " " || evento.key === "Enter" || evento.key === "F4" || (evento.altKey && (evento.key === "ArrowDown" || evento.key === "ArrowUp"));
      if (abre) {
        evento.preventDefault();
        abrir(select);
        return;
      }
      if (evento.key === "ArrowDown" || evento.key === "ArrowUp") {
        // Con la lista cerrada, las flechas pasan a la opción vecina (en macOS abrirían la ventana del sistema).
        evento.preventDefault();
        const opciones = opcionesDe(select);
        const desde = opciones.findIndex((o) => o.valor === select.value);
        const i = siguienteHabilitada(opciones, desde, evento.key === "ArrowDown" ? 1 : -1);
        if (i !== desde && opciones[i]) fijarValor(select, opciones[i].valor);
      }
    };

    const alDesplazar = (evento: Event) => {
      const a = actual.current;
      if (!a) return;
      seguirAlControl(evento, lista.current, a.select, () => lista.current && ubicarJunto(lista.current, a.select, 160), () => cerrar(false));
    };
    const alRedimensionar = () => actual.current && cerrar(false);

    document.addEventListener("mousedown", alPresionar, true);
    document.addEventListener("touchstart", alPresionar, { capture: true, passive: false });
    document.addEventListener("keydown", alTeclear, true);
    window.addEventListener("scroll", alDesplazar, true);
    window.addEventListener("resize", alRedimensionar);
    window.addEventListener("blur", alRedimensionar);
    return () => {
      document.removeEventListener("mousedown", alPresionar, true);
      document.removeEventListener("touchstart", alPresionar, { capture: true } as EventListenerOptions);
      document.removeEventListener("keydown", alTeclear, true);
      window.removeEventListener("scroll", alDesplazar, true);
      window.removeEventListener("resize", alRedimensionar);
      window.removeEventListener("blur", alRedimensionar);
    };
  }, []);

  useLayoutEffect(() => {
    const el = lista.current;
    if (!abierta || !el) return;
    ubicarJunto(el, abierta.select, 160);
    el.querySelector<HTMLElement>(`[data-indice="${abierta.resaltada}"]`)?.scrollIntoView({ block: "nearest" });
  }, [abierta]);

  if (!abierta) return null;
  const valor = abierta.select.value;
  return createPortal(
    <div
      ref={lista}
      {...{ [ATRIBUTO_EMERGENTE]: "desplegable" }}
      role="listbox"
      aria-label={abierta.select.getAttribute("aria-label") ?? abierta.select.name ?? undefined}
      style={{ top: 0, left: 0, visibility: "hidden" }}
      className={`${CLASE_EMERGENTE} max-h-[300px] max-w-[min(480px,calc(100vw-16px))] overflow-y-auto py-1`}
    >
      {abierta.opciones.map((o, i) => {
        const encabezado = o.grupo && (i === 0 || abierta.opciones[i - 1].grupo !== o.grupo) ? o.grupo : null;
        const elegida = o.valor === valor;
        return (
          <div key={i}>
            {encabezado && <div className="px-3 pb-1 pt-2 text-[10.5px] font-semibold uppercase tracking-wide text-ink-500">{encabezado}</div>}
            <div
              role="option"
              data-indice={i}
              aria-selected={elegida}
              aria-disabled={o.desactivada || undefined}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => !o.desactivada && setAbierta((a) => (a ? { ...a, resaltada: i } : a))}
              onClick={() => {
                if (o.desactivada) return;
                if (abierta.select.value !== o.valor) fijarValor(abierta.select, o.valor);
                setAbierta(null);
                abierta.select.focus({ preventScroll: true });
              }}
              className={`flex cursor-default items-center gap-2 py-1.5 pr-3 ${o.grupo ? "pl-5" : "pl-2.5"} ${
                o.desactivada ? "text-ink-300" : i === abierta.resaltada ? "bg-blue-50 text-navy-800" : ""
              } ${elegida ? "font-semibold text-navy-800" : ""}`}
            >
              <span className="inline-flex w-3.5 shrink-0 justify-center">{elegida && <Icon name="check" size={13} stroke={2.2} />}</span>
              <span className="whitespace-nowrap">{o.texto || " "}</span>
            </div>
          </div>
        );
      })}
    </div>,
    document.body,
  );
}
