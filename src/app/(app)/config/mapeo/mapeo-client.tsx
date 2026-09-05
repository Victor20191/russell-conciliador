"use client";

import { EstadoProcesando } from "@/components/estado-procesando";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { Card, Chip, StatCard, EmptyState } from "@/components/ui";
import {
  PageSizeSelect,
  PaginationFooter,
  usePagination,
} from "@/components/pagination-controls";
import { ActionForm } from "@/components/action-form";
import { Modal } from "@/components/modal";
import { notifyActionState } from "@/lib/client-notifications";
import { fmtDateTimeLong } from "@/lib/format";
import {
  createStandardAccount,
  updateStandardAccount,
  deleteStandardAccount,
} from "@/app/actions/standard-accounts";
import { crearSubgrupo, editarSubgrupo, eliminarSubgrupo } from "@/app/actions/subgrupos";
import { esExcepcionCuenta, esMapeoManual, esPendiente } from "@/lib/balance/mapeo-cliente-config";
import { detectarAnomaliasMapeo, planAlinearConGrupo, type AnomaliaMapeo } from "@/lib/balance/anomalias-mapeo";
import { cruzaClaseContable } from "@/lib/balance/clase-contable";
import { coincideBusquedaPuc, normalizarBusqueda } from "@/lib/balance/busqueda-puc";
import {
  crearMapeoCliente,
  editarMapeoCliente,
  eliminarMapeoCliente,
  confirmarMapeoCliente,
  alinearMapeoConGrupo,
  declararExcepcionMapeo,
} from "@/app/actions/mapeo-cliente";
import { reaplicarMapeoBalancesCliente } from "@/app/actions/balance";

/**
 * Cuenta del PUC del cliente tal como vive en `cuentas_cliente`, con su memoria de
 * mapeo. Es la ÚNICA fila de la pestaña «Mapeo balance/cliente»: el PUC completo a
 * todos los niveles, editable en cualquiera de ellos.
 */
export type Account = {
  id: number;
  code: string;
  level: number; // 4 | 6 | 8 en BD (todo lo de 8+ dígitos se guarda como 8)
  name: string;
  cuenta6Russell: string | null;
  coincidencia: number | null;
  origenMapeo: string | null; // manual | manual_cuenta | automatico | pendiente · null = sin asignar
  actualizadoPor: string | null;
  actualizadoEn: string | null; // ISO
};
export type RussellOpt = { code: string; name: string; module: string | null };
export type StdAccount = {
  id: number;
  code: string;
  name: string;
  level: number;
  nature: string;
  parent: string | null;
  critical: boolean;
  russellAccount: string | null;
  categoryType: string | null;
  includes: string | null;
  excludes: string | null;
  possibleAccounts: string | null;
  supportingDocuments: string | null;
  controlSupports: string | null;
  mappingNotes: string | null;
};
/** Fila de la bitácora dedicada del plan estándar (movimientos). */
export type StdLogRow = {
  id: number;
  code: string;
  action: string;
  user: string;
  detail: string;
  createdAt: string; // ISO
};

export type Subgrupo = { id: number; codigo: string; nombre: string; grupo: string; nombreGrupo: string; naturaleza: string };

/** Balances cargados del cliente seleccionado: lo que «Reaplicar a balances cargados» recorre. */
export type BalancesCliente = { total: number; congelados: number };

/**
 * Nivel que se MUESTRA: la longitud real del código (N4, N6, N8, N10, N12…). La base
 * colapsa todo lo de 8+ dígitos en `nivel = 8` (`nivelPorCodigo`), pero el PUC del
 * cliente sí distingue esos niveles y es lo que operación necesita ver para ubicar una
 * cuenta sin abrir balance por balance.
 */
const nivelVisual = (code: string): number => code.length;
/** Sangría del árbol: un paso por cada par de dígitos a partir del nivel 4. */
const profundidad = (code: string): number => Math.max(0, Math.ceil((code.length - 4) / 2));
/** Auxiliar = más de 6 dígitos: su edición es siempre una excepción de esa sola cuenta. */
const esAuxiliar = (code: string): boolean => code.length > 6;
/** ¿La fila espera confirmación? Tiene estándar asignado pero la cascada no llegó al 100%.
 *  Definición ÚNICA: la comparten el contador, el filtro y el botón de la fila, para que el
 *  número del filtro no pueda discrepar de las filas que de verdad ofrecen «Confirmar». */
const porConfirmar = (a: Account): boolean =>
  !!a.cuenta6Russell && (a.coincidencia == null || a.coincidencia < 100);

type Tab = "puc" | "standard" | "subgrupos";

export default function MapeoClient({
  clientNames, cliente, accounts, std, subgrupos, canManage, logs, lockedStdCodes, clienteId, clienteNit, puedeMapear, balancesCliente,
}: {
  clientNames: string[]; cliente: string; accounts: Account[]; std: StdAccount[]; subgrupos: Subgrupo[]; canManage: boolean; logs: StdLogRow[]; lockedStdCodes: string[]; clienteId: number | null; clienteNit: string | null; puedeMapear: boolean; balancesCliente: BalancesCliente;
}) {
  const [tab, setTab] = useState<Tab>("puc");

  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        <TabBtn on={tab === "puc"} onClick={() => setTab("puc")} label="Mapeo balance/cliente" count={accounts.length} />
        <TabBtn on={tab === "standard"} onClick={() => setTab("standard")} label="Plan estándar Russell" count={std.length} />
        <TabBtn on={tab === "subgrupos"} onClick={() => setTab("subgrupos")} label="Subgrupos (nivel 4)" count={subgrupos.length} />
        {/* Descarga SOLO el plan estándar Russell (catálogo completo). Vive en la barra de
            pestañas, así que se ve también desde las otras dos: el rótulo dice QUÉ baja
            para que desde «Mapeo balance/cliente» o «Subgrupos» no se espere el contenido
            de esa pestaña. */}
        <a
          href="/config/mapeo/exportar"
          download
          title="Descargar el plan de cuentas estándar Russell en Excel. Solo baja ese catálogo: no incluye el PUC del cliente, la memoria de mapeo ni los subgrupos."
          className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-ink-200 bg-white px-3 py-1.5 text-[12.5px] font-semibold text-ink-700 transition hover:bg-ink-50"
        >
          <Icon name="download" size={13} /> Exportar plan estándar
        </a>
      </div>

      {tab === "puc" ? (
        <PucClienteTab accounts={accounts} std={std} clienteId={clienteId} clienteNit={clienteNit} puedeMapear={puedeMapear} cliente={cliente} clientNames={clientNames} balancesCliente={balancesCliente} />
      ) : tab === "standard" ? (
        <StandardTab std={std} canManage={canManage} logs={logs} lockedStdCodes={lockedStdCodes} />
      ) : (
        <SubgruposTab subgrupos={subgrupos} canManage={canManage} />
      )}
    </div>
  );
}

// ===== PUC del cliente a todos los niveles + memoria de mapeo (una sola vista) =====
//
// Antes eran dos pestañas: un informe de solo lectura con el PUC completo y el botón
// «Revisar», y una vista editable que solo listaba nivel 4/6 y las excepciones ya
// declaradas. Las auxiliares (8+ dígitos) solo se podían corregir desde el detalle de
// un balance que las contuviera y, como cada balance trae un subconjunto distinto de
// cuentas, había que buscarlas balance por balance. Aquí se edita en cualquier nivel:
//   - nivel 4/6 → regla del GRUPO (`manual`, propaga por prefijo);
//   - auxiliar  → EXCEPCIÓN de esa sola cuenta (`manual_cuenta`), el mismo contrato que
//                 «solo esta cuenta» en el balance;
//   - anomalía  → «Resolver»: alinear con el grupo o declararla excepción;
// y «Reaplicar a balances cargados» lleva la memoria corregida a lo ya cargado.
// Gate de escritura: `balance:crear` (la action revalida el alcance por cartera).

const SEG_CLS = (on: boolean) => `px-2.5 py-1 ${on ? "bg-navy-800 text-white" : "bg-white text-ink-600 hover:bg-ink-50"}`;

