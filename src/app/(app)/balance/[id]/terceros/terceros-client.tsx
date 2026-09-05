"use client";

import { Fragment, useMemo, useState } from "react";
import { Chip, StatCard } from "@/components/ui";
import { Icon } from "@/components/icons";
import { EncabezadoTablaBalance, CeldasImportesBalance } from "@/components/tabla-columnas-balance";
import { BotonPantallaCompleta, CLASE_TARJETA, claseScrollTabla, propsRegionPantallaCompleta, usePantallaCompletaTabla } from "@/components/tabla-pantalla-completa";
import { fmt, fmtNum } from "@/lib/format";
import { FILTROS_COLUMNAS_DETALLE_INICIALES } from "@/lib/balance/filtros-detalle";
import { clavesDesplegablesTerceros, filtrarArbolVisorTerceros, type FiltrosColumnasTerceros, type NodoVisorTerceros } from "@/lib/balance/arbol-visor-terceros";
import type { ResumenComparacionTerceros } from "@/lib/balance/visor-terceros";
import { useSeleccionFilaTabla } from "../../use-seleccion-fila-tabla";
import { chevronDivulgacion } from "@/lib/ui/chevron-divulgacion";
import { ETIQUETAS_IDENTIDAD, estadoIdentidadTercero, type EstadoIdentidadTercero } from "@/lib/balance/identidad-tercero";

export type FuenteTercero = { version: string; archivo: string; filas: number; origen: string };
const NIVELES = [2, 4, 6, 8];
const ETIQUETAS: Record<number, string> = { 2: "Grupo", 4: "Cuenta", 6: "Subcuenta", 8: "Auxiliar" };
const VALIDACIONES = [
  { value: "todas", label: "Todas" }, { value: "ok", label: "OK" },
  { value: "alerta", label: "Diferencia o incompleta" }, { value: "incompleta", label: "Incompletas" },
];
const claseBoton = (activo: boolean) => `rounded px-1.5 py-0.5 text-[11px] font-semibold transition ${activo ? "bg-navy-700 text-white" : "text-ink-500 hover:bg-ink-100"}`;

/** La misma distribución del balance, con terceros al final de cada cuenta.
 * La interacción es de lectura: expansión, filtros y selección local. */
