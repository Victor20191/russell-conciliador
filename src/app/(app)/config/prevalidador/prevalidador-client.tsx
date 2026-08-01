"use client";

import { useActionState, useEffect, useState } from "react";
import { EstadoProcesando } from "@/components/estado-procesando";
import { Card, Chip } from "@/components/ui";
import { Icon } from "@/components/icons";
import { fmtDateTime } from "@/lib/format";
import { notifyActionState } from "@/lib/client-notifications";
import { eliminarFilaPrevalidador, guardarFilaPrevalidador } from "@/app/actions/prevalidador";
import type { ActionState } from "@/lib/definitions";
import type { FilaCatalogoVista } from "@/lib/parametros/prevalidador";
import { baseCalculoPorDefecto } from "@/lib/balance/prevalidador/catalogo";

type ModuloOpcion = { id: number; code: string; name: string };

export default function PrevalidadorConfigClient({
  catalogo,
  modulos,
}: {
  catalogo: FilaCatalogoVista[];
  modulos: ModuloOpcion[];
}) {
  const [creando, setCreando] = useState(false);

  // Un bloque por módulo, respetando el orden en que se muestran en el informe.
  const porModulo = modulos
    .map((m) => ({ modulo: m, filas: catalogo.filter((f) => f.moduloCodigo === m.code) }))
    .filter((g) => g.filas.length > 0)
    .sort((a, b) => (a.filas[0]?.moduloOrden ?? 999) - (b.filas[0]?.moduloOrden ?? 999));
  const sinFilas = modulos.filter((m) => !catalogo.some((f) => f.moduloCodigo === m.code));

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-md border border-warn-100 bg-warn-100/40 px-3 py-2.5 text-[12.5px] text-warn-700">
        Los cambios actualizan el cálculo vigente de los balances. Toda revisión aprobada conserva su instantánea y
        queda marcada como desactualizada si el catálogo usado para aprobar ya no coincide.
      </div>

      <div className="flex items-center justify-between">
        <p className="text-[12px] text-ink-500">
          {catalogo.length} cuenta(s) configuradas · {catalogo.filter((f) => f.activa).length} activa(s)
        </p>
        {!creando && (
          <button
            type="button"
            onClick={() => setCreando(true)}
            className="inline-flex items-center gap-1.5 rounded-md bg-navy-700 px-3 py-1.5 text-[12.5px] font-semibold text-white hover:bg-navy-600"
          >
            <Icon name="plus" size={13} /> Agregar cuenta
          </button>
        )}
      </div>

      {creando && (
        <Card className="p-4">
          <h2 className="mb-3 text-[13px] font-semibold text-ink-900">Nueva cuenta del prevalidador</h2>
          <FilaEditor modulos={modulos} onListo={() => setCreando(false)} onCancelar={() => setCreando(false)} />
        </Card>
      )}

      {porModulo.map(({ modulo, filas }) => (
        <Card key={modulo.id} className="p-4">
          <div className="mb-3 flex items-center gap-2">
            <Icon name="settings" size={15} />
            <h2 className="text-[14px] font-semibold text-ink-900">{modulo.name}</h2>
            <span className="text-[11px] text-ink-400">{modulo.code}</span>
          </div>
          <div className="flex flex-col gap-2">
            {filas.map((f) => (
              <FilaEditor key={f.id} fila={f} modulos={modulos} />
            ))}
          </div>
        </Card>
      ))}

      {sinFilas.length > 0 && (
        <p className="text-[11.5px] text-ink-400">
          Módulos sin cuentas configuradas: {sinFilas.map((m) => m.name).join(", ")}. No aparecerán en el informe.
        </p>
      )}
    </div>
  );
}

