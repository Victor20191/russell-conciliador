"use client";

import { Card } from "@/components/ui";
import { fmtNum } from "@/lib/format";

export type BarraUso = {
  etiqueta: string;
  total: number;
  detalle?: string;
};

export type SerieDiaUso = {
  fecha: string; // YYYY-MM-DD
  total: number;
};

function anchoBarra(valor: number, max: number): number {
  if (max <= 0 || valor <= 0) return 0;
  return Math.max(3, Math.round((valor / max) * 100));
}

function ListaBarras({
  titulo,
  subtitulo,
  items,
  vacio,
  barClass = "bg-navy-700",
  trackClass = "bg-ink-100",
}: {
  titulo: string;
  subtitulo?: string;
  items?: BarraUso[] | null;
  vacio: string;
  barClass?: string;
  trackClass?: string;
}) {
  const filas = Array.isArray(items) ? items : [];
  const max = filas.reduce((m, item) => Math.max(m, Number(item?.total) || 0), 0) || 1;

  return (
    <Card className="p-4">
      <h2 className="text-[13px] font-semibold text-ink-800">{titulo}</h2>
      {subtitulo && <p className="mt-0.5 text-[11.5px] text-ink-500">{subtitulo}</p>}
      {filas.length === 0 ? (
        <p className="py-8 text-center text-[12.5px] text-ink-400">{vacio}</p>
      ) : (
        <ul className="mt-3 space-y-2.5">
          {filas.map((item, index) => {
            const etiqueta = item?.etiqueta ?? `Ítem ${index + 1}`;
            const total = Number(item?.total) || 0;
            return (
              <li key={`${titulo}-${index}-${etiqueta}`}>
                <div className="mb-1 flex items-baseline justify-between gap-3">
                  <div className="min-w-0">
                    <span className="block truncate text-[12.5px] text-ink-800">{etiqueta}</span>
                    {item?.detalle && (
                      <span className="block truncate text-[11px] text-ink-400">{item.detalle}</span>
                    )}
                  </div>
                  <span className="shrink-0 font-mono text-[12px] font-semibold text-ink-700">
                    {fmtNum(total)}
                  </span>
                </div>
                <div className={`h-1.5 w-full overflow-hidden rounded-full ${trackClass}`}>
                  <div
                    className={`h-full rounded-full ${barClass}`}
                    style={{ width: `${anchoBarra(total, max)}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function RitmoDiario({ serie }: { serie?: SerieDiaUso[] | null }) {
  const puntos = Array.isArray(serie) ? serie.slice(-21) : [];
  const max = puntos.reduce((m, p) => Math.max(m, Number(p?.total) || 0), 0) || 1;

  return (
    <Card className="p-4 lg:col-span-2">
      <h2 className="text-[13px] font-semibold text-ink-800">Ritmo de uso diario</h2>
      <p className="mt-0.5 text-[11.5px] text-ink-500">
        Acciones por día en el período
        {(serie?.length ?? 0) > 21 ? " (últimos 21 días del rango)" : ""}
      </p>
      {puntos.length === 0 ? (
        <p className="py-8 text-center text-[12.5px] text-ink-400">
          Sin actividad diaria registrada en el período.
        </p>
      ) : (
        <div className="mt-4 flex h-28 items-end gap-1">
          {puntos.map((d, index) => {
            const total = Number(d?.total) || 0;
            const h = Math.max(4, Math.round((total / max) * 100));
            const fecha = d?.fecha ?? `dia-${index}`;
            return (
              <div
                key={`${fecha}-${index}`}
                className="flex min-w-0 flex-1 flex-col items-center justify-end"
                title={`${fecha}: ${fmtNum(total)} acciones`}
              >
                <div
                  className="w-full max-w-[14px] rounded-t-sm bg-navy-700"
                  style={{ height: `${h}%` }}
                />
                <span className="mt-1 max-w-full truncate text-[9px] text-ink-400">
                  {fecha.slice(5)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

/**
 * Panel permanente de indicadores de uso de la plataforma.
 * Siempre visible en Configuración › Reportes ejecutivos (con o sin reporte IA).
 */
export function IndicadoresUso({
  periodoLabel,
  porFamilia,
  topUsuarios,
  topAcciones,
  topClientes,
  serieDiaria,
  adopcion,
}: {
  periodoLabel: string;
  porFamilia?: BarraUso[] | null;
  topUsuarios?: BarraUso[] | null;
  topAcciones?: BarraUso[] | null;
  topClientes?: BarraUso[] | null;
  serieDiaria?: SerieDiaUso[] | null;
  adopcion?: BarraUso[] | null;
}) {
  return (
    <section aria-label="Indicadores de uso de la plataforma" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="font-serif text-lg text-ink-900">Indicadores de uso</h2>
          <p className="mt-0.5 text-[12.5px] text-ink-500">
            Actividad real de los usuarios en el período {periodoLabel}. Estos indicadores están
            siempre disponibles en la plataforma.
          </p>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <ListaBarras
          titulo="Módulos y procesos más usados"
          subtitulo="Acciones agrupadas por familia de proceso"
          items={porFamilia}
          vacio="Aún no hay acciones registradas en este período."
          barClass="bg-navy-700"
          trackClass="bg-ink-100"
        />
        <ListaBarras
          titulo="Usuarios con más actividad"
          subtitulo="Quién más opera la plataforma"
          items={topUsuarios}
          vacio="Sin usuarios activos en el período."
          barClass="bg-blue-500"
          trackClass="bg-blue-100"
        />
        <ListaBarras
          titulo="Acciones más frecuentes"
          subtitulo="Tipos de operación con mayor volumen"
          items={topAcciones}
          vacio="Sin acciones en el período."
          barClass="bg-navy-600"
          trackClass="bg-ink-100"
        />
        <ListaBarras
          titulo="Clientes con más operaciones"
          subtitulo="Actividad vinculada a clientes"
          items={topClientes}
          vacio="Sin operaciones asociadas a clientes en el período."
          barClass="bg-navy-500"
          trackClass="bg-ink-100"
        />
        <ListaBarras
          titulo="Adopción de novedades"
          subtitulo="Estado de las funcionalidades liberadas vs. uso real"
          items={adopcion}
          vacio="No hay novedades publicadas para medir adopción."
          barClass="bg-ok-500"
          trackClass="bg-ok-100"
        />
        <RitmoDiario serie={serieDiaria} />
      </div>
    </section>
  );
}
