"use client";

import { EstadoProcesando } from "@/components/estado-procesando";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { Card, Chip } from "@/components/ui";
import { Modal } from "@/components/modal";
import { fmt, fmtPct } from "@/lib/format";
import { notifyError, notifySuccess } from "@/lib/client-notifications";
import { asignarCuentaEstandar, validarAlerta, revertirValidacionAlerta, eliminarDetalleBalance } from "@/app/actions/balance";
import Conversacion from "@/components/conversacion";
import type { NodoBalance } from "@/lib/balance/calcular";
import { useSeleccionFilaTabla } from "@/app/(app)/balance/use-seleccion-fila-tabla";

export type ValidacionInfo = { tipo: string; por: string; en: string; comentario: string };
// Contexto de validación de alertas que se pasa al renderizador de filas.
type ValCtx = {
  puede: boolean;
  mapa: Record<string, ValidacionInfo>;
  revirtiendo: boolean;
  codigoRevirtiendo: string | null;
  onOk: (n: NodoBalance, tipo: string) => void;
  onRevertir: (code: string) => void;
};

export type Sums = { activo: number; pasivo: number; patrimonio: number; ingresos: number; gastos: number; costos: number; utilidad: number };
export type Validation = { id: string; rule: string; status: string; detail: string; count?: number };
export type EstandarOpcion = { code: string; name: string };
export type Meta = { rows: number; mapped: number; unmapped: number; critical: number; file: string; fileSize: string; frozenBy: string; frozenAt: string; uploadedBy: string; uploadedAt: string };
export type Version = { v: string; date: string; uploadedBy: string; role: string; file: string; size: string; rows: number; sumA: number; balanced: boolean; note: string; changes: number };

type Tab = "breakdown" | "validations" | "versions" | "clases";
type Filtro = "todo" | "balance" | "er" | "alertas";
type Conteo = { mapeo: number; naturaleza: number };

const CLASES_BALANCE = new Set(["1", "2", "3"]);
const CLASES_ER = new Set(["4", "5", "6", "7"]);
// Nombre del nivel PUC según la longitud del código: 1=Clase, 2=Grupo, 4=Cuenta,
// 6=Subcuenta, 8=Auxiliar (el nivel 8 es la cuenta del cliente / auxiliar).
const NIVEL_LABEL: Record<number, string> = { 1: "Clase", 2: "Grupo", 4: "Cuenta", 6: "Subcuenta", 8: "Auxiliar" };

export default function BalanceDetailClient({
  arbol, estandar, puedeMapear, validations, versions, officialVersion, warnCount, balanceId, comentarios, validaciones, puedeValidar, puedeEliminar, sums, balanced, diffCuadre,
}: {
  arbol: NodoBalance[]; estandar: EstandarOpcion[]; puedeMapear: boolean; validations: Validation[]; versions: Version[]; officialVersion: string; warnCount: number; balanceId: number; comentarios: Record<string, number>; validaciones: Record<string, ValidacionInfo>; puedeValidar: boolean; puedeEliminar: boolean; sums: Sums; balanced: boolean; diffCuadre: number;
}) {
  const [tab, setTab] = useState<Tab>("breakdown");
  return (
    <div className="mt-5">
      <div className="mb-3 flex items-center gap-2">
        <TabBtn on={tab === "breakdown"} onClick={() => setTab("breakdown")} label="Detalle por niveles" />
        <TabBtn on={tab === "validations"} onClick={() => setTab("validations")} label="Validaciones" count={warnCount} />
        <TabBtn on={tab === "versions"} onClick={() => setTab("versions")} label="Versiones" count={versions.length} />
        <TabBtn on={tab === "clases"} onClick={() => setTab("clases")} label="Saldos por clase" />
      </div>
      {tab === "breakdown" && <BreakdownTab arbol={arbol} estandar={estandar} puedeMapear={puedeMapear} balanceId={balanceId} comentarios={comentarios} validaciones={validaciones} puedeValidar={puedeValidar} puedeEliminar={puedeEliminar} />}
      {tab === "validations" && <ValidationsTab validations={validations} />}
      {tab === "versions" && <VersionsTab versions={versions} officialVersion={officialVersion} />}
      {tab === "clases" && <ClasesTab sums={sums} balanced={balanced} diffCuadre={diffCuadre} />}
    </div>
  );
}

/** Llaves de los nodos con hijos (para expandir/contraer todo). */
function keysConHijos(nodos: NodoBalance[]): string[] {
  const ks: string[] = [];
  const walk = (n: NodoBalance) => { if (n.hijos.length) { ks.push(n.key); n.hijos.forEach(walk); } };
  nodos.forEach(walk);
  return ks;
}

/** ¿Hoja con alerta? Cuenta sin mapear (mapeo) o con naturaleza/saldo contrario NO
 *  validada (una alerta de saldo con OK+comentario deja de contar). */
function esHojaAlerta(n: NodoBalance, validados: Set<string>): boolean {
  const mapeado = n.nivel === 8 ? !!n.std : n.mapped;
  return !mapeado || (!n.saldoOk && !validados.has(n.code));
}

