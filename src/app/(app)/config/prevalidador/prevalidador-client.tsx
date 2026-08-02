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

const CONTROL_CLASS =
  "h-9 w-full rounded-md border border-ink-200 bg-white px-2.5 text-[12.5px] text-ink-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100";

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
    <div className="rounded-lg border border-ink-150 bg-white p-3.5 shadow-[0_1px_2px_rgba(15,23,42,0.03)] transition-colors focus-within:border-blue-200">
      <form
        action={guardarAction}
        className="grid grid-cols-1 gap-x-3 gap-y-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-[minmax(8.5rem,1fr)_6rem_minmax(13rem,1.5fr)_minmax(13rem,1.4fr)_5rem_7rem_auto] xl:items-start"
      >
        {fila && <input type="hidden" name="id" value={fila.id} />}
        <Campo etiqueta="Módulo">
          <select
            name="moduloId"
            defaultValue={fila?.moduloId ?? modulos[0]?.id}
            className={CONTROL_CLASS}
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
            className={`${CONTROL_CLASS} font-mono tabular-nums`}
          />
        </Campo>

        <Campo etiqueta="Etiqueta">
          <input
            name="etiqueta"
            defaultValue={fila?.etiqueta ?? ""}
            maxLength={120}
            placeholder="Ingresos operacionales"
            className={CONTROL_CLASS}
          />
        </Campo>

        <Campo
          etiqueta="Base de cálculo"
          ayuda={sugerida ? `Por la clase le corresponde: ${sugerida === "saldo" ? "saldo final" : "movimiento"}` : undefined}
        >
          <select
            name="baseCalculo"
            defaultValue={fila?.baseCalculo ?? "saldo"}
            className={CONTROL_CLASS}
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
            className={`${CONTROL_CLASS} font-mono tabular-nums`}
          />
        </Campo>

        <div className="flex min-w-0 flex-col gap-1">
          <span className="text-[11px] font-medium text-ink-600">Estado</span>
          <label className="flex h-9 cursor-pointer items-center gap-2 rounded-md border border-ink-200 bg-ink-50/60 px-2.5 text-[12px] text-ink-600 transition hover:border-ink-300 hover:bg-ink-50">
            <input
              type="checkbox"
              name="activa"
              value="si"
              defaultChecked={fila?.activa ?? true}
              className="h-4 w-4 rounded border-ink-300 accent-navy-700"
            />
            Activa
          </label>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 sm:col-span-2 lg:col-span-3 xl:col-span-1 xl:pt-5">
          {onCancelar && (
            <button
              type="button"
              onClick={onCancelar}
              className="inline-flex h-9 items-center justify-center rounded-md border border-ink-200 bg-white px-3 text-[12px] font-semibold text-ink-600 transition hover:border-ink-300 hover:bg-ink-50"
            >
              Cancelar
            </button>
          )}
          <button
            type="submit"
            disabled={guardando}
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md bg-navy-700 px-3.5 text-[12px] font-semibold text-white shadow-sm transition hover:bg-navy-600 disabled:opacity-50"
          >
            {!guardando && <Icon name={fila ? "check" : "plus"} size={13} />}
            {guardando ? <EstadoProcesando>Guardando</EstadoProcesando> : fila ? "Guardar" : "Agregar"}
          </button>
          {fila && (
            <button
              type="button"
              onClick={() => setConfirmarBorrado(true)}
              title="Para retirarla del informe sin perder la configuración de los balances, desmarca «Activa»."
              aria-label={`Eliminar la cuenta ${fila.cuentaRussell} del prevalidador`}
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-ink-200 bg-white text-ink-500 transition hover:border-red-200 hover:bg-red-50 hover:text-err-700"
            >
              <Icon name="trash" size={13} />
            </button>
          )}
        </div>
      </form>

      {fila && (fila.actualizadoEn || fila.balancesConCuentaPropia > 0) && (
        <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 border-t border-ink-100 pt-2.5">
          {fila.actualizadoEn ? (
            <p className="text-[11px] text-ink-400">
              Editado {fmtDateTime(fila.actualizadoEn)}
              {fila.actualizadoPor ? ` · ${fila.actualizadoPor}` : ""}
            </p>
          ) : (
            <span />
          )}
          {fila.balancesConCuentaPropia > 0 && (
            <Chip label={`${fila.balancesConCuentaPropia} balance(s) con cuenta propia`} tone="ai" />
          )}
        </div>
      )}

      {fila && confirmarBorrado && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-md border border-err-100 bg-err-100/35 px-3 py-2">
          <span className="min-w-[220px] flex-1 text-[11.5px] text-ink-600">
            {fila.balancesConCuentaPropia > 0
              ? `Esta acción también eliminará ${fila.balancesConCuentaPropia} cuenta(s) propia(s) asociada(s).`
              : `¿Eliminar la cuenta ${fila.cuentaRussell} del catálogo?`}
          </span>
          <button
            type="button"
            onClick={() => setConfirmarBorrado(false)}
            disabled={borrando}
            className="inline-flex h-8 items-center justify-center rounded-md border border-ink-200 bg-white px-3 text-[12px] font-semibold text-ink-600 transition hover:bg-ink-50 disabled:opacity-60"
          >
            Cancelar
          </button>
          <button
            type="submit"
            form={`borrar-${fila.id}`}
            disabled={borrando}
            className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-err-100 bg-white px-3 text-[12px] font-semibold text-err-700 transition hover:bg-err-100/60 disabled:opacity-60"
          >
            {!borrando && <Icon name="trash" size={12} />}
            {borrando ? <EstadoProcesando>Eliminando</EstadoProcesando> : "Sí, eliminar"}
          </button>
        </div>
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
    <label className="flex min-w-0 flex-col gap-1">
      <span className="text-[11px] font-medium text-ink-600">{etiqueta}</span>
      {children}
      {ayuda && <span className="text-[10.5px] leading-4 text-ink-400">{ayuda}</span>}
    </label>
  );
}
