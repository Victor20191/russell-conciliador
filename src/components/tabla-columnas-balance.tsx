"use client";

import type { ReactNode } from "react";
import { fmt, fmtPct } from "@/lib/format";
import { OPCIONES_FILTRO_VALIDACION, type FiltrosColumnasDetalle } from "@/lib/balance/filtros-detalle";

/** Cabecera y columnas compartidas por balance oficial y visor por terceros. */
export function EncabezadoTablaBalance<V extends string>({ filtros, onChange, opcionesValidacion = OPCIONES_FILTRO_VALIDACION }: {
  filtros: Omit<FiltrosColumnasDetalle, "validacion"> & { validacion: V };
  onChange: <K extends keyof FiltrosColumnasDetalle>(columna: K, valor: (Omit<FiltrosColumnasDetalle, "validacion"> & { validacion: V })[K]) => void;
  opcionesValidacion?: readonly { value: string; label: string }[];
}) {
  return (
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-ink-500">
              <th className="min-w-48 px-4 py-2 font-semibold">
                Código
                <FiltroTextoColumna
                  ariaLabel="Filtrar la columna Código"
                  value={filtros.codigo}
                  onChange={(valor) => onChange("codigo", valor)}
                  placeholder="Buscar código"
                />
              </th>
              <th className="min-w-56 px-4 py-2 font-semibold">
                Cuenta
                <FiltroTextoColumna
                  ariaLabel="Filtrar la columna Cuenta"
                  value={filtros.cuenta}
                  onChange={(valor) => onChange("cuenta", valor)}
                  placeholder="Buscar cuenta"
                />
              </th>
              <th className="min-w-44 px-4 py-2 font-semibold">
                Mapeo estándar
                <FiltroTextoColumna
                  ariaLabel="Filtrar la columna Mapeo estándar"
                  value={filtros.mapeo}
                  onChange={(valor) => onChange("mapeo", valor)}
                  placeholder="Código o sin mapeo"
                />
              </th>
              <th data-separador="true" className="min-w-40 whitespace-nowrap px-4 py-2 text-right font-semibold">
                Saldo anterior
                <FiltroTextoColumna
                  ariaLabel="Filtrar la columna Saldo anterior"
                  value={filtros.saldoAnterior}
                  onChange={(valor) => onChange("saldoAnterior", valor)}
                  placeholder="Ej. > 1000000"
                  numerico
                />
              </th>
              <th data-separador="true" className="min-w-36 whitespace-nowrap px-4 py-2 text-right font-semibold">
                Débito
                <FiltroTextoColumna
                  ariaLabel="Filtrar la columna Débito"
                  value={filtros.debito}
                  onChange={(valor) => onChange("debito", valor)}
                  placeholder="Ej. > 0"
                  numerico
                />
              </th>
              <th data-separador="true" className="min-w-36 whitespace-nowrap px-4 py-2 text-right font-semibold">
                Crédito
                <FiltroTextoColumna
                  ariaLabel="Filtrar la columna Crédito"
                  value={filtros.credito}
                  onChange={(valor) => onChange("credito", valor)}
                  placeholder="Ej. > 0"
                  numerico
                />
              </th>
              <th data-separador="true" className="min-w-36 whitespace-nowrap px-4 py-2 text-right font-semibold">
                Saldo
                <FiltroTextoColumna
                  ariaLabel="Filtrar la columna Saldo"
                  value={filtros.saldo}
                  onChange={(valor) => onChange("saldo", valor)}
                  placeholder="Ej. < 0"
                  numerico
                />
              </th>
              <th data-separador="true" className="min-w-32 whitespace-nowrap px-4 py-2 text-right font-semibold">
                Var %
                <FiltroTextoColumna
                  ariaLabel="Filtrar la columna Variación porcentual"
                  value={filtros.variacion}
                  onChange={(valor) => onChange("variacion", valor)}
                  placeholder="Ej. > 25"
                  numerico
                />
              </th>
              <th data-separador="true" className="min-w-44 px-4 py-2 font-semibold">
                Validación
                <select
                  value={filtros.validacion}
                  onChange={(evento) => onChange(
                    "validacion",
                    evento.target.value as V,
                  )}
                  aria-label="Filtrar la columna Validación"
                  className={CLASE_FILTRO_COLUMNA}
                >
                  {opcionesValidacion.map((opcion) => (
                    <option key={opcion.value} value={opcion.value}>{opcion.label}</option>
                  ))}
                </select>
              </th>
            </tr>
          </thead>
  );
}

const CLASE_FILTRO_COLUMNA =
  "mt-1 block h-7 w-full rounded-md border border-ink-200 bg-white px-2 text-[11px] font-normal normal-case tracking-normal text-ink-700 outline-none placeholder:text-ink-400 focus:border-blue-400";

function FiltroTextoColumna({
  ariaLabel,
  value,
  onChange,
  placeholder,
  numerico = false,
}: {
  ariaLabel: string;
  value: string;
  onChange: (valor: string) => void;
  placeholder: string;
  numerico?: boolean;
}) {
  return (
    <input
      type="text"
      inputMode={numerico ? "decimal" : "search"}
      value={value}
      onChange={(evento) => onChange(evento.target.value)}
      aria-label={ariaLabel}
      placeholder={placeholder}
      className={`${CLASE_FILTRO_COLUMNA} ${numerico ? "text-right" : "text-left"}`}
    />
  );
}


export function CeldasImportesBalance({ anterior, debito, credito, saldo, variacion, grupo = false, validacion }: {
  anterior: number; debito: number; credito: number; saldo: number; variacion: number | null; grupo?: boolean; validacion?: ReactNode;
}) {
  return <>
    <td className="whitespace-nowrap border-l border-ink-150 px-4 py-2 text-right font-mono text-ink-400">{fmt(anterior)}</td>
    <td className="whitespace-nowrap border-l border-ink-150 px-4 py-2 text-right font-mono text-ink-600">{fmt(debito)}</td>
    <td className="whitespace-nowrap border-l border-ink-150 px-4 py-2 text-right font-mono text-ink-600">{fmt(credito)}</td>
    <td className={`whitespace-nowrap border-l border-ink-150 px-4 py-2 text-right font-mono ${grupo ? "font-semibold text-ink-800" : "text-ink-700"}`}>{fmt(saldo)}</td>
    <td className={`whitespace-nowrap border-l border-ink-150 px-4 py-2 text-right font-mono ${variacion != null && Math.abs(variacion) > 25 ? "text-warn-700" : "text-ink-600"}`}>{fmtPct(variacion)}</td>
    <td className="whitespace-nowrap border-l border-ink-150 px-4 py-2">{validacion}</td>
  </>;
}