/** Poda el árbol dejando solo las ramas con alertas (filtro "Alertas"). */
function podarAlertas(nodos: NodoBalance[], validados: Set<string>): NodoBalance[] {
  const out: NodoBalance[] = [];
  for (const n of nodos) {
    const hijos = podarAlertas(n.hijos, validados);
    const self = (n.hijos.length === 0 && esHojaAlerta(n, validados)) || (n.nivel === 6 && !n.mapped);
    if (hijos.length > 0 || self) out.push({ ...n, hijos });
  }
  return out;
}

/** Filtra el árbol por código/nombre: si un nodo coincide, incluye su subárbol completo; si no, solo si algún descendiente coincide. */
function podarBusqueda(nodos: NodoBalance[], needle: string): NodoBalance[] {
  const out: NodoBalance[] = [];
  for (const n of nodos) {
    const self = n.code.toLowerCase().includes(needle) || n.name.toLowerCase().includes(needle) || (n.std?.toLowerCase().includes(needle) ?? false);
    if (self) { out.push(n); continue; }
    const hijos = podarBusqueda(n.hijos, needle);
    if (hijos.length > 0) out.push({ ...n, hijos });
  }
  return out;
}

/** Cuenta de alertas (mapeo / naturaleza) por nodo, sumando sus hojas. Las alertas
 *  de saldo VALIDADAS (OK+comentario) no cuentan. */
function contarAlertas(arbol: NodoBalance[], validados: Set<string>): Map<string, Conteo> {
  const m = new Map<string, Conteo>();
  const walk = (n: NodoBalance): Conteo => {
    let r: Conteo;
    if (n.hijos.length === 0) {
      const mapeado = n.nivel === 8 ? !!n.std : n.mapped;
      r = { mapeo: mapeado ? 0 : 1, naturaleza: n.saldoOk || validados.has(n.code) ? 0 : 1 };
    } else {
      r = n.hijos.reduce<Conteo>((a, h) => { const c = walk(h); return { mapeo: a.mapeo + c.mapeo, naturaleza: a.naturaleza + c.naturaleza }; }, { mapeo: 0, naturaleza: 0 });
    }
    m.set(n.key, r);
    return r;
  };
  arbol.forEach(walk);
  return m;
}

