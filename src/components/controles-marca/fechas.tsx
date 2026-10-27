"use client";

import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent as EventoTeclado } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/icons";
import { DIAS_SEMANA, MESES, aIso, deIso, hoyIso, permitido, semanasDelMes, sumarMeses } from "@/lib/marca/emergentes";
import { ATRIBUTO_EMERGENTE, CLASE_EMERGENTE, fijarValor, seguirAlControl, ubicarJunto } from "./comun";

/**
 * El calendario de los campos de fecha y de mes con la marca. El navegador abre el
 * suyo (del sistema operativo); aquí, el ícono del campo, Alt + ↓ / F4 y, en una
 * pantalla táctil, el toque abren este calendario en la paleta y en Lato. Los días
 * se siguen pudiendo escribir en el propio campo.
 */

type Abierto = { campo: HTMLInputElement; tipo: "date" | "month"; anio: number; mes: number; foco: string };

const SELECTOR = 'input[type="date"], input[type="month"]';
const ZONA_ICONO_PX = 34;

function inicial(campo: HTMLInputElement): Abierto {
  const tipo = campo.type === "month" ? "month" : "date";
  const hoy = hoyIso();
  const base = deIso(campo.value) ?? deIso(campo.max && campo.max < hoy ? campo.max : hoy)!;
  const foco = tipo === "month" ? aIso(base.anio, base.mes) : aIso(base.anio, base.mes, base.dia ?? 1);
  return { campo, tipo, anio: base.anio, mes: base.mes, foco };
}

