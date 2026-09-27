"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { EstadoProcesando } from "@/components/estado-procesando";
import { Card, Chip } from "@/components/ui";
import { Icon } from "@/components/icons";
import { SelectBuscable } from "@/components/select-buscable";
import { fmtDateTime } from "@/lib/format";
import { notifyActionState } from "@/lib/client-notifications";
import { agregarCuentaConciliacion, cambiarOrigenCuentaConciliacion, quitarCuentaConciliacion } from "@/app/actions/cuentas-conciliacion";
import type { ActionState } from "@/lib/definitions";
import type { FilaCatalogoVista } from "@/lib/parametros/prevalidador";
import type { CuentaConciliacionVista } from "@/lib/parametros/cuentas-conciliacion";
import { cuenta4DelModulo, prefijosCuentaModulo } from "@/lib/modulos/cuentas-modulo";

export type CuentaPlanVm = { codigo: string; nombre: string };

type ModuloPanel = { code: string; name: string; conOrigen: boolean; conCrucePorTercero: boolean };

const CONTROL_CLASS =
  "h-9 w-full rounded-md border border-ink-200 bg-white px-2.5 text-[12.5px] text-ink-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100";

const ORIGENES = [
  { value: "", label: "Sin origen" },
  { value: "nacional", label: "Nacional" },
  { value: "exterior", label: "Exterior" },
] as const;

/**
 * Cuentas Russell de 6 dígitos que concilia un módulo: la cédula contable (y, en Cartera y CxP, el
 * cruce por tercero) solo toma estas cuentas; las demás del grupo se informan «fuera del módulo».
 */