function BreakdownTab({ arbol, estandar, puedeMapear, balanceId, comentarios, validaciones, puedeValidar, puedeEliminar }: { arbol: NodoBalance[]; estandar: EstandarOpcion[]; puedeMapear: boolean; balanceId: number; comentarios: Record<string, number>; validaciones: Record<string, ValidacionInfo>; puedeValidar: boolean; puedeEliminar: boolean }) {
  const router = useRouter();
  const [filtro, setFiltro] = useState<Filtro>("todo");
  const [q, setQ] = useState("");
  // Por defecto TODO contraído: al entrar se ve el encabezado y solo las clases,
  // colapsadas. El usuario expande lo que necesite.
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const [asignar, setAsignar] = useState<NodoBalance | null>(null);
  const [comentar, setComentar] = useState<NodoBalance | null>(null);
  const [validar, setValidar] = useState<{ nodo: NodoBalance; tipo: string } | null>(null);
  const [eliminar, setEliminar] = useState<NodoBalance | null>(null);
  const { filaSeleccionada, onClickFila, onDoubleClickFila } = useSeleccionFilaTabla();
  // Handler de borrado (o null si no puede): controla la visibilidad del botón.
  const onEliminar = puedeEliminar ? setEliminar : null;
  const [revirtiendo, startRevertir] = useTransition();
  const [codigoRevirtiendo, setCodigoRevirtiendo] = useState<string | null>(null);

  // Cuentas cuya alerta de saldo ya fue VALIDADA (retiradas del conteo/poda).
  const validados = useMemo(() => new Set(Object.keys(validaciones)), [validaciones]);
  const val: ValCtx = {
    puede: puedeValidar,
    mapa: validaciones,
    revirtiendo,
    codigoRevirtiendo,
    onOk: (nodo, tipo) => setValidar({ nodo, tipo }),
    onRevertir: (code) => {
      setCodigoRevirtiendo(code);
      startRevertir(async () => {
        try {
          const r = await revertirValidacionAlerta({ balanceId, anchor: code });
          if (r.ok) { notifySuccess(r.message ?? "Validación revertida."); router.refresh(); }
          else notifyError(r.message ?? "No se pudo revertir.");
        } finally {
          setCodigoRevirtiendo(null);
        }
      });
    },
  };

  // Conteo de alertas (mapeo / naturaleza) por nodo + totales del balance.
  const conteos = useMemo(() => contarAlertas(arbol, validados), [arbol, validados]);
  const totales = useMemo(
    () => arbol.reduce<Conteo>((a, n) => { const c = conteos.get(n.key); return { mapeo: a.mapeo + (c?.mapeo ?? 0), naturaleza: a.naturaleza + (c?.naturaleza ?? 0) }; }, { mapeo: 0, naturaleza: 0 }),
    [arbol, conteos],
  );
  const totalAlertas = totales.mapeo + totales.naturaleza;

  const visible = useMemo(() => {
    let base: NodoBalance[];
    if (filtro === "balance") base = arbol.filter((n) => CLASES_BALANCE.has(n.clase));
    else if (filtro === "er") base = arbol.filter((n) => CLASES_ER.has(n.clase));
    else if (filtro === "alertas") base = podarAlertas(arbol, validados);
    else base = arbol;
    const needle = q.trim().toLowerCase();
    return needle ? podarBusqueda(base, needle) : base;
  }, [arbol, filtro, q, validados]);

  // En el filtro "Alertas" el árbol podado se muestra totalmente expandido.
  const openEff = useMemo(() => (filtro === "alertas" || q.trim() ? new Set(keysConHijos(visible)) : open), [filtro, visible, open, q]);

  const toggle = (key: string) => setOpen((o) => { const n = new Set(o); if (n.has(key)) n.delete(key); else n.add(key); return n; });
  const expandirTodo = () => setOpen(new Set(keysConHijos(arbol)));
  const contraerTodo = () => setOpen(new Set());

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2 border-b border-ink-100 px-4 py-2.5">
        <span className="text-[11.5px] text-ink-500">Normalizado al <span className="font-semibold text-ink-700">plan estándar Russell</span>: grupo → cuenta → subcuenta → auxiliar (cuenta del cliente).</span>
        <div className="ml-auto flex items-center gap-1.5">
          <div className="mr-1 flex items-center gap-2 rounded-md border border-ink-200 bg-ink-50 px-2.5 py-1.5 text-ink-400">
            <Icon name="search" size={14} />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar código o cuenta…"
              className="w-48 bg-transparent text-[12.5px] text-ink-700 outline-none placeholder:text-ink-400"
            />
          </div>
          <FiltroBtn on={filtro === "todo"} onClick={() => setFiltro("todo")} label="Todo" />
          <FiltroBtn on={filtro === "balance"} onClick={() => setFiltro("balance")} label="Balance" />
          <FiltroBtn on={filtro === "er"} onClick={() => setFiltro("er")} label="Estado de Resultado" />
          <FiltroBtn on={filtro === "alertas"} onClick={() => setFiltro("alertas")} label="Alertas" count={totalAlertas} tone="warn" />
          <span className="mx-1 h-4 w-px bg-ink-200" />
          <button onClick={expandirTodo} className="inline-flex items-center gap-1.5 rounded-md border border-ink-200 px-2 py-1 text-[11.5px] font-medium text-ink-600 hover:bg-ink-50">
            <Icon name="chev-d" size={12} /> Expandir todo
          </button>
          <button onClick={contraerTodo} className="inline-flex items-center gap-1.5 rounded-md border border-ink-200 px-2 py-1 text-[11.5px] font-medium text-ink-600 hover:bg-ink-50">
            <Icon name="chev-r" size={12} /> Contraer todo
          </button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="balance-detail-row-hover w-full text-[12.5px]">
          <thead>
            <tr className="border-b border-ink-100 text-left text-[11px] uppercase tracking-wider text-ink-500">
              <th className="px-4 py-2 font-semibold">Código</th>
              <th className="px-4 py-2 font-semibold">Cuenta</th>
              <th className="px-4 py-2 font-semibold">Mapeo estándar</th>
              <th className="whitespace-nowrap border-l border-ink-150 px-4 py-2 text-right font-semibold">Saldo anterior</th>
              <th className="whitespace-nowrap border-l border-ink-150 px-4 py-2 text-right font-semibold">Débito</th>
              <th className="whitespace-nowrap border-l border-ink-150 px-4 py-2 text-right font-semibold">Crédito</th>
              <th className="whitespace-nowrap border-l border-ink-150 px-4 py-2 text-right font-semibold">Saldo</th>
              <th className="whitespace-nowrap border-l border-ink-150 px-4 py-2 text-right font-semibold">Var %</th>
              <th className="border-l border-ink-150 px-4 py-2 font-semibold">Validación</th>
            </tr>
          </thead>
          <tbody onClick={onClickFila} onDoubleClick={onDoubleClickFila}>
            {visible.length === 0 ? (
              <tr><td colSpan={9} className="px-4 py-6 text-center text-[12.5px] text-ink-400">{q.trim() ? "Sin cuentas que coincidan con la búsqueda." : filtro === "alertas" ? "Sin alertas de mapeo ni de naturaleza. 🎉" : "Sin cuentas para este filtro."}</td></tr>
            ) : (
              visible.flatMap((n) => filas(n, 0, openEff, toggle, puedeMapear, setAsignar, conteos, comentarios, setComentar, val, onEliminar, filaSeleccionada))
            )}
          </tbody>
        </table>
      </div>
      {asignar && <AsignarModal nodo={asignar} estandar={estandar} onClose={() => setAsignar(null)} />}
      {comentar && <ComentarModal nodo={comentar} balanceId={balanceId} onClose={() => setComentar(null)} />}
      {validar && <ValidarModal nodo={validar.nodo} tipo={validar.tipo} balanceId={balanceId} onClose={() => setValidar(null)} />}
      {eliminar && <EliminarModal nodo={eliminar} onClose={() => setEliminar(null)} />}
    </Card>
  );
}

