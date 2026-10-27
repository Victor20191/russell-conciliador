"use client";

// Novedades de Activos fijos por activo (17/Oct/2026): costo o neto negativo, el «Costo neto» del
// archivo contra el calculado y qué lado le falta al cargue. Los negativos y la depreciación sin
// costo además exigen comentario para cerrar (tarjeta de arriba).
import { Card } from "@/components/ui";
import { fmtContable } from "@/lib/format";
import type { ValidacionesActivos } from "@/lib/modulos/activos/validaciones-activos";
import { IconoEnTexto } from "@/components/icons";

const MAX_VISIBLES = 50;

export function ValidacionesActivosCard({ v }: { v: ValidacionesActivos }) {
  const sinNovedad = v.negativos.cantidad === 0 && v.netoVsCalculado.cantidad === 0 && !v.faltaCosto && !v.faltaDepreciacion;
  return (
    <Card className="p-4">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-ink-500">Validación por activo</div>
      <p className="mb-2 text-[11.5px] text-ink-500">
        Costo neto = costo de adquisición + adiciones + mejoras + valorización − depreciación − deterioro.
      </p>
      {sinNovedad && (
        <div className="rounded-md border border-ok-500 bg-ok-100 px-3 py-1.5 text-[12px] text-ok-700">
          <IconoEnTexto name="check" />Ningún activo con costo o neto negativo, y el costo neto del archivo coincide con el calculado.
        </div>
      )}
      <div className="flex flex-col gap-3">
        {v.faltaCosto && (
          <div className="rounded-md border border-err-500 bg-err-100 px-3 py-2 text-[12px] text-err-700">
            El cargue trae la depreciación y ningún costo de adquisición. Exige un comentario para cerrar la conciliación.
          </div>
        )}
        {v.faltaDepreciacion && (
          <div className="rounded-md border border-blue-100 bg-blue-50 px-3 py-2 text-[12px] text-blue-800">
            El cargue trae el costo y ninguna depreciación. Solo se informa.
          </div>
        )}
        {v.negativos.cantidad > 0 && (
          <div className="flex flex-col gap-1.5">
            <div className="text-[12.5px] font-semibold text-err-700">
              <IconoEnTexto name="warn" />{v.negativos.cantidad.toLocaleString("es-CO")} {v.negativos.cantidad === 1 ? "activo" : "activos"} con costo o neto negativo
            </div>
            <div className="overflow-x-auto rounded-md border border-ink-150">
              <table className="w-full text-[12px]">
                <thead className="bg-ink-50 text-left text-ink-500">
                  <tr>
                    <th className="px-2.5 py-1.5 font-semibold">Fila</th>
                    <th className="px-2.5 py-1.5 font-semibold">Placa</th>
                    <th className="px-2.5 py-1.5 font-semibold">Descripción</th>
                    <th className="px-2.5 py-1.5 text-right font-semibold">Costo de adquisición</th>
                    <th className="px-2.5 py-1.5 text-right font-semibold">Costo neto</th>
                  </tr>
                </thead>
                <tbody>
                  {v.negativos.filas.slice(0, MAX_VISIBLES).map((n) => (
                    <tr key={n.filaNum} className="border-t border-ink-100">
                      <td className="whitespace-nowrap px-2.5 py-1.5 tabular-nums text-ink-500">{n.filaNum}</td>
                      <td className="px-2.5 py-1.5 text-ink-700">{n.placa ?? "—"}</td>
                      <td className="px-2.5 py-1.5 text-ink-700">{n.descripcion ?? "—"}</td>
                      <td className={`whitespace-nowrap px-2.5 py-1.5 text-right tabular-nums ${n.costo != null ? "font-semibold text-err-700" : "text-ink-400"}`}>{n.costo != null ? fmtContable(n.costo) : "—"}</td>
                      <td className={`whitespace-nowrap px-2.5 py-1.5 text-right tabular-nums ${n.neto != null ? "font-semibold text-err-700" : "text-ink-400"}`}>{n.neto != null ? fmtContable(n.neto) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {v.negativos.cantidad > MAX_VISIBLES && <span className="text-[11.5px] text-ink-500">Se muestran los primeros {MAX_VISIBLES}.</span>}
          </div>
        )}
        {v.netoVsCalculado.cantidad > 0 && (
          <div className="flex flex-col gap-1.5">
            <div className="text-[12.5px] font-semibold text-warn-700">
              {v.netoVsCalculado.cantidad.toLocaleString("es-CO")} {v.netoVsCalculado.cantidad === 1 ? "activo" : "activos"} donde el costo neto del archivo no es el calculado (solo informa)
            </div>
            <div className="overflow-x-auto rounded-md border border-ink-150">
              <table className="w-full text-[12px]">
                <thead className="bg-ink-50 text-left text-ink-500">
                  <tr>
                    <th className="px-2.5 py-1.5 font-semibold">Fila</th>
                    <th className="px-2.5 py-1.5 font-semibold">Placa</th>
                    <th className="px-2.5 py-1.5 text-right font-semibold">Neto del archivo</th>
                    <th className="px-2.5 py-1.5 text-right font-semibold">Neto calculado</th>
                    <th className="px-2.5 py-1.5 text-right font-semibold">Diferencia</th>
                  </tr>
                </thead>
                <tbody>
                  {v.netoVsCalculado.filas.slice(0, MAX_VISIBLES).map((n) => (
                    <tr key={n.filaNum} className="border-t border-ink-100">
                      <td className="whitespace-nowrap px-2.5 py-1.5 tabular-nums text-ink-500">{n.filaNum}</td>
                      <td className="px-2.5 py-1.5 text-ink-700">{n.placa ?? "—"}</td>
                      <td className="whitespace-nowrap px-2.5 py-1.5 text-right tabular-nums text-ink-700">{fmtContable(n.archivo)}</td>
                      <td className="whitespace-nowrap px-2.5 py-1.5 text-right tabular-nums text-ink-700">{fmtContable(n.calculado)}</td>
                      <td className="whitespace-nowrap px-2.5 py-1.5 text-right tabular-nums font-semibold text-warn-700">{fmtContable(n.diferencia)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