function PucClienteTab({ accounts, std, clienteId, clienteNit, puedeMapear, cliente, clientNames, balancesCliente }: {
  accounts: Account[]; std: StdAccount[]; clienteId: number | null; clienteNit: string | null; puedeMapear: boolean; cliente: string; clientNames: string[]; balancesCliente: BalancesCliente;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [nivel, setNivel] = useState<number | "all">("all");
  const [origen, setOrigen] = useState<"all" | "manual" | "automatico" | "sinasignar">("all");
  // Ejes distintos al del origen (aquel dice DE DÓNDE salió la regla): coincidencia
  // < 100, homologación a otra clase contable y anomalías frente a la regla del grupo.
  const [soloPorConfirmar, setSoloPorConfirmar] = useState(false);
  const [soloCruceClase, setSoloCruceClase] = useState(false);
  const [soloAnomalias, setSoloAnomalias] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [reaplicarOpen, setReaplicarOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Account | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Account | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<Account | null>(null);
  const [anomaliaTarget, setAnomaliaTarget] = useState<Account | null>(null);

  const stdByCode = useMemo(() => new Map(std.map((s) => [s.code, s.name])), [std]);
  // El selector de cuenta estándar ofrece solo cuentas de 6 dígitos (nivel 6).
  const opciones6 = useMemo(() => std.filter((s) => s.code.length === 6), [std]);
  // Árbol: el orden lexicográfico por código deja cada grupo seguido de sus auxiliares.
  const rows = useMemo(() => [...accounts].sort((a, b) => a.code.localeCompare(b.code)), [accounts]);
  // Auxiliares cuyo mapeo NO se explica por la regla de su grupo. Se indexa por código
  // para pintarlo en la fila y ofrecer «Resolver».
  const anomalias = useMemo(() => {
    const m = new Map<string, AnomaliaMapeo>();
    for (const a of detectarAnomaliasMapeo(accounts)) m.set(a.code, a);
    return m;
  }, [accounts]);
  // Niveles reales del PUC de ESTE cliente (por longitud del código): el filtro
  // ofrece solo los que existen.
  const niveles = useMemo(() => [...new Set(accounts.map((a) => nivelVisual(a.code)))].sort((a, b) => a - b), [accounts]);
  const stats = useMemo(() => ({
    total: accounts.length,
    porNivel: niveles.map((n) => ({ nivel: n, count: accounts.filter((a) => nivelVisual(a.code) === n).length })),
    stdMapped: accounts.filter((a) => a.cuenta6Russell).length,
    porConfirmar: accounts.filter(porConfirmar).length,
    manual: accounts.filter((a) => esMapeoManual(a.origenMapeo)).length,
    excepciones: accounts.filter((a) => esExcepcionCuenta(a.origenMapeo)).length,
    sinAsignar: accounts.filter((a) => !a.cuenta6Russell).length,
    cruceClase: accounts.filter((a) => cruzaClaseContable(a.code, a.cuenta6Russell)).length,
  }), [accounts, niveles]);

  const needle = normalizarBusqueda(q);
  const filtered = rows
    .filter((a) => nivel === "all" || nivelVisual(a.code) === nivel)
    .filter((a) => {
      if (origen === "all") return true;
      if (origen === "sinasignar") return !a.cuenta6Russell;
      if (!a.cuenta6Russell) return false;
      return origen === "manual" ? esMapeoManual(a.origenMapeo) : a.origenMapeo === "automatico";
    })
    .filter((a) => !soloPorConfirmar || porConfirmar(a))
    .filter((a) => !soloCruceClase || cruzaClaseContable(a.code, a.cuenta6Russell))
    .filter((a) => !soloAnomalias || anomalias.has(a.code))
    .filter((a) => coincideBusquedaPuc(a, needle, stdByCode));
  const pg = usePagination(filtered, 50);
  const stdCoverage = stats.total > 0 ? Math.round((stats.stdMapped / stats.total) * 100) : 0;
  const resetPg = () => pg.resetToFirstPage();

  return (
    <>
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card className="p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">Cliente</div>
          <div className="mt-1 text-[15px] font-semibold text-ink-900">{cliente || "—"}</div>
          <div className="mt-1 text-[12px] text-ink-500">{clienteNit ? <>NIT <span className="font-mono">{clienteNit}</span></> : "PUC del cliente"}</div>
        </Card>
        <Card className="p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">Cuentas del cliente</div>
          <div className="mt-1 font-mono text-2xl font-semibold text-ink-900">{stats.total}</div>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {stats.porNivel.map((n) => <Chip key={n.nivel} label={`N${n.nivel} · ${n.count}`} tone="ink" />)}
          </div>
        </Card>
        <StatCard label="Mapeadas a estándar" value={`${stats.stdMapped}/${stats.total}`} hint={`${stdCoverage}% cobertura`} tone="ok" />
        <StatCard label="Por revisar" value={String(anomalias.size)} hint={`${stats.porConfirmar} por confirmar · ${stats.cruceClase} cruzan de clase`} tone={anomalias.size > 0 ? "warn" : "ok"} />
      </div>

      <Card className="mt-4">
        <div className="border-b border-ink-100 bg-blue-50/40 px-4 py-2.5 text-[11.5px] leading-relaxed text-ink-600">
          PUC completo de <b>{cliente}</b> a todos los niveles que usa (acumulado de todas sus cargas) con su memoria de mapeo, que se aplica <b>automáticamente</b> al importar balances de este cliente (prioridad sobre la cascada). Editar una cuenta de <b>4 o 6 dígitos</b> fija la regla de todo su grupo; editar una <b>auxiliar</b> deja una excepción de <b>solo esa cuenta</b>, que le gana a la regla de su grupo. Lo <b>manual</b> no lo pisa el mapeo automático. Editar aquí <b>no</b> cambia balances ya cargados: usa <b>Reaplicar a balances cargados</b> para llevarles la memoria corregida.
        </div>
        {/* Barra de búsqueda sobre el PUC COMPLETO del cliente: es la respuesta a «para
            encontrar una cuenta específica hay que buscar balance por balance». Numérico =
            prefijo del código (o de la estándar); texto = nombre del ERP o de la estándar,
            sin tildes ni mayúsculas. Se combina con los filtros de abajo. */}
        <div className="border-b border-ink-100 px-4 py-3">
          <div className="relative">
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-ink-400"><Icon name="search" size={15} /></span>
            <input
              value={q}
              onChange={(e) => { setQ(e.target.value); resetPg(); }}
              placeholder="Buscar en el PUC del cliente: código (prefijo, p. ej. 6165), nombre de la cuenta o cuenta estándar Russell…"
              aria-label="Buscar cuenta en el PUC del cliente"
              className="w-full rounded-md border border-ink-200 bg-white py-2 pl-9 pr-28 text-[13px] text-ink-800 outline-none placeholder:text-ink-400 focus:border-blue-400"
            />
            {q && (
              <button
                type="button"
                onClick={() => { setQ(""); resetPg(); }}
                title="Limpiar búsqueda"
                className="absolute inset-y-1 right-1.5 inline-flex items-center gap-1 rounded-md px-2 text-[11.5px] font-semibold text-ink-500 hover:bg-ink-100 hover:text-ink-700"
              >
                <Icon name="x" size={12} /> Limpiar
              </button>
            )}
          </div>
          {needle && clienteId != null && (
            <p className="mt-1.5 text-[11.5px] text-ink-500">
              <b className="text-ink-700">{filtered.length}</b> cuenta(s) coinciden con «{q.trim()}»
              {/^\d+$/.test(needle) ? " (código o cuenta estándar que empieza por ese número)" : " (en el nombre de la cuenta o de la estándar)"}
              {filtered.length !== rows.length && (nivel !== "all" || origen !== "all" || soloPorConfirmar || soloCruceClase || soloAnomalias) ? " · los filtros de abajo también aplican" : ""}.
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 border-b border-ink-100 px-4 py-3">
          <h2 className="text-[13px] font-semibold text-ink-800">Parametrización cuenta a cuenta</h2>
          <select
            value={cliente}
            onChange={(e) => router.push(`/config/mapeo?cliente=${encodeURIComponent(e.target.value)}`)}
            className="rounded-md border border-ink-200 px-2 py-1 text-[12px] text-ink-700 outline-none"
          >
            {clientNames.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          {puedeMapear && clienteId != null && (
            <div className="ml-auto flex items-center gap-2">
              {balancesCliente.total > 0 && (
              <button
                type="button"
                onClick={() => setReaplicarOpen(true)}
                title="Llevar la memoria de mapeo vigente a los balances ya cargados de este cliente"
                className="inline-flex items-center gap-1.5 rounded-md border border-ink-200 bg-white px-3 py-1.5 text-[12px] font-semibold text-ink-700 hover:bg-ink-50"
              >
                <Icon name="play" size={12} /> Reaplicar a balances cargados
              </button>
              )}
              <button type="button" onClick={() => setCreateOpen(true)} className="rounded-md bg-navy-700 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-navy-800">Nueva regla</button>
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 border-b border-ink-100 px-4 py-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex overflow-hidden rounded-md border border-ink-200 text-[11.5px]">
              <button type="button" onClick={() => { setNivel("all"); resetPg(); }} className={SEG_CLS(nivel === "all")}>Todos</button>
              {niveles.map((n) => (
                <button key={n} type="button" onClick={() => { setNivel(n); resetPg(); }} className={SEG_CLS(nivel === n)}>N{n}</button>
              ))}
            </div>
            <div className="flex overflow-hidden rounded-md border border-ink-200 text-[11.5px]">
              {(["all", "manual", "automatico", "sinasignar"] as const).map((o) => (
                <button key={o} type="button" onClick={() => { setOrigen(o); resetPg(); }} className={SEG_CLS(origen === o)}>{o === "all" ? "Todos" : o === "manual" ? "Manual" : o === "automatico" ? "Automático" : "Sin asignar"}</button>
              ))}
            </div>
            <FiltroToggle
              on={soloPorConfirmar}
              tone="warn"
              onClick={() => { setSoloPorConfirmar((v) => !v); resetPg(); }}
              label={`Por confirmar${stats.porConfirmar > 0 ? ` (${stats.porConfirmar})` : ""}`}
            />
            <FiltroToggle
              on={soloCruceClase}
              tone="err"
              title="La cuenta del cliente y su estándar están en clases contables distintas"
              onClick={() => { setSoloCruceClase((v) => !v); resetPg(); }}
              label={`Cruza de clase${stats.cruceClase > 0 ? ` (${stats.cruceClase})` : ""}`}
            />
            {/* Se ordena con los cruces de clase primero: son los que mueven saldo de un
                estado financiero a otro. */}
            <FiltroToggle
              on={soloAnomalias}
              tone="err"
              title="Auxiliares cuya homologación no coincide con la regla de su grupo y nadie declaró excepción"
              onClick={() => { setSoloAnomalias((v) => !v); resetPg(); }}
              label={`Revisar${anomalias.size > 0 ? ` (${anomalias.size})` : ""}`}
            />
          </div>
          <div className="ml-auto">
            <PageSizeSelect value={pg.pageSize} onChange={pg.setPageSize} />
          </div>
        </div>

        {clienteId == null ? (
          <EmptyState icon="doc" title="Sin cliente" description="Selecciona un cliente con balances para ver y editar su PUC y su memoria de mapeo." />
        ) : rows.length === 0 ? (
          <EmptyState icon="doc" title="Sin cuentas para este cliente" description="Este cliente aún no tiene PUC en el repositorio de mapeo. Se irá creando al cargar balances o al crear reglas a mano." />
        ) : filtered.length === 0 ? (
          soloAnomalias ? (
            <EmptyState icon="check" title="Sin anomalías" description="Todas las cuentas auxiliares de este cliente siguen la homologación de su grupo o son excepciones declaradas." />
          ) : soloPorConfirmar ? (
            <EmptyState icon="check" title="Nada por confirmar" description="Todas las cuentas con mapeo están confirmadas o son coincidencia exacta (100%)." />
          ) : (
            <EmptyState icon="search" title="Sin coincidencias" description={needle ? `Ninguna cuenta coincide con «${q.trim()}»${nivel !== "all" || origen !== "all" || soloPorConfirmar || soloCruceClase ? " con los filtros aplicados" : ""}.` : "Ninguna cuenta coincide con los filtros aplicados."} />
          )
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="border-b border-ink-100 text-left text-[11px] uppercase tracking-wider text-ink-500">
                  <th className="px-3 py-2 font-semibold">Nivel</th>
                  <th className="px-3 py-2 font-semibold">Cuenta cliente</th>
                  <th className="px-3 py-2 font-semibold">Nombre cuenta (ERP)</th>
                  <th className="px-3 py-2 font-semibold">Cuenta estándar Russell</th>
                  <th className="px-3 py-2 font-semibold">Origen</th>
                  <th className="px-3 py-2 font-semibold">Coincidencia</th>
                  <th className="px-3 py-2 font-semibold">Actualizado</th>
                  {puedeMapear && <th className="px-3 py-2 text-right font-semibold">Acciones</th>}
                </tr>
              </thead>
              <tbody>
                {pg.pageItems.map((a) => {
                  const an = anomalias.get(a.code);
                  const stdName = a.cuenta6Russell ? stdByCode.get(a.cuenta6Russell) : undefined;
                  const auxiliar = esAuxiliar(a.code);
                  const prof = profundidad(a.code);
                  return (
                    <tr key={a.id} className="border-b border-ink-50 last:border-0 hover:bg-ink-50">
                      <td className="px-3 py-2"><Chip label={`N${nivelVisual(a.code)}`} tone="ink" /></td>
                      {/* La cuenta del cliente identifica la fila y NO se edita: va como texto
                          plano con la sangría del árbol. Lo editable es la cuenta estándar. */}
                      <td className="whitespace-nowrap px-3 py-2 font-mono font-semibold text-ink-700" style={{ paddingLeft: 12 + prof * 16 }}>
                        {prof > 0 && <span className="mr-1 font-sans font-normal text-ink-400">└</span>}{a.code}
                      </td>
                      <td className="px-3 py-2 text-ink-800">
                        {/* Las reglas creadas por anticipado guardan el código como nombre:
                            en esas no hay nombre del ERP que mostrar. */}
                        {a.name && a.name !== a.code ? a.name : <span className="text-ink-400">—</span>}
                        {an && (
                          <span className="ml-2">
                            <Chip
                              label={an.cruzaClase ? `Cruza de clase · su grupo va a ${an.cuenta6RussellDelGrupo}` : `Difiere de su grupo (${an.cuenta6RussellDelGrupo})`}
                              tone={an.cruzaClase ? "err" : "warn"}
                            />
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-ink-800">
                        {puedeMapear ? (
                          <button
                            type="button"
                            onClick={() => setEditTarget(a)}
                            title={auxiliar ? `Cambiar la cuenta estándar solo de ${a.code}` : `Cambiar la cuenta estándar de todo el grupo ${a.code}`}
                            className="text-left hover:underline"
                          >
                            {a.cuenta6Russell ? (
                              <><span className="font-mono text-blue-600">{a.cuenta6Russell}</span>{stdName ? ` · ${stdName}` : ""}</>
                            ) : (
                              <Chip label="Asignar" tone="warn" />
                            )}
                          </button>
                        ) : a.cuenta6Russell ? (
                          <><span className="font-mono text-blue-600">{a.cuenta6Russell}</span>{stdName ? ` · ${stdName}` : ""}</>
                        ) : (
                          <Chip label="Sin mapeo" tone="warn" />
                        )}
                      </td>
                      <td className="px-3 py-2"><OrigenChip a={a} /></td>
                      <td className="px-3 py-2">
                        {!a.cuenta6Russell || a.coincidencia == null ? (
                          <span className="text-ink-400">—</span>
                        ) : (
                          <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${a.coincidencia >= 85 ? "bg-ok-100 text-ok-700" : a.coincidencia >= 55 ? "bg-warn-100 text-warn-700" : "bg-err-100 text-err-700"}`}>{a.coincidencia}%</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-[11.5px] text-ink-500">{a.actualizadoEn ? fmtFecha(a.actualizadoEn) : "—"}{a.actualizadoPor ? ` · ${a.actualizadoPor}` : ""}</td>
                      {puedeMapear && (
                        /* Botones en una sola línea (`whitespace-nowrap` + flex): como enlaces
                           sueltos se apilaban al angostarse la columna y quedaban ilegibles. */
                        <td className="whitespace-nowrap px-3 py-2">
                          <div className="flex items-center justify-end gap-1.5">
                            {an && (
                              <button
                                type="button"
                                onClick={() => setAnomaliaTarget(a)}
                                title="Alinear con la regla del grupo o declararla excepción de solo esta cuenta"
                                className="inline-flex items-center gap-1 rounded-md border border-err-200 bg-err-50 px-2 py-1 text-[11.5px] font-semibold text-err-700 hover:bg-err-100"
                              >
                                <Icon name="warn" size={12} /> Resolver
                              </button>
                            )}
                            {!an && porConfirmar(a) && (
                              <button
                                type="button"
                                onClick={() => setConfirmTarget(a)}
                                title="Aceptar esta homologación y fijarla como manual al 100%"
                                className="inline-flex items-center gap-1 rounded-md border border-warn-200 bg-warn-50 px-2 py-1 text-[11.5px] font-semibold text-warn-700 hover:bg-warn-100"
                              >
                                <Icon name="check" size={12} /> Confirmar
                              </button>
                            )}
                            {a.cuenta6Russell && (
                              <button
                                type="button"
                                onClick={() => setDeleteTarget(a)}
                                title={auxiliar ? "Quitar la homologación de esta cuenta: volverá a seguir la regla de su grupo" : "Quitar la homologación: el grupo vuelve a la cascada automática"}
                                className="inline-flex items-center gap-1 rounded-md border border-ink-200 bg-white px-2 py-1 text-[11.5px] font-semibold text-err-700 hover:border-err-200 hover:bg-err-50"
                              >
                                <Icon name="trash" size={12} /> Eliminar
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-ink-100 px-4 py-2.5 text-[11.5px] text-ink-500">
          <span>
            {stats.total} cuenta(s) · {stats.stdMapped} mapeadas · {stats.manual} manual(es)
            {stats.excepciones > 0 ? ` · ${stats.excepciones} de solo esta cuenta` : ""}
            {stats.porConfirmar > 0 ? ` · ${stats.porConfirmar} por confirmar` : ""}
            {anomalias.size > 0 ? ` · ${anomalias.size} por revisar` : ""}
            {stats.cruceClase > 0 ? ` · ${stats.cruceClase} cruzan de clase` : ""}
            {stats.sinAsignar > 0 ? ` · ${stats.sinAsignar} sin asignar` : ""}
          </span>
        </div>
        <PaginationFooter rangeLabel={pg.rangeLabel} currentPage={pg.page} totalPages={pg.totalPages} onPageChange={pg.setPage} />
      </Card>

      {puedeMapear && clienteId != null && createOpen && (
        <MapeoClienteForm mode="create" clienteId={clienteId} opciones={opciones6} onClose={() => setCreateOpen(false)} />
      )}
      {puedeMapear && editTarget && (
        <MapeoClienteForm
          mode="edit"
          row={editTarget}
          opciones={opciones6}
          excepcionesDelGrupo={esExcepcionCuenta(editTarget.origenMapeo) || esAuxiliar(editTarget.code)
            ? [] /* editar una excepción o una auxiliar no propaga: no pisa nada */
            : rows.filter((r) => esExcepcionCuenta(r.origenMapeo) && r.code !== editTarget.code && r.code.startsWith(editTarget.code))}
          onClose={() => setEditTarget(null)}
          onDelete={editTarget.cuenta6Russell ? () => { const t = editTarget; setEditTarget(null); setDeleteTarget(t); } : undefined}
        />
      )}
      {puedeMapear && deleteTarget && (
        <DeleteMapeoClienteForm row={deleteTarget} onClose={() => setDeleteTarget(null)} />
      )}
      {puedeMapear && confirmTarget && (
        <ConfirmarMapeoModal cuenta={confirmTarget} accounts={accounts} stdByCode={stdByCode} onClose={() => setConfirmTarget(null)} />
      )}
      {puedeMapear && anomaliaTarget && anomalias.get(anomaliaTarget.code) && (
        <ResolverAnomaliaModal cuenta={anomaliaTarget} anomalia={anomalias.get(anomaliaTarget.code)!} accounts={accounts} stdByCode={stdByCode} onClose={() => setAnomaliaTarget(null)} />
      )}
      {puedeMapear && clienteId != null && reaplicarOpen && (
        <ReaplicarBalancesModal clienteId={clienteId} cliente={cliente} balances={balancesCliente} onClose={() => setReaplicarOpen(false)} />
      )}
    </>
  );
}

function FiltroToggle({ on, tone, label, title, onClick }: { on: boolean; tone: "warn" | "err"; label: string; title?: string; onClick: () => void }) {
  const onCls = tone === "err" ? "border-err-300 bg-err-100 text-err-700" : "border-warn-300 bg-warn-100 text-warn-700";
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-[11.5px] font-medium transition ${on ? onCls : "border-ink-200 text-ink-600 hover:bg-ink-50"}`}
    >
      <Icon name="warn" size={12} /> {label}
    </button>
  );
}

function OrigenChip({ a }: { a: Account }) {
  if (esPendiente(a.origenMapeo)) return <Chip label="Pendiente por asignar" tone="warn" />;
  if (!a.cuenta6Russell) return <Chip label="Sin asignar" tone="warn" />;
  if (esExcepcionCuenta(a.origenMapeo)) return <Chip label="Solo esta cuenta" tone="blue" />;
  if (a.origenMapeo === "manual") return <Chip label="Manual" tone="blue" />;
  return <Chip label="Automático" tone="ink" />;
}

// Caja de confirmación: confirma el mapeo de una cuenta como MANUAL al 100%. Por
// defecto aplica a TODAS las cuentas del cliente que mapean al mismo estándar
// (varios grupos de 6 díg a la vez, p. ej. todas las imputables → 158405); si se
// desmarca, confirma solo el grupo de 6 díg de la fila.
function ConfirmarMapeoModal({ cuenta, accounts, stdByCode, onClose }: {
  cuenta: Account; accounts: Account[]; stdByCode: Map<string, string>; onClose: () => void;
}) {
  const router = useRouter();
  const [todas, setTodas] = useState(true);
  const c6 = cuenta.code.slice(0, 6);
  const std = cuenta.cuenta6Russell;
  const stdName = std ? stdByCode.get(std) : undefined;
  const grupoCount = accounts.filter((x) => x.code.slice(0, 6) === c6).length;
  const estandarCount = accounts.filter((x) => x.cuenta6Russell === std).length;
  const estandarPend = accounts.filter((x) => x.cuenta6Russell === std && (x.coincidencia == null || x.coincidencia < 100)).length;
  const total = todas ? estandarCount : grupoCount;

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      title="Confirmar mapeo estándar"
      footer={
        <ActionForm action={confirmarMapeoCliente} successMessage="Mapeo confirmado." errorMessage="No se pudo confirmar el mapeo." showInlineError={false} onSuccess={() => { router.refresh(); onClose(); }}>
          {(pending) => (
            <>
              <input type="hidden" name="id" value={cuenta.id} />
              <input type="hidden" name="todas" value={todas ? "1" : "0"} />
              <button type="submit" disabled={pending} className="rounded-md bg-navy-700 px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-60">
                {pending ? <EstadoProcesando>Confirmando</EstadoProcesando> : `Confirmar ${total} cuenta(s)`}
              </button>
            </>
          )}
        </ActionForm>
      }
    >
      <div className="flex flex-col gap-3 text-[13px] text-ink-700">
        <p>
          La cuenta <span className="font-mono font-semibold">{cuenta.code}</span> — {cuenta.name} mapea a{" "}
          <span className="font-mono text-blue-600">{std}</span>{stdName ? ` · ${stdName}` : ""} con <b>{cuenta.coincidencia ?? "—"}%</b> de coincidencia.
        </p>
        <label className="flex cursor-pointer items-start gap-2 rounded-md border border-ink-150 px-3 py-2.5 hover:bg-ink-50">
          <input type="checkbox" checked={todas} onChange={(e) => setTodas(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-ink-300 text-navy-600 focus:ring-navy-600" />
          <span className="text-[12.5px]">
            <b>Aplicar a todas las cuentas que mapean a {std}{stdName ? ` · ${stdName}` : ""}</b>
            <span className="mt-0.5 block text-ink-500">
              {estandarCount} cuenta(s) en total · {estandarPend} pendiente(s). Si lo desmarcas, se confirma solo el grupo <span className="font-mono">{c6}</span> ({grupoCount} cuenta(s)).
            </span>
          </span>
        </label>
        <div className="rounded-md bg-blue-50 px-3 py-2 text-[12px] text-blue-700">
          Las cuentas quedarán como mapeo <b>manual al 100%</b> y ya no se recalcularán (ni con IA) en próximas cargas de balance.
        </div>
      </div>
    </Modal>
  );
}

// «Resolver» una anomalía: la auxiliar difiere de la regla de su grupo y nadie la
// declaró excepción. Dos salidas, ambas explícitas: volver a la regla del grupo o
// dejar la divergencia como excepción de solo esta cuenta. Antes el informe solo la
// señalaba y había que ir al balance —a uno que contuviera la cuenta— a corregirla.
function ResolverAnomaliaModal({ cuenta, anomalia, accounts, stdByCode, onClose }: {
  cuenta: Account; anomalia: AnomaliaMapeo; accounts: Account[]; stdByCode: Map<string, string>; onClose: () => void;
}) {
  const router = useRouter();
  const [modo, setModo] = useState<"alinear" | "excepcion">("alinear");
  // Misma autoridad que usará la action: qué regla gobierna el grupo y con qué origen
  // quedará la fila. Si no hay plan, alinear no es posible y solo queda la excepción.
  const plan = useMemo(() => planAlinearConGrupo(accounts, cuenta.code), [accounts, cuenta.code]);
  const grupo = cuenta.code.slice(0, 6);
  const nombre = (code: string | null | undefined) => (code ? stdByCode.get(code) : undefined);
  const action = modo === "alinear" ? alinearMapeoConGrupo : declararExcepcionMapeo;

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      title={`Resolver homologación · ${cuenta.code}`}
      footer={
        /* `key={modo}`: cada opción llama a una action distinta; remontar el formulario al
           cambiar evita que un envío en curso mezcle la acción anterior con la nueva. */
        <ActionForm
          key={modo}
          action={action}
          successMessage={modo === "alinear" ? "Cuenta alineada con su grupo." : "Excepción declarada."}
          errorMessage="No se pudo resolver la homologación."
          showInlineError={false}
          onSuccess={() => { router.refresh(); onClose(); }}
        >
          {(pending) => (
            <>
              <input type="hidden" name="id" value={cuenta.id} />
              <button type="submit" disabled={pending || (modo === "alinear" && !plan)} className="rounded-md bg-navy-700 px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-60">
                {pending ? <EstadoProcesando>Guardando</EstadoProcesando> : modo === "alinear" ? "Alinear con el grupo" : "Mantener como excepción"}
              </button>
            </>
          )}
        </ActionForm>
      }
    >
      <div className="flex flex-col gap-3 text-[13px] text-ink-700">
        <p>
          La cuenta <span className="font-mono font-semibold">{cuenta.code}</span>{cuenta.name && cuenta.name !== cuenta.code ? ` — ${cuenta.name}` : ""} está homologada a{" "}
          <span className="font-mono text-blue-600">{anomalia.cuenta6Russell}</span>{nombre(anomalia.cuenta6Russell) ? ` · ${nombre(anomalia.cuenta6Russell)}` : ""}, pero su grupo{" "}
          <span className="font-mono">{grupo}</span> va a <span className="font-mono text-blue-600">{anomalia.cuenta6RussellDelGrupo}</span>{nombre(anomalia.cuenta6RussellDelGrupo) ? ` · ${nombre(anomalia.cuenta6RussellDelGrupo)}` : ""}.
          {anomalia.cruzaClase && <> <b className="text-err-700">Cruza de clase contable:</b> mueve saldo a otro estado financiero.</>}
        </p>
        <label className={`flex items-start gap-2 rounded-md border border-ink-150 px-3 py-2.5 ${plan ? "cursor-pointer hover:bg-ink-50" : "cursor-not-allowed opacity-60"}`}>
          <input type="radio" name="modo" checked={modo === "alinear"} disabled={!plan} onChange={() => setModo("alinear")} className="mt-0.5 h-4 w-4 border-ink-300 text-navy-600 focus:ring-navy-600" />
          <span className="text-[12.5px]">
            <b>Alinear con el grupo</b> → <span className="font-mono">{plan?.cuenta6Russell ?? anomalia.cuenta6RussellDelGrupo}</span>
            <span className="mt-0.5 block text-ink-500">
              {plan
                ? `La cuenta vuelve a seguir la regla de su grupo (${plan.origenMapeo === "manual" ? "manual al 100%" : `automática${plan.coincidencia != null ? ` al ${plan.coincidencia}%` : ""}`}, igual que sus hermanas). Solo cambia esta fila.`
                : "El grupo no tiene una regla vigente con la que alinear esta cuenta."}
            </span>
          </span>
        </label>
        <label className="flex cursor-pointer items-start gap-2 rounded-md border border-ink-150 px-3 py-2.5 hover:bg-ink-50">
          <input type="radio" name="modo" checked={modo === "excepcion"} onChange={() => setModo("excepcion")} className="mt-0.5 h-4 w-4 border-ink-300 text-navy-600 focus:ring-navy-600" />
          <span className="text-[12.5px]">
            <b>Mantener como excepción de solo esta cuenta</b> → <span className="font-mono">{anomalia.cuenta6Russell}</span>
            <span className="mt-0.5 block text-ink-500">La divergencia es intencional: queda como manual al 100%, le gana a la regla del grupo solo para este código y deja de aparecer en «Revisar».</span>
          </span>
        </label>
        <div className="rounded-md bg-blue-50 px-3 py-2 text-[12px] text-blue-700">
          Aplica a las próximas cargas. Para los balances ya cargados usa <b>Reaplicar a balances cargados</b>.
        </div>
      </div>
    </Modal>
  );
}

// Lleva la memoria vigente a TODOS los balances ya cargados del cliente (los no
// congelados), sin abrirlos uno por uno. Es el cierre del ciclo: sin esto, corregir
// aquí y ver el efecto exigía volver al balance igual que antes.
function ReaplicarBalancesModal({ clienteId, cliente, balances, onClose }: {
  clienteId: number; cliente: string; balances: BalancesCliente; onClose: () => void;
}) {
  const router = useRouter();
  const editables = balances.total - balances.congelados;

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      title="Reaplicar la memoria a los balances cargados"
      footer={
        <ActionForm action={reaplicarMapeoBalancesCliente} successMessage="Balances re-homologados." errorMessage="No se pudieron re-homologar los balances." showInlineError={false} onSuccess={() => { router.refresh(); onClose(); }}>
          {(pending) => (
            <>
              <input type="hidden" name="clienteId" value={clienteId} />
              <button type="submit" disabled={pending || editables === 0} className="rounded-md bg-navy-700 px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-60">
                {pending ? <EstadoProcesando>Re-homologando</EstadoProcesando> : `Reaplicar a ${editables} balance(s)`}
              </button>
            </>
          )}
        </ActionForm>
      }
    >
      <div className="flex flex-col gap-3 text-[13px] text-ink-700">
        <p>
          Vuelve a homologar el detalle de los <b>{editables}</b> balance(s) cargados de <b>{cliente}</b> con la memoria de mapeo vigente (memoria del cliente → exacto → descripción), sin IA y sin volver a leer los archivos.
          {balances.congelados > 0 ? <> Los <b>{balances.congelados}</b> congelado(s) no se tocan.</> : null}
        </p>
        <ul className="list-disc space-y-1 pl-5 text-[12.5px] text-ink-600">
          <li>Cada cuenta toma la regla de su memoria; si no hay, decide la cascada determinista, que respeta la clase contable.</li>
          <li>Si tampoco resuelve, conserva el mapeo actual salvo que cruce de clase: en ese caso lo retira.</li>
          <li>Nunca inventa un mapeo nuevo con IA ni escribe memoria: solo la consume.</li>
        </ul>
        <div className="rounded-md bg-blue-50 px-3 py-2 text-[12px] text-blue-700">
          Es la misma operación que «Re-homologar» en el detalle de un balance, aplicada a todos a la vez. Cada balance se procesa en su propia transacción.
        </div>
      </div>
    </Modal>
  );
}

function MapeoClienteForm({ mode, row, clienteId, opciones, excepcionesDelGrupo = [], onClose, onDelete }: {
  mode: "create" | "edit"; row?: Account; clienteId?: number; opciones: StdAccount[];
  /** Excepciones de cuenta que cuelgan de esta regla y que guardar va a REEMPLAZAR. */
  excepcionesDelGrupo?: Account[];
  onClose: () => void; onDelete?: () => void;
}) {
  const isEdit = mode === "edit";
  // Una auxiliar editada desde aquí es SIEMPRE una excepción de esa sola cuenta (la
  // action lo garantiza): el clic fue sobre esa cuenta, no sobre su grupo.
  const esExcepcion = isEdit && (esExcepcionCuenta(row!.origenMapeo) || esAuxiliar(row!.code));
  const [state, action, pending] = useActionState(isEdit ? editarMapeoCliente : crearMapeoCliente, undefined);

  useEffect(() => {
    notifyActionState(state, {
      success: isEdit ? "Mapeo actualizado." : "Regla creada.",
      error: isEdit ? "No se pudo actualizar el mapeo." : "No se pudo crear la regla.",
    });
    if (state?.ok) onClose();
  }, [state, isEdit, onClose]);

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      title={isEdit ? `${row?.cuenta6Russell ? "Editar mapeo" : "Asignar cuenta estándar"} · ${row?.code}` : "Nueva regla de mapeo"}
      footer={
        <div className="flex w-full items-center justify-between gap-2">
          <div>
            {isEdit && onDelete && (
              <button type="button" onClick={onDelete} className="rounded-md border border-err-200 px-3 py-2 text-[13px] font-semibold text-err-700 hover:bg-err-50">Eliminar</button>
            )}
          </div>
          <button type="submit" form="mapeo-cliente-form" disabled={pending} className="rounded-md bg-navy-700 px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-60">
            {pending ? <EstadoProcesando>Guardando</EstadoProcesando> : isEdit ? "Guardar cambios" : "Crear regla"}
          </button>
        </div>
      }
    >
      <form id="mapeo-cliente-form" action={action} className="flex flex-col gap-4">
        {isEdit ? <input type="hidden" name="id" value={row!.id} /> : <input type="hidden" name="clienteId" value={clienteId} />}
        {/* Guardar una regla de grupo propaga por PREFIJO y arrastra las excepciones de
            cuenta que cuelgan de ella. Es intencional —una decisión de grupo manda sobre
            las de cuenta— pero era silencioso: alguien las creó desde el balance y aquí
            desaparecían sin aviso. */}
        {excepcionesDelGrupo.length > 0 && (
          <p className="rounded-md border border-warn-300 bg-warn-50 px-3 py-2 text-[12px] leading-relaxed text-warn-800">
            <b>Guardar reemplazará {excepcionesDelGrupo.length} excepción(es) de cuenta</b> asociadas a este grupo:{" "}
            {excepcionesDelGrupo.slice(0, 4).map((e) => `${e.code} → ${e.cuenta6Russell}`).join(" · ")}
            {excepcionesDelGrupo.length > 4 ? " …" : ""}. Quedarán con el estándar que elijas aquí.
          </p>
        )}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Campo label={esExcepcion ? "Cuenta del cliente" : "Cuenta del cliente (6 dígitos)"}>
            {isEdit ? (
              <input value={row!.code} readOnly className={`${INPUT_CLS} cursor-not-allowed bg-ink-50 text-ink-500`} />
            ) : (
              <input name="cuenta6" required inputMode="numeric" pattern="\d{6}" placeholder="140501" className={INPUT_CLS} />
            )}
            <p className="text-[11px] leading-snug text-ink-500">
              {esExcepcion
                ? `Excepción de solo esta cuenta${row!.name && row!.name !== row!.code ? ` (${row!.name})` : ""}: no cambia las demás cuentas del grupo ${row!.code.slice(0, 6)} y le gana a la regla del grupo en las próximas cargas.`
                : isEdit && row!.code.length < 6
                  ? `Se aplica a esta cuenta de ${row!.code.length} dígitos y a TODAS las cuentas del cliente que inician con ella.`
                  : "Se aplica a TODAS las cuentas del cliente que inician con este código de 6 dígitos."}
            </p>
          </Campo>
          <Campo label="Cuenta estándar Russell">
            <select name="codigo" defaultValue={row?.cuenta6Russell ?? ""} required className={INPUT_CLS}>
              <option value="">— Selecciona —</option>
              {opciones.map((o) => <option key={o.code} value={o.code}>{o.code} · {o.name}</option>)}
            </select>
          </Campo>
        </div>
        {state?.message && <p className="text-[12px] text-err-700">{state.message}</p>}
      </form>
    </Modal>
  );
}

function DeleteMapeoClienteForm({ row, onClose }: { row: Account; onClose: () => void }) {
  const [state, action, pending] = useActionState(eliminarMapeoCliente, undefined);
  const excepcionOAuxiliar = esExcepcionCuenta(row.origenMapeo) || esAuxiliar(row.code);

  useEffect(() => {
    notifyActionState(state, { success: "Regla eliminada.", error: "No se pudo eliminar la regla." });
    if (state?.ok) onClose();
  }, [state, onClose]);

  return (
    <Modal
      open
      onClose={onClose}
      title="Eliminar regla de mapeo"
      footer={
        <button type="submit" form="delete-mapeo-cliente-form" disabled={pending} className="rounded-md bg-err-700 px-4 py-2 text-[13px] font-semibold text-white hover:bg-err-700/90 disabled:opacity-60">
          {pending ? <EstadoProcesando>Eliminando</EstadoProcesando> : "Eliminar"}
        </button>
      }
    >
      <form id="delete-mapeo-cliente-form" action={action} className="flex flex-col gap-4">
        <input type="hidden" name="id" value={row.id} />
        <p className="text-[13px] text-ink-600">
          Vas a eliminar el mapeo guardado <strong className="font-mono">{row.code}</strong> → <strong className="font-mono">{row.cuenta6Russell}</strong>.{" "}
          {excepcionOAuxiliar
            ? `En la próxima importación esa cuenta volverá a seguir la regla de su grupo ${row.code.slice(0, 6)} (o la cascada automática si el grupo no tiene regla).`
            : "En la próxima importación esa cuenta y las de su grupo se volverán a mapear con la cascada automática."}
        </p>
        {state?.message && <p className="text-[12px] text-err-700">{state.message}</p>}
      </form>
    </Modal>
  );
}

function StandardTab({ std, canManage, logs, lockedStdCodes }: { std: StdAccount[]; canManage: boolean; logs: StdLogRow[]; lockedStdCodes: string[] }) {
  const [q, setQ] = useState("");
  // Códigos de cuenta estándar con balances ya asociados: su código no se puede
  // mover ni la cuenta eliminar (la regla la garantiza la Server Action; aquí
  // solo se bloquea el campo y el botón para evitar el intento).
  const lockedCodes = useMemo(() => new Set(lockedStdCodes), [lockedStdCodes]);
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<StdAccount | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<StdAccount | null>(null);
  const [logsOpen, setLogsOpen] = useState(false);
  const needle = q.trim().toLowerCase();
  // Una búsqueda numérica se interpreta SIEMPRE como prefijo del código PUC
  // (escribir «23» debe traer 23xxxx, no cualquier cuenta cuyo texto contenga
  // «23»). El texto libre sigue buscando en todas las columnas.
  const esPrefijoCodigo = /^\d+$/.test(needle);
  const rows = std.filter((s) => {
    if (!needle) return true;
    if (esPrefijoCodigo) return s.code.startsWith(needle);
    return [s.code, s.name, s.russellAccount, s.categoryType, s.includes, s.mappingNotes]
      .some((value) => value?.toLowerCase().includes(needle));
  });
  const pg = usePagination(rows, 50);

  return (
    <>
    <Card>
      <div className="flex flex-wrap items-center gap-2 border-b border-ink-100 px-4 py-3">
        <h2 className="text-[13px] font-semibold text-ink-800">Plan de cuentas estándar — Russell Bedford</h2>
        <Chip label={`${pg.total} cuentas`} tone="ink" />
        <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              pg.resetToFirstPage();
            }}
            placeholder="código (23…) o texto: rubro, soporte"
            className="w-72 rounded-md border border-ink-200 px-2.5 py-1.5 text-[12.5px] outline-none focus:border-blue-400"
          />
          <PageSizeSelect value={pg.pageSize} onChange={pg.setPageSize} />
          {canManage && (
            <>
              <button
                type="button"
                onClick={() => setLogsOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-md border border-ink-200 bg-white px-2.5 py-1.5 text-[12px] font-semibold text-ink-700 hover:bg-ink-50"
              >
                <Icon name="log" size={13} /> Bitácora
              </button>
              <button
                type="button"
                onClick={() => setCreateOpen(true)}
                className="rounded-md bg-navy-700 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-navy-800"
              >
                Nueva cuenta
              </button>
            </>
          )}
        </div>
      </div>
      {canManage && (
        <div className="border-b border-ink-100 bg-blue-50/40 px-4 py-2 text-[11.5px] text-ink-600">
          Haz clic en el <b>código del sistema</b> para editar la cuenta. Cada cambio (crear, editar, eliminar) queda registrado en la <b>bitácora</b>.
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="border-b border-ink-100 text-left text-[11px] uppercase tracking-wider text-ink-500">
              <th className="px-4 py-2 font-semibold">Código</th>
              <th className="px-4 py-2 font-semibold">Nombre PUC</th>
              <th className="px-4 py-2 font-semibold">Cuenta Russell</th>
              <th className="px-4 py-2 font-semibold">Tipo rubro</th>
              <th className="px-4 py-2 font-semibold">Naturaleza</th>
              <th className="px-4 py-2 font-semibold">Qué incluye</th>
              <th className="px-4 py-2 font-semibold">Soportes</th>
              <th className="px-4 py-2 font-semibold">Observaciones</th>
            </tr>
          </thead>
          <tbody>
            {pg.pageItems.map((s) => (
              <tr key={s.id} className="border-b border-ink-50 last:border-0 hover:bg-ink-50">
                <td className="px-4 py-2.5 font-mono text-ink-600" style={{ paddingLeft: (s.level - 1) * 16 + 16 }}>
                  {canManage ? (
                    <button
                      type="button"
                      onClick={() => setEditTarget(s)}
                      title="Editar cuenta estándar"
                      className="font-mono font-semibold text-blue-600 hover:underline"
                    >
                      {s.code}
                    </button>
                  ) : (
                    s.code
                  )}
                </td>
                <td className="min-w-56 px-4 py-2.5 font-medium text-ink-800">{s.name}</td>
                <td className="min-w-44 px-4 py-2.5 text-ink-700">{s.russellAccount ?? "—"}</td>
                <td className="min-w-56 px-4 py-2.5 text-ink-600">{s.categoryType ?? "—"}</td>
                <td className="px-4 py-2.5"><Chip label={s.nature === "D" ? "Débito" : "Crédito"} tone="ink" /></td>
                <td className="max-w-md whitespace-normal px-4 py-2.5 leading-relaxed text-ink-600">{s.includes ?? "—"}</td>
                <td className="max-w-xs whitespace-normal px-4 py-2.5 leading-relaxed text-ink-500">{s.supportingDocuments ?? "—"}</td>
                <td className="max-w-md whitespace-normal px-4 py-2.5 leading-relaxed text-ink-500">{s.mappingNotes ?? "—"}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-ink-400">Sin cuentas que coincidan con el filtro.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <PaginationFooter
        rangeLabel={pg.rangeLabel}
        currentPage={pg.page}
        totalPages={pg.totalPages}
        onPageChange={pg.setPage}
      />
    </Card>

    {canManage && createOpen && (
      <StandardAccountForm mode="create" onClose={() => setCreateOpen(false)} />
    )}
    {canManage && editTarget && (
      <StandardAccountForm
        mode="edit"
        account={editTarget}
        locked={lockedCodes.has(editTarget.code)}
        onClose={() => setEditTarget(null)}
        onDelete={() => {
          const t = editTarget;
          setEditTarget(null);
          setDeleteTarget(t);
        }}
      />
    )}
    {canManage && deleteTarget && (
      <DeleteStandardAccountForm account={deleteTarget} onClose={() => setDeleteTarget(null)} />
    )}
    {canManage && logsOpen && (
      <LogsModal logs={logs} onClose={() => setLogsOpen(false)} />
    )}
    </>
  );
}

// ----- Formularios y bitácora del plan estándar (solo Administrador) -----

const INPUT_CLS = "rounded-md border border-ink-200 px-3 py-2 text-[13px] outline-none focus:border-blue-400";
const TEXTAREA_CLS = `${INPUT_CLS} min-h-[64px] resize-y`;

function Campo({ label, full, children }: { label: string; full?: boolean; children: React.ReactNode }) {
  return (
    <div className={`flex flex-col gap-1.5 ${full ? "sm:col-span-2" : ""}`}>
      <label className="text-[12px] font-medium text-ink-700">{label}</label>
      {children}
    </div>
  );
}

function StandardAccountForm({
  mode,
  account,
  locked,
  onClose,
  onDelete,
}: {
  mode: "create" | "edit";
  account?: StdAccount;
  locked?: boolean;
  onClose: () => void;
  onDelete?: () => void;
}) {
  const isEdit = mode === "edit";
  const [state, action, pending] = useActionState(
    isEdit ? updateStandardAccount : createStandardAccount,
    undefined,
  );
  const a = account;

  useEffect(() => {
    notifyActionState(state, {
      success: isEdit ? "Cuenta estándar actualizada." : "Cuenta estándar creada.",
      error: isEdit ? "No se pudo actualizar la cuenta." : "No se pudo crear la cuenta.",
    });
    if (state?.ok) onClose();
  }, [state, isEdit, onClose]);

  return (
    <Modal
      open
      onClose={onClose}
      size="3xl"
      title={isEdit ? `Editar cuenta estándar · ${a?.code}` : "Nueva cuenta estándar"}
      footer={
        <div className="flex w-full items-center justify-between gap-2">
          <div>
            {isEdit && onDelete && (
              <button
                type="button"
                onClick={onDelete}
                disabled={locked}
                title={locked ? "No se puede eliminar: la cuenta ya tiene balances asociados." : undefined}
                className="rounded-md border border-err-200 px-3 py-2 text-[13px] font-semibold text-err-700 hover:bg-err-50 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
              >
                Eliminar
              </button>
            )}
          </div>
          <button
            type="submit"
            form="standard-account-form"
            disabled={pending}
            className="rounded-md bg-navy-700 px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-60"
          >
            {pending ? <EstadoProcesando>Guardando</EstadoProcesando> : isEdit ? "Guardar cambios" : "Crear cuenta"}
          </button>
        </div>
      }
    >
      <form id="standard-account-form" action={action} className="flex flex-col gap-4">
        {isEdit && <input type="hidden" name="id" value={a!.id} />}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Campo label="Código del sistema">
            <input
              name="code"
              defaultValue={a?.code ?? ""}
              required
              readOnly={locked}
              aria-disabled={locked}
              className={`${INPUT_CLS} ${locked ? "cursor-not-allowed bg-ink-50 text-ink-500" : ""}`}
            />
            {locked && (
              <p className="text-[11px] leading-snug text-ink-500">
                No editable: esta cuenta ya tiene balances de clientes asociados.
              </p>
            )}
          </Campo>
          <Campo label="Nombre PUC">
            <input name="name" defaultValue={a?.name ?? ""} required className={INPUT_CLS} />
          </Campo>
          <Campo label="Nivel">
            <input name="level" type="number" min={1} max={12} defaultValue={a?.level ?? 1} required className={INPUT_CLS} />
          </Campo>
          <Campo label="Naturaleza">
            <select name="nature" defaultValue={a?.nature ?? "D"} required className={INPUT_CLS}>
              <option value="D">Débito</option>
              <option value="C">Crédito</option>
            </select>
          </Campo>
          <Campo label="Cuenta Russell">
            <input name="russellAccount" defaultValue={a?.russellAccount ?? ""} className={INPUT_CLS} />
          </Campo>
          <Campo label="Tipo rubro">
            <input name="categoryType" defaultValue={a?.categoryType ?? ""} className={INPUT_CLS} />
          </Campo>
          <Campo label="Cuenta padre">
            <input name="parent" defaultValue={a?.parent ?? ""} className={INPUT_CLS} />
          </Campo>
          <label className="flex items-center gap-2 self-end pb-2 text-[13px] text-ink-800">
            <input
              type="checkbox"
              name="critical"
              defaultChecked={a?.critical ?? false}
              className="h-4 w-4 rounded border-ink-300 text-navy-600 focus:ring-navy-600"
            />
            Cuenta crítica
          </label>
          <Campo label="Qué incluye" full>
            <textarea name="includes" defaultValue={a?.includes ?? ""} className={TEXTAREA_CLS} />
          </Campo>
          <Campo label="Qué no incluye" full>
            <textarea name="excludes" defaultValue={a?.excludes ?? ""} className={TEXTAREA_CLS} />
          </Campo>
          <Campo label="Cuentas posibles" full>
            <textarea name="possibleAccounts" defaultValue={a?.possibleAccounts ?? ""} className={TEXTAREA_CLS} />
          </Campo>
          <Campo label="Soportes de terceros" full>
            <textarea name="supportingDocuments" defaultValue={a?.supportingDocuments ?? ""} className={TEXTAREA_CLS} />
          </Campo>
          <Campo label="Soportes de control" full>
            <textarea name="controlSupports" defaultValue={a?.controlSupports ?? ""} className={TEXTAREA_CLS} />
          </Campo>
          <Campo label="Observaciones de homologación" full>
            <textarea name="mappingNotes" defaultValue={a?.mappingNotes ?? ""} className={TEXTAREA_CLS} />
          </Campo>
        </div>

        {state?.message && <p className="text-[12px] text-err-700">{state.message}</p>}
        {state?.errors && (
          <p className="text-[12px] text-err-700">
            {Object.values(state.errors).flat().filter(Boolean)[0]}
          </p>
        )}
      </form>
    </Modal>
  );
}

function DeleteStandardAccountForm({ account, onClose }: { account: StdAccount; onClose: () => void }) {
  const [state, action, pending] = useActionState(deleteStandardAccount, undefined);

  useEffect(() => {
    notifyActionState(state, {
      success: "Cuenta estándar eliminada.",
      error: "No se pudo eliminar la cuenta.",
    });
    if (state?.ok) onClose();
  }, [state, onClose]);

  return (
    <Modal
      open
      onClose={onClose}
      title="Eliminar cuenta estándar"
      footer={
        <button
          type="submit"
          form="delete-standard-account-form"
          disabled={pending}
          className="rounded-md bg-err-700 px-4 py-2 text-[13px] font-semibold text-white hover:bg-err-700/90 disabled:opacity-60"
        >
          {pending ? <EstadoProcesando>Eliminando</EstadoProcesando> : "Eliminar definitivamente"}
        </button>
      }
    >
      <form id="delete-standard-account-form" action={action} className="flex flex-col gap-4">
        <input type="hidden" name="id" value={account.id} />
        <p className="text-[13px] text-ink-600">
          Vas a eliminar permanentemente la cuenta estándar{" "}
          <strong className="font-mono">{account.code}</strong> · {account.name}. Esta acción
          quedará registrada en la bitácora y no se puede deshacer.
        </p>
        {state?.message && <p className="text-[12px] text-err-700">{state.message}</p>}
      </form>
    </Modal>
  );
}

function fmtFecha(iso: string): string {
  return fmtDateTimeLong(iso);
}

function logTone(action: string): "ok" | "blue" | "err" | "ink" {
  if (action.includes("CREÓ")) return "ok";
  if (action.includes("EDITÓ")) return "blue";
  if (action.includes("ELIMINÓ")) return "err";
  return "ink";
}

function LogsModal({ logs, onClose }: { logs: StdLogRow[]; onClose: () => void }) {
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();
  const rows = logs.filter(
    (l) => !needle || [l.code, l.action, l.user, l.detail].some((v) => v.toLowerCase().includes(needle)),
  );
  const pg = usePagination(rows, 50);

  return (
    <Modal open onClose={onClose} size="3xl" title="Bitácora del plan estándar">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[12px] text-ink-500">
            Movimientos sobre las cuentas estándar (crear · editar · eliminar). {logs.length} registro(s).
          </p>
          <div className="ml-auto flex items-center gap-2">
            <input
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                pg.resetToFirstPage();
              }}
              placeholder="filtrar por código, acción, usuario…"
              className="w-64 rounded-md border border-ink-200 px-2.5 py-1.5 text-[12.5px] outline-none focus:border-blue-400"
            />
            <PageSizeSelect value={pg.pageSize} onChange={pg.setPageSize} />
          </div>
        </div>
        <div className="overflow-x-auto rounded-md border border-ink-100">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="border-b border-ink-100 text-left text-[11px] uppercase tracking-wider text-ink-500">
                <th className="px-3 py-2 font-semibold">Fecha y hora</th>
                <th className="px-3 py-2 font-semibold">Acción</th>
                <th className="px-3 py-2 font-semibold">Código</th>
                <th className="px-3 py-2 font-semibold">Usuario</th>
                <th className="px-3 py-2 font-semibold">Detalle</th>
              </tr>
            </thead>
            <tbody>
              {pg.pageItems.map((l) => (
                <tr key={l.id} className="border-b border-ink-50 last:border-0 hover:bg-ink-50">
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-[11.5px] text-ink-500">{fmtFecha(l.createdAt)}</td>
                  <td className="px-3 py-2"><Chip label={l.action} tone={logTone(l.action)} /></td>
                  <td className="px-3 py-2 font-mono text-ink-700">{l.code}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-ink-800">{l.user}</td>
                  <td className="px-3 py-2 text-ink-600">{l.detail}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={5} className="px-3 py-8 text-center text-ink-400">Sin movimientos registrados.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <PaginationFooter
          rangeLabel={pg.rangeLabel}
          currentPage={pg.page}
          totalPages={pg.totalPages}
          onPageChange={pg.setPage}
        />
      </div>
    </Modal>
  );
}

function TabBtn({ on, onClick, label, count }: { on: boolean; onClick: () => void; label: string; count: number }) {
  return (
    <button onClick={onClick} className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12.5px] font-medium transition ${on ? "bg-navy-800 text-white" : "text-ink-600 hover:bg-ink-100"}`}>
      {label}
      <span className={`rounded-full px-1.5 text-[10px] font-semibold ${on ? "bg-white/20 text-white" : "bg-ink-100 text-ink-500"}`}>{count}</span>
    </button>
  );
}

// ===== Subgrupos del plan estándar (nivel 4) — solo Administrador edita =====

function SubgruposTab({ subgrupos, canManage }: { subgrupos: Subgrupo[]; canManage: boolean }) {
  const [q, setQ] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Subgrupo | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Subgrupo | null>(null);
  const needle = q.trim().toLowerCase();
  const rows = subgrupos.filter((s) => !needle || [s.codigo, s.nombre, s.grupo, s.nombreGrupo].some((v) => v.toLowerCase().includes(needle)));
  const pg = usePagination(rows, 50);

  return (
    <>
      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-ink-100 px-4 py-3">
          <h2 className="text-[13px] font-semibold text-ink-800">Subgrupos del plan estándar (nivel 4)</h2>
          <Chip label={`${pg.total} subgrupos`} tone="ink" />
          <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
            <input
              value={q}
              onChange={(e) => { setQ(e.target.value); pg.resetToFirstPage(); }}
              placeholder="filtrar código, subgrupo o grupo"
              className="w-72 rounded-md border border-ink-200 px-2.5 py-1.5 text-[12.5px] outline-none focus:border-blue-400"
            />
            <PageSizeSelect value={pg.pageSize} onChange={pg.setPageSize} />
            {canManage && (
              <button type="button" onClick={() => setCreateOpen(true)} className="rounded-md bg-navy-700 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-navy-800">
                Nuevo subgrupo
              </button>
            )}
          </div>
        </div>
        {canManage && (
          <div className="border-b border-ink-100 bg-blue-50/40 px-4 py-2 text-[11.5px] text-ink-600">
            Estos nombres alimentan los <b>niveles 4 y 2</b> del balance normalizado. Haz clic en el <b>código</b> para editar.
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="border-b border-ink-100 text-left text-[11px] uppercase tracking-wider text-ink-500">
                <th className="px-4 py-2 font-semibold">Código (4D)</th>
                <th className="px-4 py-2 font-semibold">Subgrupo</th>
                <th className="px-4 py-2 font-semibold">Grupo (2D)</th>
                <th className="px-4 py-2 font-semibold">Nombre grupo</th>
                <th className="px-4 py-2 font-semibold">Naturaleza</th>
              </tr>
            </thead>
            <tbody>
              {pg.pageItems.map((s) => (
                <tr key={s.id} className="border-b border-ink-50 last:border-0 hover:bg-ink-50">
                  <td className="px-4 py-2.5 font-mono text-ink-600">
                    {canManage ? (
                      <button type="button" onClick={() => setEditTarget(s)} title="Editar subgrupo" className="font-mono font-semibold text-blue-600 hover:underline">{s.codigo}</button>
                    ) : (
                      s.codigo
                    )}
                  </td>
                  <td className="min-w-56 px-4 py-2.5 font-medium text-ink-800">{s.nombre}</td>
                  <td className="px-4 py-2.5 font-mono text-ink-500">{s.grupo}</td>
                  <td className="min-w-44 px-4 py-2.5 text-ink-700">{s.nombreGrupo}</td>
                  <td className="px-4 py-2.5"><Chip label={s.naturaleza === "D" ? "Débito" : "Crédito"} tone="ink" /></td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-ink-400">Sin subgrupos que coincidan con el filtro.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <PaginationFooter rangeLabel={pg.rangeLabel} currentPage={pg.page} totalPages={pg.totalPages} onPageChange={pg.setPage} />
      </Card>

      {canManage && createOpen && <SubgrupoForm mode="create" onClose={() => setCreateOpen(false)} />}
      {canManage && editTarget && (
        <SubgrupoForm
          mode="edit"
          subgrupo={editTarget}
          onClose={() => setEditTarget(null)}
          onDelete={() => { const t = editTarget; setEditTarget(null); setDeleteTarget(t); }}
        />
      )}
      {canManage && deleteTarget && <DeleteSubgrupoForm subgrupo={deleteTarget} onClose={() => setDeleteTarget(null)} />}
    </>
  );
}

function SubgrupoForm({ mode, subgrupo, onClose, onDelete }: { mode: "create" | "edit"; subgrupo?: Subgrupo; onClose: () => void; onDelete?: () => void }) {
  const isEdit = mode === "edit";
  const [state, action, pending] = useActionState(isEdit ? editarSubgrupo : crearSubgrupo, undefined);
  const s = subgrupo;

  useEffect(() => {
    notifyActionState(state, {
      success: isEdit ? "Subgrupo actualizado." : "Subgrupo creado.",
      error: isEdit ? "No se pudo actualizar el subgrupo." : "No se pudo crear el subgrupo.",
    });
    if (state?.ok) onClose();
  }, [state, isEdit, onClose]);

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      title={isEdit ? `Editar subgrupo · ${s?.codigo}` : "Nuevo subgrupo"}
      footer={
        <div className="flex w-full items-center justify-between gap-2">
          <div>
            {isEdit && onDelete && (
              <button type="button" onClick={onDelete} className="rounded-md border border-err-200 px-3 py-2 text-[13px] font-semibold text-err-700 hover:bg-err-50">
                Eliminar
              </button>
            )}
          </div>
          <button type="submit" form="subgrupo-form" disabled={pending} className="rounded-md bg-navy-700 px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-60">
            {pending ? <EstadoProcesando>Guardando</EstadoProcesando> : isEdit ? "Guardar cambios" : "Crear subgrupo"}
          </button>
        </div>
      }
    >
      <form id="subgrupo-form" action={action} className="flex flex-col gap-4">
        {isEdit && <input type="hidden" name="id" value={s!.id} />}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Campo label="Código del subgrupo (4 dígitos)">
            <input name="codigo" defaultValue={s?.codigo ?? ""} required inputMode="numeric" pattern="\d{4}" placeholder="1105" className={INPUT_CLS} />
            <p className="text-[11px] leading-snug text-ink-500">El grupo (nivel 2) se deriva de los 2 primeros dígitos.</p>
          </Campo>
          <Campo label="Naturaleza">
            <select name="naturaleza" defaultValue={s?.naturaleza ?? "D"} required className={INPUT_CLS}>
              <option value="D">Débito</option>
              <option value="C">Crédito</option>
            </select>
          </Campo>
          <Campo label="Nombre del subgrupo (nivel 4)" full>
            <input name="nombre" defaultValue={s?.nombre ?? ""} required placeholder="Caja" className={INPUT_CLS} />
          </Campo>
          <Campo label="Nombre del grupo (nivel 2)" full>
            <input name="nombreGrupo" defaultValue={s?.nombreGrupo ?? ""} required placeholder="Disponible" className={INPUT_CLS} />
          </Campo>
        </div>
        {state?.message && <p className="text-[12px] text-err-700">{state.message}</p>}
      </form>
    </Modal>
  );
}

function DeleteSubgrupoForm({ subgrupo, onClose }: { subgrupo: Subgrupo; onClose: () => void }) {
  const [state, action, pending] = useActionState(eliminarSubgrupo, undefined);

  useEffect(() => {
    notifyActionState(state, { success: "Subgrupo eliminado.", error: "No se pudo eliminar el subgrupo." });
    if (state?.ok) onClose();
  }, [state, onClose]);

  return (
    <Modal
      open
      onClose={onClose}
      title="Eliminar subgrupo"
      footer={
        <button type="submit" form="delete-subgrupo-form" disabled={pending} className="rounded-md bg-err-700 px-4 py-2 text-[13px] font-semibold text-white hover:bg-err-700/90 disabled:opacity-60">
          {pending ? <EstadoProcesando>Eliminando</EstadoProcesando> : "Eliminar definitivamente"}
        </button>
      }
    >
      <form id="delete-subgrupo-form" action={action} className="flex flex-col gap-4">
        <input type="hidden" name="id" value={subgrupo.id} />
        <p className="text-[13px] text-ink-600">
          Vas a eliminar el subgrupo <strong className="font-mono">{subgrupo.codigo}</strong> · {subgrupo.nombre}. Las cuentas de ese
          subgrupo seguirán existiendo, pero en el balance se mostrarán con su código (sin nombre) hasta que lo vuelvas a crear.
        </p>
        {state?.message && <p className="text-[12px] text-err-700">{state.message}</p>}
      </form>
    </Modal>
  );
}
