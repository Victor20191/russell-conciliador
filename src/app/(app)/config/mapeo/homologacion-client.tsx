"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, Chip, EmptyState } from "@/components/ui";
import { Icon } from "@/components/icons";
import { Modal } from "@/components/modal";
import { ActionForm } from "@/components/action-form";
import { EstadoProcesando } from "@/components/estado-procesando";
import { PageSizeSelect, PaginationFooter, usePagination } from "@/components/pagination-controls";
import { notifyError, notifySuccess } from "@/lib/client-notifications";
import { fmtDateTimeLong } from "@/lib/format";
import { esExcepcionCuenta, esMapeoManual } from "@/lib/balance/mapeo-cliente-config";
import { cruzaClaseContable } from "@/lib/balance/clase-contable";
import type { AnomaliaMapeo } from "@/lib/balance/anomalias-mapeo";
import type { CuentaPucCliente } from "@/lib/balance/catalogo-puc-cliente";
import { consultarImpactoHomologacionCliente, guardarHomologacionCliente } from "@/app/actions/homologacion-cliente";
import { eliminarMapeoCliente } from "@/app/actions/mapeo-cliente";
import type { StdAccount } from "./mapeo-client";

const INPUT = "w-full rounded-md border border-ink-200 bg-white px-3 py-2 text-[12.5px] text-ink-800 outline-none focus:border-blue-400";
const porConfirmar = (c: CuentaPucCliente) => !!c.cuenta6Russell && (c.coincidencia == null || c.coincidencia < 100);

