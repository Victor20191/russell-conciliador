"use client";

import { useMemo, useState, useTransition } from "react";
import { Chip } from "@/components/ui";
import { Modal } from "@/components/modal";
import { fmtContable } from "@/lib/format";
import { notifyError, notifySuccess } from "@/lib/client-notifications";
import { aplicarEmparejamientosSugeridos } from "@/app/actions/modulos-datos";
import { ETIQUETA_SENAL, type SugerenciaEmparejamiento } from "@/lib/modulos/cartera/coherencia-tercero";

/**
 * Validación de coherencia: las coincidencias que el cruce encontró entre terceros que quedaron
 * solo en el auxiliar y solo en la contabilidad, con su evidencia (mismo saldo, NIT con sufijo,
 * nombre parecido) y su confianza. El auditor marca las que acepta y las aplica en lote; las de
 * confianza alta vienen marcadas. Nada se aplica sin pasar por aquí o por «Emparejar…».
 */
export function ModalValidarCoherencia({
  sugerencias,
  encabezadoId,
  etiquetaClave,
  onClose,
  onGuardado,
}: {
  sugerencias: SugerenciaEmparejamiento[];
  encabezadoId: number;
  etiquetaClave: string;
  onClose: () => void;
  onGuardado: () => void;
}) {
  const [marcadas, setMarcadas] = useState<Set<string>>(
    () => new Set(sugerencias.filter((s) => s.confianza === "alta").map((s) => s.claveModulo)),
  );
  const [alcance, setAlcance] = useState<"todos" | "periodo">("todos");
  const [guardando, start] = useTransition();
  const seleccionadas = useMemo(() => sugerencias.filter((s) => marcadas.has(s.claveModulo)), [sugerencias, marcadas]);
  const altas = sugerencias.filter((s) => s.confianza === "alta").length;

  const alternar = (clave: string) =>
    setMarcadas((actual) => {
      const siguiente = new Set(actual);
      if (siguiente.has(clave)) siguiente.delete(clave);
      else siguiente.add(clave);
      return siguiente;
    });
  const marcarTodas = (cuales: SugerenciaEmparejamiento[]) => setMarcadas(new Set(cuales.map((s) => s.claveModulo)));

  const aplicar = () => {
    if (seleccionadas.length === 0 || guardando) return;
    start(async () => {
      const r = await aplicarEmparejamientosSugeridos({
        encabezadoId,
        pares: seleccionadas.map((s) => ({ claveModulo: s.claveModulo, claveBalance: s.claveBalance })),
        alcance,
      });
      if (r.ok) {
        notifySuccess(r.message ?? "Emparejamientos aplicados.");
        onGuardado();
      } else {
        notifyError(r.message ?? "No se pudieron aplicar los emparejamientos.");
      }
    });
  };

  const etiqueta = (clave: string, nombre: string | null) =>
    clave.startsWith("~") ? `${nombre ?? clave.slice(1)} (sin ${etiquetaClave})` : clave;

  return (
    <Modal
      open
      onClose={onClose}
      title="Validar coherencia de terceros"
      size="xl"
      footer={
        <button
          type="button"
          onClick={aplicar}
          disabled={seleccionadas.length === 0 || guardando}
          className="inline-flex items-center gap-1.5 rounded-md bg-navy-700 px-3.5 py-2 text-[13px] font-semibold text-white hover:bg-navy-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {guardando ? "Aplicando…" : `Aplicar ${seleccionadas.length} ${seleccionadas.length === 1 ? "emparejamiento" : "emparejamientos"}`}
        </button>
      }
    >
      <div className="flex flex-col gap-3 text-[12.5px] text-ink-700">
        <p>
          Terceros que quedaron <b>solo en el auxiliar</b> y <b>solo en la contabilidad</b> con señales de ser el mismo. Cada par se
          propone únicamente cuando es el mejor candidato en los dos sentidos; las de confianza <b>alta</b> (dos señales o más) vienen marcadas.
          Al aplicar, el saldo del auxiliar pasa a cruzarse con el del tercero del balance, como con «Emparejar…».
        </p>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px]">
          <span className="text-ink-500">
            {sugerencias.length} {sugerencias.length === 1 ? "propuesta" : "propuestas"} · {altas} de confianza alta
          </span>
          <button type="button" onClick={() => marcarTodas(sugerencias.filter((s) => s.confianza === "alta"))} className="font-semibold text-blue-700 hover:underline">
            Marcar las de confianza alta
          </button>
          <button type="button" onClick={() => marcarTodas(sugerencias)} className="font-semibold text-blue-700 hover:underline">
            Marcar todas
          </button>
          <button type="button" onClick={() => setMarcadas(new Set())} className="font-semibold text-blue-700 hover:underline">
            Desmarcar todas
          </button>
        </div>

        <div className="overflow-x-auto rounded-md border border-ink-150">
          <table className="w-full text-[12px]">
            <thead className="bg-ink-50 text-left text-ink-500">
              <tr>
                <th className="w-px px-2 py-2" />
                <th className="px-2 py-2 font-semibold">Auxiliar (módulo)</th>
                <th className="px-2 py-2 text-right font-semibold">Saldo auxiliar</th>
                <th className="px-2 py-2 font-semibold">Contabilidad</th>
                <th className="px-2 py-2 text-right font-semibold">Saldo contable</th>
                <th className="px-2 py-2 font-semibold">Evidencia</th>
                <th className="px-2 py-2 font-semibold">Confianza</th>
              </tr>
            </thead>
            <tbody>
              {sugerencias.map((s) => {
                const marcada = marcadas.has(s.claveModulo);
                return (
                  <tr key={s.claveModulo} className={`border-t border-ink-100 ${marcada ? "bg-blue-50/60" : ""}`}>
                    <td className="px-2 py-1.5 align-top">
                      <input type="checkbox" checked={marcada} onChange={() => alternar(s.claveModulo)} aria-label={`Aplicar ${s.claveModulo}`} />
                    </td>
                    <td className="px-2 py-1.5 align-top">
                      <div className="font-medium text-ink-800">{etiqueta(s.claveModulo, s.nombreModulo)}</div>
                      {!s.claveModulo.startsWith("~") && s.nombreModulo && <div className="text-ink-500">{s.nombreModulo}</div>}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums align-top">{fmtContable(s.saldoModulo)}</td>
                    <td className="px-2 py-1.5 align-top">
                      <div className="font-medium text-ink-800">{etiqueta(s.claveBalance, s.nombreBalance)}</div>
                      {!s.claveBalance.startsWith("~") && s.nombreBalance && <div className="text-ink-500">{s.nombreBalance}</div>}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums align-top">{fmtContable(s.saldoContable)}</td>
                    <td className="px-2 py-1.5 align-top">
                      <div className="flex flex-wrap gap-1">
                        {s.senales.map((x) => <Chip key={x} label={ETIQUETA_SENAL[x]} tone="ink" />)}
                      </div>
                    </td>
                    <td className="px-2 py-1.5 align-top">
                      <Chip label={s.confianza === "alta" ? "Alta" : "Media"} tone={s.confianza === "alta" ? "ok" : "warn"} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <fieldset className="flex flex-col gap-1">
          <legend className="mb-1 text-[12px] font-semibold text-ink-700">Alcance</legend>
          <label className="flex items-center gap-2">
            <input type="radio" name="alcance-coherencia" checked={alcance === "todos"} onChange={() => setAlcance("todos")} />
            Todos los períodos del cliente
            <span className="text-ink-400">(la forma en que cada lado escribe el tercero es del ERP, no del mes)</span>
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" name="alcance-coherencia" checked={alcance === "periodo"} onChange={() => setAlcance("periodo")} />
            Solo este período
          </label>
        </fieldset>
      </div>
    </Modal>
  );
}