export function FechasDeMarca() {
  const [abierto, setAbierto] = useState<Abierto | null>(null);
  const actual = useRef<Abierto | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    actual.current = abierto;
  }, [abierto]);

  useEffect(() => {
    const campoDe = (evento: Event): HTMLInputElement | null => {
      const objetivo = evento.target instanceof Element ? evento.target : null;
      const campo = objetivo?.closest(SELECTOR);
      return campo instanceof HTMLInputElement && !campo.disabled && !campo.readOnly ? campo : null;
    };
    const enIcono = (campo: HTMLInputElement, x: number) => x >= campo.getBoundingClientRect().right - ZONA_ICONO_PX;

    const alPresionar = (evento: MouseEvent | TouchEvent) => {
      const objetivo = evento.target instanceof Element ? evento.target : null;
      if (objetivo?.closest(`[${ATRIBUTO_EMERGENTE}="calendario"]`)) return;
      const campo = campoDe(evento);
      const tactil = typeof TouchEvent !== "undefined" && evento instanceof TouchEvent;
      if (campo && (tactil || enIcono(campo, (evento as MouseEvent).clientX))) {
        evento.preventDefault(); // no abre el calendario del sistema
        if (!tactil) campo.focus({ preventScroll: true });
        setAbierto((a) => (a?.campo === campo ? null : inicial(campo)));
        return;
      }
      if (actual.current) setAbierto(null);
    };
    // El calendario del sistema se abre al soltar el clic sobre el ícono.
    const alHacerClic = (evento: MouseEvent) => {
      const campo = campoDe(evento);
      if (campo && enIcono(campo, evento.clientX)) evento.preventDefault();
    };
    const alTeclear = (evento: KeyboardEvent) => {
      const campo = campoDe(evento);
      if (!campo) return;
      if ((evento.altKey && (evento.key === "ArrowDown" || evento.key === "ArrowUp")) || evento.key === "F4") {
        evento.preventDefault();
        setAbierto(inicial(campo));
      }
    };
    const cerrar = (evento: Event) => {
      const a = actual.current;
      if (!a) return;
      if (evento.type === "resize") return setAbierto(null);
      seguirAlControl(evento, panel.current, a.campo, () => panel.current && ubicarJunto(panel.current, a.campo), () => setAbierto(null));
    };

    document.addEventListener("mousedown", alPresionar, true);
    document.addEventListener("touchstart", alPresionar, { capture: true, passive: false });
    document.addEventListener("click", alHacerClic, true);
    document.addEventListener("keydown", alTeclear, true);
    window.addEventListener("scroll", cerrar, true);
    window.addEventListener("resize", cerrar);
    return () => {
      document.removeEventListener("mousedown", alPresionar, true);
      document.removeEventListener("touchstart", alPresionar, { capture: true } as EventListenerOptions);
      document.removeEventListener("click", alHacerClic, true);
      document.removeEventListener("keydown", alTeclear, true);
      window.removeEventListener("scroll", cerrar, true);
      window.removeEventListener("resize", cerrar);
    };
  }, []);

  useLayoutEffect(() => {
    const el = panel.current;
    if (!abierto || !el) return;
    ubicarJunto(el, abierto.campo);
    el.querySelector<HTMLElement>(`[data-fecha="${abierto.foco}"]`)?.focus({ preventScroll: true });
  }, [abierto]);

  if (!abierto) return null;
  const { campo, tipo, anio, mes, foco } = abierto;
  const min = campo.min || null;
  const max = campo.max || null;
  const elegida = campo.value;
  const hoy = tipo === "month" ? hoyIso().slice(0, 7) : hoyIso();

  const elegir = (iso: string) => {
    if (!permitido(iso, min, max)) return;
    if (campo.value !== iso) fijarValor(campo, iso);
    setAbierto(null);
    campo.focus({ preventScroll: true });
  };
  const navegar = (n: number) => {
    const s = tipo === "month" ? { anio: anio + n, mes } : sumarMeses(anio, mes, n);
    setAbierto({ ...abierto, ...s, foco: tipo === "month" ? aIso(s.anio, s.mes) : aIso(s.anio, s.mes, 1) });
  };
  const alTeclearEnPanel = (evento: EventoTeclado) => {
    const actualFoco = deIso(foco);
    if (!actualFoco) return;
    const paso: Record<string, number> = tipo === "month" ? { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -3, ArrowDown: 3 } : { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    if (evento.key in paso) {
      evento.preventDefault();
      if (tipo === "month") {
        const s = sumarMeses(actualFoco.anio, actualFoco.mes, paso[evento.key]);
        setAbierto({ ...abierto, anio: s.anio, mes: s.mes, foco: aIso(s.anio, s.mes) });
      } else {
        const f = new Date(Date.UTC(actualFoco.anio, actualFoco.mes - 1, (actualFoco.dia ?? 1) + paso[evento.key]));
        const iso = aIso(f.getUTCFullYear(), f.getUTCMonth() + 1, f.getUTCDate());
        setAbierto({ ...abierto, anio: f.getUTCFullYear(), mes: f.getUTCMonth() + 1, foco: iso });
      }
    } else if (evento.key === "PageUp" || evento.key === "PageDown") {
      evento.preventDefault();
      navegar(evento.key === "PageUp" ? -1 : 1);
    } else if (evento.key === "Escape") {
      evento.preventDefault();
      evento.stopPropagation();
      setAbierto(null);
      campo.focus({ preventScroll: true });
    }
  };

  const claseCelda = (iso: string, delMes: boolean) => {
    const fuera = !permitido(iso, min, max);
    if (iso === elegida) return "bg-navy-700 font-semibold text-white";
    if (fuera) return "cursor-not-allowed text-ink-200";
    return `${delMes ? "text-ink-800" : "text-ink-300"} hover:bg-blue-50 ${iso === hoy ? "font-semibold text-navy-800 ring-1 ring-inset ring-blue-500" : ""}`;
  };

  return createPortal(
    <div
      ref={panel}
      {...{ [ATRIBUTO_EMERGENTE]: "calendario" }}
      role="dialog"
      aria-label={tipo === "month" ? "Elegir mes" : "Elegir fecha"}
      style={{ top: 0, left: 0, visibility: "hidden" }}
      onKeyDown={alTeclearEnPanel}
      className={`${CLASE_EMERGENTE} w-[264px] p-3`}
    >
      <div className="mb-2 flex items-center justify-between">
        <button type="button" onClick={() => navegar(-1)} aria-label={tipo === "month" ? "Año anterior" : "Mes anterior"} className="rounded p-1 text-ink-500 hover:bg-ink-50 hover:text-navy-800">
          <Icon name="chev-l" size={15} />
        </button>
        <span className="text-[13px] font-semibold text-navy-800">{tipo === "month" ? anio : `${MESES[mes - 1]} de ${anio}`}</span>
        <button type="button" onClick={() => navegar(1)} aria-label={tipo === "month" ? "Año siguiente" : "Mes siguiente"} className="rounded p-1 text-ink-500 hover:bg-ink-50 hover:text-navy-800">
          <Icon name="chev-r" size={15} />
        </button>
      </div>
      {tipo === "date" ? (
        <div role="grid" className="grid grid-cols-7 gap-0.5 text-center">
          {DIAS_SEMANA.map((d) => (
            <span key={d} className="pb-1 text-[10.5px] font-semibold uppercase text-ink-500">{d}</span>
          ))}
          {semanasDelMes(anio, mes).flat().map((c) => (
            <button
              key={c.iso}
              type="button"
              data-fecha={c.iso}
              tabIndex={c.iso === foco ? 0 : -1}
              disabled={!permitido(c.iso, min, max)}
              aria-current={c.iso === hoy ? "date" : undefined}
              aria-pressed={c.iso === elegida}
              onClick={() => elegir(c.iso)}
              className={`h-8 rounded text-[12.5px] tabular-nums focus-visible:outline-2 focus-visible:outline-blue-500 ${claseCelda(c.iso, c.delMes)}`}
            >
              {c.dia}
            </button>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-1.5">
          {MESES.map((m, i) => {
            const iso = aIso(anio, i + 1);
            return (
              <button
                key={iso}
                type="button"
                data-fecha={iso}
                tabIndex={iso === foco ? 0 : -1}
                disabled={!permitido(iso, min, max)}
                aria-pressed={iso === elegida}
                onClick={() => elegir(iso)}
                className={`h-9 rounded text-[12.5px] capitalize focus-visible:outline-2 focus-visible:outline-blue-500 ${claseCelda(iso, true)}`}
              >
                {m.slice(0, 3)}
              </button>
            );
          })}
        </div>
      )}
      <div className="mt-2 flex items-center justify-between border-t border-ink-100 pt-2">
        {!campo.required ? (
          <button type="button" onClick={() => { if (campo.value) fijarValor(campo, ""); setAbierto(null); campo.focus({ preventScroll: true }); }} className="rounded px-2 py-1 text-[12px] font-medium text-ink-600 hover:bg-ink-50">
            Borrar
          </button>
        ) : (
          <span />
        )}
        <button
          type="button"
          disabled={!permitido(hoy, min, max)}
          onClick={() => elegir(hoy)}
          className="rounded px-2 py-1 text-[12px] font-semibold text-navy-800 hover:bg-blue-50 disabled:cursor-not-allowed disabled:text-ink-300"
        >
          {tipo === "month" ? "Este mes" : "Hoy"}
        </button>
      </div>
    </div>,
    document.body,
  );
}
