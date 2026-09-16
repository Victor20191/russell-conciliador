"use client";

// Campos de APLICATIVO de la ficha del cliente: Contabilidad, Nómina, Inventarios y Activos fijos.
// Cada campo admite varios aplicativos (un cliente puede usar SAP y Siesa para la nómina). Cada
// aplicativo elegido viaja como un `erpProceso_<COD>` oculto; sin aplicativos el campo queda
// pendiente. Cartera, CxP e Ingresos se leen con los de Contabilidad.
import { useState } from "react";
import { Icon } from "@/components/icons";
import { PROCESOS_ERP, campoErpProceso, type CodigoProcesoErp } from "@/lib/erp-procesos";

type ErpOpcion = { id: number; name: string; active: boolean };
type Asignacion = { processCode: string; erpId: number | null };

function asignadosIniciales(
  asignaciones: readonly Asignacion[],
  erpLegado: number | null,
): Record<CodigoProcesoErp, number[]> {
  const salida = Object.fromEntries(PROCESOS_ERP.map((p) => [p.codigo, [] as number[]])) as Record<CodigoProcesoErp, number[]>;
  for (const asignacion of asignaciones) {
    const lista = salida[asignacion.processCode as CodigoProcesoErp];
    if (lista && asignacion.erpId != null && !lista.includes(asignacion.erpId)) lista.push(asignacion.erpId);
  }
  // El único dato legado confiable es el ERP contable; los demás campos nunca se infieren.
  if (salida.CONT.length === 0 && erpLegado != null) salida.CONT.push(erpLegado);
  return salida;
}

export function AplicativosPorProceso({
  erps,
  procesosActivos,
  asignaciones,
  erpLegado,
  errores,
}: {
  erps: readonly ErpOpcion[];
  /** Códigos activos en `procesos_erp`: solo esos campos se muestran. */
  procesosActivos: readonly string[];
  asignaciones: readonly Asignacion[];
  erpLegado: number | null;
  errores?: Record<string, string[] | undefined>;
}) {
  const [asignados, setAsignados] = useState(() => asignadosIniciales(asignaciones, erpLegado));
  const iniciales = asignadosIniciales(asignaciones, erpLegado);
  const nombrePorId = new Map(erps.map((erp) => [erp.id, erp]));
  const procesos = PROCESOS_ERP.filter((proceso) => procesosActivos.includes(proceso.codigo));

  const agregar = (codigo: CodigoProcesoErp, valor: string) => {
    const erpId = Number(valor);
    if (!Number.isInteger(erpId) || erpId <= 0) return;
    setAsignados((actual) => (actual[codigo].includes(erpId) ? actual : { ...actual, [codigo]: [...actual[codigo], erpId] }));
  };
  const quitar = (codigo: CodigoProcesoErp, erpId: number) => {
    setAsignados((actual) => ({ ...actual, [codigo]: actual[codigo].filter((id) => id !== erpId) }));
  };

  return (
    <div className="rounded-md border border-ink-150 bg-ink-50/60 p-3 sm:col-span-2">
      <div className="mb-2.5">
        <div className="text-[11.5px] font-medium text-ink-700">Aplicativos por proceso</div>
        <p className="mt-0.5 text-[11px] text-ink-400">
          Un proceso puede tener varios aplicativos. Al cargar un módulo se pregunta de cuál de ellos es el archivo.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {procesos.map((proceso) => {
          const campo = campoErpProceso(proceso.codigo);
          const elegidos = asignados[proceso.codigo];
          // Un aplicativo inactivo solo se conserva donde ya estaba: no se ofrece para agregar.
          const disponibles = erps.filter((erp) => !elegidos.includes(erp.id) && (erp.active || iniciales[proceso.codigo].includes(erp.id)));
          return (
            <div key={proceso.codigo} className="rounded-md border border-ink-150 bg-white p-2.5">
              <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                <span className="rounded bg-navy-50 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-navy-700">{proceso.codigo}</span>
                <span className="truncate text-[11.5px] font-medium text-ink-700">{proceso.nombre}</span>
              </div>
              {proceso.detalle && <p className="mb-1.5 text-[10.5px] text-ink-400">{proceso.detalle}</p>}
              <div className="mb-1.5 flex min-h-7 flex-wrap items-center gap-1.5">
                {elegidos.length === 0 ? (
                  <span className="text-[11px] italic text-ink-400">Pendiente / sin definir</span>
                ) : (
                  elegidos.map((erpId) => {
                    const erp = nombrePorId.get(erpId);
                    return (
                      <span key={erpId} className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 py-0.5 pl-2 pr-1 text-[11px] font-medium text-blue-800">
                        {erp?.name ?? `ERP ${erpId}`}{erp && !erp.active ? " (inactivo)" : ""}
                        <button
                          type="button"
                          onClick={() => quitar(proceso.codigo, erpId)}
                          title={`Quitar ${erp?.name ?? "aplicativo"} de ${proceso.nombre}`}
                          aria-label={`Quitar ${erp?.name ?? "aplicativo"} de ${proceso.nombre}`}
                          className="rounded-full p-0.5 text-blue-700 hover:bg-blue-100"
                        >
                          <Icon name="x" size={10} />
                        </button>
                        <input type="hidden" name={campo} value={erpId} />
                      </span>
                    );
                  })
                )}
              </div>
              <select
                value=""
                onChange={(event) => agregar(proceso.codigo, event.target.value)}
                aria-label={`Agregar aplicativo de ${proceso.nombre}`}
                disabled={disponibles.length === 0}
                className="w-full rounded-md border border-ink-200 bg-white px-2 py-1.5 text-[12px] text-ink-700 outline-none focus:border-blue-400 disabled:opacity-50"
              >
                <option value="">Agregar aplicativo…</option>
                {disponibles.map((erp) => (
                  <option key={erp.id} value={erp.id}>{erp.name}{erp.active ? "" : " (inactivo)"}</option>
                ))}
              </select>
              {errores?.[campo]?.map((error) => (
                <span key={error} className="mt-1 block text-[10.5px] text-err-600">{error}</span>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
