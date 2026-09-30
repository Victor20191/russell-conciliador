"use client";

import { useActionState, useEffect, useId, useMemo, useState } from "react";
import { EstadoProcesando } from "@/components/estado-procesando";
import { Card, Chip } from "@/components/ui";
import { Icon } from "@/components/icons";
import { fmtDateTime } from "@/lib/format";
import { notifyActionState } from "@/lib/client-notifications";
import { agregarSubgrupoConciliacion, quitarSubgrupoConciliacion } from "@/app/actions/cuentas-conciliacion";
import type { ActionState } from "@/lib/definitions";
import type { SubgrupoConciliacionVista } from "@/lib/parametros/cuentas-conciliacion";
import { cuenta4DelModulo } from "@/lib/modulos/cuentas-modulo";
import { Campo, CONTROL_CLASS } from "./prevalidador-client";

export type SubgrupoPlanVm = { codigo: string; nombre: string };

const GRID_NUEVO =
  "grid grid-cols-1 gap-x-3 gap-y-3 sm:grid-cols-2 xl:grid-cols-[7rem_minmax(13rem,3.6fr)_auto] xl:items-start";

/**
 * Subgrupos Russell de 4 dígitos que concilia un módulo con cédula a ese nivel (Inventarios, Activos
 * fijos): las cuentas PROPIAS del módulo, independientes de la regla del prevalidador. Misma gramática
 * que las cuentas de 6 dígitos (`cuentas-conciliacion-panel.tsx`): contador + «Agregar», tarjeta con
 * una fila por subgrupo. Los subgrupos fijos en código (la 1592 de Activos fijos) salen bloqueados.
 */
export default function SubgruposConciliacionPanel({
  modulo,
  subgrupos,
  plan4,
  prefijos,
  fijos,
}: {
  modulo: { code: string; name: string };
  subgrupos: SubgrupoConciliacionVista[];
  plan4: SubgrupoPlanVm[];
  /** Reglas activas del prevalidador del módulo: solo para marcar lo que queda fuera de ellas. */
  prefijos: string[];
  /** Subgrupos fijos en código (abiertos a 6 dígitos): siempre concilian. */
  fijos: string[];
}) {
  const [creando, setCreando] = useState(false);
  const listaPlan = useId();
  const nombrePlan = useMemo(() => new Map(plan4.map((s) => [s.codigo, s.nombre])), [plan4]);
  const fueraDeLaRegla = (subgrupo: string) => !cuenta4DelModulo(subgrupo, prefijos);
  const fuera = subgrupos.filter((s) => fueraDeLaRegla(s.subgrupo)).length;
  const configurados = new Set(subgrupos.map((s) => s.subgrupo));

  return (
    <div className="flex flex-col gap-4">
      <datalist id={listaPlan}>
        {plan4
          .filter((s) => !configurados.has(s.codigo) && !fijos.includes(s.codigo))
          .map((s) => (
            <option key={s.codigo} value={s.codigo}>
              {s.nombre}
            </option>
          ))}
      </datalist>

      <div className="flex items-center justify-between">
        <p className="text-[12px] text-ink-500">
          {subgrupos.length} subgrupo(s) de 4 dígitos que concilia {modulo.name}
          {fuera > 0 ? ` · ${fuera} fuera de la regla del prevalidador` : ""}
        </p>
        {!creando && (
          <button
            type="button"
            onClick={() => setCreando(true)}
            className="inline-flex items-center gap-1.5 rounded-md bg-navy-700 px-3 py-1.5 text-[12.5px] font-semibold text-white hover:bg-navy-600"
          >
            <Icon name="plus" size={13} /> Agregar subgrupo que concilia
          </button>
        )}
      </div>

      {creando && (
        <Card className="p-4">
          <h2 className="mb-3 text-[13px] font-semibold text-ink-900">Nuevo subgrupo que concilia</h2>
          <SubgrupoNuevo
            modulo={modulo}
            nombrePlan={nombrePlan}
            listaPlan={listaPlan}
            onListo={() => setCreando(false)}
            onCancelar={() => setCreando(false)}
          />
        </Card>
      )}

      <Card className="p-4">
        <div className="mb-1 flex items-center gap-2">
          <Icon name="settings" size={15} />
          <h2 className="text-[14px] font-semibold text-ink-900">Subgrupos que concilia · 4 dígitos</h2>
          <span className="text-[11px] text-ink-400">{modulo.code}</span>
        </div>
        <p className="mb-3 text-[11.5px] leading-relaxed text-ink-500">
          El cruce contable de {modulo.name} toma, por su saldo final, las cuentas del cliente homologadas a estos subgrupos,
          aunque no se hayan asignado en el Consolidado. Son independientes de la regla del prevalidador, que solo valida el
          balance: un subgrupo fuera de la regla se concilia igual. Los cambios rigen para los cargues abiertos; un período
          conciliado en firme conserva los subgrupos con que se cerró. Una cuenta que no esté aquí se asigna en el Consolidado
          del cargue, solo para ese período.
        </p>
        <div className="flex flex-col gap-2">
          {subgrupos.map((s) => (
            <SubgrupoFila
              key={s.id}
              subgrupo={s}
              nombre={nombrePlan.get(s.subgrupo) ?? null}
              fueraDeLaRegla={fueraDeLaRegla(s.subgrupo)}
              unico={subgrupos.length === 1}
            />
          ))}
          {fijos.map((codigo) => (
            <div
              key={codigo}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-ink-150 bg-ink-50/60 px-3.5 py-2.5"
            >
              <p className="min-w-0 text-[12.5px] text-ink-700">
                <span className="font-mono tabular-nums text-ink-900">{codigo}</span> {nombrePlan.get(codigo) ?? ""}
              </p>
              <span className="inline-flex items-center gap-1.5 text-[11px] text-ink-500">
                <Icon name="info" size={12} /> Fijo · a 6 dígitos, con la depreciación relacionada
              </span>
            </div>
          ))}
          {subgrupos.length === 0 && fijos.length === 0 && (
            <p className="text-[11.5px] text-ink-400">Sin subgrupos: el módulo concilia los de fábrica.</p>
          )}
        </div>
      </Card>
    </div>
  );
}

