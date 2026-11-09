"use client";

import { useActionState, useEffect, useState } from "react";
import { EstadoProcesando } from "@/components/estado-procesando";
import { Pestana } from "@/components/pestanas";
import { Card, Chip } from "@/components/ui";
import { fmtDateTime } from "@/lib/format";
import { notifyActionState } from "@/lib/client-notifications";
import {
  agregarTerceroDian,
  cambiarRestaTerceroDian,
  guardarCuentaMapeoDian,
  quitarTerceroDian,
} from "@/app/actions/impuestos-configuracion";
import type { ActionState } from "@/lib/definitions";
import type { CuentaMapeoVista, MapeoDianVista } from "@/lib/impuestos/configuracion-servidor";
import { renglonDe } from "@/lib/impuestos/formularios/definicion";
import { F350 } from "@/lib/impuestos/formularios/f350";

type FilaVista = MapeoDianVista["filas"][number];

const BOTON_PRIMARIO = "rounded-md bg-navy-700 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-navy-600 disabled:opacity-60";
const BOTON_SECUNDARIO = "rounded-md border border-ink-200 px-2.5 py-1.5 text-[12px] font-semibold text-ink-600 hover:bg-ink-50 disabled:opacity-60";

const PESTANAS = [
  { formulario: "350", etiqueta: "Retención en la fuente · 350" },
  { formulario: "300", etiqueta: "IVA · 300" },
] as const;

/** Una o varias cuentas de 6 dígitos separadas con «+», coma o punto y coma (vacío = sin cuenta). */
const CUENTAS_VALIDAS = /^(\d{6}([+,;]\d{6})*)?$/;