export default function TercerosClient({ arbol, resumen, fuenteTercero }: {
  arbol: NodoVisorTerceros[]; resumen: ResumenComparacionTerceros; fuenteTercero: FuenteTercero;
}) {
  const [q, setQ] = useState("");
  const [clase, setClase] = useState<"todo" | "balance" | "er">("todo");
  const [nivel, setNivel] = useState(0);
  const [soloDiferencias, setSoloDiferencias] = useState(false);
  const [ocultarSinMovimiento, setOcultarSinMovimiento] = useState(false);
  const [identidad, setIdentidad] = useState<EstadoIdentidadTercero | "todas">("todas");
  const [columnas, setColumnas] = useState<FiltrosColumnasTerceros>({ ...FILTROS_COLUMNAS_DETALLE_INICIALES });
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const [cerradosEnFiltro, setCerradosEnFiltro] = useState<Set<string>>(() => new Set());
  const { pantallaCompleta, alternar } = usePantallaCompletaTabla();
  const seleccion = useSeleccionFilaTabla();
  const columnasActivas = Object.entries(columnas).some(([k, v]) => k === "validacion" ? v !== "todas" : v.trim() !== "");
  const filtrando = !!q.trim() || soloDiferencias || columnasActivas || identidad !== "todas";
  const visible = useMemo(() => filtrarArbolVisorTerceros(arbol, { q, clase, nivel, soloDiferencias, columnas, ocultarSinMovimiento, identidad }), [arbol, q, clase, nivel, soloDiferencias, columnas, ocultarSinMovimiento, identidad]);
  const claves = useMemo(() => clavesDesplegablesTerceros(visible), [visible]);
  const abiertos = useMemo(() => filtrando ? new Set(claves.filter((k) => !cerradosEnFiltro.has(k))) : open, [filtrando, claves, cerradosEnFiltro, open]);
  const toggle = (key: string) => {
    const alternarClave = (previo: Set<string>) => { const siguiente = new Set(previo); if (siguiente.has(key)) siguiente.delete(key); else siguiente.add(key); return siguiente; };
    if (filtrando) setCerradosEnFiltro(alternarClave);
    else setOpen(alternarClave);
  };
  const cambiarColumna = <K extends keyof FiltrosColumnasTerceros>(key: K, valor: FiltrosColumnasTerceros[K]) => {
    setColumnas((f) => ({ ...f, [key]: valor })); setCerradosEnFiltro(new Set());
  };
  const hayContenidoExpandido = visible.some((n) => n.hijos.length && abiertos.has(n.key));

  return <div>
    <p className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-ink-500">
      <span className="inline-flex items-center gap-1"><Icon name="link" size={12} /> Fuente por tercero: versión {fuenteTercero.version}</span>
      <span className="font-mono">{fuenteTercero.archivo} · {fmtNum(fuenteTercero.filas)} filas</span>
    </p>
    <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatCard label="Cuentas comparadas" value={fmtNum(resumen.totalCuentas)} tone="ink" />
      <StatCard label="Diferencias (incluye incompletas)" value={fmtNum(resumen.conDiferencia)} tone={resumen.conDiferencia ? "warn" : "ok"} />
      <StatCard label="Incompletas" value={fmtNum(resumen.incompletas)} tone={resumen.incompletas ? "err" : "ok"} />
      <StatCard label="Saldo balance / Σ terceros" value={`${fmt(resumen.saldoBalance)} / ${fmt(resumen.saldoTercero)}`} tone={Math.abs(resumen.saldoBalance - resumen.saldoTercero) > 0.01 ? "warn" : "blue"} valueClassName="text-[14px]" />
    </div>
    <div role="region" aria-label="Detalle del balance por terceros" {...propsRegionPantallaCompleta(pantallaCompleta, CLASE_TARJETA)}>
      <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-ink-100 bg-white px-4 py-2.5">
        <div className="mr-1 flex items-center gap-2 rounded-md border border-ink-200 bg-ink-50 px-2.5 py-1.5 text-ink-400">
          <Icon name="search" size={14} />
          <input aria-label="Buscar cuenta o tercero" value={q} onChange={(e) => { setQ(e.target.value); setCerradosEnFiltro(new Set()); }} placeholder="Buscar cuenta, NIT o tercero…" className="w-48 bg-transparent text-[12.5px] text-ink-700 outline-none placeholder:text-ink-400" />
        </div>
        <div className="flex items-center gap-0.5 rounded-md border border-ink-200 p-0.5">
          {([ ["todo", "Todas"], ["balance", "Balance"], ["er", "Resultados"] ] as const).map(([valor, label]) => <button key={valor} type="button" aria-pressed={clase === valor} onClick={() => setClase(valor)} className={claseBoton(clase === valor)}>{label}</button>)}
        </div>
        <div className="flex items-center gap-0.5 rounded-md border border-ink-200 p-0.5">
          {[0, ...NIVELES].map((n) => <button key={n} type="button" aria-pressed={nivel === n} onClick={() => setNivel(n)} className={claseBoton(nivel === n)}>{n ? `N${n}` : "Todos"}</button>)}
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <button type="button" aria-pressed={!soloDiferencias} onClick={() => { setSoloDiferencias(false); setCerradosEnFiltro(new Set()); }} className={claseBoton(!soloDiferencias)}>Todo</button>
          <button type="button" title="Incluye diferencias de saldo o mapeo y cuentas sin contraparte" aria-pressed={soloDiferencias} onClick={() => { setSoloDiferencias((v) => !v); setCerradosEnFiltro(new Set()); }} className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-semibold ${soloDiferencias ? "border-warn-300 bg-warn-100 text-warn-700" : "border-ink-200 text-ink-600 hover:bg-ink-50"}`}><Icon name="warn" size={11} /> Solo con diferencia ({resumen.conDiferencia})</button>
          {columnasActivas && <button type="button" onClick={() => { setColumnas({ ...FILTROS_COLUMNAS_DETALLE_INICIALES }); setCerradosEnFiltro(new Set()); }} className="inline-flex items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-[11px] font-semibold text-blue-700"><Icon name="x" size={11} /> Limpiar columnas</button>}
          <span className="mx-1 h-4 w-px bg-ink-200" />
          <button type="button" onClick={() => { setOpen(new Set(claves)); setCerradosEnFiltro(new Set()); }} className="inline-flex items-center gap-1.5 rounded-md border border-ink-200 px-2 py-1 text-[11.5px] font-medium text-ink-600 hover:bg-ink-50"><Icon name={chevronDivulgacion(hayContenidoExpandido)} size={12} /> Expandir todo</button>
          <button type="button" onClick={() => { setOpen(new Set()); setCerradosEnFiltro(new Set(claves)); }} className="inline-flex items-center gap-1.5 rounded-md border border-ink-200 px-2 py-1 text-[11.5px] font-medium text-ink-600 hover:bg-ink-50"><Icon name={chevronDivulgacion(hayContenidoExpandido)} size={12} /> Contraer todo</button>
          <BotonPantallaCompleta activa={pantallaCompleta} onToggle={alternar} />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-ink-100 bg-white px-4 py-2 text-[11.5px] text-ink-600">
        <label className="flex items-center gap-2">Identificación de terceros
          <select aria-label="Estado de identificación de terceros" value={identidad} onChange={(e) => { setIdentidad(e.target.value as EstadoIdentidadTercero | "todas"); setNivel(0); setCerradosEnFiltro(new Set()); }} className="rounded-md border border-ink-200 bg-white px-2 py-1">
            <option value="todas">Todas</option>
            {Object.entries(ETIQUETAS_IDENTIDAD).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label className="flex cursor-pointer items-center gap-2"><input type="checkbox" checked={ocultarSinMovimiento} onChange={(e) => setOcultarSinMovimiento(e.target.checked)} /> Ocultar terceros sin saldos ni movimientos</label>
        <span className="text-ink-400">Conserva los totales de las cuentas.</span>
      </div>
      <div className={claseScrollTabla(pantallaCompleta)}>
        <table className="balance-detail-row-hover tabla-encabezado-fijo w-full text-[12.5px]">
          <EncabezadoTablaBalance filtros={columnas} onChange={cambiarColumna} opcionesValidacion={VALIDACIONES} />
          <tbody onClick={seleccion.onClickFila} onDoubleClick={seleccion.onDoubleClickFila}>
            {visible.length ? visible.map((n) => <Fila key={n.key} nodo={n} profundidad={0} abiertos={abiertos} toggle={toggle} seleccionada={seleccion.filaSeleccionada} />) : <tr><td colSpan={9} className="px-4 py-6 text-center text-[12.5px] text-ink-400">Sin cuentas o terceros que coincidan con los filtros.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="shrink-0 border-t border-ink-100 bg-white px-4 py-2 text-[11.5px] text-ink-500">
        Normalizado al <span className="font-semibold text-ink-700">plan estándar Russell</span>: grupo → cuenta → subcuenta → auxiliar → tercero. Las cuentas conservan los importes del balance; los terceros muestran su detalle. Solo lectura.
      </div>
    </div>
  </div>;
}

function Fila({ nodo: n, profundidad, abiertos, toggle, seleccionada }: {
  nodo: NodoVisorTerceros; profundidad: number; abiertos: Set<string>; toggle: (key: string) => void; seleccionada: string | null;
}) {
  // Carga progresiva local solo de ramas muy grandes: no corta cuentas ni pierde
  // la ruta de sus terceros como lo haría paginar toda la tabla aplanada.
  const [limite, setLimite] = useState(100);
  const tieneHijos = n.hijos.length > 0;
  const abierto = abiertos.has(n.key);
  const grupo = n.tipo === "cuenta" && n.nivel !== 8;
  const label = n.tipo === "cuenta" ? ETIQUETAS[n.nivel] : n.tipo === "tercero" ? (n.esFilaPropia ? "Sin detalle" : "Tercero") : "Movimiento";
  const clase = `border-b border-ink-100 ${grupo ? n.nivel === 6 && !n.mapped ? "bg-warn-100" : n.nivel <= 2 ? "bg-ink-100" : "bg-ink-50" : "hover:bg-ink-50"} ${tieneHijos ? "cursor-pointer" : ""}`;
  const c = n.comparacion;
  return <Fragment>
    <tr data-selection-key={n.key} data-selected={seleccionada === n.key ? "true" : undefined} className={clase} onClick={tieneHijos ? () => toggle(n.key) : undefined}>
      <td className="whitespace-nowrap px-4 py-2 font-mono text-ink-600" style={{ paddingLeft: 16 + profundidad * 18 }}>
        {tieneHijos && <button type="button" aria-expanded={abierto} aria-label={`${abierto ? "Contraer" : "Desplegar"} ${n.tipo === "tercero" ? "tercero " : "cuenta "}${n.code}`} onClick={(e) => { e.stopPropagation(); toggle(n.key); }} className="mr-1 inline-flex align-middle text-ink-400 hover:text-ink-700"><Icon name={chevronDivulgacion(abierto)} size={12} /></button>}
        <span className={grupo ? "font-semibold text-ink-700" : "text-[11.5px] text-ink-500"}>{n.code}</span>
        <span className="ml-2 rounded border border-ink-200 bg-white px-1.5 py-px align-middle text-[10px] font-semibold uppercase tracking-wide text-ink-500">{label}</span>
        {grupo && n.diferencias > 0 && <span title={`${n.diferencias} cuentas con diferencias o sin contraparte`} className="ml-2 rounded bg-warn-100 px-1 text-[10px] font-semibold text-warn-700">{n.diferencias}</span>}
      </td>
      <td className={`px-4 py-2 ${grupo ? "font-semibold text-ink-800" : "text-ink-700"}`}>
        {n.name}
        {n.identidadTercero && <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[10.5px] font-normal text-ink-500" title={[...n.identidadTercero.observaciones, n.identidadTercero.fuenteNombre ?? "", n.identidadTercero.origen === "historico" ? "Registro anterior sin tipo de documento ni valor original conservado." : `Documento original: ${n.identidadTercero.documentoOriginal || "no reportado"}`].join("\n")}>
          <span>{n.identidadTercero.tipoDocumento ?? "Tipo no informado"}{n.identidadTercero.digitoVerificacion ? ` · DV ${n.identidadTercero.digitoVerificacion}` : ""}</span>
          <span className={estadoIdentidadTercero(n.identidadTercero) === "identificado" ? "text-ok-700" : "text-warn-700"}>{ETIQUETAS_IDENTIDAD[estadoIdentidadTercero(n.identidadTercero)]}</span>
        </div>}
        {n.tipo === "tercero" && (n.movimientos ?? 0) > 1 && <span className="ml-2 whitespace-nowrap text-[10.5px] text-ink-400">{n.movimientos} movimientos</span>}
        {c && (c.diferenciaSaldo || !c.enBalance) && <div className="mt-0.5 text-[11px] font-normal text-warn-700">Σ terceros: {fmt(c.saldoConsolidadoTercero)}{c.enBalance ? ` · Diferencia: ${fmt(c.saldoFinalBalance - c.saldoConsolidadoTercero)}` : " · Sin cuenta en el balance"}</div>}
      </td>
      <td className="px-4 py-2">
        {n.mapeoInconsistente ? <Chip label="Inconsistente" tone="warn" /> : grupo ? n.nivel === 6 ? <Chip label={n.mapped ? "Russell" : "Sin mapeo"} tone={n.mapped ? "ok" : "warn"} /> : null : n.std ? <span className="inline-flex items-center gap-1.5 font-mono text-[11.5px] text-blue-500">→ {n.std}</span> : <Chip label="Sin mapeo" tone="warn" />}
        {c?.diferenciaHomologacion && <div className="mt-1 text-[10.5px] text-warn-700">Terceros: {c.homologacionInconsistente ? "inconsistente" : c.cuenta6RussellTercero ?? "sin mapeo"}</div>}
      </td>
      <CeldasImportesBalance anterior={n.prevBalance} debito={n.debe} credito={n.haber} saldo={n.balance} variacion={n.variation} grupo={grupo} validacion={<Estado nodo={n} />} />
    </tr>
    {abierto && <>
      {n.hijos.slice(0, limite).map((h) => <Fila key={h.key} nodo={h} profundidad={profundidad + 1} abiertos={abiertos} toggle={toggle} seleccionada={seleccionada} />)}
      {n.hijos.length > limite && <tr><td colSpan={9} className="border-b border-ink-100 px-4 py-2" style={{ paddingLeft: 34 + profundidad * 18 }}><button type="button" onClick={() => setLimite((v) => v + 100)} className="text-[12px] font-semibold text-blue-600 hover:underline">Mostrar más de {n.code} ({limite} de {n.hijos.length})</button></td></tr>}
    </>}
  </Fragment>;
}

function Estado({ nodo: n }: { nodo: NodoVisorTerceros }) {
  const c = n.comparacion;
  if (c) {
    if (c.incompleto) return <Chip label={!c.enBalance ? "Sin cuenta en balance" : "Sin detalle por tercero"} tone="err" />;
    if (c.diferenciaHomologacion && c.diferenciaSaldo) return <Chip label="Mapeo y saldo difieren" tone="err" />;
    if (c.diferenciaHomologacion) return <Chip label="Mapeo difiere" tone="warn" />;
    if (c.diferenciaSaldo) return <Chip label="Saldo difiere" tone="warn" />;
    return <Chip label={n.esFilaPropia ? "Sin desagregar" : "OK"} tone={n.esFilaPropia ? "ink" : "ok"} />;
  }
  if (n.tipo === "cuenta") return n.diferencias ? <Chip label={`${n.diferencias} con diferencia`} tone="warn" /> : n.nivel === 6 ? <Chip label="OK" tone="ok" /> : null;
  return n.diferencias ? <Chip label="Mapeo difiere" tone="warn" /> : null;
}