/** Renderiza recursivamente las filas (nodo + hijos si está expandido). */
function filas(nodo: NodoBalance, depth: number, open: Set<string>, toggle: (k: string) => void, puedeMapear: boolean, onAsignar: (n: NodoBalance) => void, conteos: Map<string, Conteo>, comentarios: Record<string, number>, onComentar: (n: NodoBalance) => void, val: ValCtx, onEliminar: ((n: NodoBalance) => void) | null, filaSeleccionada: string | null): React.ReactElement[] {
  const tieneHijos = nodo.hijos.length > 0;
  const isOpen = open.has(nodo.key);
  const esGrupo = nodo.nivel !== 8;
  const sinMapeo = nodo.nivel === 6 && !nodo.mapped;
  const pad = 16 + depth * 18;
  // Contadores de alertas del subárbol (solo en nodos de agrupación: clase/subgrupo/cuenta estándar).
  const c = tieneHijos ? conteos.get(nodo.key) : undefined;

  const fila = (
    <tr
      key={nodo.key}
      data-selection-key={nodo.key}
      data-selected={filaSeleccionada === nodo.key ? "true" : undefined}
      className={`border-b border-ink-100 ${esGrupo ? (sinMapeo ? "bg-warn-100" : nodo.nivel <= 2 ? "bg-ink-100" : "bg-ink-50") : "hover:bg-ink-50"} ${tieneHijos ? "cursor-pointer" : ""}`}
      onClick={tieneHijos ? () => toggle(nodo.key) : undefined}
    >
      <td className="px-4 py-2 font-mono text-ink-600" style={{ paddingLeft: pad }}>
        {tieneHijos && <span className="mr-1 inline-block align-middle text-ink-400"><Icon name={isOpen ? "chev-d" : "chev-r"} size={12} /></span>}
        <span className={esGrupo ? "font-semibold text-ink-700" : "text-[11.5px] text-ink-500"}>{nodo.code}</span>
        <span className="ml-2 rounded border border-ink-200 bg-white px-1.5 py-px align-middle text-[10px] font-semibold uppercase tracking-wide text-ink-500">{NIVEL_LABEL[nodo.nivel]}</span>
        {c && (c.mapeo > 0 || c.naturaleza > 0) && (
          <span className="ml-2 inline-flex items-center gap-1 align-middle">
            {c.mapeo > 0 && <span title={`${c.mapeo} cuenta(s) sin mapeo`} className="inline-flex items-center gap-0.5 rounded bg-warn-100 px-1 text-[10px] font-semibold text-warn-700"><Icon name="warn" size={9} />{c.mapeo}</span>}
            {c.naturaleza > 0 && <span title={`${c.naturaleza} cuenta(s) con naturaleza/saldo contrario`} className="rounded bg-err-100 px-1 text-[10px] font-semibold text-err-700">±{c.naturaleza}</span>}
          </span>
        )}
      </td>
      <td className={`px-4 py-2 ${esGrupo ? "font-semibold text-ink-800" : "text-ink-700"}`}>
        {nodo.name}
        {nodo.critical && nodo.nivel === 8 && <span className="ml-2"><Chip label="Crítica" tone="warn" /></span>}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onComentar(nodo); }}
          title="Comentarios de esta cuenta"
          className={`ml-2 inline-flex items-center gap-0.5 rounded px-1 align-middle text-[11px] hover:bg-ink-100 ${comentarios[nodo.code] ? "text-blue-600" : "text-ink-300 hover:text-ink-600"}`}
        >
          <Icon name="msg" size={12} />{comentarios[nodo.code] ? <span className="font-semibold">{comentarios[nodo.code]}</span> : null}
        </button>
        {onEliminar && nodo.nivel === 8 && nodo.detalleId != null && !nodo.std && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onEliminar(nodo); }}
            title="Eliminar registro sin mapeo del balance"
            className="ml-1.5 inline-flex items-center rounded-md border border-err-300 bg-err-100 px-1.5 py-0.5 align-middle font-bold text-err-700 hover:bg-err-200"
          >
            <Icon name="x" size={16} />
          </button>
        )}
      </td>
      <td className="px-4 py-2">{celdaMapeo(nodo, puedeMapear, onAsignar)}</td>
      <td className="whitespace-nowrap border-l border-ink-150 px-4 py-2 text-right font-mono text-ink-400">{fmt(nodo.prevBalance)}</td>
      <td className="whitespace-nowrap border-l border-ink-150 px-4 py-2 text-right font-mono text-ink-600">{fmt(nodo.debe)}</td>
      <td className="whitespace-nowrap border-l border-ink-150 px-4 py-2 text-right font-mono text-ink-600">{fmt(nodo.haber)}</td>
      <td className={`whitespace-nowrap border-l border-ink-150 px-4 py-2 text-right font-mono ${esGrupo ? "font-semibold text-ink-800" : "text-ink-700"}`}>{fmt(nodo.balance)}</td>
      <td className={`whitespace-nowrap border-l border-ink-150 px-4 py-2 text-right font-mono ${nodo.variation != null && Math.abs(nodo.variation) > 25 ? "text-warn-700" : "text-ink-600"}`}>{fmtPct(nodo.variation)}</td>
      <td className="whitespace-nowrap border-l border-ink-150 px-4 py-2">{celdaValidacion(nodo, val)}</td>
    </tr>
  );

  if (!tieneHijos || !isOpen) return [fila];
  return [fila, ...nodo.hijos.flatMap((h) => filas(h, depth + 1, open, toggle, puedeMapear, onAsignar, conteos, comentarios, onComentar, val, onEliminar, filaSeleccionada))];
}

