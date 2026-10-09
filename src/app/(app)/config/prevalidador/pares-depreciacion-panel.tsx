"use client";

import { useActionState, useEffect, useId, useMemo, useState } from "react";
import { EstadoProcesando } from "@/components/estado-procesando";
import { Card } from "@/components/ui";
import { Icon } from "@/components/icons";
import { fmtDateTime } from "@/lib/format";
import { notifyActionState } from "@/lib/client-notifications";
import { guardarParDepreciacion, quitarParDepreciacion } from "@/app/actions/cuentas-conciliacion";
import type { ActionState } from "@/lib/definitions";
import type { ParDepreciacionVista } from "@/lib/parametros/cuentas-conciliacion";
import { Campo, CONTROL_CLASS } from "./prevalidador-client";

export type CuentaPlanVm = { codigo: string; nombre: string };

const GRID_NUEVO =
  "grid grid-cols-1 gap-x-3 gap-y-3 sm:grid-cols-2 xl:grid-cols-[7rem_minmax(11rem,2fr)_7rem_minmax(11rem,2fr)_auto] xl:items-start";

/**
 * Parejas activo → depreciación de la cédula de Activos fijos: con qué cuenta 1592## se junta cada
 * subgrupo 15## en el mismo renglón, de modo que el papel de trabajo muestre costo, depreciación y
 * neto en una sola línea y concluya por el neto.
 *
 * No cambian QUÉ cuentas concilia el módulo (eso son los subgrupos y la 1592 abierta): solo cómo se
 * presentan. Un activo tiene una sola cuenta de depreciación, así que guardar dos veces el mismo
 * activo reemplaza la suya.
 */
export default function ParesDepreciacionPanel({
  modulo,
  pares,
  subgruposAbiertos,
  plan4,
  plan6,
}: {
  modulo: { code: string; name: string };
  pares: ParDepreciacionVista[];
  /** Subgrupos que el módulo abre a 6 dígitos (la 1592): de ahí tiene que colgar la depreciación. */
  subgruposAbiertos: string[];
  plan4: CuentaPlanVm[];
  plan6: CuentaPlanVm[];
}) {
  const [creando, setCreando] = useState(false);
  const listaActivos = useId();
  const listaCuentas = useId();
  const nombre4 = useMemo(() => new Map(plan4.map((s) => [s.codigo, s.nombre])), [plan4]);
  const nombre6 = useMemo(() => new Map(plan6.map((s) => [s.codigo, s.nombre])), [plan6]);
  // Solo las cuentas de depreciación: las que cuelgan de los subgrupos abiertos.
  const cuentasDepreciacion = useMemo(
    () => plan6.filter((c) => subgruposAbiertos.some((s) => c.codigo.startsWith(s))),
    [plan6, subgruposAbiertos],
  );
  const emparejados = new Set(pares.map((p) => p.subgrupo));

  return (
    <div className="flex flex-col gap-4">
      <datalist id={listaActivos}>
        {plan4
          .filter((s) => !emparejados.has(s.codigo) && !subgruposAbiertos.includes(s.codigo))
          .map((s) => (
            <option key={s.codigo} value={s.codigo}>
              {s.nombre}
            </option>
          ))}
      </datalist>
      <datalist id={listaCuentas}>
        {cuentasDepreciacion.map((c) => (
          <option key={c.codigo} value={c.codigo}>
            {c.nombre}
          </option>
        ))}
      </datalist>

      <div className="flex items-center justify-between">
        <p className="text-[12px] text-ink-500">{pares.length} pareja(s) activo → depreciación en {modulo.name}</p>
        {!creando && (
          <button
            type="button"
            onClick={() => setCreando(true)}
            className="inline-flex items-center gap-1.5 rounded-md bg-navy-700 px-3 py-1.5 text-[12.5px] font-semibold text-white hover:bg-navy-600"
          >
            <Icon name="plus" size={13} /> Agregar pareja
          </button>
        )}
      </div>

      {creando && (
        <Card className="p-4">
          <h2 className="mb-3 text-[13px] font-semibold text-ink-900">Nueva pareja activo → depreciación</h2>
          <ParNuevo
            modulo={modulo}
            nombre4={nombre4}
            nombre6={nombre6}
            listaActivos={listaActivos}
            listaCuentas={listaCuentas}
            onListo={() => setCreando(false)}
            onCancelar={() => setCreando(false)}
          />
        </Card>
      )}

      <Card className="p-4">
        <div className="mb-1 flex items-center gap-2">
          <Icon name="settings" size={15} />
          <h2 className="text-[14px] font-semibold text-ink-900">Activo y su depreciación</h2>
          <span className="text-[11px] text-ink-400">{modulo.code}</span>
        </div>
        <p className="mb-3 text-[11.5px] leading-relaxed text-ink-500">
          En la cédula de {modulo.name} cada activo y su depreciación van en el MISMO renglón, con tres columnas por lado
          —costo, depreciación acumulada y neto—. La diferencia que se concilia y que exige marca es la del neto; cuando el
          neto cuadra pero las columnas no, el renglón avisa de una posible reclasificación. Un activo sin pareja (Terrenos,
          Montaje) muestra la depreciación en cero y una {subgruposAbiertos.join("/") || "1592"}## sin pareja queda en su
          propio renglón, restando del neto. Los cambios rigen para los cargues abiertos; un período conciliado en firme
          conserva las parejas con que se cerró.
        </p>
        <div className="flex flex-col gap-2">
          {pares.map((p) => (
            <ParFila key={p.id} par={p} nombreActivo={nombre4.get(p.subgrupo) ?? null} nombreCuenta={nombre6.get(p.cuenta6) ?? null} />
          ))}
          {pares.length === 0 && (
            <p className="text-[11.5px] text-ink-400">Sin parejas: la cédula usa las de fábrica del módulo.</p>
          )}
        </div>
      </Card>
    </div>
  );
}

