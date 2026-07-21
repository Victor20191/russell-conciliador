"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/icons";

type ClienteOpcion = {
  id: number;
  name: string;
  nit: string;
};

const LIMITE_OPCIONES = 50;

const soloDigitos = (valor: string) => valor.replace(/\D/g, "");

const normalizarBusqueda = (valor: string) =>
  valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es-CO")
    .trim();

const etiquetaCliente = (cliente: ClienteOpcion) => `${cliente.name} — ${cliente.nit}`;

export function SelectorClienteBuscable({
  clients,
  value,
  onChange,
  name,
  className = "",
}: {
  clients: ClienteOpcion[];
  value: number | null;
  onChange: (clientId: number | null) => void;
  name?: string;
  className?: string;
}) {
  const clienteSeleccionado = clients.find((cliente) => cliente.id === value) ?? null;
  const [busqueda, setBusqueda] = useState("");
  const [abierto, setAbierto] = useState(false);
  const [indiceActivo, setIndiceActivo] = useState(0);
  const contenedorRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const idBase = useId();
  const inputId = `${idBase}-input`;
  const listboxId = `${idBase}-lista`;

  const coincidencias = useMemo(() => {
    const texto = normalizarBusqueda(busqueda);
    const digitos = soloDigitos(busqueda);
    if (!texto && clienteSeleccionado) return [clienteSeleccionado];

    return clients.filter((cliente) => {
      if (!texto) return true;
      return (
        normalizarBusqueda(cliente.name).includes(texto) ||
        normalizarBusqueda(cliente.nit).includes(texto) ||
        (digitos.length > 0 && soloDigitos(cliente.nit).includes(digitos))
      );
    });
  }, [busqueda, clienteSeleccionado, clients]);

  const opcionesVisibles = useMemo(
    () => coincidencias.slice(0, LIMITE_OPCIONES),
    [coincidencias],
  );

  useEffect(() => {
    const cerrarAlHacerClickAfuera = (event: PointerEvent) => {
      if (!contenedorRef.current?.contains(event.target as Node)) setAbierto(false);
    };
    document.addEventListener("pointerdown", cerrarAlHacerClickAfuera);
    return () => document.removeEventListener("pointerdown", cerrarAlHacerClickAfuera);
  }, []);

  useEffect(() => {
    if (!abierto) return;
    const opcion = opcionesVisibles[indiceActivo];
    if (opcion) {
      document.getElementById(`${idBase}-opcion-${opcion.id}`)?.scrollIntoView({ block: "nearest" });
    }
  }, [abierto, idBase, indiceActivo, opcionesVisibles]);

  useEffect(() => {
    if (value != null) inputRef.current?.setCustomValidity("");
  }, [value]);

  const elegir = (cliente: ClienteOpcion) => {
    setBusqueda("");
    setAbierto(false);
    setIndiceActivo(0);
    inputRef.current?.setCustomValidity("");
    onChange(cliente.id);
  };

  const limpiarSeleccion = () => {
    setBusqueda("");
    setAbierto(true);
    setIndiceActivo(0);
    inputRef.current?.setCustomValidity("Selecciona un cliente de la lista.");
    onChange(null);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const actualizarBusqueda = (valor: string) => {
    setBusqueda(valor);
    if (value != null) onChange(null);
    setAbierto(true);
    setIndiceActivo(0);
    inputRef.current?.setCustomValidity("Selecciona un cliente de la lista.");
  };

  return (
    <div ref={contenedorRef} className={`relative flex flex-col gap-1.5 ${className}`}>
      <label htmlFor={inputId} className="text-[11.5px] font-medium text-ink-600">
        Cliente
      </label>
      {name && <input type="hidden" name={name} value={value ?? ""} />}

      <div className="flex items-center rounded-md border border-ink-200 bg-white text-ink-400 transition focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100">
        <Icon name="search" size={14} className="ml-2.5 shrink-0" />
        <input
          ref={inputRef}
          id={inputId}
          type="text"
          role="combobox"
          required
          autoComplete="off"
          aria-autocomplete="list"
          aria-controls={listboxId}
          aria-expanded={abierto}
          aria-activedescendant={
            abierto && opcionesVisibles[indiceActivo]
              ? `${idBase}-opcion-${opcionesVisibles[indiceActivo].id}`
              : undefined
          }
          value={clienteSeleccionado ? etiquetaCliente(clienteSeleccionado) : busqueda}
          placeholder="Buscar por nombre o NIT…"
          onFocus={() => setAbierto(true)}
          onChange={(event) => actualizarBusqueda(event.target.value)}
          onInvalid={(event) => {
            event.currentTarget.setCustomValidity(value == null ? "Selecciona un cliente de la lista." : "");
          }}
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
            }
          }}
          className="min-w-0 flex-1 bg-transparent px-2.5 py-2 text-[12.5px] text-ink-700 outline-none placeholder:text-ink-400"
        />

        {(busqueda || clienteSeleccionado) && (
          <button
            type="button"
            onClick={limpiarSeleccion}
            aria-label="Limpiar cliente"
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
          aria-label={abierto ? "Cerrar lista de clientes" : "Mostrar lista de clientes"}
          className="mr-1 rounded p-1 text-ink-400 transition hover:bg-ink-50 hover:text-ink-700"
        >
          <Icon name="chev-d" size={14} className={`transition ${abierto ? "rotate-180" : ""}`} />
        </button>
      </div>

      {abierto && (
        <div
          id={listboxId}
          role="listbox"
          aria-label="Clientes"
          className="absolute top-full z-30 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-ink-200 bg-white p-1 shadow-lg"
        >
          {opcionesVisibles.length > 0 ? (
            <>
              {opcionesVisibles.map((cliente, index) => (
                <div
                  key={cliente.id}
                  id={`${idBase}-opcion-${cliente.id}`}
                  role="option"
                  aria-selected={cliente.id === value}
                  onMouseEnter={() => setIndiceActivo(index)}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    elegir(cliente);
                  }}
                  className={`flex cursor-pointer items-center justify-between gap-3 rounded px-2.5 py-2 text-[12.5px] transition ${
                    index === indiceActivo ? "bg-blue-50 text-navy-800" : "text-ink-700 hover:bg-ink-50"
                  }`}
                >
                  <span className="min-w-0 truncate font-medium">{cliente.name}</span>
                  <span className="shrink-0 font-mono text-[11.5px] text-ink-500">{cliente.nit}</span>
                </div>
              ))}
              {coincidencias.length > opcionesVisibles.length && (
                <p className="border-t border-ink-100 px-2.5 py-2 text-[11px] text-ink-500">
                  Mostrando 50 de {coincidencias.length} clientes. Escribe más para precisar la búsqueda.
                </p>
              )}
            </>
          ) : (
            <p className="px-2.5 py-3 text-center text-[12px] text-ink-500">
              No encontramos clientes con ese nombre o NIT.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
