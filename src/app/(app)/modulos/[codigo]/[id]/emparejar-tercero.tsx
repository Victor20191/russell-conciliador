"use client";

import { useState, useTransition } from "react";
import { Modal } from "@/components/modal";
import { SelectBuscable } from "@/components/select-buscable";
import { fmtContable } from "@/lib/format";
import { notifyError, notifySuccess } from "@/lib/client-notifications";
import { emparejarTerceroContable, emparejarTerceroCruce } from "@/app/actions/modulos-datos";
import { MAX_NOTA_MARCA, type FilaCruceTerceroMarcada } from "@/lib/modulos/marcas-cruce";
import { describirSenales } from "@/lib/modulos/cartera/coherencia-tercero";
import { etiquetaTercero } from "./marca-tercero";

/**
 * Emparejar un tercero suelto con el renglón que le corresponde. Queda en la memoria del cliente
 * (por defecto para todos sus períodos). Dos direcciones:
 *  - solo en el AUXILIAR: «el X del auxiliar es el Y del balance» (candidatos: terceros con saldo
 *    en la contabilidad);
 *  - solo en la CONTABILIDAD: «el X de la contabilidad es el Y del auxiliar», el mismo tercero con
 *    otro NIT en el balance (candidatos: terceros con saldo en el auxiliar).
 * Se parte de la propuesta de la validación de coherencia o del renglón cuya diferencia explica.
 */
export function ModalEmparejarTercero({
  fila,
  candidatos,
  destinoInicial,
  encabezadoId,
  onClose,
  onGuardado,
}: {
  fila: FilaCruceTerceroMarcada;
  /** Terceros del otro lado: con saldo en la contabilidad o, si `fila` es contable, en el auxiliar. */
  candidatos: FilaCruceTerceroMarcada[];
  /** Renglón destino preelegido (p. ej. desde el renglón con diferencia que este tercero explica). */
  destinoInicial?: string | null;
  encabezadoId: number;
  onClose: () => void;
  onGuardado: () => void;
}) {
  const desdeContable = fila.estado === "solo_contable";
  const sugerida = fila.sugerencia?.clave ?? null;
  // La compensación apunta al renglón con diferencia cuando este tercero es el suelto.
  const compensa = fila.explicaDiferencia?.rol === "descuadre" ? fila.explicaDiferencia.clave : null;
  const [claveDestino, setClaveDestino] = useState(destinoInicial ?? compensa ?? sugerida ?? "");
  const [alcance, setAlcance] = useState<"todos" | "periodo">("todos");
  const [nota, setNota] = useState("");
  const [guardando, start] = useTransition();
  const elegido = candidatos.find((c) => c.clave === claveDestino) ?? null;
  const importe = desdeContable ? fila.contable.total : fila.modulo.total;
  const opciones = candidatos
    .filter((c) => c.clave !== fila.clave)
    .map((c) => ({
      value: c.clave,
      label: `${etiquetaTercero(c)} · ${fmtContable(desdeContable ? c.modulo.total : c.contable.total)}`,
    }));

  const emparejar = () => {
    if (!claveDestino || guardando) return;
    start(async () => {
      const comun = {
        encabezadoId,
        alcance,
        origen: claveDestino === sugerida ? ("sugerido_coherencia" as const) : ("manual" as const),
        nota: nota.trim() || undefined,
      };
      const r = desdeContable
        ? await emparejarTerceroContable({ ...comun, claveContable: fila.clave, claveDestino })
        : await emparejarTerceroCruce({ ...comun, claveModulo: fila.clave, claveBalance: claveDestino });
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
          disabled={!claveDestino || guardando}
          className="inline-flex items-center gap-1.5 rounded-md bg-navy-700 px-3.5 py-2 text-[13px] font-semibold text-white hover:bg-navy-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {guardando ? "Emparejando…" : "Emparejar"}
        </button>
      }
    >
      <div className="flex flex-col gap-3 text-[12.5px] text-ink-700">
        <p>
          {desdeContable ? (
            <>
              Este tercero está en la contabilidad por <b>{fmtContable(importe)}</b> y no aparece en el auxiliar. Elige con qué tercero del auxiliar corresponde (el mismo tercero con otro NIT en el balance): su saldo contable se sumará al de ese renglón.
            </>
          ) : (
            <>
              Este tercero está en el auxiliar por <b>{fmtContable(importe)}</b> y no aparece en la contabilidad del período. Elige a qué tercero del balance corresponde: su saldo pasará a cruzarse con el de ese tercero.
            </>
          )}
        </p>

        {compensa && (
          <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-[12px] text-blue-800">
            Su saldo es exactamente la diferencia de <b>{fila.explicaDiferencia?.nombre ?? compensa}</b> ({compensa}): probablemente es el mismo tercero con otro NIT.
          </div>
        )}
        {fila.sugerencia && (
          <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-[12px] text-blue-800">
            Propuesta de la validación de coherencia (confianza {fila.sugerencia.confianza}): <b>{fila.sugerencia.nombre ?? fila.sugerencia.clave}</b> ({fila.sugerencia.clave}) — {describirSenales(fila.sugerencia.senales)}. Confírmala o elige otro tercero.
          </div>
        )}

        <div className="flex flex-col gap-1">
          <span className="text-[12px] font-semibold text-ink-700">{desdeContable ? "Tercero del auxiliar" : "Tercero del balance"}</span>
          <SelectBuscable
            opciones={opciones}
            value={claveDestino}
            onChange={setClaveDestino}
            placeholder="Buscar por NIT o nombre…"
            sinResultados={desdeContable ? "Ningún tercero del auxiliar coincide." : "Ningún tercero de la contabilidad coincide."}
          />
          {elegido && (
            <span className="text-[11.5px] text-ink-500">
              {desdeContable ? (
                <>
                  En la contabilidad: {fmtContable(elegido.contable.total)} · en el auxiliar: {fmtContable(elegido.modulo.total)}. Emparejado, la contabilidad sumará {fmtContable(elegido.contable.total + importe)}
                  {Math.abs(elegido.contable.total + importe - elegido.modulo.total) <= 0.01 ? " y cuadra." : "."}
                </>
              ) : (
                <>
                  En la contabilidad: {fmtContable(elegido.contable.total)} · en el auxiliar: {fmtContable(elegido.modulo.total)}. Emparejado, el auxiliar sumará {fmtContable(elegido.modulo.total + importe)}
                  {Math.abs(elegido.contable.total - (elegido.modulo.total + importe)) <= 0.01 ? " y cuadra." : "."}
                </>
              )}
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
            placeholder={desdeContable ? "Por qué es el mismo tercero (p. ej. el balance lo registra con otro NIT)." : "Por qué es el mismo tercero (p. ej. el auxiliar lo registra sin NIT)."}
            className="resize-y rounded-md border border-ink-200 px-3 py-2 text-[12.5px] focus:outline-none focus:ring-2 focus:ring-navy-600"
          />
        </label>
      </div>
    </Modal>
  );
}