function ParNuevo({
  modulo,
  nombre4,
  nombre6,
  listaActivos,
  listaCuentas,
  onListo,
  onCancelar,
}: {
  modulo: { code: string; name: string };
  nombre4: ReadonlyMap<string, string>;
  nombre6: ReadonlyMap<string, string>;
  listaActivos: string;
  listaCuentas: string;
  onListo: () => void;
  onCancelar: () => void;
}) {
  const [state, action, guardando] = useActionState<ActionState, FormData>(guardarParDepreciacion, {});
  const [activo, setActivo] = useState("");
  const [cuenta, setCuenta] = useState("");

  useEffect(() => {
    notifyActionState(state, { success: "Pareja guardada.", error: "No se pudo guardar la pareja." });
    if (state?.ok) onListo();
  }, [state, onListo]);

  const digitosActivo = activo.replace(/[\s.]/g, "");
  const digitosCuenta = cuenta.replace(/[\s.]/g, "");
  const nombreActivo = nombre4.get(digitosActivo) ?? null;
  const nombreCuenta = nombre6.get(digitosCuenta) ?? null;

  return (
    <form action={action} className={GRID_NUEVO}>
      <input type="hidden" name="moduloCodigo" value={modulo.code} />
      <Campo etiqueta="Activo (4 dígitos)">
        <input
          name="subgrupo"
          value={activo}
          onChange={(e) => setActivo(e.target.value)}
          inputMode="numeric"
          maxLength={6}
          list={listaActivos}
          placeholder="1516"
          autoFocus
          className={`${CONTROL_CLASS} font-mono tabular-nums`}
        />
      </Campo>

      <Campo etiqueta="Nombre del activo" ayuda={digitosActivo.length === 4 && !nombreActivo ? "No está en el plan estándar Russell." : undefined}>
        <input value={nombreActivo ?? ""} readOnly tabIndex={-1} className={`${CONTROL_CLASS} bg-ink-50/60 text-ink-600`} />
      </Campo>

      <Campo etiqueta="Depreciación (6 dígitos)">
        <input
          name="cuenta"
          value={cuenta}
          onChange={(e) => setCuenta(e.target.value)}
          inputMode="numeric"
          maxLength={8}
          list={listaCuentas}
          placeholder="159205"
          className={`${CONTROL_CLASS} font-mono tabular-nums`}
        />
      </Campo>

      <Campo etiqueta="Nombre de la depreciación" ayuda={digitosCuenta.length === 6 && !nombreCuenta ? "No está en el plan estándar Russell." : undefined}>
        <input value={nombreCuenta ?? ""} readOnly tabIndex={-1} className={`${CONTROL_CLASS} bg-ink-50/60 text-ink-600`} />
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
          {guardando ? <EstadoProcesando>Guardando</EstadoProcesando> : "Guardar"}
        </button>
      </div>
    </form>
  );
}

function ParFila({
  par,
  nombreActivo,
  nombreCuenta,
}: {
  par: ParDepreciacionVista;
  nombreActivo: string | null;
  nombreCuenta: string | null;
}) {
  const [state, action, quitando] = useActionState<ActionState, FormData>(quitarParDepreciacion, {});
  const [confirmar, setConfirmar] = useState(false);

  useEffect(() => {
    notifyActionState(state, { success: "Pareja retirada.", error: "No se pudo quitar la pareja." });
  }, [state]);

  return (
    <div className="rounded-lg border border-ink-150 bg-white px-3.5 py-2.5 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="min-w-0 flex-1 text-[12.5px] text-ink-700">
          <span className="font-mono tabular-nums text-ink-900">{par.subgrupo}</span>{" "}
          {nombreActivo ?? <span className="text-ink-400">No está en el plan</span>}
          <span className="px-2 text-ink-400">→</span>
          <span className="font-mono tabular-nums text-ink-900">{par.cuenta6}</span>{" "}
          {nombreCuenta ?? <span className="text-ink-400">No está en el plan</span>}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] text-ink-400">
            Editado {fmtDateTime(par.actualizadoEn)}
            {par.actualizadoPor ? ` · ${par.actualizadoPor}` : ""}
          </span>
          <button
            type="button"
            onClick={() => setConfirmar(true)}
            disabled={quitando}
            title={`Quitar la pareja ${par.subgrupo} → ${par.cuenta6}.`}
            aria-label={`Quitar la pareja ${par.subgrupo} → ${par.cuenta6}`}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-ink-200 bg-white text-ink-500 transition hover:border-red-200 hover:bg-red-50 hover:text-err-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Icon name="trash" size={13} />
          </button>
        </div>
      </div>

      {confirmar && (
        <form action={action} className="mt-2.5 flex flex-wrap items-center gap-2 rounded-md border border-err-100 bg-err-100/35 px-3 py-2">
          <input type="hidden" name="id" value={par.id} />
          <span className="min-w-[220px] flex-1 text-[11.5px] text-ink-600">
            ¿Quitar la pareja {par.subgrupo} → {par.cuenta6}? En los cargues abiertos el activo queda con la depreciación en
            cero y {par.cuenta6} pasa a su propio renglón. Las dos siguen conciliándose; los períodos en firme no cambian.
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