/** Celda de la columna "Validación": alerta de naturaleza/saldo contrario con botón
 *  "Dar OK", o el estado "Validado ✓" (con quién/cuándo/comentario) y opción de
 *  revertir. Sin alerta de saldo, muestra el "OK" de la cuenta estándar mapeada. */
function celdaValidacion(nodo: NodoBalance, val: ValCtx): React.ReactNode {
  if (nodo.saldoOk) return nodo.nivel === 6 && nodo.mapped ? <Chip label="OK" tone="ok" /> : null;
  const tipo = nodo.nivel === 8 ? "naturaleza" : "saldo_contrario";
  const label = nodo.nivel === 8 ? "Naturaleza" : "Saldo contrario";
  const v = val.mapa[nodo.code];
  if (v) {
    return (
      <span className="inline-flex flex-col items-start gap-1">
        <span title={`Validado por ${v.por} · ${v.en}\n“${v.comentario}”`} className="cursor-help"><Chip label="Validado ✓" tone="ok" /></span>
        {val.puede && (
          <button type="button" disabled={val.revirtiendo} onClick={(e) => { e.stopPropagation(); val.onRevertir(nodo.code); }} title="Revertir la validación (la alerta reaparece)" className="whitespace-nowrap rounded px-1 text-[10.5px] font-medium text-ink-400 hover:bg-ink-100 hover:text-ink-600 disabled:opacity-60">
            {val.codigoRevirtiendo === nodo.code ? (
              <EstadoProcesando>Revirtiendo</EstadoProcesando>
            ) : (
              "Revertir"
            )}
          </button>
        )}
      </span>
    );
  }
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <Chip label={label} tone="err" />
      {val.puede && (
        <button type="button" onClick={(e) => { e.stopPropagation(); val.onOk(nodo, tipo); }} title="Dar OK a esta alerta (exige un comentario justificativo)" className="whitespace-nowrap rounded border border-ok-500 bg-ok-100 px-1.5 py-0.5 text-[10.5px] font-semibold text-ok-700 hover:bg-ok-500 hover:text-white">Dar OK</button>
      )}
    </span>
  );
}

function celdaMapeo(nodo: NodoBalance, puedeMapear: boolean, onAsignar: (n: NodoBalance) => void): React.ReactNode {
  if (nodo.nivel === 6) return nodo.mapped ? <Chip label="Russell" tone="ok" /> : <Chip label="Sin mapeo" tone="warn" />;
  if (nodo.nivel !== 8) return null;

  const contenido = nodo.std ? (
    <span className="inline-flex items-center gap-1.5 font-mono text-[11.5px] text-blue-500">
      {nodo.coincidencia != null && nodo.coincidencia < 100 ? "≈" : "→"} {nodo.std}
      {nodo.coincidencia != null && (
        <span className={`rounded px-1 text-[10px] font-semibold ${nodo.coincidencia >= 85 ? "bg-ok-100 text-ok-700" : nodo.coincidencia >= 55 ? "bg-warn-100 text-warn-700" : "bg-err-100 text-err-700"}`}>{nodo.coincidencia}%</span>
      )}
    </span>
  ) : (
    <Chip label="Asignar" tone="warn" />
  );

  if (!puedeMapear || nodo.detalleId == null) return contenido;
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onAsignar(nodo); }}
      title="Asignar / cambiar la cuenta estándar"
      className="rounded hover:bg-ink-100"
    >
      {contenido}
    </button>
  );
}

