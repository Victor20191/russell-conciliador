"use client";

import { useActionState, useEffect, useId, useMemo, useState } from "react";
import { EstadoProcesando } from "@/components/estado-procesando";
import { Card, Chip } from "@/components/ui";
import { Icon } from "@/components/icons";
import { fmtDateTime } from "@/lib/format";
import { notifyActionState } from "@/lib/client-notifications";
import { guardarCuentaConciliacion, quitarCuentaConciliacion } from "@/app/actions/cuentas-conciliacion";
import type { ActionState } from "@/lib/definitions";
import type { FilaCatalogoVista } from "@/lib/parametros/prevalidador";
import type { CuentaConciliacionVista } from "@/lib/parametros/cuentas-conciliacion";
import { cuenta4DelModulo, prefijosCuentaModulo } from "@/lib/modulos/cuentas-modulo";
import { Campo, CONTROL_CLASS } from "./prevalidador-client";

export type CuentaPlanVm = { codigo: string; nombre: string };

/** Módulo que concilia a 6 dígitos; `conOrigen` = sus cuentas deciden nacional/exterior (Cartera y CxP). */
export type ModuloCuentasVm = { code: string; name: string; conOrigen: boolean; conCrucePorTercero: boolean };

const ORIGENES = [
  { value: "", label: "Sin origen" },
  { value: "nacional", label: "Nacional" },
  { value: "exterior", label: "Exterior" },
] as const;

// Mismo diseño de fila que los prefijos del prevalidador (`FilaEditor`); la columna del origen solo
// existe en Cartera y CxP.
const GRID_CON_ORIGEN =
  "grid grid-cols-1 gap-x-3 gap-y-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-[minmax(8.5rem,1fr)_7rem_minmax(13rem,2.6fr)_minmax(9rem,1fr)_auto] xl:items-start";
const GRID_SIN_ORIGEN =
  "grid grid-cols-1 gap-x-3 gap-y-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-[minmax(8.5rem,1fr)_7rem_minmax(13rem,3.6fr)_auto] xl:items-start";

/**
 * Cuentas Russell de 6 dígitos que concilia un módulo, con la misma gramática visual que los
 * prefijos del prevalidador: contador + «Agregar», tarjeta con una fila editable por cuenta.
 */
export default function CuentasConciliacionPanel({
  modulo,
  modulosCuentas,
  cuentas,
  catalogo,
  plan6,
}: {
  modulo: ModuloCuentasVm;
  /** Los módulos que concilian a 6 dígitos: el editor permite mover una cuenta a otro. */
  modulosCuentas: ModuloCuentasVm[];
  cuentas: CuentaConciliacionVista[];
  catalogo: FilaCatalogoVista[];
  plan6: CuentaPlanVm[];
}) {
  const [creando, setCreando] = useState(false);
  const listaPlan = useId();
  const nombrePlan = useMemo(() => new Map(plan6.map((c) => [c.codigo, c.nombre])), [plan6]);
  // Una cuenta fuera de los prefijos ACTIVOS de su módulo se concilia como adicional (sin regla del
  // prevalidador). Mismo criterio que la cédula (`cedulaModulo`).
  const fueraDePrefijos = (moduloCodigo: string, cuenta: string) =>
    !cuenta4DelModulo(cuenta.slice(0, 4), prefijosCuentaModulo(moduloCodigo, catalogo));
  const fuera = cuentas.filter((c) => fueraDePrefijos(c.moduloCodigo, c.cuenta)).length;
  const comunes = { modulo, modulosCuentas, nombrePlan, listaPlan, fueraDePrefijos };

  return (
    <div className="flex flex-col gap-4">
      <datalist id={listaPlan}>
        {plan6.map((c) => (
          <option key={c.codigo} value={c.codigo}>
            {c.nombre}
          </option>
        ))}
      </datalist>

      <div className="flex items-center justify-between">
        <p className="text-[12px] text-ink-500">
          {cuentas.length} cuenta(s) de 6 dígitos que concilia {modulo.name}
          {fuera > 0 ? ` · ${fuera} fuera de los prefijos` : ""}
        </p>
        {!creando && (
          <button
            type="button"
            onClick={() => setCreando(true)}
            className="inline-flex items-center gap-1.5 rounded-md bg-navy-700 px-3 py-1.5 text-[12.5px] font-semibold text-white hover:bg-navy-600"
          >
            <Icon name="plus" size={13} /> Agregar cuenta que concilia
          </button>
        )}
      </div>

      {creando && (
        <Card className="p-4">
          <h2 className="mb-3 text-[13px] font-semibold text-ink-900">Nueva cuenta que concilia</h2>
          <CuentaEditor {...comunes} onListo={() => setCreando(false)} onCancelar={() => setCreando(false)} />
        </Card>
      )}

      <Card className="p-4">
        <div className="mb-1 flex items-center gap-2">
          <Icon name="settings" size={15} />
          <h2 className="text-[14px] font-semibold text-ink-900">Cuentas que concilia · 6 dígitos</h2>
          <span className="text-[11px] text-ink-400">{modulo.code}</span>
        </div>
        <p className="mb-3 text-[11.5px] text-ink-500">
          {modulo.conCrucePorTercero ? "El cruce contable y el cruce por tercero" : "El cruce contable"} de {modulo.name} solo{" "}
          {modulo.conCrucePorTercero ? "toman" : "toma"} estas cuentas Russell; lo demás de sus prefijos se informa «fuera del
          módulo». Una cuenta fuera de los prefijos se concilia igual, por su saldo final, sin pasar por el prevalidador. Los
          cambios rigen para los cargues abiertos; un período conciliado en firme conserva las cuentas con que se cerró.
        </p>
        <div className="flex flex-col gap-2">
          {cuentas.map((c) => (
            <CuentaEditor key={c.id} {...comunes} cuenta={c} unica={cuentas.length === 1} />
          ))}
          {cuentas.length === 0 && (
            <p className="text-[11.5px] text-ink-400">Sin cuentas: el módulo concilia todas las cuentas de 6 dígitos de sus prefijos.</p>
          )}
        </div>
      </Card>
    </div>
  );
}

