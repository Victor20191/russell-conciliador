"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/icons";
import { filtrarFicha } from "@/lib/ayuda/buscar";
import { cicloDisponible, filtrarPasos } from "@/lib/ayuda/ciclo";
import { fichaAyuda } from "@/lib/ayuda/fichas";
import { CODIGOS_MODULOS, resolverAyuda } from "@/lib/ayuda/resolver";
import { moduloDelPermiso, MODULOS_PLATAFORMA_KEYS } from "@/lib/rbac/modulos-plataforma";
import ContenidoAyuda from "./contenido-ayuda";
import { ID_PANEL_AYUDA, useAccionesAyuda, useEstadoAyuda } from "./contexto";
import type { DatosPanelAyuda } from "./ranura-panel-ayuda";
import VistaCiclo from "./vista-ciclo";

const ID_TITULO = "titulo-panel-ayuda";

type Vista = "pantalla" | "ciclo";
const VISTAS: { id: Vista; label: string }[] = [
  { id: "pantalla", label: "Esta pantalla" },
  { id: "ciclo", label: "Ciclo del cliente" },
];

/** En pantallas angostas el panel tapa todo el contenido: al seguir uno de sus enlaces se cierra. */
function esPantallaAngosta(): boolean {
  return window.matchMedia("(max-width: 639px)").matches;
}

/**
 * Panel lateral de la ayuda: se superpone a la derecha del contenido, debajo de la barra superior
 * (la página no se reacomoda y el botón «?» sigue a la vista); en pantallas angostas ocupa todo el
 * ancho. No es un diálogo: no atrapa el foco ni bloquea la página. Se cierra con la X, con el mismo
 * botón «?» o con Escape mientras el foco esté dentro del panel. En Balance, sus borradores y los
 * Módulos tiene una segunda vista, el ciclo del cliente; en las demás pantallas solo la de la
 * pantalla. Al navegar vuelve a la de la pantalla.
 */