function AsignarModal({ nodo, estandar, onClose }: { nodo: NodoBalance; estandar: EstandarOpcion[]; onClose: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [q, setQ] = useState("");
  const clase = nodo.code.charAt(0);

  const opciones = useMemo(() => {
    const t = q.trim().toLowerCase();
    const base = estandar.filter((o) => (t ? `${o.code} ${o.name}`.toLowerCase().includes(t) : o.code.charAt(0) === clase));
    return base.slice(0, 200);
  }, [estandar, q, clase]);

  const elegir = (codigo: string) => {
    const fd = new FormData();
    fd.set("detalleId", String(nodo.detalleId));
    fd.set("codigo", codigo);
    start(async () => {
      const r = await asignarCuentaEstandar(fd);
      if (r?.ok) { notifySuccess(r.message ?? "Cuenta asignada."); router.refresh(); onClose(); }
      else notifyError(r?.message ?? "No se pudo asignar la cuenta.");
    });
  };

  return (
    <Modal open onClose={onClose} title="Asignar cuenta estándar" size="2xl">
      <div className="flex flex-col gap-3">
        <p className="text-[12.5px] text-ink-600">
          Cuenta del cliente <span className="font-mono font-semibold">{nodo.code}</span> — {nodo.name}.
          Elige la cuenta del <span className="font-semibold">plan estándar Russell</span> (nivel 6) a la que corresponde.
        </p>
        <p className="rounded-md bg-blue-50 px-3 py-2 text-[11.5px] text-blue-700">
          Se aplicará a <span className="font-semibold">todas las cuentas que inician con {nodo.code.slice(0, 6)}</span> (mismo nivel 6) en este balance.
        </p>
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={`Filtra por código o nombre… (por defecto, clase ${clase})`}
          className="rounded-md border border-ink-200 bg-white px-2.5 py-2 text-[12.5px] text-ink-700 outline-none focus:border-blue-400"
        />
        <div className="max-h-80 overflow-y-auto rounded-md border border-ink-150">
          {opciones.length === 0 ? (
            <div className="px-3 py-4 text-center text-[12px] text-ink-400">Sin coincidencias.</div>
          ) : (
            opciones.map((o) => (
              <button
                key={o.code}
                type="button"
                disabled={pending}
                onClick={() => elegir(o.code)}
                className="flex w-full items-center gap-3 border-b border-ink-50 px-3 py-2 text-left last:border-0 hover:bg-ink-50 disabled:opacity-60"
              >
                <span className="font-mono text-[11.5px] font-semibold text-ink-700">{o.code}</span>
                <span className="text-[12.5px] text-ink-700">{o.name}</span>
                {o.code === nodo.std && <span className="ml-auto"><Chip label="Actual" tone="ok" /></span>}
              </button>
            ))
          )}
        </div>
        {pending && <p className="text-[12px] text-ink-500"><EstadoProcesando>Asignando</EstadoProcesando></p>}
      </div>
    </Modal>
  );
}

/** Comentarios de una cuenta puntual del balance (anclados por su código). */
function ComentarModal({ nodo, balanceId, onClose }: { nodo: NodoBalance; balanceId: number; onClose: () => void }) {
  const router = useRouter();
  return (
    <Modal open onClose={onClose} title={`Comentarios · ${nodo.code} — ${nodo.name}`} size="2xl">
      {/* Al publicar, refresca la página para que el badge azul de comentarios del
          informe (conteo por cuenta, calculado server-side) se actualice. */}
      <Conversacion tipo="balance" entityId={balanceId} anchor={nodo.code} titulo={`${NIVEL_LABEL[nodo.nivel]} ${nodo.code} · ${nodo.name}`} onPublicado={() => router.refresh()} />
    </Modal>
  );
}

/** Validar (dar OK a) una alerta: exige un comentario justificativo. El comentario
 *  se publica en la conversación de la cuenta y la alerta se retira de la vista. */
function ValidarModal({ nodo, tipo, balanceId, onClose }: { nodo: NodoBalance; tipo: string; balanceId: number; onClose: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [texto, setTexto] = useState("");
  const label = tipo === "naturaleza" ? "Naturaleza" : "Saldo contrario";
  const listo = texto.trim().length >= 3;
  const guardar = () => {
    if (!listo) { notifyError("Escribe un comentario para validar la alerta."); return; }
    start(async () => {
      const r = await validarAlerta({ balanceId, anchor: nodo.code, tipoAlerta: tipo, comentario: texto.trim() });
      if (r.ok) { notifySuccess(r.message ?? "Alerta validada."); router.refresh(); onClose(); }
      else notifyError(r.message ?? "No se pudo validar la alerta.");
    });
  };
  return (
    <Modal open onClose={onClose} title={`Validar alerta · ${label}`} size="lg">
      <div className="flex flex-col gap-3">
        <p className="text-[12.5px] text-ink-600">
          Cuenta <span className="font-mono font-semibold">{nodo.code}</span> — {nodo.name}. Vas a dar <span className="font-semibold">OK</span> a la alerta de <span className="font-semibold">{label.toLowerCase()}</span>: la alerta se retira de la vista y queda registrada como validada.
        </p>
        <p className="rounded-md bg-blue-50 px-3 py-2 text-[11.5px] text-blue-700">
          El <span className="font-semibold">comentario es obligatorio</span> — justifica por qué el saldo es correcto pese a la alerta. Se publicará en la conversación de la cuenta.
        </p>
        <textarea
          autoFocus
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          rows={4}
          placeholder="Comentario obligatorio: motivo por el que esta cuenta está correcta…"
          className="min-h-[96px] resize-y rounded-md border border-ink-200 px-3 py-2 text-[12.5px] text-ink-700 outline-none focus:border-blue-400"
        />
        <div className="flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} disabled={pending} className="rounded-md border border-ink-200 px-3 py-1.5 text-[12.5px] text-ink-600 hover:bg-ink-50 disabled:opacity-60">Cancelar</button>
          <button type="button" onClick={guardar} disabled={pending || !listo} className="rounded-md bg-ok-700 px-3 py-1.5 text-[12.5px] font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50">
            {pending ? <EstadoProcesando>Validando</EstadoProcesando> : "Validar y dar OK"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

/** Confirmación para eliminar una cuenta (línea de detalle) del balance oficial. */
function EliminarModal({ nodo, onClose }: { nodo: NodoBalance; onClose: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const eliminar = () => {
    if (nodo.detalleId == null) return;
    start(async () => {
      const r = await eliminarDetalleBalance(nodo.detalleId!);
      if (r.ok) { notifySuccess(r.message ?? "Cuenta eliminada."); router.refresh(); onClose(); }
      else notifyError(r.message ?? "No se pudo eliminar la cuenta.");
    });
  };
  return (
    <Modal open onClose={onClose} title="Eliminar registro del balance" size="lg">
      <div className="flex flex-col gap-3">
        <p className="text-[12.5px] text-ink-600">
          Vas a eliminar del balance el registro <span className="font-semibold">{nodo.name}</span>
          {nodo.code ? <span className="font-mono text-ink-500"> ({nodo.code})</span> : null}
          {" "}— saldo {fmt(nodo.balance)}. Se quita del detalle y los totales/mapeo se recalculan.
        </p>
        <p className="rounded-md bg-err-100 px-3 py-2 text-[11.5px] text-err-700">
          Esta acción no se puede deshacer. Úsala para retirar filas que no son cuentas (p. ej. «Totales Prueba», totales del reporte).
        </p>
        <div className="flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} disabled={pending} className="rounded-md border border-ink-200 px-3 py-1.5 text-[12.5px] text-ink-600 hover:bg-ink-50 disabled:opacity-60">Cancelar</button>
          <button type="button" onClick={eliminar} disabled={pending} className="rounded-md bg-err-700 px-3 py-1.5 text-[12.5px] font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50">
            {pending ? <EstadoProcesando>Eliminando</EstadoProcesando> : "Eliminar registro"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

/** Saldos totales por clase contable (PUC) + indicador de cuadre. Chequeo rápido de completitud. */
function ClasesTab({ sums, balanced, diffCuadre }: { sums: Sums; balanced: boolean; diffCuadre: number }) {
  const fila = (label: string, valor: number, bold = false) => (
    <div className="flex items-center justify-between border-b border-ink-100 px-4 py-2.5 last:border-0">
      <span className={`text-[12.5px] ${bold ? "font-semibold text-ink-800" : "text-ink-600"}`}>{label}</span>
      <span className={`whitespace-nowrap font-mono text-[13px] ${bold ? "font-semibold text-ink-800" : "text-ink-700"}`}>{fmt(valor)}</span>
    </div>
  );
  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2 border-b border-ink-100 px-4 py-2.5">
        <span className="text-[11.5px] text-ink-500">Totales por clase contable (PUC). Sirve para confirmar que el balance subió completo y cuadrado.</span>
        <span className="ml-auto inline-flex items-center gap-2">
          <span className="text-[11.5px] text-ink-500" title="Σ saldos firmados (débito − crédito) ≈ 0">Cuadre</span>
          {balanced ? <Chip label="Cuadrado" tone="ok" /> : <Chip label={`Descuadra · dif ${fmt(diffCuadre)}`} tone="err" />}
        </span>
      </div>
      <div className="grid gap-4 p-4 md:grid-cols-2">
        <div className="overflow-hidden rounded-lg border border-ink-100">
          <div className="border-b border-ink-100 bg-ink-50 px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-ink-500">Balance general</div>
          {fila("Activo", sums.activo)}
          {fila("Pasivo", sums.pasivo)}
          {fila("Patrimonio", sums.patrimonio)}
        </div>
        <div className="overflow-hidden rounded-lg border border-ink-100">
          <div className="border-b border-ink-100 bg-ink-50 px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-ink-500">Estado de resultado</div>
          {fila("Ingresos", sums.ingresos)}
          {fila("Costos", sums.costos)}
          {fila("Gastos", sums.gastos)}
          {fila("Utilidad", sums.utilidad, true)}
        </div>
      </div>
    </Card>
  );
}

function ValidationsTab({ validations }: { validations: Validation[] }) {
  const { filaSeleccionada, onClickFila, onDoubleClickFila } = useSeleccionFilaTabla();
  return (
    <Card>
      <div className="overflow-x-auto">
        <table className="balance-detail-row-hover w-full text-[12.5px]">
          <thead>
            <tr className="border-b border-ink-100 text-left text-[11px] uppercase tracking-wider text-ink-500">
              <th className="px-4 py-2 font-semibold">Regla</th>
              <th className="px-4 py-2 font-semibold">Estado</th>
              <th className="px-4 py-2 font-semibold">Detalle</th>
            </tr>
          </thead>
          <tbody onClick={onClickFila} onDoubleClick={onDoubleClickFila}>
            {validations.map((v) => (
              <tr key={v.id} data-selection-key={v.id} data-selected={filaSeleccionada === v.id ? "true" : undefined} className="border-b border-ink-100 last:border-0">
                <td className="px-4 py-2.5 font-medium text-ink-800">{v.rule}</td>
                <td className="px-4 py-2.5">{v.status === "ok" ? <Chip label="OK" tone="ok" /> : <Chip label={`${v.count ?? ""} ${v.count === 1 ? "alerta" : "alertas"}`} tone="warn" />}</td>
                <td className="px-4 py-2.5 text-ink-500">{v.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function VersionsTab({ versions, officialVersion }: { versions: Version[]; officialVersion: string }) {
  const { filaSeleccionada, onClickFila, onDoubleClickFila } = useSeleccionFilaTabla();
  return (
    <Card>
      <div className="overflow-x-auto">
        <table className="balance-detail-row-hover w-full text-[12.5px]">
          <thead>
            <tr className="border-b border-ink-100 text-left text-[11px] uppercase tracking-wider text-ink-500">
              <th className="px-4 py-2 font-semibold">Versión</th>
              <th className="px-4 py-2 font-semibold">Fecha</th>
              <th className="px-4 py-2 font-semibold">Cargado por</th>
              <th className="px-4 py-2 font-semibold">Archivo</th>
              <th className="whitespace-nowrap border-l border-ink-150 px-4 py-2 text-right font-semibold">Cuentas</th>
              <th className="whitespace-nowrap border-l border-ink-150 px-4 py-2 text-right font-semibold">Activo</th>
              <th className="border-l border-ink-150 px-4 py-2 font-semibold">Cuadrado</th>
              <th className="whitespace-nowrap border-l border-ink-150 px-4 py-2 text-right font-semibold">Cambios</th>
              <th className="px-4 py-2 font-semibold">Nota</th>
            </tr>
          </thead>
          <tbody onClick={onClickFila} onDoubleClick={onDoubleClickFila}>
            {versions.map((v, i) => (
              <tr key={v.v} data-selection-key={v.v} data-selected={filaSeleccionada === v.v ? "true" : undefined} className="border-b border-ink-100 last:border-0 align-top">
                <td className="px-4 py-2.5">{v.v === officialVersion ? <Chip label={`${v.v} · oficial`} tone="ok" /> : <Chip label={v.v} tone="ink" />}</td>
                <td className="whitespace-nowrap px-4 py-2.5 font-mono text-ink-500">{v.date}</td>
                <td className="px-4 py-2.5"><div className="font-medium text-ink-800">{v.uploadedBy}</div><div className="text-[11px] text-ink-400">{v.role}</div></td>
                <td className="px-4 py-2.5 text-ink-600">{v.file}<div className="text-[11px] text-ink-400">{v.size}</div></td>
                <td className="whitespace-nowrap border-l border-ink-150 px-4 py-2.5 text-right font-mono text-ink-700">{v.rows}</td>
                <td className="whitespace-nowrap border-l border-ink-150 px-4 py-2.5 text-right font-mono text-ink-700">{fmt(v.sumA)}</td>
                <td className="border-l border-ink-150 px-4 py-2.5">{v.balanced ? <Chip label="Sí" tone="ok" /> : <Chip label="Descuadra" tone="err" />}</td>
                <td className="whitespace-nowrap border-l border-ink-150 px-4 py-2.5 text-right font-mono text-ink-600">{i === versions.length - 1 ? "—" : `+${v.changes}`}</td>
                <td className="px-4 py-2.5 text-ink-500">{v.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function TabBtn({ on, onClick, label, count }: { on: boolean; onClick: () => void; label: string; count?: number }) {
  return (
    <button onClick={onClick} className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12.5px] font-medium transition ${on ? "bg-navy-800 text-white" : "text-ink-600 hover:bg-ink-100"}`}>
      {label}
      {count != null && <span className={`rounded-full px-1.5 text-[10px] font-semibold ${on ? "bg-white/20 text-white" : "bg-ink-100 text-ink-500"}`}>{count}</span>}
    </button>
  );
}

function FiltroBtn({ on, onClick, label, count, tone }: { on: boolean; onClick: () => void; label: string; count?: number; tone?: "warn" }) {
  return (
    <button onClick={onClick} className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11.5px] font-medium transition ${on ? "bg-navy-700 text-white" : "border border-ink-200 text-ink-600 hover:bg-ink-50"}`}>
      {label}
      {count != null && count > 0 && (
        <span className={`rounded-full px-1.5 text-[10px] font-semibold ${on ? "bg-white/20 text-white" : tone === "warn" ? "bg-warn-100 text-warn-700" : "bg-ink-100 text-ink-500"}`}>{count}</span>
      )}
    </button>
  );
}