export default function CuentasConciliacionPanel({
  modulo,
  cuentas,
  catalogo,
  plan6,
}: {
  modulo: ModuloPanel;
  cuentas: CuentaConciliacionVista[];
  catalogo: FilaCatalogoVista[];
  plan6: CuentaPlanVm[];
}) {
  const nombre = useMemo(() => new Map(plan6.map((c) => [c.codigo, c.nombre])), [plan6]);
  // Los prefijos ACTIVOS del módulo: una cuenta fuera de ellos se concilia como adicional (sin regla
  // del prevalidador). Mismo criterio que la cédula (`cedulaModulo`).
  const prefijos = useMemo(
    () => prefijosCuentaModulo(modulo.code, catalogo.map((f) => ({ moduloCodigo: f.moduloCodigo, cuentaRussell: f.cuentaRussell, activa: f.activa }))),
    [catalogo, modulo.code],
  );
  const configuradas = useMemo(() => new Set(cuentas.map((c) => c.cuenta)), [cuentas]);

  return (
    <Card className="p-4">
      <div className="mb-3">
        <h2 className="text-[14px] font-semibold text-ink-900">Cuentas que concilia · 6 dígitos</h2>
        <p className="mt-1 text-[11.5px] text-ink-500">
          El cruce contable{modulo.conCrucePorTercero ? " y el cruce por tercero" : ""} de {modulo.name} solo toman estas
          cuentas Russell; lo demás de sus prefijos se informa «fuera del módulo». Una cuenta fuera de los prefijos se
          concilia igual, por su saldo final, sin pasar por el prevalidador.
          {modulo.conOrigen ? " El origen dice qué cuenta es la nacional y cuál la del exterior en el cruce por tercero." : ""}
        </p>
      </div>

      <AgregarCuenta modulo={modulo} plan6={plan6} configuradas={configuradas} />

      <div className="mt-3 overflow-x-auto rounded-lg border border-ink-150">
        <table className="w-full min-w-[560px] text-[12.5px]">
          <thead className="bg-ink-50 text-left text-[11px] font-semibold uppercase tracking-wide text-ink-500">
            <tr>
              <th className="px-3 py-2">Cuenta</th>
              <th className="px-3 py-2">Nombre</th>
              {modulo.conOrigen && <th className="px-3 py-2">Origen</th>}
              <th className="px-3 py-2">Editado</th>
              <th className="px-3 py-2 text-right" aria-label="Acciones" />
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {cuentas.map((c) => (
              <FilaCuenta
                key={c.id}
                cuenta={c}
                nombre={nombre.get(c.cuenta) ?? null}
                conOrigen={modulo.conOrigen}
                fueraDePrefijos={!cuenta4DelModulo(c.cuenta.slice(0, 4), prefijos)}
                unica={cuentas.length === 1}
              />
            ))}
            {cuentas.length === 0 && (
              <tr>
                <td colSpan={modulo.conOrigen ? 5 : 4} className="px-3 py-4 text-center text-[12px] text-ink-400">
                  Sin cuentas: el módulo concilia todas las cuentas de 6 dígitos de sus prefijos.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[11px] text-ink-400">
        {cuentas.length} cuenta(s). Los cambios rigen para todos los cargues abiertos; un período conciliado en firme
        conserva las cuentas con que se cerró hasta que se desbloquee.
      </p>
    </Card>
  );
}

function AgregarCuenta({ modulo, plan6, configuradas }: { modulo: ModuloPanel; plan6: CuentaPlanVm[]; configuradas: ReadonlySet<string> }) {
  const [state, action, guardando] = useActionState<ActionState, FormData>(agregarCuentaConciliacion, {});
  const [elegida, setCuenta] = useState("");
  // Una vez agregada, la cuenta sale de las opciones y la selección se descarta sola.
  const cuenta = configuradas.has(elegida) ? "" : elegida;
  const opciones = useMemo(
    () => plan6.filter((c) => !configuradas.has(c.codigo)).map((c) => ({ value: c.codigo, label: `${c.codigo} · ${c.nombre}`, sublabel: c.codigo })),
    [plan6, configuradas],
  );

  useEffect(() => {
    notifyActionState(state, { success: "Cuenta agregada.", error: "No se pudo agregar la cuenta." });
  }, [state]);

  return (
    <form action={action} className="grid grid-cols-1 gap-3 rounded-lg border border-ink-150 bg-ink-50/40 p-3 sm:grid-cols-[minmax(0,1fr)_10rem_auto] sm:items-end">
      <input type="hidden" name="moduloCodigo" value={modulo.code} />
      <input type="hidden" name="cuenta" value={cuenta} />
      <label className="flex min-w-0 flex-col gap-1">
        <span className="text-[11px] font-medium text-ink-600">Cuenta del plan estándar Russell</span>
        <SelectBuscable
          opciones={opciones}
          value={cuenta}
          onChange={setCuenta}
          placeholder="Buscar por código o nombre…"
          sinResultados="No hay cuentas de 6 dígitos con ese código o nombre."
          ariaLabel="Cuenta a agregar"
        />
      </label>
      {modulo.conOrigen ? (
        <label className="flex min-w-0 flex-col gap-1">
          <span className="text-[11px] font-medium text-ink-600">Origen</span>
          <select name="origen" defaultValue="" className={CONTROL_CLASS}>
            {ORIGENES.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <span className="hidden sm:block" />
      )}
      <button
        type="submit"
        disabled={guardando || !cuenta}
        className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md bg-navy-700 px-3.5 text-[12px] font-semibold text-white shadow-sm transition hover:bg-navy-600 disabled:opacity-50"
      >
        {!guardando && <Icon name="plus" size={13} />}
        {guardando ? <EstadoProcesando>Agregando</EstadoProcesando> : "Agregar"}
      </button>
    </form>
  );
}

function FilaCuenta({
  cuenta,
  nombre,
  conOrigen,
  fueraDePrefijos,
  unica,
}: {
  cuenta: CuentaConciliacionVista;
  nombre: string | null;
  conOrigen: boolean;
  fueraDePrefijos: boolean;
  unica: boolean;
}) {
  const [origenState, origenAction, cambiando] = useActionState<ActionState, FormData>(cambiarOrigenCuentaConciliacion, {});
  const [quitarState, quitarAction, quitando] = useActionState<ActionState, FormData>(quitarCuentaConciliacion, {});
  const [confirmar, setConfirmar] = useState(false);
  const origenForm = useRef<HTMLFormElement>(null);
  const origenSelect = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    notifyActionState(origenState, { success: "Origen actualizado.", error: "No se pudo cambiar el origen." });
    // Si el servidor lo rechazó, el control vuelve a mostrar lo guardado.
    if (origenState?.ok === false && origenSelect.current) origenSelect.current.value = cuenta.origen ?? "";
  }, [origenState, cuenta.origen]);
  useEffect(() => {
    notifyActionState(quitarState, { success: "Cuenta retirada del módulo.", error: "No se pudo quitar la cuenta." });
  }, [quitarState]);

  return (
    <>
      <tr className="align-middle">
        <td className="px-3 py-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-mono font-semibold tabular-nums text-ink-800">{cuenta.cuenta}</span>
            {fueraDePrefijos && <Chip label="Fuera de los prefijos" tone="ai" />}
          </div>
        </td>
        <td className="px-3 py-2 text-ink-600">{nombre ?? <span className="text-err-700">No está en el plan estándar</span>}</td>
        {conOrigen && (
          <td className="px-3 py-2">
            <form ref={origenForm} action={origenAction}>
              <input type="hidden" name="id" value={cuenta.id} />
              <select
                ref={origenSelect}
                name="origen"
                defaultValue={cuenta.origen ?? ""}
                disabled={cambiando}
                onChange={() => origenForm.current?.requestSubmit()}
                aria-label={`Origen de la cuenta ${cuenta.cuenta}`}
                className="h-8 rounded-md border border-ink-200 bg-white px-2 text-[12px] text-ink-700 outline-none focus:border-blue-400 disabled:opacity-60"
              >
                {ORIGENES.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </form>
          </td>
        )}
        <td className="px-3 py-2 text-[11px] text-ink-400">
          {fmtDateTime(cuenta.actualizadoEn)}
          {cuenta.actualizadoPor ? ` · ${cuenta.actualizadoPor}` : ""}
        </td>
        <td className="px-3 py-2 text-right">
          <button
            type="button"
            onClick={() => setConfirmar(true)}
            disabled={unica || quitando}
            title={unica ? "El módulo debe conciliar al menos una cuenta." : `Quitar la cuenta ${cuenta.cuenta}`}
            aria-label={`Quitar la cuenta ${cuenta.cuenta}`}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-ink-200 bg-white text-ink-500 transition hover:border-red-200 hover:bg-red-50 hover:text-err-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Icon name="trash" size={13} />
          </button>
        </td>
      </tr>
      {confirmar && (
        <tr>
          <td colSpan={conOrigen ? 5 : 4} className="bg-err-100/30 px-3 py-2">
            <form action={quitarAction} className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="id" value={cuenta.id} />
              <span className="min-w-[220px] flex-1 text-[11.5px] text-ink-600">
                ¿Quitar la {cuenta.cuenta}? Deja de conciliarse en los cargues abiertos: su saldo pasa a «fuera del módulo».
              </span>
              <button
                type="button"
                onClick={() => setConfirmar(false)}
                disabled={quitando}
                className="inline-flex h-8 items-center justify-center rounded-md border border-ink-200 bg-white px-3 text-[12px] font-semibold text-ink-600 transition hover:bg-ink-50 disabled:opacity-60"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={quitando}
                className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-err-100 bg-white px-3 text-[12px] font-semibold text-err-700 transition hover:bg-err-100/60 disabled:opacity-60"
              >
                {!quitando && <Icon name="trash" size={12} />}
                {quitando ? <EstadoProcesando>Quitando</EstadoProcesando> : "Sí, quitar"}
              </button>
            </form>
          </td>
        </tr>
      )}
    </>
  );
}
