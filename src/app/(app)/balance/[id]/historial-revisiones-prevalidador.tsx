"use client";

// Historial de aprobaciones y revocaciones del prevalidador de este balance: quién, cuándo, qué
// hizo y con qué comentario. Solo consulta; la tabla de revisiones es append-only, así que una
// revocación nunca borra la aprobación que revocó.

import { useState } from "react";
import { Icon } from "@/components/icons";
import { Chip } from "@/components/ui";
import { Modal } from "@/components/modal";
import { fmtDateTime } from "@/lib/format";
import {
  etiquetaAccionRevision,
  etiquetaSituacionRevision,
  type RevisionHistorialVM,
} from "@/lib/balance/prevalidador/historial";

export function HistorialRevisionesPrevalidador({ historial }: { historial: RevisionHistorialVM[] }) {
  const [abierto, setAbierto] = useState(false);
  if (historial.length === 0) return null;
  const aprobaciones = historial.filter((h) => h.accion === "aprobada").length;
  const revocaciones = historial.length - aprobaciones;
  // Solo se aprueba lo que no tiene una aprobación vigente: dos aprobaciones seguidas, sin
  // revocación en medio, significan que la anterior quedó desactualizada.
  const aprobacionesSeguidas = historial.some((h, i) => h.accion === "aprobada" && historial[i + 1]?.accion === "aprobada");
  const conDesactualizada = aprobacionesSeguidas || historial.some((h) => h.situacion === "desactualizada");

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        title="Ver todas las aprobaciones y revocaciones del prevalidador de este balance"
        className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-ink-200 px-2.5 py-1.5 text-[12px] font-semibold text-ink-700 transition hover:bg-ink-50"
      >
        <Icon name="log" size={13} />
        Historial ({historial.length})
      </button>
      {abierto && (
        <Modal open onClose={() => setAbierto(false)} size="4xl" title="Historial de revisiones del prevalidador">
          <div className="flex flex-col gap-3">
            <p className="text-[12px] leading-relaxed text-ink-500">
              {aprobaciones} aprobación(es) y {revocaciones} revocación(es), de la más reciente a la más antigua. Cada
              revisión queda registrada tal como se hizo: revocar una aprobación no la borra.
            </p>
            <div className="overflow-x-auto rounded-md border border-ink-150">
              <table className="w-full text-[12.5px]">
                <thead>
                  <tr className="border-b border-ink-100 bg-ink-50 text-[11px] uppercase tracking-wider text-ink-500">
                    <th className="whitespace-nowrap px-3 py-2 text-left font-semibold">Fecha</th>
                    <th className="px-3 py-2 text-left font-semibold">Usuario</th>
                    <th className="px-3 py-2 text-left font-semibold">Acción</th>
                    <th className="px-3 py-2 text-left font-semibold">Comentario</th>
                  </tr>
                </thead>
                <tbody>
                  {historial.map((h) => {
                    const situacion = etiquetaSituacionRevision(h.situacion);
                    return (
                      <tr key={h.id} className="border-b border-ink-100 align-top last:border-0">
                        <td className="whitespace-nowrap px-3 py-2.5 text-ink-700">{fmtDateTime(h.fecha)}</td>
                        <td className="px-3 py-2.5 font-medium text-ink-800">{h.usuario}</td>
                        <td className="px-3 py-2.5">
                          <div className="flex flex-wrap items-center gap-1">
                            <Chip label={etiquetaAccionRevision(h.accion)} tone={h.accion === "aprobada" ? "ok" : "err"} />
                            {situacion && <Chip label={situacion} tone={h.situacion === "vigente" ? "blue" : "warn"} />}
                          </div>
                        </td>
                        <td className="min-w-[16rem] whitespace-pre-wrap break-words px-3 py-2.5 leading-relaxed text-ink-700">
                          {h.comentario}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {conDesactualizada && (
              <p className="text-[11px] leading-relaxed text-ink-400">
                Una aprobación queda desactualizada cuando cambia algo de lo aprobado (p. ej. saldos, homologación o
                cuenta alternativa) y hay que aprobar otra vez; por eso puede haber dos aprobaciones seguidas sin una
                revocación en medio.
              </p>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}