function SubgrupoNuevo({
  modulo,
  nombrePlan,
  listaPlan,
  onListo,
  onCancelar,
}: {
  modulo: { code: string; name: string };
  nombrePlan: ReadonlyMap<string, string>;
  listaPlan: string;
  onListo: () => void;
  onCancelar: () => void;
}) {
  const [state, action, guardando] = useActionState<ActionState, FormData>(agregarSubgrupoConciliacion, {});
  const [codigo, setCodigo] = useState("");

  useEffect(() => {
    notifyActionState(state, { success: "Subgrupo agregado.", error: "No se pudo agregar el subgrupo." });
    if (state?.ok) onListo();
  }, [state, onListo]);

  const digitos = codigo.replace(/[\s.]/g, "");
  const nombre = nombrePlan.get(digitos) ?? null;

  return (
    <form action={action} className={GRID_NUEVO}>
      <input type="hidden" name="moduloCodigo" value={modulo.code} />
      <Campo etiqueta="Subgrupo Russell">
        <input
          name="subgrupo"
          value={codigo}
          onChange={(e) => setCodigo(e.target.value)}
          inputMode="numeric"
          maxLength={6}
          list={listaPlan}
          placeholder="1435"
          autoFocus
          className={`${CONTROL_CLASS} font-mono tabular-nums`}
        />
      </Campo>

      <Campo etiqueta="Nombre en el plan Russell" ayuda={digitos.length === 4 && !nombre ? "No está en el plan estándar Russell." : undefined}>
        <input
          value={nombre ?? ""}
          readOnly
          tabIndex={-1}
          placeholder="Busca por código o nombre en la lista"
          className={`${CONTROL_CLASS} bg-ink-50/60 text-ink-600`}
        />
      </Campo>

      <div className="flex flex-wrap items-center justify-end gap-2 sm:col-span-2 xl:col-span-1 xl:pt-5">
        <button
          type="button"
          onClick={onCancelar}
          className="inline-flex h-9 items-center justify-center rounded-md border border-ink-200 bg-white px-3 text-[12px] font-semibold text-ink-600 transition hover:border-ink-300 hover:bg-ink-50"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={guardando}
          className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md bg-navy-700 px-3.5 text-[12px] font-semibold text-white shadow-sm transition hover:bg-navy-600 disabled:opacity-50"
        >
          {!guardando && <Icon name="plus" size={13} />}
          {guardando ? <EstadoProcesando>Guardando</EstadoProcesando> : "Agregar"}
        </button>
      </div>
    </form>
  );
}

function SubgrupoFila({
  subgrupo,
  nombre,
  fueraDeLaRegla,
  unico,
}: {
  subgrupo: SubgrupoConciliacionVista;
  nombre: string | null;
  fueraDeLaRegla: boolean;
  unico: boolean;
}) {
  const [state, action, quitando] = useActionState<ActionState, FormData>(quitarSubgrupoConciliacion, {});
  const [confirmar, setConfirmar] = useState(false);

  useEffect(() => {
    notifyActionState(state, { success: "Subgrupo retirado del módulo.", error: "No se pudo quitar el subgrupo." });
  }, [state]);

  return (
    <div className="rounded-lg border border-ink-150 bg-white px-3.5 py-2.5 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="min-w-0 flex-1 text-[12.5px] text-ink-700">
          <span className="font-mono tabular-nums text-ink-900">{subgrupo.subgrupo}</span>{" "}
          {nombre ?? <span className="text-ink-400">No está en el plan estándar Russell</span>}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {fueraDeLaRegla && <Chip label="Fuera de la regla del prevalidador" tone="ai" />}
          <span className="text-[11px] text-ink-400">
            Editado {fmtDateTime(subgrupo.actualizadoEn)}
            {subgrupo.actualizadoPor ? ` · ${subgrupo.actualizadoPor}` : ""}
          </span>
          <button
            type="button"
            onClick={() => setConfirmar(true)}
            disabled={unico || quitando}
            title={unico ? "El módulo debe conciliar al menos un subgrupo." : `Quitar el subgrupo ${subgrupo.subgrupo} de los que concilia el módulo.`}
            aria-label={`Quitar el subgrupo ${subgrupo.subgrupo} de los que concilia el módulo`}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-ink-200 bg-white text-ink-500 transition hover:border-red-200 hover:bg-red-50 hover:text-err-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Icon name="trash" size={13} />
          </button>
        </div>
      </div>

      {confirmar && (
        <form action={action} className="mt-2.5 flex flex-wrap items-center gap-2 rounded-md border border-err-100 bg-err-100/35 px-3 py-2">
          <input type="hidden" name="id" value={subgrupo.id} />
          <span className="min-w-[220px] flex-1 text-[11.5px] text-ink-600">
            ¿Quitar el subgrupo {subgrupo.subgrupo}? Deja de conciliarse en los cargues abiertos: sus cuentas salen del cruce
            contable. Los períodos en firme lo conservan.
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
      )}
    </div>
  );
}
