"use client";

// Período de «Reportes para gerencia» (tarjetas e «Indicadores de uso»); va junto
// al título de la página. Se guarda en la URL (`?desde=…&hasta=…`):
// la página lo lee en el servidor con la misma regla que el reporte generado
// (`rango.ts`), y el enlace se puede compartir o recargar sin perderlo.

import { useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ultimosDias } from "@/lib/auditoria/reporte-ejecutivo/periodo-sugerido";
import { leerRangoElegido } from "@/lib/auditoria/reporte-ejecutivo/rango";

export type PeriodoIndicadores = {
  /** AAAA-MM-DD del período que muestran hoy los indicadores. */
  desde: string;
  hasta: string;
  /** true si viene de la URL; false si es el período por defecto (últimos 30 días). */
  elegido: boolean;
  /**
   * «Hoy» del servidor, con el que se calcularon los últimos 30 días por defecto.
   * Los atajos parten de aquí (y no del reloj del navegador) para coincidir con él.
   */
  hoy: string;
  /** Algo que la persona debe saber del período (rango inválido, cifras incompletas). */
  aviso?: string | null;
};

const ATAJOS = [
  ["7 días", 7],
  ["15 días", 15],
  ["30 días", 30],
  ["90 días", 90],
] as const;

const BTN_ATAJO =
  "inline-flex items-center rounded-md border border-ink-150 bg-white px-2.5 py-1 text-[11.5px] font-medium text-ink-600 transition hover:bg-ink-50 disabled:cursor-not-allowed disabled:opacity-60";
const BTN_ATAJO_ACTIVO =
  "inline-flex items-center rounded-md border border-navy-700 bg-navy-700 px-2.5 py-1 text-[11.5px] font-semibold text-white shadow-sm transition hover:bg-navy-600 disabled:cursor-not-allowed disabled:opacity-60";
const CAMPO_FECHA = "rounded-md border border-ink-150 bg-white px-2 py-1 text-[12.5px] text-ink-800";
const BTN_APLICAR =
  "inline-flex items-center justify-center rounded-md bg-navy-700 px-3 py-1.5 text-[12px] font-semibold text-white transition hover:bg-navy-600 disabled:cursor-not-allowed disabled:opacity-60";

export function SelectorPeriodoTablero({ periodo }: { periodo: PeriodoIndicadores }) {
  const router = useRouter();
  const pathname = usePathname();
  const [desde, setDesde] = useState(periodo.desde);
  const [hasta, setHasta] = useState(periodo.hasta);
  const [error, setError] = useState<string | null>(null);
  const [cargando, startTransition] = useTransition();

  const ir = (rango: { desde: string; hasta: string } | null) => {
    setError(null);
    const consulta = rango ? `?${new URLSearchParams(rango).toString()}` : "";
    startTransition(() => {
      router.push(`${pathname}${consulta}`, { scroll: false });
    });
  };

  const aplicar = (rango: { desde: string; hasta: string }) => {
    const leido = leerRangoElegido(rango);
    if (leido.estado !== "valido") {
      setError(leido.estado === "invalido" ? leido.motivo : "Elige las dos fechas del período.");
      return;
    }
    setDesde(rango.desde);
    setHasta(rango.hasta);
    ir(rango);
  };

  const sinCambios = desde === periodo.desde && hasta === periodo.hasta;

  return (
    <div className="flex flex-col items-start gap-1.5 lg:items-end">
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Período de los indicadores">
        <span className="mr-0.5 text-[11.5px] font-semibold text-ink-600">Período</span>
        {ATAJOS.map(([etiqueta, dias]) => {
          const rango = ultimosDias(periodo.hoy, dias);
          const activo = rango.desde === periodo.desde && rango.hasta === periodo.hasta;
          return (
            <button
              key={etiqueta}
              type="button"
              aria-pressed={activo}
              disabled={cargando}
              className={activo ? BTN_ATAJO_ACTIVO : BTN_ATAJO}
              // Los 30 días son la vista por defecto: se vuelve a ella en vez de fijarla en la URL.
              onClick={() => {
                if (dias !== 30) return aplicar(rango);
                setDesde(rango.desde);
                setHasta(rango.hasta);
                ir(null);
              }}
            >
              {etiqueta}
            </button>
          );
        })}
        <label className="ml-1 flex items-center gap-1 text-[11.5px] text-ink-600">
          Desde
          <input
            type="date"
            value={desde}
            max={hasta || undefined}
            onChange={(e) => setDesde(e.target.value)}
            className={CAMPO_FECHA}
          />
        </label>
        <label className="flex items-center gap-1 text-[11.5px] text-ink-600">
          Hasta
          <input
            type="date"
            value={hasta}
            min={desde || undefined}
            onChange={(e) => setHasta(e.target.value)}
            className={CAMPO_FECHA}
          />
        </label>
        <button
          type="button"
          disabled={cargando || sinCambios}
          className={BTN_APLICAR}
          onClick={() => aplicar({ desde, hasta })}
        >
          {cargando ? "Actualizando…" : "Aplicar"}
        </button>
      </div>
      {error && <p className="text-[11.5px] text-err-700">{error}</p>}
      {periodo.aviso && (
        <p
          role="status"
          className="rounded-md border border-warn-200 bg-warn-100 px-2.5 py-1.5 text-[11.5px] text-warn-700"
        >
          {periodo.aviso}
        </p>
      )}
    </div>
  );
}