export function MapeoClienteTab({ accounts, std, anomalias, clienteId, clienteNit, puedeMapear, cliente, clientNames, onEditar }: {
  accounts: CuentaPucCliente[]; std: StdAccount[]; anomalias: Map<string, AnomaliaMapeo>;
  clienteId: number | null; clienteNit: string | null; puedeMapear: boolean;
  cliente: string; clientNames: string[]; onEditar: (cuenta: CuentaPucCliente | null) => void;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [nivel, setNivel] = useState("all");
  const [origen, setOrigen] = useState("all");
  const [revisar, setRevisar] = useState(false);
  const [confirmar, setConfirmar] = useState(false);
  const [cruce, setCruce] = useState(false);
  const nombres = useMemo(() => new Map(std.map((s) => [s.code, s.name])), [std]);
  const niveles = useMemo(() => [...new Set(accounts.map((a) => a.level))].sort((a, b) => a - b), [accounts]);
  const pendientes = accounts.filter(porConfirmar).length;
  const cruces = accounts.filter((a) => cruzaClaseContable(a.code, a.cuenta6Russell)).length;
  const sinAsignar = accounts.filter((a) => !a.cuenta6Russell).length;
  const needle = q.trim().toLowerCase();
  const rows = useMemo(() => accounts.filter((a) => {
    if (nivel !== "all" && a.level !== Number(nivel)) return false;
    if (revisar && !anomalias.has(a.code)) return false;
    if (confirmar && !porConfirmar(a)) return false;
    if (cruce && !cruzaClaseContable(a.code, a.cuenta6Russell)) return false;
    if (origen === "sinasignar" && a.cuenta6Russell) return false;
    if (origen === "manual" && !esMapeoManual(a.origenMapeo)) return false;
    if (origen === "automatico" && a.origenMapeo !== "automatico") return false;
    return !needle || [a.code, a.name, a.cuenta6Russell, nombres.get(a.cuenta6Russell ?? "")].some((v) => v?.toLowerCase().includes(needle));
  }), [accounts, nivel, revisar, confirmar, cruce, origen, needle, nombres, anomalias]);
  const pg = usePagination(rows, 50);
  const filtro = (set: (v: boolean) => void, value: boolean) => { set(!value); pg.resetToFirstPage(); };

  return (
    <Card>
      <div className="border-b border-ink-100 bg-blue-50/40 px-4 py-3 text-[12px] leading-relaxed text-ink-600">
        <b className="text-ink-800">PUC acumulado de {cliente}</b>{clienteNit ? <> · NIT <span className="font-mono">{clienteNit}</span></> : null}
        <p className="mt-1">Reúne las cuentas de sus distintos balances y las reglas guardadas, en todos los niveles. Cada homologación se conserva para próximas cargas; al guardar puedes aplicarla también a balances existentes.</p>
      </div>
      <div className="flex flex-wrap items-center gap-3 border-b border-ink-100 px-4 py-3">
        <h2 className="text-[13px] font-semibold text-ink-800">Mapeo de balance por cliente</h2>
        <select aria-label="Cliente del PUC" value={cliente} onChange={(e) => router.push(`/config/mapeo?cliente=${encodeURIComponent(e.target.value)}`)} className="max-w-full rounded-md border border-ink-200 px-2 py-1.5 text-[12px]">
          {clientNames.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        <div className="ml-auto flex items-center gap-2">
          <PageSizeSelect value={pg.pageSize} onChange={pg.setPageSize} />
          {puedeMapear && clienteId != null && <button type="button" onClick={() => onEditar(null)} className="rounded-md bg-navy-700 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-navy-800">Nueva regla</button>}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 border-b border-ink-100 px-4 py-3">
        <input aria-label="Buscar cuenta del cliente" value={q} onChange={(e) => { setQ(e.target.value); pg.resetToFirstPage(); }} placeholder="Buscar código, nombre o estándar…" className={`${INPUT} min-w-48 flex-1 sm:max-w-sm`} />
        <select aria-label="Nivel de la cuenta" value={nivel} onChange={(e) => { setNivel(e.target.value); pg.resetToFirstPage(); }} className="rounded-md border border-ink-200 px-2 py-2 text-[12px]">
          <option value="all">Todos los niveles</option>
          {niveles.map((n) => <option key={n} value={n}>N{n} · {n} dígitos</option>)}
        </select>
        <select aria-label="Origen de homologación" value={origen} onChange={(e) => { setOrigen(e.target.value); pg.resetToFirstPage(); }} className="rounded-md border border-ink-200 px-2 py-2 text-[12px]">
          <option value="all">Todos los orígenes</option><option value="manual">Manual</option><option value="automatico">Automático</option><option value="sinasignar">Sin asignar</option>
        </select>
        {[{ label: "Revisar", count: anomalias.size, value: revisar, set: setRevisar }, { label: "Por confirmar", count: pendientes, value: confirmar, set: setConfirmar }, { label: "Cruza de clase", count: cruces, value: cruce, set: setCruce }].map((f) => (
          <button key={f.label} type="button" aria-pressed={f.value} onClick={() => filtro(f.set, f.value)} className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-2 text-[11.5px] font-medium ${f.value ? "border-warn-300 bg-warn-100 text-warn-700" : "border-ink-200 text-ink-600 hover:bg-ink-50"}`}>
            <Icon name="warn" size={12} /> {f.label} ({f.count})
          </button>
        ))}
      </div>
      {!clienteId || accounts.length === 0 ? <EmptyState icon="doc" title="Sin cuentas" description="Selecciona un cliente con balances o crea su primera regla de homologación." /> : (
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead><tr className="border-b border-ink-100 text-left text-[11px] uppercase tracking-wider text-ink-500">
              {["Nivel", "Cuenta cliente / nombre ERP", "Cuenta estándar Russell", "Origen", "Coincidencia", "Actualizado", ...(puedeMapear ? ["Acciones"] : [])].map((h) => <th key={h} className="px-3 py-2 font-semibold">{h}</th>)}
            </tr></thead>
            <tbody>{pg.pageItems.map((a) => {
              const an = anomalias.get(a.code);
              const nombreStd = nombres.get(a.cuenta6Russell ?? "");
              return <tr key={a.code} className={`border-b border-ink-50 hover:bg-ink-50 ${an ? "bg-warn-50/50" : ""}`}>
                <td className="px-3 py-3"><Chip label={`N${a.level}`} tone="ink" /></td>
                <td className="min-w-56 py-3 pr-3" style={{ paddingLeft: 12 + Math.max(0, a.level - 4) * 5 }}>
                  <div className="font-mono font-semibold text-ink-800">{a.level > 6 && <span aria-hidden="true" className="mr-1 text-ink-300">└</span>}{a.code}</div>
                  <div className="mt-0.5 text-[12px] text-ink-600">{a.name === a.code ? "Nombre no disponible" : a.name}</div>
                  {an && <div className="mt-1 text-[11px] text-warn-700">Difiere de su grupo: {an.cuenta6RussellDelGrupo}</div>}
                </td>
                <td className="min-w-52 px-3 py-3">
                  {puedeMapear && a.code.length >= 4 ? <button type="button" onClick={() => onEditar(a)} title={`Editar homologación de ${a.code}`} className="text-left hover:underline">
                    {a.cuenta6Russell ? <><span className="font-mono text-blue-600">{a.cuenta6Russell}</span><span className="mt-0.5 block text-[12px] text-ink-600">{nombreStd}</span></> : <Chip label="Asignar" tone="warn" />}
                  </button> : <span>{a.cuenta6Russell ? `${a.cuenta6Russell} · ${nombreStd ?? ""}` : "—"}</span>}
                </td>
                <td className="px-3 py-3"><Chip label={!a.enMemoria ? "Último balance" : !a.cuenta6Russell ? "Sin asignar" : esExcepcionCuenta(a.origenMapeo) ? "Solo esta cuenta" : esMapeoManual(a.origenMapeo) ? "Manual" : "Automático"} tone={esMapeoManual(a.origenMapeo) ? "blue" : "ink"} /></td>
                <td className="px-3 py-3 font-mono text-ink-600">{a.coincidencia != null ? `${a.coincidencia}%` : "—"}</td>
                <td className="px-3 py-3 text-[11px] text-ink-500">{a.actualizadoEn ? fmtDateTimeLong(a.actualizadoEn) : "—"}{a.actualizadoPor && <span className="block">{a.actualizadoPor}</span>}</td>
                {puedeMapear && <td className="px-3 py-3">{a.code.length >= 4 && <button type="button" onClick={() => onEditar(a)} className="rounded-md border border-ink-200 bg-white px-2.5 py-1.5 text-[11.5px] font-semibold text-navy-700 hover:bg-blue-50">{an ? "Corregir" : porConfirmar(a) ? "Confirmar / editar" : "Editar"}</button>}</td>}
              </tr>;
            })}{rows.length === 0 && <tr><td colSpan={puedeMapear ? 7 : 6} className="px-4 py-8 text-center text-ink-500">{revisar ? "No hay inconsistencias que coincidan con estos filtros." : "No hay cuentas que coincidan con estos filtros."}</td></tr>}</tbody>
          </table>
        </div>
      )}
      <div className="border-t border-ink-100 px-4 py-2.5 text-[11.5px] text-ink-500">{accounts.length} cuentas acumuladas · {sinAsignar} sin asignar · {niveles.map((n) => `N${n}`).join(" / ")}</div>
      <PaginationFooter rangeLabel={pg.rangeLabel} currentPage={pg.page} totalPages={pg.totalPages} onPageChange={pg.setPage} />
    </Card>
  );
}

export function HomologacionClienteForm({ cuenta, clienteId, std, accounts, onClose }: {
  cuenta: CuentaPucCliente | null; clienteId: number; std: StdAccount[]; accounts: CuentaPucCliente[]; onClose: () => void;
}) {
  const router = useRouter();
  const [cuentaCliente, setCuentaCliente] = useState(cuenta?.code ?? "");
  const [seleccionAlcance, setSeleccionAlcance] = useState<"solo" | "grupo">("solo");
  const [codigo, setCodigo] = useState(cuenta?.cuenta6Russell ?? "");
  const [busquedaStd, setBusquedaStd] = useState("");
  const [aplicarExistentes, setAplicarExistentes] = useState(false);
  const [quitar, setQuitar] = useState(false);
  const [state, action, pending] = useActionState(guardarHomologacionCliente, undefined);
  const alcance = cuentaCliente.length === 6 ? "grupo" : cuentaCliente.length < 6 ? "solo" : seleccionAlcance;
  const claveImpacto = `${clienteId}:${cuentaCliente}:${alcance}`;
  type Impacto = Awaited<ReturnType<typeof consultarImpactoHomologacionCliente>>;
  const [consulta, setConsulta] = useState<{ clave: string; resultado: Impacto } | null>(null);
  const impacto = consulta?.clave === claveImpacto ? consulta.resultado : null;
  const cuentaValida = /^\d{4,30}$/.test(cuentaCliente);
  const cargandoImpacto = cuentaValida && !impacto;
  useEffect(() => {
    if (!cuentaValida) return;
    let vigente = true;
    const timer = setTimeout(() => {
      consultarImpactoHomologacionCliente({ clienteId, cuentaCliente, alcance }).then((resultado) => {
        if (vigente) setConsulta({ clave: claveImpacto, resultado });
      }).catch(() => {
        if (vigente) setConsulta({ clave: claveImpacto, resultado: { ok: false, message: "No se pudo consultar el alcance. Cierra y vuelve a abrir la cuenta." } });
      });
    }, 250);
    return () => { vigente = false; clearTimeout(timer); };
  }, [clienteId, cuentaCliente, alcance, claveImpacto, cuentaValida]);
  useEffect(() => {
    if (state?.ok) { notifySuccess(state.message ?? "Homologación guardada."); router.refresh(); onClose(); }
    else if (state?.ok === false) notifyError(state.message ?? "No se pudo guardar la homologación.");
  }, [state, router, onClose]);
  const opciones = useMemo(() => std.filter((s) => s.code.length === 6 && (s.code === codigo || `${s.code} ${s.name}`.toLowerCase().includes(busquedaStd.trim().toLowerCase()))), [std, codigo, busquedaStd]);
  const grupo = cuentaCliente.slice(0, 6);
  const excepciones = alcance === "grupo" ? accounts.filter((a) => a.code.startsWith(grupo) && esExcepcionCuenta(a.origenMapeo)) : [];

  return <Modal open size="2xl" onClose={() => { if (!pending) onClose(); }} title={quitar ? "Quitar regla de homologación" : cuenta ? `Homologar · ${cuenta.code}` : "Nueva regla de homologación"} footer={quitar && cuenta ? (
    <ActionForm action={eliminarMapeoCliente.bind(null, undefined)} successMessage="Regla retirada para próximas cargas." errorMessage="No se pudo quitar la regla." onSuccess={() => { router.refresh(); onClose(); }}>
      {(eliminando) => <><input type="hidden" name="id" value={cuenta.id} /><button disabled={eliminando} type="submit" className="rounded-md bg-err-700 px-3 py-2 text-[12px] font-semibold text-white">{eliminando ? "Quitando…" : "Quitar regla"}</button></>}
    </ActionForm>
  ) : (
    <div className="flex w-full flex-wrap items-center justify-between gap-2">
      {cuenta?.enMemoria && cuenta.cuenta6Russell ? <button type="button" disabled={pending} onClick={() => setQuitar(true)} className="text-[12px] font-medium text-err-700 hover:underline">Quitar regla</button> : <span />}
      <button type="submit" form="homologacion-cliente-form" disabled={pending || !codigo || !cuentaValida || !impacto?.ok} className="rounded-md bg-navy-700 px-4 py-2 text-[12.5px] font-semibold text-white hover:bg-navy-800 disabled:opacity-50">{pending ? <EstadoProcesando>Guardando</EstadoProcesando> : aplicarExistentes ? "Guardar y actualizar balances" : "Guardar para próximas cargas"}</button>
    </div>
  )}>
    {quitar ? <div className="space-y-3 text-[13px] leading-relaxed text-ink-700"><p>Se retirará la regla de <b className="font-mono">{cuenta?.code}</b> para próximas cargas. {cuenta && (esExcepcionCuenta(cuenta.origenMapeo) || cuenta.code.length !== 6) ? "Esa cuenta volverá a usar la regla de su grupo, si existe." : "También se retirarán las reglas de las cuentas de este grupo."}</p><p>Esta acción conserva los balances existentes. Para cambiar su homologación, vuelve y elige una cuenta estándar.</p><button type="button" onClick={() => setQuitar(false)} className="font-semibold text-blue-600 hover:underline">Volver a editar</button></div> : (
      <form id="homologacion-cliente-form" action={action} className="space-y-4">
        <input type="hidden" name="clienteId" value={clienteId} /><input type="hidden" name="alcance" value={alcance} /><input type="hidden" name="aplicarExistentes" value={aplicarExistentes ? "1" : "0"} />
        <fieldset disabled={pending} className="space-y-4">
          <label className="block text-[12px] font-semibold text-ink-700">Cuenta del cliente<input name="cuentaCliente" value={cuentaCliente} readOnly={!!cuenta} onChange={(e) => setCuentaCliente(e.target.value.trim())} pattern="\d{4,30}" required inputMode="numeric" placeholder="Código completo de la cuenta" className={`${INPUT} mt-1 font-mono ${cuenta ? "bg-ink-50" : ""}`} /></label>
          {cuenta && <p className="text-[12px] text-ink-600">{cuenta.name}{!cuenta.enMemoria && <span className="mt-1 block">Cuenta recuperada de balances históricos. Al guardar se incorporará a la memoria del cliente.</span>}</p>}
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="block text-[12px] font-semibold text-ink-700">Buscar cuenta estándar<input value={busquedaStd} onChange={(e) => setBusquedaStd(e.target.value)} placeholder="Código o nombre Russell" className={`${INPUT} mt-1 font-normal`} /></label>
            <label className="block text-[12px] font-semibold text-ink-700">Cuenta estándar Russell<select name="codigo" required value={codigo} onChange={(e) => setCodigo(e.target.value)} className={`${INPUT} mt-1 font-normal`}><option value="">Selecciona una cuenta</option>{opciones.map((s) => <option key={s.code} value={s.code}>{s.code} · {s.name}</option>)}</select></label>
          </div>
          <fieldset className="rounded-md border border-ink-150 p-3"><legend className="px-1 text-[12px] font-semibold text-ink-700">Cuentas que reciben el cambio</legend>
            {cuentaCliente.length === 6 ? <p className="text-[12px] text-ink-600">Regla del grupo <b className="font-mono">{grupo}</b>: se aplica a todas las cuentas que comienzan con este código.</p> : <div className="space-y-2 text-[12px] text-ink-700">
              <label className="flex items-start gap-2"><input type="radio" name="seleccionAlcance" value="solo" checked={alcance === "solo"} onChange={() => setSeleccionAlcance("solo")} className="mt-0.5" /><span><b>Solo esta cuenta</b><span className="block text-ink-500">Código exacto {cuentaCliente || "seleccionado"}; conserva las demás cuentas.</span></span></label>
              {cuentaCliente.length > 6 && <label className="flex items-start gap-2"><input type="radio" name="seleccionAlcance" value="grupo" checked={alcance === "grupo"} onChange={() => setSeleccionAlcance("grupo")} className="mt-0.5" /><span><b>Todo el grupo {grupo}</b><span className="block text-ink-500">Incluye todas sus cuentas y reemplaza sus excepciones individuales.</span></span></label>}
            </div>}
            {impacto?.ok && impacto.excepciones > 0 && alcance === "grupo" && <p className="mt-3 rounded-md bg-warn-50 px-3 py-2 text-[12px] text-warn-800">Se reemplazarán <b>{impacto.excepciones} excepciones</b> del grupo{excepciones.length ? `: ${excepciones.slice(0, 3).map((a) => `${a.code} → ${a.cuenta6Russell ?? "—"}`).join(" · ")}` : "."}.</p>}
          </fieldset>
          <label className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 ${aplicarExistentes ? "border-blue-300 bg-blue-50" : "border-ink-200 bg-ink-50"}`}>
            <input type="checkbox" checked={aplicarExistentes} onChange={(e) => setAplicarExistentes(e.target.checked)} className="mt-0.5 h-4 w-4" />
            <span className="text-[12.5px] text-ink-800"><b>Aplicar también a balances existentes</b><span className="mt-1 block text-[12px] leading-relaxed text-ink-600">{aplicarExistentes ? "Se guardará para próximas cargas y se actualizará la homologación en los balances existentes del cliente, incluidas sus versiones anteriores. Los importes se conservan." : "Desactivado: se guarda únicamente para próximas cargas. Puedes decidirlo de nuevo en cada cuenta."}</span></span>
          </label>
          <div aria-live="polite" className="rounded-md border border-ink-100 px-3 py-2 text-[12px] leading-relaxed text-ink-600">
            {cargandoImpacto ? "Consultando balances asociados…" : impacto?.ok ? <><b>{impacto.balances} balances · {impacto.filas} filas</b> {aplicarExistentes ? "recibirán la homologación elegida." : "disponibles si activas la actualización."}{impacto.congelados > 0 ? <span className="mt-1 block text-warn-700">{impacto.congelados} balances congelados quedan excluidos.</span> : <span className="mt-1 block">Los balances congelados siempre quedan excluidos.</span>}</> : impacto ? <span role="alert" className="text-err-700">{impacto.message}</span> : "Escribe el código completo para consultar el alcance."}
          </div>
          {state?.ok === false && <p role="alert" className="text-[12px] text-err-700">{state.message}</p>}
        </fieldset>
      </form>
    )}
  </Modal>;
}
