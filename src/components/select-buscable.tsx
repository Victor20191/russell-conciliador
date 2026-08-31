"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/icons";

export type OpcionBuscable = { value: string; label: string };

const LIMITE_OPCIONES = 50;

const normalizarBusqueda = (valor: string) =>
  valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es-CO")
    .trim();

export function SelectBuscable({
  opciones,
  value,
  onChange,
  placeholder = "Buscar…",
  sinResultados = "No se encontraron opciones.",
  className = "",
}: {
  opciones: OpcionBuscable[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  sinResultados?: string;
  className?: string;
}) {
  const seleccionada = opciones.find((opcion) => opcion.value === value) ?? null;
  const [busqueda, setBusqueda] = useState("");
  const [abierto, setAbierto] = useState(false);
  const [indiceActivo, setIndiceActivo] = useState(0);
  const contenedorRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const idBase = useId();
  const listboxId = `${idBase}-lista`;

  const coincidencias = useMemo(() => {
    const texto = normalizarBusqueda(busqueda);
    if (!texto) return opciones;
    return opciones.filter((opcion) => normalizarBusqueda(opcion.label).includes(texto));
  }, [busqueda, opciones]);

  const opcionesVisibles = useMemo(
    () => coincidencias.slice(0, LIMITE_OPCIONES),
    [coincidencias],
  );

  useEffect(() => {
    const cerrarAlHacerClickAfuera = (event: PointerEvent) => {
      if (!contenedorRef.current?.contains(event.target as Node)) {
        setAbierto(false);
        setBusqueda("");
      }
    };
    document.addEventListener("pointerdown", cerrarAlHacerClickAfuera);
    return () => document.removeEventListener("pointerdown", cerrarAlHacerClickAfuera);
  }, []);

  useEffect(() => {
    if (!abierto) return;
    const opcion = opcionesVisibles[indiceActivo];
    if (opcion) {
      document.getElementById(`${idBase}-opcion-${opcion.value}`)?.scrollIntoView({ block: "nearest" });
    }
  }, [abierto, idBase, indiceActivo, opcionesVisibles]);

  const elegir = (opcion: OpcionBuscable) => {
    setBusqueda("");
    setAbierto(false);
    setIndiceActivo(0);
    onChange(opcion.value);
  };

  const limpiarSeleccion = () => {
    setBusqueda("");
    setAbierto(true);
    setIndiceActivo(0);
    onChange("");
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const actualizarBusqueda = (texto: string) => {
    setBusqueda(texto);
    setAbierto(true);
    setIndiceActivo(0);
  };

  return (
    <div ref={contenedorRef} className={`relative ${className}`}>
      <div className="flex items-center rounded-md border border-ink-200 bg-white text-ink-400 transition focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100">
        <Icon name="search" size={14} className="ml-2.5 shrink-0" />
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          autoComplete="off"
          aria-autocomplete="list"
          aria-controls={listboxId}
          aria-expanded={abierto}
          aria-activedescendant={
            abierto && opcionesVisibles[indiceActivo]
              ? `${idBase}-opcion-${opcionesVisibles[indiceActivo].value}`
              : undefined
          }
          value={busqueda !== "" ? busqueda : (seleccionada?.label ?? "")}
          placeholder={placeholder}
          onFocus={() => setAbierto(true)}
          onChange={(event) => actualizarBusqueda(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setAbierto(true);
              if (opcionesVisibles.length > 0) {
                setIndiceActivo((actual) => Math.min(actual + 1, opcionesVisibles.length - 1));
              }
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setAbierto(true);
              if (opcionesVisibles.length > 0) {
                setIndiceActivo((actual) => Math.max(actual - 1, 0));
              }
            } else if (event.key === "Enter" && abierto && opcionesVisibles[indiceActivo]) {
              event.preventDefault();
              elegir(opcionesVisibles[indiceActivo]);
            } else if (event.key === "Escape") {
              setAbierto(false);
              setBusqueda("");
            }
          }}
          className="min-w-0 flex-1 bg-transparent px-2.5 py-2 text-[12.5px] text-ink-700 outline-none placeholder:text-ink-400"
        />

        {(busqueda !== "" || value !== "") && (
          <button
            type="button"
            onClick={limpiarSeleccion}
            aria-label="Limpiar selección"
            className="rounded p-1 text-ink-400 transition hover:bg-ink-50 hover:text-ink-700"
          >
            <Icon name="x" size={13} />
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            setAbierto((actual) => !actual);
            inputRef.current?.focus();
          }}
          aria-label={abierto ? "Cerrar lista" : "Mostrar lista"}
          className="mr-1 rounded p-1 text-ink-400 transition hover:bg-ink-50 hover:text-ink-700"
        >
          <Icon name="chev-d" size={14} className={`transition ${abierto ? "rotate-180" : ""}`} />
        </button>
      </div>

      {abierto && (
        <div
          id={listboxId}
          role="listbox"
          className="absolute top-full z-30 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-ink-200 bg-white p-1 shadow-lg"
        >
          {opcionesVisibles.length > 0 ? (
            <>
              {opcionesVisibles.map((opcion, index) => (
                <div
                  key={opcion.value}
                  id={`${idBase}-opcion-${opcion.value}`}
                  role="option"
                  aria-selected={opcion.value === value}
                  onMouseEnter={() => setIndiceActivo(index)}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    elegir(opcion);
                  }}
                  className={`flex cursor-pointer items-center justify-between gap-3 rounded px-2.5 py-2 text-[12.5px] transition ${
                    index === indiceActivo ? "bg-blue-50 text-navy-800" : "text-ink-700 hover:bg-ink-50"
                  }`}
                >
                  <span className="min-w-0 truncate font-medium">{opcion.label}</span>
                  {opcion.value === value && <Icon name="check" size={13} className="shrink-0 text-ok-600" />}
                </div>
              ))}
              {coincidencias.length > opcionesVisibles.length && (
                <p className="border-t border-ink-100 px-2.5 py-2 text-[11px] text-ink-500">
                  Mostrando 50 de {coincidencias.length} opciones. Escribe más para precisar la búsqueda.
                </p>
              )}
            </>
          ) : (
            <p className="px-2.5 py-3 text-center text-[12px] text-ink-500">{sinResultados}</p>
          )}
        </div>
      )}
    </div>
  );
}
