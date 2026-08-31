"use client";

// Detalle de un cargue del balance por tercero, leído como el borrador de balance:
// UN solo árbol grupo → cuenta → subcuenta → auxiliar (con chip de nivel, filtros
// por columna y controles N2/N4/N6/N8) cuyo último peldaño —la cuenta imputable—
// se abre en sus TERCEROS (NIT · nombre · montos). El árbol y sus totales se
// reconstruyen en el servidor con `arbol-tercero.ts`; aquí solo se filtra y pinta.
// La segunda pestaña son las versiones del período, como en el balance normal.

import { useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { EstadoProcesando } from "@/components/estado-procesando";
import { Icon } from "@/components/icons";
import { Card, Chip, StatCard } from "@/components/ui";
import {
  BotonPantallaCompleta,
  CLASE_TARJETA,
  claseScrollTabla,
  propsRegionPantallaCompleta,
  usePantallaCompletaTabla,
} from "@/components/tabla-pantalla-completa";
import { chevronDivulgacion } from "@/lib/ui/chevron-divulgacion";
import { nombreNivelCuenta } from "@/lib/balance/nivel-cuenta";
import { fmtContable, fmtNum } from "@/lib/format";
import { notifyError, notifySuccess } from "@/lib/client-notifications";
import { eliminarBalanceTercero } from "@/app/actions/balance";
import {
  codigosDesplegables,
  contarNodosArbolTercero,
  filtrarArbolTercero,
  FILTROS_COLUMNAS_TERCERO_INICIALES,
  hayFiltrosColumnasTercero,
  OPCIONES_FILTRO_HOMOLOGADA,
  type FiltroHomologadaTercero,
  type FiltrosColumnasTercero,
  type NodoArbolTercero,
  type ResumenArbolTercero,
  type TerceroDeCuenta,
} from "@/lib/balance/arbol-tercero";

export type VersionTerceroRow = {
  id: number;
  version: string;
  esOficial: boolean;
  archivo: string | null;
  filas: number;
  cargadoPor: string | null;
  fecha: string;
};

type Tab = "balance" | "versiones";

function TabBtn({
  on,
  onClick,
  label,
  count,
}: {
  on: boolean;
  onClick: () => void;
  label: string;
  count?: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12.5px] font-medium transition ${
        on ? "bg-navy-800 text-white" : "text-ink-600 hover:bg-ink-100"
      }`}
    >
      {label}
      {count != null && (
        <span
          className={`rounded-full px-1.5 text-[10px] font-semibold ${
            on ? "bg-white/20 text-white" : "bg-ink-100 text-ink-500"
          }`}
        >
          {fmtNum(count)}
        </span>
      )}
    </button>
  );
}

export default function TerceroDetailClient({
  encabezadoId,
  resumen,
  filasArchivo,
  arbol,
  versiones,
  puedeEliminar,
}: {
  encabezadoId: number;
  resumen: ResumenArbolTercero;
  /** Filas crudas del archivo (para el pie de la tarjeta de saldo). */
  filasArchivo: number;
  arbol: NodoArbolTercero[];
  versiones: VersionTerceroRow[];
  puedeEliminar: boolean;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("balance");
  const [confirmarBorrado, setConfirmarBorrado] = useState(false);
  const [eliminando, startEliminar] = useTransition();
  const totalCuentas = useMemo(() => contarNodosArbolTercero(arbol), [arbol]);

  const onEliminar = () => {
    startEliminar(async () => {
      const r = await eliminarBalanceTercero({ encabezadoId });
      if (!r.ok) {
        notifyError(r.message ?? "No se pudo eliminar el cargue.");
        return;
      }
      notifySuccess(r.message ?? "Cargue eliminado.");
      router.push("/balance/terceros");
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Saldo final"
          value={fmtContable(resumen.saldoFinal)}
          hint={`${fmtNum(filasArchivo)} fila(s) del archivo`}
          valueClassName="text-xl"
        />
        <StatCard
          label="Terceros"
          value={fmtNum(resumen.terceros)}
          hint={
            resumen.filasSinNit > 0
              ? `${fmtNum(resumen.filasSinNit)} fila(s) sin NIT · ${fmtContable(resumen.saldoSinNit)}`
              : "todas las filas traen NIT"
          }
          tone={resumen.filasSinNit > 0 ? "warn" : "ink"}
          valueClassName="text-xl"
        />
        <StatCard
          label="Cuentas"
          value={fmtNum(resumen.cuentas)}
          hint={
            resumen.descuadres > 0
              ? `${fmtNum(resumen.descuadres)} agrupadora(s) con Δ contra su desglose`
              : "cuentas imputables (8 díg.) de CxC/CxP"
          }
          tone={resumen.descuadres > 0 ? "warn" : "ink"}
          valueClassName="text-xl"
        />
        <StatCard
          label="Sin homologar"
          value={fmtNum(resumen.sinHomologar)}
          hint={`${fmtNum(resumen.homologadas)} cuenta(s) con cuenta Russell`}
          tone={resumen.sinHomologar > 0 ? "warn" : "ok"}
          valueClassName="text-xl"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <TabBtn on={tab === "balance"} onClick={() => setTab("balance")} label="Balance por tercero" count={totalCuentas} />
        <TabBtn on={tab === "versiones"} onClick={() => setTab("versiones")} label="Versiones" count={versiones.length} />
        <div className="ml-auto flex items-center gap-1.5">
          <a
            href={`/balance/terceros/${encabezadoId}/export`}
            className="inline-flex items-center gap-1.5 rounded-md border border-ok-200 bg-ok-100/40 px-3 py-1.5 text-[12.5px] font-semibold text-ok-700 hover:bg-ok-100"
            title="Exporta a Excel el árbol por tercero, el detalle plano y el resumen de este cargue"
          >
            <Icon name="download" size={14} /> Exportar a Excel
          </a>
          {puedeEliminar && (
            confirmarBorrado ? (
              <>
                <span className="text-[12px] text-err-700">¿Eliminar este cargue y todo su detalle?</span>
                <button
                  type="button"
                  onClick={onEliminar}
                  disabled={eliminando}
                  className="inline-flex items-center gap-1.5 rounded-md bg-err-700 px-3 py-1.5 text-[12.5px] font-semibold text-white hover:bg-err-700/90 disabled:opacity-60"
                >
                  {eliminando ? <EstadoProcesando etiqueta="Eliminando" /> : "Sí, eliminar"}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmarBorrado(false)}
                  disabled={eliminando}
                  className="rounded-md border border-ink-200 px-3 py-1.5 text-[12.5px] font-medium text-ink-600 hover:bg-ink-50 disabled:opacity-60"
                >
                  Cancelar
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmarBorrado(true)}
                className="inline-flex items-center gap-1.5 rounded-md border border-err-200 px-3 py-1.5 text-[12.5px] font-medium text-err-700 transition hover:bg-err-50"
              >
                <Icon name="trash" size={14} /> Eliminar cargue
              </button>
            )
          )}
        </div>
      </div>

      {tab === "balance" && <ArbolTercero arbol={arbol} resumen={resumen} />}
      {tab === "versiones" && <TablaVersiones versiones={versiones} actual={encabezadoId} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Árbol: barra de herramientas + tabla con filtros por columna.
// ---------------------------------------------------------------------------

const CLASE_FILTRO_COLUMNA =
  "mt-1 block h-7 w-full rounded-md border border-ink-200 bg-white px-2 text-[11px] font-normal normal-case tracking-normal text-ink-700 outline-none placeholder:text-ink-400 focus:border-blue-400";

function FiltroTextoColumna({
  ariaLabel,
  value,
  onChange,
  placeholder,
  numerico = false,
}: {
  ariaLabel: string;
  value: string;
  onChange: (valor: string) => void;
  placeholder: string;
  numerico?: boolean;
}) {
  return (
    <input
      type="text"
      inputMode={numerico ? "decimal" : "search"}
      value={value}
      onChange={(evento) => onChange(evento.target.value)}
      aria-label={ariaLabel}
      placeholder={placeholder}
      className={`${CLASE_FILTRO_COLUMNA} ${numerico ? "text-right" : "text-left"}`}
    />
  );
}

const CLASE_CELDA_MONTO = "whitespace-nowrap px-2 py-1 text-right align-top tabular-nums";

function ArbolTercero({ arbol, resumen }: { arbol: NodoArbolTercero[]; resumen: ResumenArbolTercero }) {
  // Abiertos al entrar: los grupos (≤ 2 díg.) y toda rama con descuadre, como en el borrador.
  const abiertosInicial = useMemo(() => {
    const s = new Set<string>();
    const rec = (n: NodoArbolTercero): boolean => {
      let descuadra = n.descuadre != null && n.descuadre !== 0;
      for (const h of n.hijos) if (rec(h)) descuadra = true;
      if (n.nivel <= 2 || descuadra) s.add(n.codigo);
      return descuadra;
    };
    arbol.forEach(rec);
    return s;
  }, [arbol]);
  const [abiertos, setAbiertos] = useState<Set<string>>(abiertosInicial);
  const toggle = (codigo: string) =>
    setAbiertos((prev) => {
      const n = new Set(prev);
      if (n.has(codigo)) n.delete(codigo);
      else n.add(codigo);
      return n;
    });
  const nodoPorCodigo = useMemo(() => {
    const m = new Map<string, NodoArbolTercero>();
    const rec = (n: NodoArbolTercero) => { m.set(n.codigo, n); n.hijos.forEach(rec); };
    arbol.forEach(rec);
    return m;
  }, [arbol]);

  const desplegables = useMemo(() => codigosDesplegables(arbol), [arbol]);
  // «Expandir todo» abre las CUENTAS; los terceros se abren cuenta por cuenta (una
  // imputable puede traer miles y abrirlas todas a la vez no ayuda a leer).
  const expandirTodo = () =>
    setAbiertos(new Set([...desplegables].filter((c) => (nodoPorCodigo.get(c)?.hijos.length ?? 0) > 0)));
  const contraerTodo = () => setAbiertos(new Set());

  // ---- Filtros: búsqueda global, vista, nivel máximo y columnas. ----
  const [q, setQ] = useState("");
  const [vista, setVista] = useState<"todo" | "sinHomologar">("todo");
  const [nivelMax, setNivelMax] = useState(0);
  const [filtros, setFiltros] = useState<FiltrosColumnasTercero>({ ...FILTROS_COLUMNAS_TERCERO_INICIALES });
  const { pantallaCompleta, alternar: alternarPantallaCompleta } = usePantallaCompletaTabla();
  const filtrosActivos = hayFiltrosColumnasTercero(filtros);
  const filtrando = q.trim() !== "" || vista !== "todo" || nivelMax > 0 || filtrosActivos;

  const actualizarFiltro = <K extends keyof FiltrosColumnasTercero>(clave: K, valor: FiltrosColumnasTercero[K]) =>
    setFiltros((prev) => ({ ...prev, [clave]: valor }));
  const limpiarFiltros = () => setFiltros({ ...FILTROS_COLUMNAS_TERCERO_INICIALES });

  const visibles = useMemo(
    () => filtrarArbolTercero(arbol, {
      busqueda: q,
      filtros,
      nivelMax,
      soloSinHomologar: vista === "sinHomologar",
    }),
    [arbol, q, filtros, nivelMax, vista],
  );
  const nVisibles = useMemo(() => contarNodosArbolTercero(visibles), [visibles]);
  const hayContenidoExpandido = abiertos.size > 0;
  const tablaRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    tablaRef.current?.scrollTo({ top: 0 });
  }, [q, filtros, nivelMax, vista]);

  const filas: ReactNode[] = [];
  const pintar = (n: NodoArbolTercero, depth: number) => {
    const hasHijos = n.hijos.length > 0;
    const hasTerceros = n.detalleTerceros.length > 0;
    const esMov = n.tipoFila === "movimiento";
    // Filtrando, las cuentas se abren solas; los terceros solo si la coincidencia
    // vino por ellos (`abrirTerceros`) o el usuario los abrió a mano.
    const open = filtrando && hasHijos ? true : abiertos.has(n.codigo) || !!n.abrirTerceros;
    const descuadrado = n.descuadre != null && n.descuadre !== 0;
    filas.push(
      <tr
        key={n.codigo}
        className={`border-t border-ink-100 transition-colors ${esMov ? "hover:bg-ink-50/60" : "bg-ink-50/40 font-semibold"}`}
      >
        <td className="px-2 py-1 align-top">
          <div className="flex items-center gap-1.5" style={{ paddingLeft: 4 + depth * 16 }}>
            {hasHijos || hasTerceros ? (
              <button
                type="button"
                onClick={() => toggle(n.codigo)}
                aria-expanded={open}
                aria-label={open ? `Contraer ${n.codigo}` : `Expandir ${n.codigo}`}
                className="text-ink-400 hover:text-ink-700"
              >
                <Icon name={chevronDivulgacion(open)} size={13} />
              </button>
            ) : (
              <span className="inline-block w-[13px]" />
            )}
            <span className="font-mono text-[11px] text-ink-500">{n.codigo}</span>
            <span
              title={`Nivel contable: ${nombreNivelCuenta(n.codigo)} · ${esMov ? "Movimiento (se abre en terceros)" : "Agrupadora"}${n.declarado ? " · total declarado por el archivo" : " · total sumado de sus cuentas"}`}
              className={`whitespace-nowrap rounded border px-1.5 py-px text-[9.5px] font-semibold uppercase tracking-wide ${esMov ? "border-blue-100 bg-blue-100 text-navy-700" : "border-ink-100 bg-ink-100 text-ink-600"}`}
            >
              {nombreNivelCuenta(n.codigo)} · {esMov ? "Movimiento" : "Agrupadora"}
            </span>
          </div>
        </td>
        <td className="px-2 py-1 align-top">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={`${esMov ? "font-medium" : "font-semibold"} ${n.nombre ? "text-ink-800" : "italic text-ink-400"}`}>
              {n.nombre ?? "Sin nombre en el archivo"}
            </span>
            {descuadrado && (
              <span
                className="cursor-help rounded border border-err-100 bg-err-100/35 px-1.5 py-0.5 text-[10.5px] font-semibold text-err-700"
                title={`Δ = total declarado por el archivo (${fmtContable(n.saldoFinal)}) − suma de ${hasHijos ? `sus ${n.hijos.length} cuenta(s)` : `sus ${n.detalleTerceros.length} tercero(s)`} = ${fmtContable(n.descuadre!)}.`}
              >
                Δ {fmtContable(n.descuadre!)}
              </span>
            )}
            {esMov && n.filasSinNit > 0 && (
              <span title={`${fmtNum(n.filasSinNit)} fila(s) de tercero sin NIT: no cruzan contra el auxiliar.`}>
                <Chip label={`${fmtNum(n.filasSinNit)} sin NIT`} tone="warn" />
              </span>
            )}
          </div>
        </td>
        <td className="px-2 py-1 align-top">
          {esMov ? (
            n.cuenta6Russell ? (
              <span className="font-mono text-[11px] text-ink-600">{n.cuenta6Russell}</span>
            ) : (
              <Chip label="Sin homologar" tone="warn" />
            )
          ) : (
            <span className="text-ink-300">—</span>
          )}
        </td>
        <td className={`${CLASE_CELDA_MONTO} text-ink-600`}>{n.terceros > 0 ? fmtNum(n.terceros) : <span className="text-ink-300">—</span>}</td>
        <td className={`${CLASE_CELDA_MONTO} text-ink-600`}>{fmtContable(n.saldoInicial)}</td>
        <td className={`${CLASE_CELDA_MONTO} text-ink-600`}>{fmtContable(n.debitos)}</td>
        <td className={`${CLASE_CELDA_MONTO} text-ink-600`}>{fmtContable(n.creditos)}</td>
        <td className={`${CLASE_CELDA_MONTO} text-ink-800 ${esMov ? "font-medium" : "font-semibold"}`}>{fmtContable(n.saldoFinal)}</td>
      </tr>,
    );
    if (!open) return;
    n.hijos.forEach((h) => pintar(h, depth + 1));
    if (hasTerceros) n.detalleTerceros.forEach((t) => filas.push(filaTercero(n, t, depth + 1)));
  };

  const filaTercero = (cuenta: NodoArbolTercero, t: TerceroDeCuenta, depth: number) => (
    <tr key={`${cuenta.codigo}:${t.id}`} className="border-t border-ink-100/70 bg-white text-ink-600 hover:bg-blue-50/40">
      <td className="px-2 py-1 align-top">
        <div className="flex items-center gap-1.5" style={{ paddingLeft: 4 + depth * 16 }}>
          <span className="inline-block w-[13px]" />
          {t.nit ? (
            <span className="font-mono text-[11px] text-ink-700">{t.nit}</span>
          ) : (
            <Chip label="Sin NIT" tone="warn" />
          )}
          <span className="whitespace-nowrap rounded border border-ink-100 bg-white px-1.5 py-px text-[9.5px] font-semibold uppercase tracking-wide text-ink-500">
            Tercero
          </span>
        </div>
      </td>
      <td className="px-2 py-1 align-top">
        <span className={t.nombre ? "text-ink-700" : "italic text-ink-400"} title={t.nombre ?? undefined}>
          {t.nombre ?? "Sin nombre"}
        </span>
      </td>
      <td className="px-2 py-1 align-top"><span className="text-ink-300">—</span></td>
      <td className={`${CLASE_CELDA_MONTO}`}><span className="text-ink-300">—</span></td>
      <td className={CLASE_CELDA_MONTO}>{fmtContable(t.saldoInicial)}</td>
      <td className={CLASE_CELDA_MONTO}>{fmtContable(t.debitos)}</td>
      <td className={CLASE_CELDA_MONTO}>{fmtContable(t.creditos)}</td>
      <td className={`${CLASE_CELDA_MONTO} font-medium text-ink-800`}>{fmtContable(t.saldoFinal)}</td>
    </tr>
  );

  visibles.forEach((n) => pintar(n, 0));

  const nivelBtn = (v: number, label: string) => (
    <button
      type="button"
      aria-pressed={nivelMax === v}
      onClick={() => setNivelMax((prev) => (prev === v ? 0 : v))}
      className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${nivelMax === v ? "bg-navy-700 text-white" : "text-ink-500 hover:bg-ink-100"}`}
    >
      {label}
    </button>
  );
  const vistaBtn = (v: typeof vista, label: string, count?: number) => (
    <button
      type="button"
      aria-pressed={vista === v}
      onClick={() => setVista((prev) => (prev === v ? "todo" : v))}
      className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11.5px] font-medium ${vista === v ? "bg-navy-700 text-white" : "text-ink-600 hover:bg-ink-100"}`}
    >
      {label}
      {count != null && count > 0 && (
        <span className={`rounded-full px-1.5 text-[10px] font-semibold ${vista === v ? "bg-white/20" : "bg-warn-100 text-warn-700"}`}>
          {fmtNum(count)}
        </span>
      )}
    </button>
  );

  return (
    <div
      role="region"
      aria-label="Balance por tercero en árbol"
      {...propsRegionPantallaCompleta(pantallaCompleta, CLASE_TARJETA)}
    >
      <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-ink-100 bg-white px-3 py-2">
        <div className="flex items-center gap-1.5 rounded-md border border-ink-200 bg-ink-50 px-2 py-1 text-ink-400">
          <Icon name="search" size={13} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar código, cuenta, NIT o tercero…"
            className="w-56 bg-transparent text-[12px] text-ink-700 outline-none placeholder:text-ink-400"
          />
        </div>
        <div className="ml-auto flex items-center gap-0.5 rounded-md border border-ink-200 p-0.5">
          {nivelBtn(0, "Todos")}{nivelBtn(2, "N2")}{nivelBtn(4, "N4")}{nivelBtn(6, "N6")}{nivelBtn(8, "N8")}
        </div>
        <span className="mx-0.5 h-4 w-px bg-ink-200" />
        {vistaBtn("todo", "Todo")}
        {vistaBtn("sinHomologar", "Sin homologar", resumen.sinHomologar)}
        {filtrosActivos && (
          <button
            type="button"
            onClick={limpiarFiltros}
            className="inline-flex items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-[11px] font-semibold text-blue-700 transition hover:bg-blue-100"
          >
            <Icon name="x" size={11} /> Limpiar columnas
          </button>
        )}
        <span className="mx-0.5 h-4 w-px bg-ink-200" />
        <button type="button" onClick={expandirTodo} className="inline-flex items-center gap-1.5 rounded-md border border-ink-200 px-2 py-1 text-[11px] font-medium text-ink-600 hover:bg-ink-50">
          <Icon name={chevronDivulgacion(hayContenidoExpandido)} size={12} />Expandir todo
        </button>
        <button type="button" onClick={contraerTodo} className="inline-flex items-center gap-1.5 rounded-md border border-ink-200 px-2 py-1 text-[11px] font-medium text-ink-600 hover:bg-ink-50">
          <Icon name={chevronDivulgacion(hayContenidoExpandido)} size={12} />Contraer todo
        </button>
        <BotonPantallaCompleta activa={pantallaCompleta} onToggle={alternarPantallaCompleta} />
      </div>
      <div ref={tablaRef} className={claseScrollTabla(pantallaCompleta)}>
        <table className="balance-detail-row-hover tabla-encabezado-fijo w-full text-[11px]">
          <thead className="text-ink-500">
            <tr className="text-left text-[11px] uppercase tracking-wider">
              <th className="min-w-44 px-2 py-1.5 font-semibold">
                Código
                <FiltroTextoColumna
                  ariaLabel="Filtrar la columna Código"
                  value={filtros.codigo}
                  onChange={(v) => actualizarFiltro("codigo", v)}
                  placeholder="Buscar código"
                />
              </th>
              <th className="min-w-56 px-2 py-1.5 font-semibold">
                Cuenta
                <FiltroTextoColumna
                  ariaLabel="Filtrar la columna Cuenta"
                  value={filtros.cuenta}
                  onChange={(v) => actualizarFiltro("cuenta", v)}
                  placeholder="Buscar cuenta"
                />
              </th>
              <th className="min-w-36 px-2 py-1.5 font-semibold">
                Homologada
                <select
                  value={filtros.homologada}
                  onChange={(e) => actualizarFiltro("homologada", e.target.value as FiltroHomologadaTercero)}
                  aria-label="Filtrar la columna Homologada"
                  className={CLASE_FILTRO_COLUMNA}
                >
                  {OPCIONES_FILTRO_HOMOLOGADA.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </th>
              <th className="min-w-36 px-2 py-1.5 text-right font-semibold">
                Terceros
                <FiltroTextoColumna
                  ariaLabel="Filtrar por NIT o nombre del tercero"
                  value={filtros.tercero}
                  onChange={(v) => actualizarFiltro("tercero", v)}
                  placeholder="NIT o nombre"
                />
              </th>
              <th className="min-w-36 whitespace-nowrap px-2 py-1.5 text-right font-semibold">
                Saldo ant.
                <FiltroTextoColumna
                  ariaLabel="Filtrar la columna Saldo anterior"
                  value={filtros.saldoAnterior}
                  onChange={(v) => actualizarFiltro("saldoAnterior", v)}
                  placeholder="Ej. > 1000000"
                  numerico
                />
              </th>
              <th className="min-w-32 whitespace-nowrap px-2 py-1.5 text-right font-semibold">
                Débito
                <FiltroTextoColumna
                  ariaLabel="Filtrar la columna Débito"
                  value={filtros.debito}
                  onChange={(v) => actualizarFiltro("debito", v)}
                  placeholder="Ej. > 0"
                  numerico
                />
              </th>
              <th className="min-w-32 whitespace-nowrap px-2 py-1.5 text-right font-semibold">
                Crédito
                <FiltroTextoColumna
                  ariaLabel="Filtrar la columna Crédito"
                  value={filtros.credito}
                  onChange={(v) => actualizarFiltro("credito", v)}
                  placeholder="Ej. > 0"
                  numerico
                />
              </th>
              <th className="min-w-36 whitespace-nowrap px-2 py-1.5 text-right font-semibold">
                Saldo actual
                <FiltroTextoColumna
                  ariaLabel="Filtrar la columna Saldo actual"
                  value={filtros.saldo}
                  onChange={(v) => actualizarFiltro("saldo", v)}
                  placeholder="Ej. < 0"
                  numerico
                />
              </th>
            </tr>
          </thead>
          <tbody>
            {filas}
            {filas.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-[12.5px] text-ink-400">
                  Ninguna cuenta ni tercero coincide con los filtros.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-ink-100 px-4 py-2 text-[12px] text-ink-500">
        <span>
          Mostrando {fmtNum(nVisibles)} de {fmtNum(contarNodosArbolTercero(arbol))} cuenta(s)
          {filtrando ? " · filtrado" : ""}
        </span>
        <span>
          Cada cuenta muestra el total que declara el archivo (o la suma de sus cuentas si no lo trae); abre una imputable para ver sus terceros.
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Versiones del período.
// ---------------------------------------------------------------------------

function TablaVersiones({ versiones, actual }: { versiones: VersionTerceroRow[]; actual: number }) {
  return (
    <Card>
      <div className="max-sm:overflow-x-auto">
        <table className="tabla-encabezado-fijo w-full text-[12.5px]">
          <thead className="bg-ink-50 text-ink-500">
            <tr className="text-left text-[11px] uppercase tracking-wider">
              <th className="px-4 py-2 font-semibold">Versión</th>
              <th className="px-4 py-2 font-semibold">Archivo</th>
              <th className="px-4 py-2 text-right font-semibold">Filas</th>
              <th className="px-4 py-2 font-semibold">Cargado por</th>
              <th className="px-4 py-2 font-semibold">Fecha</th>
              <th className="px-4 py-2 text-right font-semibold">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {versiones.map((v) => (
              <tr
                key={v.id}
                className={`border-t border-ink-100 ${v.id === actual ? "bg-blue-50/40" : "hover:bg-ink-50/50"}`}
              >
                <td className="px-4 py-2">
                  <span className="inline-flex items-center gap-1.5">
                    <Chip label={v.version} tone={v.esOficial ? "ok" : "ink"} />
                    {v.id === actual && <span className="text-[10.5px] text-ink-400">en pantalla</span>}
                  </span>
                </td>
                <td className="max-w-[320px] truncate px-4 py-2 text-ink-700" title={v.archivo ?? undefined}>
                  {v.archivo ?? "— sin archivo —"}
                </td>
                <td className="px-4 py-2 text-right tabular-nums text-ink-700">{fmtNum(v.filas)}</td>
                <td className="px-4 py-2 text-ink-600">{v.cargadoPor ?? "—"}</td>
                <td className="px-4 py-2 text-[11px] text-ink-500">{v.fecha}</td>
                <td className="px-4 py-2 text-right">
                  {v.id === actual ? (
                    <span className="text-[11px] text-ink-400">—</span>
                  ) : (
                    <Link
                      href={`/balance/terceros/${v.id}`}
                      className="inline-flex items-center gap-1 text-[12px] font-medium text-blue-500 hover:underline"
                    >
                      Ver <Icon name="chev-r" size={12} />
                    </Link>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
