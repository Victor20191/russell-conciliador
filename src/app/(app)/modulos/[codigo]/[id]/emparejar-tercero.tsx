"use client";

import { useState, useTransition } from "react";
import { Modal } from "@/components/modal";
import { SelectBuscable } from "@/components/select-buscable";
import { fmtContable } from "@/lib/format";
import { notifyError, notifySuccess } from "@/lib/client-notifications";
import { emparejarTerceroCruce } from "@/app/actions/modulos-datos";
import { MAX_NOTA_MARCA, type FilaCruceTerceroMarcada } from "@/lib/modulos/marcas-cruce";
import { describirSenales } from "@/lib/modulos/cartera/coherencia-tercero";
import { etiquetaTercero } from "./marca-tercero";

/**
 * Emparejar un tercero que solo está en el auxiliar con uno de la contabilidad: «el X del
 * auxiliar es el Y del balance». Queda en la memoria del cliente (por defecto para todos sus
 * períodos). Cuando la validación de coherencia propone un tercero, se parte de él.
 */
export function ModalEmparejarTercero({
  fila,
  candidatos,
  encabezadoId,
  onClose,
  onGuardado,
}: {
  fila: FilaCruceTerceroMarcada;
  /** Terceros con saldo en la contabilidad del período. */
  candidatos: FilaCruceTerceroMarcada[];
  encabezadoId: number;
  onClose: () => void;
  onGuardado: () => void;
}) {
  const sugerida = fila.sugerencia?.clave ?? "";
  const [claveBalance, setClaveBalance] = useState(sugerida);
  const [alcance, setAlcance] = useState<"todos" | "periodo">("todos");
  const [nota, setNota] = useState("");
  const [guardando, start] = useTransition();
  const elegido = candidatos.find((c) => c.clave === claveBalance) ?? null;
  const opciones = candidatos
    .filter((c) => c.clave !== fila.clave)
    .map((c) => ({ value: c.clave, label: `${etiquetaTercero(c)} · ${fmtContable(c.contable.total)}` }));

  const emparejar = () => {
    if (!claveBalance || guardando) return;
    start(async () => {
      const r = await emparejarTerceroCruce({
        encabezadoId,
        claveModulo: fila.clave,
        claveBalance,
        alcance,
        origen: claveBalance === sugerida ? "sugerido_coherencia" : "manual",
        nota: nota.trim() || undefined,
      });
      if (r.ok) {
        notifySuccess(r.message ?? "Tercero emparejado.");
        onGuardado();
      } else {
        notifyError(r.message ?? "No se pudo emparejar el tercero.");
      }
    });
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`Emparejar · ${etiquetaTercero(fila)}`}
      size="xl"
      footer={
        <button
          type="button"
          onClick={emparejar}
          disabled={!claveBalance || guardando}
          className="inline-flex items-center gap-1.5 rounded-md bg-navy-700 px-3.5 py-2 text-[13px] font-semibold text-white hover:bg-navy-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {guardando ? "Emparejando…" : "Emparejar"}
        </button>
      }
    >
      <div className="flex flex-col gap-3 text-[12.5px] text-ink-700">
        <p>
          Este tercero está en el auxiliar por <b>{fmtContable(fila.modulo.total)}</b> y no aparece en la contabilidad del período. Elige a qué tercero del balance corresponde: su saldo pasará a cruzarse con el de ese tercero.
        </p>

        {fila.sugerencia && (
          <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-[12px] text-blue-800">
            Propuesta de la validación de coherencia (confianza {fila.sugerencia.confianza}): <b>{fila.sugerencia.nombre ?? fila.sugerencia.clave}</b> ({fila.sugerencia.clave}) — {describirSenales(fila.sugerencia.senales)}. Confírmala o elige otro tercero.
          </div>
        )}

        <div className="flex flex-col gap-1">
          <span className="text-[12px] font-semibold text-ink-700">Tercero del balance</span>
          <SelectBuscable
            opciones={opciones}
            value={claveBalance}
            onChange={setClaveBalance}
            placeholder="Buscar por NIT o nombre…"
            sinResultados="Ningún tercero de la contabilidad coincide."
          />
          {elegido && (
            <span className="text-[11.5px] text-ink-500">
              En la contabilidad: {fmtContable(elegido.contable.total)} · en el auxiliar: {fmtContable(elegido.modulo.total)}. Emparejado, el auxiliar sumará {fmtContable(elegido.modulo.total + fila.modulo.total)}.
            </span>
          )}
        </div>

        <fieldset className="flex flex-col gap-1">
          <legend className="mb-1 text-[12px] font-semibold text-ink-700">Alcance</legend>
          <label className="flex items-center gap-2">
            <input type="radio" name="alcance-emparejamiento" checked={alcance === "todos"} onChange={() => setAlcance("todos")} />
            Todos los períodos del cliente
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" name="alcance-emparejamiento" checked={alcance === "periodo"} onChange={() => setAlcance("periodo")} />
            Solo este período
          </label>
        </fieldset>

        <label className="flex flex-col gap-1">
          <span className="text-[12px] font-semibold text-ink-700">
            Nota <span className="font-normal text-ink-400">(opcional)</span>
          </span>
          <textarea
            value={nota}
            onChange={(e) => setNota(e.target.value.slice(0, MAX_NOTA_MARCA))}
            rows={3}
            placeholder="Por qué es el mismo tercero (p. ej. el auxiliar lo registra sin NIT)."
            className="resize-y rounded-md border border-ink-200 px-3 py-2 text-[12.5px] focus:outline-none focus:ring-2 focus:ring-navy-600"
          />
        </label>
      </div>
    </Modal>
  );
}