function FilaEditor({
  fila,
  modulos,
  onListo,
  onCancelar,
}: {
  fila?: FilaCatalogoVista;
  modulos: ModuloOpcion[];
  onListo?: () => void;
  onCancelar?: () => void;
}) {
  const [guardarState, guardarAction, guardando] = useActionState<ActionState, FormData>(guardarFilaPrevalidador, {});
  const [borrarState, borrarAction, borrando] = useActionState<ActionState, FormData>(eliminarFilaPrevalidador, {});
  const [confirmarBorrado, setConfirmarBorrado] = useState(false);
  const [cuenta, setCuenta] = useState(fila?.cuentaRussell ?? "");

  useEffect(() => {
    notifyActionState(guardarState, { success: "Cuenta guardada.", error: "No se pudo guardar la cuenta." });
    if (guardarState?.ok) onListo?.();
  }, [guardarState, onListo]);

  useEffect(() => {
    notifyActionState(borrarState, { success: "Cuenta eliminada.", error: "No se pudo eliminar la cuenta." });
  }, [borrarState]);

  const sugerida = cuenta ? baseCalculoPorDefecto(cuenta.replace(/[\s.]/g, "")) : null;

  return (
    <div className="rounded-md border border-ink-150 p-3">
      <form action={guardarAction} className="flex flex-wrap items-end gap-3">
        {fila && <input type="hidden" name="id" value={fila.id} />}
        <Campo etiqueta="Módulo">
          <select
            name="moduloId"
            defaultValue={fila?.moduloId ?? modulos[0]?.id}
            className="rounded-md border border-ink-200 bg-white px-2.5 py-1.5 text-[12.5px] text-ink-700 outline-none focus:border-blue-400"
          >
            {modulos.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </Campo>

        <Campo etiqueta="Cuenta Russell">
          <input
            name="cuentaRussell"
            value={cuenta}
            onChange={(e) => setCuenta(e.target.value)}
            inputMode="numeric"
            maxLength={4}
            placeholder="41"
            className="w-24 rounded-md border border-ink-200 bg-white px-2.5 py-1.5 font-mono text-[12.5px] text-ink-700 outline-none focus:border-blue-400"
          />
        </Campo>

        <Campo etiqueta="Etiqueta">
          <input
            name="etiqueta"
            defaultValue={fila?.etiqueta ?? ""}
            maxLength={120}
            placeholder="Ingresos operacionales"
            className="w-56 rounded-md border border-ink-200 bg-white px-2.5 py-1.5 text-[12.5px] text-ink-700 outline-none focus:border-blue-400"
          />
        </Campo>

        <Campo
          etiqueta="Base de cálculo"
          ayuda={sugerida ? `Por la clase le corresponde: ${sugerida === "saldo" ? "saldo final" : "movimiento"}` : undefined}
        >
          <select
            name="baseCalculo"
            defaultValue={fila?.baseCalculo ?? "saldo"}
            className="rounded-md border border-ink-200 bg-white px-2.5 py-1.5 text-[12.5px] text-ink-700 outline-none focus:border-blue-400"
          >
            <option value="saldo">Saldo final</option>
            <option value="movimiento">Movimiento (débitos − créditos)</option>
          </select>
        </Campo>

        <Campo etiqueta="Orden">
          <input
            name="orden"
            type="number"
            min={0}
            max={9999}
            defaultValue={fila?.orden ?? 10}
            className="w-20 rounded-md border border-ink-200 bg-white px-2.5 py-1.5 text-[12.5px] text-ink-700 outline-none focus:border-blue-400"
          />
        </Campo>

        <label className="flex items-center gap-1.5 pb-1.5 text-[12px] text-ink-600">
          <input type="checkbox" name="activa" value="si" defaultChecked={fila?.activa ?? true} className="accent-navy-700" />
          Activa
        </label>

        <div className="ml-auto flex items-center gap-2 pb-0.5">
          {fila && fila.balancesConCuentaPropia > 0 && (
            <Chip label={`${fila.balancesConCuentaPropia} balance(s) con cuenta propia`} tone="ai" />
          )}
          <button
            type="submit"
            disabled={guardando}
            className="rounded-md bg-navy-700 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-navy-600 disabled:opacity-50"
          >
            {guardando ? <EstadoProcesando>Guardando</EstadoProcesando> : fila ? "Guardar" : "Agregar"}
          </button>
          {onCancelar && (
            <button
              type="button"
              onClick={onCancelar}
              className="rounded-md border border-ink-200 px-3 py-1.5 text-[12px] font-semibold text-ink-600 hover:bg-ink-50"
            >
              Cancelar
            </button>
          )}
          {fila &&
            (confirmarBorrado ? (
              <div className="flex items-center gap-1.5">
                <span className="text-[11.5px] text-ink-500">
                  {fila.balancesConCuentaPropia > 0
                    ? `¿Eliminar y perder ${fila.balancesConCuentaPropia} cuenta(s) propia(s) de balance?`
                    : "¿Eliminar?"}
                </span>
                <button
                  type="submit"
                  form={`borrar-${fila.id}`}
                  disabled={borrando}
                  className="rounded-md border border-err-100 px-2.5 py-1.5 text-[12px] font-semibold text-err-700 hover:bg-err-100/50 disabled:opacity-60"
                >
                  {borrando ? <EstadoProcesando>Eliminando</EstadoProcesando> : "Sí, eliminar"}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmarBorrado(false)}
                  className="rounded-md border border-ink-200 px-2.5 py-1.5 text-[12px] font-semibold text-ink-600 hover:bg-ink-50"
                >
                  Cancelar
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmarBorrado(true)}
                title="Para retirarla del informe sin perder la configuración de los clientes, desmarca «Activa»."
                className="rounded-md border border-ink-200 p-1.5 text-ink-500 hover:bg-ink-50 hover:text-err-700"
              >
                <Icon name="trash" size={13} />
              </button>
            ))}
        </div>
      </form>

      {fila?.actualizadoEn && (
        <p className="mt-2 text-[11px] text-ink-400">
          Editado {fmtDateTime(fila.actualizadoEn)}
          {fila.actualizadoPor ? ` · ${fila.actualizadoPor}` : ""}
        </p>
      )}

      {/* Form separado para eliminar (no puede anidarse en el de guardar). */}
      {fila && (
        <form id={`borrar-${fila.id}`} action={borrarAction} className="hidden">
          <input type="hidden" name="id" value={fila.id} />
        </form>
      )}
    </div>
  );
}

function Campo({ etiqueta, ayuda, children }: { etiqueta: string; ayuda?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-medium text-ink-600">{etiqueta}</span>
      {children}
      {ayuda && <span className="text-[10.5px] text-ink-400">{ayuda}</span>}
    </label>
  );
}