export default function PanelAyuda({ rolesAyuda, rol, permisos, modulosVisibles }: DatosPanelAyuda) {
  const pathname = usePathname();
  const { cerrar } = useAccionesAyuda();
  const { pestanaActiva } = useEstadoAyuda();
  const resuelta = useMemo(() => resolverAyuda(pathname), [pathname]);
  const ficha = useMemo(() => (resuelta ? fichaAyuda(resuelta) : null), [resuelta]);
  const [vistaElegida, setVista] = useState<Vista>("pantalla");
  const conCiclo = cicloDisponible(resuelta);
  const vista: Vista = conCiclo ? vistaElegida : "pantalla";
  const [busqueda, setBusqueda] = useState("");
  const [elegida, setElegida] = useState<string | null>(null);

  // Al cambiar de pantalla o de pestaña, el panel vuelve a la pestaña en la que está el usuario
  // (ajuste de estado en render, sin efecto); al cambiar de pantalla, también a la vista de la
  // pantalla y sin búsqueda.
  const [previo, setPrevio] = useState({ pathname, pestanaActiva });
  if (previo.pathname !== pathname || previo.pestanaActiva !== pestanaActiva) {
    setPrevio({ pathname, pestanaActiva });
    setElegida(null);
    if (previo.pathname !== pathname) {
      setVista("pantalla");
      setBusqueda("");
    }
  }

  const tituloRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    tituloRef.current?.focus({ preventScroll: true });
  }, []);

  // Los pasos de módulos del ciclo enlazan al módulo de la ruta o, si no hay, al primero del menú.
  const modulo = resuelta?.modulo ?? CODIGOS_MODULOS[0] ?? "INV";
  const pestanas = ficha?.pestanas ?? [];
  const anunciada = pestanas.some((p) => p.id === pestanaActiva) ? pestanaActiva : null;
  const pestanaId = elegida ?? anunciada ?? pestanas[0]?.id ?? null;

  const { ficha: fichaVisible, coincidencias: coincidenciasFicha } = useMemo(
    () => (ficha ? filtrarFicha(ficha, busqueda) : { ficha: null, coincidencias: -1 }),
    [ficha, busqueda],
  );
  const pasos = useMemo(() => filtrarPasos(busqueda), [busqueda]);
  const hayBusqueda = busqueda.trim() !== "";
  const coincidencias = vista === "pantalla" ? coincidenciasFicha : hayBusqueda ? pasos.length : -1;
  const buscando = coincidencias >= 0;
  const conBuscador = vista !== "pantalla" || !!ficha;

  const puedeAbrir = (permiso: string) => {
    const m = moduloDelPermiso(permiso);
    return permisos.includes(permiso) && (!MODULOS_PLATAFORMA_KEYS.has(m) || modulosVisibles.includes(m));
  };
  const alNavegar = () => {
    if (esPantallaAngosta()) cerrar();
  };
  const titulo = vista === "pantalla" ? (ficha?.titulo ?? "Esta pantalla") : VISTAS.find((v) => v.id === vista)!.label;

  return (
    <aside
      id={ID_PANEL_AYUDA}
      aria-labelledby={ID_TITULO}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          cerrar();
        }
      }}
      className="absolute inset-y-0 right-0 z-20 flex w-full flex-col border-l border-ink-150 bg-white shadow-2xl sm:w-[400px] xl:w-[420px]"
    >
      <div className="flex items-start gap-2 border-b border-ink-100 px-4 py-3">
        <Icon name="help-circle" size={18} className="mt-1 shrink-0 text-blue-500" />
        <div className="min-w-0 flex-1">
          <p className="text-[10.5px] font-semibold uppercase tracking-wider text-ink-400">Ayuda</p>
          <h2 id={ID_TITULO} ref={tituloRef} tabIndex={-1} className="text-[14px] font-semibold leading-snug text-ink-800 outline-none">
            {titulo}
          </h2>
        </div>
        <button
          type="button"
          onClick={cerrar}
          aria-label="Cerrar ayuda"
          className="rounded p-1 text-ink-400 hover:bg-ink-50 hover:text-ink-700"
        >
          <Icon name="x" size={16} />
        </button>
      </div>
      {conCiclo && (
        <div role="group" aria-label="Vista de la ayuda" className="flex gap-1 border-b border-ink-100 px-4 py-2">
          {VISTAS.map((v) => (
            <button
              key={v.id}
              type="button"
              aria-pressed={vista === v.id}
              onClick={() => setVista(v.id)}
              className={`rounded-md px-2 py-1 text-[11.5px] font-semibold transition ${
                vista === v.id ? "bg-navy-700 text-white" : "text-ink-600 hover:bg-ink-50"
              }`}
            >
              {v.label}
            </button>
          ))}
        </div>
      )}
      {conBuscador && (
        <div className="border-b border-ink-100 px-4 py-2">
          <label className="relative block">
            <span className="sr-only">Buscar en esta ayuda</span>
            <Icon name="search" size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-400" />
            <input
              type="search"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar en esta ayuda"
              className="w-full rounded-md border border-ink-200 bg-white py-1.5 pl-7 pr-2 text-[12.5px] text-ink-800 placeholder:text-ink-400 focus:border-blue-400 focus:outline-none"
            />
          </label>
          <p aria-live="polite" className="mt-1 min-h-[1em] text-[11px] text-ink-500">
            {buscando && (coincidencias === 0 ? `Sin resultados para «${busqueda.trim()}».` : `${coincidencias} resultado${coincidencias === 1 ? "" : "s"}`)}
          </p>
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3">
        {vista === "pantalla" && (
          <ContenidoAyuda
            ficha={fichaVisible}
            rolesAyuda={rolesAyuda}
            rol={rol}
            permisos={permisos}
            puedeAbrir={puedeAbrir}
            pestanaId={pestanaId}
            pestanaAnunciada={anunciada}
            onPestana={setElegida}
            buscando={buscando}
            onNavegar={alNavegar}
          />
        )}
        {vista === "ciclo" && (
          <VistaCiclo
            pasos={pasos}
            rolesAyuda={rolesAyuda}
            rol={rol}
            permisos={permisos}
            actual={resuelta}
            pestanaActual={anunciada}
            modulo={modulo}
            puedeAbrir={puedeAbrir}
            onNavegar={alNavegar}
          />
        )}
      </div>
    </aside>
  );
}