export default function MapeosDianClient({ vista, puedeEditar }: { vista: MapeoDianVista; puedeEditar: boolean }) {
  const esIva = vista.formulario === "300";
  const secciones = [...new Set(vista.filas.map((f) => f.seccion))];
  const sinPlan = vista.cuentas.filter((c) => c.nombre == null);
  const porTercero = vista.cuentas.filter((c) => c.porTercero);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Formulario">
        {PESTANAS.map((p) => (
          <Pestana key={p.formulario} activa={vista.formulario === p.formulario} label={p.etiqueta} href={`/config/mapeos-dian?formulario=${p.formulario}`} />
        ))}
      </div>

      {sinPlan.length > 0 && (
        <div className="rounded-md border border-warn-100 bg-warn-100 px-3 py-2.5 text-[12.5px] text-warn-700">
          {sinPlan.length === 1 ? "La cuenta " : "Las cuentas "}
          <span className="font-semibold">{sinPlan.map((c) => c.cuenta).join(", ")}</span>
          {sinPlan.length === 1 ? " no existe" : " no existen"} todavía en el plan Russell: sus renglones no tendrán contra qué cruzar hasta que se creen en Plan Estándar Russell.
        </div>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-[13px] font-semibold uppercase tracking-wide text-ink-500">
          {esIva ? "Renglones del formulario 300" : "Conceptos del formulario 350"}
        </h2>
        <p className="text-[12px] leading-relaxed text-ink-500">
          {esIva
            ? "Cada renglón con saldo se compara con el saldo final de su cuenta Russell. Un renglón puede ir contra varias cuentas (sepáralas con +) y varios renglones contra la misma cuenta: en el cruce se agrupan en una fila. Las compras (44 a 57) no se concilian."
            : "Cada concepto suma sus dos columnas, persona jurídica y natural, y se compara con el saldo final de su cuenta en el balance por terceros."}
        </p>
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[760px] text-[12.5px]">
            <thead>
              <tr className="border-b border-ink-150 bg-ink-50 text-left text-[11px] font-semibold uppercase tracking-wide text-ink-500">
                <th className="px-3 py-2">{esIva ? "Renglón" : "Concepto"}</th>
                {esIva ? (
                  <th className="px-3 py-2 text-right">N.º</th>
                ) : (
                  <>
                    <th className="px-3 py-2 text-right">P. jurídica</th>
                    <th className="px-3 py-2 text-right">P. natural</th>
                  </>
                )}
                <th className="px-3 py-2">{esIva ? "Cuentas Russell" : "Cuenta Russell"}</th>
              </tr>
            </thead>
            {secciones.map((seccion) => (
              <tbody key={seccion}>
                <tr className="bg-ink-50/60">
                  <td colSpan={esIva ? 3 : 4} className="px-3 py-1.5 text-[11.5px] font-semibold text-navy-800">{seccion}</td>
                </tr>
                {vista.filas.filter((f) => f.seccion === seccion).map((f) => (
                  <FilaConcepto key={f.concepto} fila={f} formulario={vista.formulario} puedeEditar={puedeEditar} />
                ))}
              </tbody>
            ))}
          </table>
        </Card>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-[13px] font-semibold uppercase tracking-wide text-ink-500">Tercero DIAN por cuenta</h2>
        <p className="text-[12px] leading-relaxed text-ink-500">
          {esIva
            ? "Muchos clientes contabilizan los pagos a la DIAN en las mismas cuentas de IVA. En las cuentas marcadas, el saldo de los terceros DIAN se muestra tachado y se resta del saldo que se concilia. Las cuentas de ingresos no aparecen aquí: se concilian por el saldo de la cuenta, sin terceros."
            : "Muchos clientes contabilizan los pagos a la DIAN en las mismas cuentas de retención. En las cuentas marcadas, el saldo de los terceros DIAN se muestra tachado y se resta del saldo que se concilia. En las autorretenciones no se resta: sus movimientos con la DIAN son la autorretención misma."}
        </p>
        <Card className="divide-y divide-ink-100 p-0">
          {porTercero.map((c) => (
            <FilaCuenta key={c.cuenta} cuenta={c} puedeEditar={puedeEditar} />
          ))}
        </Card>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-[13px] font-semibold uppercase tracking-wide text-ink-500">NIT de la DIAN</h2>
        <p className="text-[12px] leading-relaxed text-ink-500">
          Un tercero es la DIAN si su NIT (sin el dígito de verificación) está en esta lista. Vale para Retención en la fuente y para IVA.
        </p>
        <TercerosDian terceros={vista.terceros} puedeEditar={puedeEditar} />
      </section>
    </div>
  );
}

function FilaConcepto({ fila, formulario, puedeEditar }: { fila: FilaVista; formulario: string; puedeEditar: boolean }) {
  const esIva = formulario === "300";
  const [state, action, guardando] = useActionState<ActionState, FormData>(guardarCuentaMapeoDian, {});
  const [cuenta, setCuenta] = useState(fila.cuentaRussell ?? "");
  const [previa, setPrevia] = useState(fila.cuentaRussell ?? "");
  // Resincroniza el campo cuando el servidor revalida (patrón de ajuste en render).
  if ((fila.cuentaRussell ?? "") !== previa) {
    setPrevia(fila.cuentaRussell ?? "");
    setCuenta(fila.cuentaRussell ?? "");
  }
  useEffect(() => {
    notifyActionState(state, { success: "Cuenta del renglón actualizada.", error: "No se pudo guardar la cuenta." });
  }, [state]);

  const sucio = cuenta !== (fila.cuentaRussell ?? "");
  const valida = esIva ? CUENTAS_VALIDAS.test(cuenta.replace(/\s/g, "")) : cuenta === "" || /^\d{6}$/.test(cuenta);
  const signo = fila.signo === "-" ? "−" : "";
  const varias = fila.cuentasRussell.length > 1;

  return (
    <tr className="border-b border-ink-100 align-top last:border-0">
      <td className="px-3 py-2 text-ink-800">
        {fila.etiqueta}
        {fila.signo === "-" && <span className="ml-1.5"><Chip label="Resta" tone="warn" /></span>}
        {fila.actualizadoEn && (
          <div className="mt-0.5 text-[11px] text-ink-400">Editado {fmtDateTime(fila.actualizadoEn)}{fila.actualizadoPor ? ` · ${fila.actualizadoPor}` : ""}</div>
        )}
      </td>
      {esIva ? (
        <td className="px-3 py-2 text-right tabular-nums text-ink-600">{fila.renglonPj != null ? `${signo}${fila.renglonPj}` : "—"}</td>
      ) : fila.renglonPj != null && renglonDe(F350, fila.renglonPj)?.persona === "unica" ? (
        // 129 a 137: un solo valor, de ninguna de las dos personas.
        <td colSpan={2} className="px-3 py-2 text-center tabular-nums text-ink-600">{`${signo}${fila.renglonPj}`}</td>
      ) : (
        <>
          <td className="px-3 py-2 text-right tabular-nums text-ink-600">{fila.renglonPj != null ? `${signo}${fila.renglonPj}` : "—"}</td>
          <td className="px-3 py-2 text-right tabular-nums text-ink-600">{fila.renglonPn != null ? `${signo}${fila.renglonPn}` : "—"}</td>
        </>
      )}
      <td className="px-3 py-2">
        {!fila.enCruce ? (
          <span className="text-[12px] text-ink-500">{fila.concepto === "sanciones" ? "No entra al cruce contable (solo a Pagos efectuados)" : "No entra al cruce contable"}</span>
        ) : puedeEditar ? (
          <form action={action} className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="formulario" value={formulario} />
            <input type="hidden" name="concepto" value={fila.concepto} />
            <input
              name="cuenta"
              inputMode={esIva ? "text" : "numeric"}
              value={cuenta}
              onChange={(e) => setCuenta(esIva ? e.target.value.replace(/[^\d+,;\s]/g, "") : e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="Sin cuenta"
              aria-label={`Cuenta Russell de ${fila.etiqueta}`}
              title={esIva ? "Una o varias cuentas de 6 dígitos; varias se separan con +" : undefined}
              className={`${varias ? "w-full max-w-[460px]" : esIva ? "w-40" : "w-24"} rounded-md border bg-white px-2 py-1 tabular-nums text-[12.5px] text-ink-800 outline-none focus:border-blue-400 ${valida ? "border-ink-200" : "border-err-500"}`}
            />
            {!varias && <NombreCuenta fila={fila} />}
            {sucio && (
              <button type="submit" disabled={!valida || guardando} className={BOTON_PRIMARIO}>
                {guardando ? <EstadoProcesando>Guardando</EstadoProcesando> : "Guardar"}
              </button>
            )}
            {varias && <ListaCuentas fila={fila} />}
          </form>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <span className="tabular-nums font-semibold text-ink-800">{varias ? `${fila.cuentasRussell.length} cuentas` : (fila.cuentaRussell ?? "Sin cuenta")}</span>
            {varias ? <ListaCuentas fila={fila} /> : <NombreCuenta fila={fila} />}
          </div>
        )}
      </td>
    </tr>
  );
}

function NombreCuenta({ fila }: { fila: FilaVista }) {
  if (!fila.cuentaRussell) {
    return fila.concepto === "menos_renta_exceso"
      ? <span className="text-[11.5px] text-ink-500">Resta en lo declarado del total 130</span>
      : null;
  }
  if (fila.nombreCuenta == null) return <Chip label="No existe en el plan Russell" tone="warn" />;
  return <span className="text-[11.5px] text-ink-500">{fila.nombreCuenta}</span>;
}

/** Las cuentas de una fila con varias (el renglón 40 del 300), cada una con su nombre. */
function ListaCuentas({ fila }: { fila: FilaVista }) {
  return (
    <ul className="w-full columns-1 gap-x-6 text-[11.5px] text-ink-500 md:columns-2">
      {fila.cuentasRussell.map((c) => (
        <li key={c.cuenta} className="break-inside-avoid">
          <span className="tabular-nums font-semibold text-ink-700">{c.cuenta}</span>{" "}
          {c.nombre ?? <span className="text-warn-700">no existe en el plan Russell</span>}
        </li>
      ))}
    </ul>
  );
}

function FilaCuenta({ cuenta, puedeEditar }: { cuenta: CuentaMapeoVista; puedeEditar: boolean }) {
  const [state, action, guardando] = useActionState<ActionState, FormData>(cambiarRestaTerceroDian, {});
  useEffect(() => {
    notifyActionState(state, { success: "Cuenta actualizada.", error: "No se pudo cambiar la cuenta." });
  }, [state]);

  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="tabular-nums text-[13px] font-semibold text-navy-800">{cuenta.cuenta}</span>
          <span className="text-[12px] text-ink-600">{cuenta.nombre ?? "No existe en el plan Russell"}</span>
        </div>
        <div className="mt-0.5 text-[11.5px] text-ink-400">{cuenta.conceptos.join(" · ")}</div>
      </div>
      <Chip label={cuenta.restarTerceroDian ? "Resta el tercero DIAN" : "No resta el tercero DIAN"} tone={cuenta.restarTerceroDian ? "blue" : "ink"} />
      {puedeEditar && (
        <form action={action}>
          <input type="hidden" name="cuenta" value={cuenta.cuenta} />
          <input type="hidden" name="restar" value={cuenta.restarTerceroDian ? "0" : "1"} />
          <button type="submit" disabled={guardando} className={BOTON_SECUNDARIO}>
            {guardando ? <EstadoProcesando>Guardando</EstadoProcesando> : cuenta.restarTerceroDian ? "No restar" : "Restar"}
          </button>
        </form>
      )}
    </div>
  );
}

function TercerosDian({ terceros, puedeEditar }: { terceros: MapeoDianVista["terceros"]; puedeEditar: boolean }) {
  const [agregarState, agregarAction, agregando] = useActionState<ActionState, FormData>(agregarTerceroDian, {});
  const [quitarState, quitarAction, quitando] = useActionState<ActionState, FormData>(quitarTerceroDian, {});
  const [confirmar, setConfirmar] = useState<number | null>(null);
  const [nit, setNit] = useState("");
  const [etiqueta, setEtiqueta] = useState("");

  // Tras cada respuesta del servidor: limpiar el formulario o cerrar la confirmación (ajuste en render).
  const [ultimoAgregar, setUltimoAgregar] = useState(agregarState);
  if (agregarState !== ultimoAgregar) {
    setUltimoAgregar(agregarState);
    if (agregarState.ok) { setNit(""); setEtiqueta(""); }
  }
  const [ultimoQuitar, setUltimoQuitar] = useState(quitarState);
  if (quitarState !== ultimoQuitar) {
    setUltimoQuitar(quitarState);
    setConfirmar(null);
  }
  useEffect(() => {
    notifyActionState(agregarState, { success: "NIT agregado.", error: "No se pudo agregar el NIT." });
  }, [agregarState]);
  useEffect(() => {
    notifyActionState(quitarState, { success: "NIT quitado.", error: "No se pudo quitar el NIT." });
  }, [quitarState]);

  return (
    <Card className="p-0">
      <div className="divide-y divide-ink-100">
        {terceros.map((t) => (
          <div key={t.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
            <span className="tabular-nums text-[13px] font-semibold text-navy-800">{t.nit}</span>
            <span className="min-w-0 flex-1 text-[12px] text-ink-600">{t.etiqueta}</span>
            {puedeEditar && terceros.length > 1 && (
              confirmar === t.id ? (
                <form action={quitarAction} className="flex items-center gap-1.5">
                  <input type="hidden" name="id" value={t.id} />
                  <span className="text-[11.5px] text-ink-500">¿Quitar {t.nit}?</span>
                  <button type="submit" disabled={quitando} className="rounded-md border border-err-100 px-2.5 py-1.5 text-[12px] font-semibold text-err-700 hover:bg-err-100 disabled:opacity-60">
                    {quitando ? <EstadoProcesando>Quitando</EstadoProcesando> : "Sí, quitar"}
                  </button>
                  <button type="button" onClick={() => setConfirmar(null)} className={BOTON_SECUNDARIO}>Cancelar</button>
                </form>
              ) : (
                <button type="button" onClick={() => setConfirmar(t.id)} className={BOTON_SECUNDARIO}>Quitar</button>
              )
            )}
          </div>
        ))}
      </div>
      {puedeEditar && (
        <form action={agregarAction} className="flex flex-wrap items-center gap-2 border-t border-ink-150 bg-ink-50 px-4 py-3">
          <input
            name="nit"
            inputMode="numeric"
            value={nit}
            onChange={(e) => setNit(e.target.value)}
            placeholder="NIT"
            aria-label="NIT de la DIAN"
            className="w-36 rounded-md border border-ink-200 bg-white px-2 py-1.5 tabular-nums text-[12.5px] text-ink-800 outline-none focus:border-blue-400"
          />
          <input
            name="etiqueta"
            value={etiqueta}
            onChange={(e) => setEtiqueta(e.target.value)}
            placeholder="A qué corresponde"
            aria-label="Descripción del NIT"
            className="min-w-[220px] flex-1 rounded-md border border-ink-200 bg-white px-2 py-1.5 text-[12.5px] text-ink-800 outline-none focus:border-blue-400"
          />
          <button type="submit" disabled={agregando || nit.trim() === "" || etiqueta.trim() === ""} className={BOTON_PRIMARIO}>
            {agregando ? <EstadoProcesando>Agregando</EstadoProcesando> : "Agregar NIT"}
          </button>
        </form>
      )}
    </Card>
  );
}