function CuentaEditor({
  cuenta,
  modulo,
  modulosCuentas,
  nombrePlan,
  listaPlan,
  fueraDePrefijos,
  unica = false,
  onListo,
  onCancelar,
}: {
  cuenta?: CuentaConciliacionVista;
  modulo: ModuloCuentasVm;
  modulosCuentas: ModuloCuentasVm[];
  nombrePlan: ReadonlyMap<string, string>;
  listaPlan: string;
  fueraDePrefijos: (moduloCodigo: string, cuenta: string) => boolean;
  unica?: boolean;
  onListo?: () => void;
  onCancelar?: () => void;
}) {
  const [guardarState, guardarAction, guardando] = useActionState<ActionState, FormData>(guardarCuentaConciliacion, {});
  const [quitarState, quitarAction, quitando] = useActionState<ActionState, FormData>(quitarCuentaConciliacion, {});
  const [confirmarBorrado, setConfirmarBorrado] = useState(false);
  const [codigo, setCodigo] = useState(cuenta?.cuenta ?? "");
  const [moduloSel, setModuloSel] = useState(cuenta?.moduloCodigo ?? modulo.code);

  useEffect(() => {
    notifyActionState(guardarState, { success: "Cuenta guardada.", error: "No se pudo guardar la cuenta." });
    if (guardarState?.ok) onListo?.();
  }, [guardarState, onListo]);

  useEffect(() => {
    notifyActionState(quitarState, { success: "Cuenta retirada del módulo.", error: "No se pudo quitar la cuenta." });
  }, [quitarState]);

  const digitos = codigo.replace(/[\s.]/g, "");
  const nombre = nombrePlan.get(digitos) ?? null;
  const conOrigen = modulosCuentas.find((m) => m.code === moduloSel)?.conOrigen ?? false;

  return (
    <div className="rounded-lg border border-ink-150 bg-white p-3.5 shadow-[0_1px_2px_rgba(15,23,42,0.03)] transition-colors focus-within:border-blue-200">
      <form action={guardarAction} className={conOrigen ? GRID_CON_ORIGEN : GRID_SIN_ORIGEN}>
        {cuenta && <input type="hidden" name="id" value={cuenta.id} />}
        <Campo etiqueta="Módulo">
          <select name="moduloCodigo" value={moduloSel} onChange={(e) => setModuloSel(e.target.value)} className={CONTROL_CLASS}>
            {modulosCuentas.map((m) => (
              <option key={m.code} value={m.code}>
                {m.name}
              </option>
            ))}
          </select>
        </Campo>

        <Campo etiqueta="Cuenta Russell">
          <input
            name="cuenta"
            value={codigo}
            onChange={(e) => setCodigo(e.target.value)}
            inputMode="numeric"
            maxLength={8}
            list={listaPlan}
            placeholder="130505"
            className={`${CONTROL_CLASS} font-mono tabular-nums`}
          />
        </Campo>

        <Campo etiqueta="Nombre en el plan Russell" ayuda={digitos.length === 6 && !nombre ? "No está en el plan estándar Russell." : undefined}>
          <input
            value={nombre ?? ""}
            readOnly
            tabIndex={-1}
            placeholder="Se completa con la cuenta"
            className={`${CONTROL_CLASS} bg-ink-50/60 text-ink-600`}
          />
        </Campo>

        {conOrigen && (
          <Campo etiqueta="Origen">
            <select name="origen" defaultValue={cuenta?.origen ?? ""} className={CONTROL_CLASS}>
              {ORIGENES.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </Campo>
        )}

        <div className="flex flex-wrap items-center justify-end gap-2 sm:col-span-2 lg:col-span-full xl:col-span-1 xl:pt-5">
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
            {!guardando && <Icon name={cuenta ? "check" : "plus"} size={13} />}
            {guardando ? <EstadoProcesando>Guardando</EstadoProcesando> : cuenta ? "Guardar" : "Agregar"}
          </button>
          {cuenta && (
            <button
              type="button"
              onClick={() => setConfirmarBorrado(true)}
              disabled={unica}
              title={unica ? "El módulo debe conciliar al menos una cuenta." : `Quitar la cuenta ${cuenta.cuenta} de las que concilia el módulo.`}
              aria-label={`Quitar la cuenta ${cuenta.cuenta} de las que concilia el módulo`}
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-ink-200 bg-white text-ink-500 transition hover:border-red-200 hover:bg-red-50 hover:text-err-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Icon name="trash" size={13} />
            </button>
          )}
        </div>
      </form>

      {cuenta && (
        <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 border-t border-ink-100 pt-2.5">
          <p className="text-[11px] text-ink-400">
            Editado {fmtDateTime(cuenta.actualizadoEn)}
            {cuenta.actualizadoPor ? ` · ${cuenta.actualizadoPor}` : ""}
          </p>
          {fueraDePrefijos(cuenta.moduloCodigo, cuenta.cuenta) && <Chip label="Fuera de los prefijos" tone="ai" />}
        </div>
      )}

      {cuenta && confirmarBorrado && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-md border border-err-100 bg-err-100/35 px-3 py-2">
          <span className="min-w-[220px] flex-1 text-[11.5px] text-ink-600">
            ¿Quitar la cuenta {cuenta.cuenta}? Deja de conciliarse en los cargues abiertos: su saldo pasa a «fuera del módulo».
          </span>
          <button
            type="button"
            onClick={() => setConfirmarBorrado(false)}
            disabled={quitando}
            className="inline-flex h-8 items-center justify-center rounded-md border border-ink-200 bg-white px-3 text-[12px] font-semibold text-ink-600 transition hover:bg-ink-50 disabled:opacity-60"
          >
            Cancelar
          </button>
          <button
            type="submit"
            form={`quitar-cuenta-${cuenta.id}`}
            disabled={quitando}
            className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-err-100 bg-white px-3 text-[12px] font-semibold text-err-700 transition hover:bg-err-100/60 disabled:opacity-60"
          >
            {!quitando && <Icon name="trash" size={12} />}
            {quitando ? <EstadoProcesando>Quitando</EstadoProcesando> : "Sí, quitar"}
          </button>
        </div>
      )}

      {/* Form separado para quitar (no puede anidarse en el de guardar). */}
      {cuenta && (
        <form id={`quitar-cuenta-${cuenta.id}`} action={quitarAction} className="hidden">
          <input type="hidden" name="id" value={cuenta.id} />
        </form>
      )}
    </div>
  );
}
