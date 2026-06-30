"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { Card, Chip } from "@/components/ui";
import { Modal } from "@/components/modal";
import { fmt, fmtPct } from "@/lib/format";
import { notifyError, notifySuccess } from "@/lib/client-notifications";
import { asignarCuentaEstandar, prevalidarHomologacion, type Prevalidacion, type AlertaHomologacion, type DesfaseNivel } from "@/app/actions/balance";
import Conversacion from "@/components/conversacion";
import type { NodoBalance } from "@/lib/balance/calcular";

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
const NIVEL_LABEL: Record<number, string> = { 2: "Clase", 4: "Subgrupo", 6: "Cta. estándar", 8: "Cta. cliente" };

export default function BalanceDetailClient({
  arbol, estandar, puedeMapear, validations, versions, officialVersion, warnCount, balanceId, comentarios, sums, balanced, diffCuadre,
}: {
  arbol: NodoBalance[]; estandar: EstandarOpcion[]; puedeMapear: boolean; validations: Validation[]; versions: Version[]; officialVersion: string; warnCount: number; balanceId: number; comentarios: Record<string, number>; sums: Sums; balanced: boolean; diffCuadre: number;
}) {
  const [tab, setTab] = useState<Tab>("breakdown");
  const [prevalid, setPrevalid] = useState<Prevalidacion | null>(null);
  const [pendingPrev, startPrev] = useTransition();
  function correrPrevalidador() {
    startPrev(async () => {
      const r = await prevalidarHomologacion(balanceId);
      if (!r.ok) { notifyError(r.message ?? "No se pudo prevalidar."); return; }
      setPrevalid(r);
    });
  }
  return (
    <div className="mt-5">
      <div className="mb-3 flex items-center gap-2">
        <TabBtn on={tab === "breakdown"} onClick={() => setTab("breakdown")} label="Detalle por niveles" />
        <TabBtn on={tab === "validations"} onClick={() => setTab("validations")} label="Validaciones" count={warnCount} />
        <TabBtn on={tab === "versions"} onClick={() => setTab("versions")} label="Versiones" count={versions.length} />
        <TabBtn on={tab === "clases"} onClick={() => setTab("clases")} label="Saldos por clase" />
        <button
          onClick={correrPrevalidador}
          disabled={pendingPrev}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-brand-200 bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-100 disabled:opacity-60"
          title="Verifica que las cuentas homologadas cuadren en valores por clase y subgrupo"
        >
          {!pendingPrev && <Icon name="check" size={14} />}
          {pendingPrev ? "Prevalidando…" : "Prevalidador cuentas homologadas"}
        </button>
      </div>
      {prevalid && <PrevalidadorModal data={prevalid} onClose={() => setPrevalid(null)} />}
      {tab === "breakdown" && <BreakdownTab arbol={arbol} estandar={estandar} puedeMapear={puedeMapear} balanceId={balanceId} comentarios={comentarios} />}
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

/** ¿Hoja con alerta? Cuenta sin mapear (mapeo) o con naturaleza/saldo contrario. */
function esHojaAlerta(n: NodoBalance): boolean {
  const mapeado = n.nivel === 8 ? !!n.std : n.mapped;
  return !mapeado || !n.saldoOk;
}

/** Poda el árbol dejando solo las ramas con alertas (filtro "Alertas"). */
function podarAlertas(nodos: NodoBalance[]): NodoBalance[] {
  const out: NodoBalance[] = [];
  for (const n of nodos) {
    const hijos = podarAlertas(n.hijos);
    const self = (n.hijos.length === 0 && esHojaAlerta(n)) || (n.nivel === 6 && !n.mapped);
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

/** Cuenta de alertas (mapeo / naturaleza) por nodo, sumando sus hojas. */
function contarAlertas(arbol: NodoBalance[]): Map<string, Conteo> {
  const m = new Map<string, Conteo>();
  const walk = (n: NodoBalance): Conteo => {
    let r: Conteo;
    if (n.hijos.length === 0) {
      const mapeado = n.nivel === 8 ? !!n.std : n.mapped;
      r = { mapeo: mapeado ? 0 : 1, naturaleza: n.saldoOk ? 0 : 1 };
    } else {
      r = n.hijos.reduce<Conteo>((a, h) => { const c = walk(h); return { mapeo: a.mapeo + c.mapeo, naturaleza: a.naturaleza + c.naturaleza }; }, { mapeo: 0, naturaleza: 0 });
    }
    m.set(n.key, r);
    return r;
  };
  arbol.forEach(walk);
  return m;
}

function BreakdownTab({ arbol, estandar, puedeMapear, balanceId, comentarios }: { arbol: NodoBalance[]; estandar: EstandarOpcion[]; puedeMapear: boolean; balanceId: number; comentarios: Record<string, number> }) {
  const [filtro, setFiltro] = useState<Filtro>("todo");
  const [q, setQ] = useState("");
  // Por defecto: expandido hasta nivel 6 (clase y subgrupo abiertos; cuentas del cliente colapsadas).
  const [open, setOpen] = useState<Set<string>>(() => new Set(keysConHijos(arbol).filter((k) => k.split("/").length <= 2)));
  const [asignar, setAsignar] = useState<NodoBalance | null>(null);
  const [comentar, setComentar] = useState<NodoBalance | null>(null);

  // Conteo de alertas (mapeo / naturaleza) por nodo + totales del balance.
  const conteos = useMemo(() => contarAlertas(arbol), [arbol]);
  const totales = useMemo(
    () => arbol.reduce<Conteo>((a, n) => { const c = conteos.get(n.key); return { mapeo: a.mapeo + (c?.mapeo ?? 0), naturaleza: a.naturaleza + (c?.naturaleza ?? 0) }; }, { mapeo: 0, naturaleza: 0 }),
    [arbol, conteos],
  );
  const totalAlertas = totales.mapeo + totales.naturaleza;

  const visible = useMemo(() => {
    let base: NodoBalance[];
    if (filtro === "balance") base = arbol.filter((n) => CLASES_BALANCE.has(n.clase));
    else if (filtro === "er") base = arbol.filter((n) => CLASES_ER.has(n.clase));
    else if (filtro === "alertas") base = podarAlertas(arbol);
    else base = arbol;
    const needle = q.trim().toLowerCase();
    return needle ? podarBusqueda(base, needle) : base;
  }, [arbol, filtro, q]);

  // En el filtro "Alertas" el árbol podado se muestra totalmente expandido.
  const openEff = useMemo(() => (filtro === "alertas" || q.trim() ? new Set(keysConHijos(visible)) : open), [filtro, visible, open, q]);

  const toggle = (key: string) => setOpen((o) => { const n = new Set(o); if (n.has(key)) n.delete(key); else n.add(key); return n; });
  const expandirTodo = () => setOpen(new Set(keysConHijos(arbol)));
  const contraerTodo = () => setOpen(new Set());

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2 border-b border-ink-100 px-4 py-2.5">
        <span className="text-[11.5px] text-ink-500">Normalizado al <span className="font-semibold text-ink-700">plan estándar Russell</span>: clase → subgrupo → cuenta estándar → cuenta del cliente.</span>
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
          <button onClick={expandirTodo} className="rounded-md border border-ink-200 px-2 py-1 text-[11.5px] font-medium text-ink-600 hover:bg-ink-50">Expandir todo</button>
          <button onClick={contraerTodo} className="rounded-md border border-ink-200 px-2 py-1 text-[11.5px] font-medium text-ink-600 hover:bg-ink-50">Contraer todo</button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="border-b border-ink-100 text-left text-[11px] uppercase tracking-wider text-ink-500">
              <th className="px-4 py-2 font-semibold">Código</th>
              <th className="px-4 py-2 font-semibold">Cuenta</th>
              <th className="px-4 py-2 font-semibold">Mapeo estándar</th>
              <th className="px-4 py-2 text-right font-semibold">Saldo anterior</th>
              <th className="px-4 py-2 text-right font-semibold">Débito</th>
              <th className="px-4 py-2 text-right font-semibold">Crédito</th>
              <th className="px-4 py-2 text-right font-semibold">Saldo</th>
              <th className="px-4 py-2 text-right font-semibold">Var %</th>
              <th className="px-4 py-2 font-semibold">Validación</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr><td colSpan={9} className="px-4 py-6 text-center text-[12.5px] text-ink-400">{q.trim() ? "Sin cuentas que coincidan con la búsqueda." : filtro === "alertas" ? "Sin alertas de mapeo ni de naturaleza. 🎉" : "Sin cuentas para este filtro."}</td></tr>
            ) : (
              visible.flatMap((n) => filas(n, 0, openEff, toggle, puedeMapear, setAsignar, conteos, comentarios, setComentar))
            )}
          </tbody>
        </table>
      </div>
      {asignar && <AsignarModal nodo={asignar} estandar={estandar} onClose={() => setAsignar(null)} />}
      {comentar && <ComentarModal nodo={comentar} balanceId={balanceId} onClose={() => setComentar(null)} />}
    </Card>
  );
}

/** Renderiza recursivamente las filas (nodo + hijos si está expandido). */
function filas(nodo: NodoBalance, depth: number, open: Set<string>, toggle: (k: string) => void, puedeMapear: boolean, onAsignar: (n: NodoBalance) => void, conteos: Map<string, Conteo>, comentarios: Record<string, number>, onComentar: (n: NodoBalance) => void): React.ReactElement[] {
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
      className={`border-b border-ink-50 ${esGrupo ? (sinMapeo ? "bg-warn-100" : nodo.nivel <= 2 ? "bg-ink-100" : "bg-ink-50") : "hover:bg-ink-50"} ${tieneHijos ? "cursor-pointer" : ""}`}
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
      </td>
      <td className="px-4 py-2">{celdaMapeo(nodo, puedeMapear, onAsignar)}</td>
      <td className="px-4 py-2 text-right font-mono text-ink-400">{fmt(nodo.prevBalance)}</td>
      <td className="px-4 py-2 text-right font-mono text-ink-600">{fmt(nodo.debe)}</td>
      <td className="px-4 py-2 text-right font-mono text-ink-600">{fmt(nodo.haber)}</td>
      <td className={`px-4 py-2 text-right font-mono ${esGrupo ? "font-semibold text-ink-800" : "text-ink-700"}`}>{fmt(nodo.balance)}</td>
      <td className={`px-4 py-2 text-right font-mono ${nodo.variation != null && Math.abs(nodo.variation) > 25 ? "text-warn-700" : "text-ink-600"}`}>{fmtPct(nodo.variation)}</td>
      <td className="px-4 py-2">{!nodo.saldoOk ? <Chip label={nodo.nivel === 8 ? "Naturaleza" : "Saldo contrario"} tone="err" /> : nodo.nivel === 6 && nodo.mapped ? <Chip label="OK" tone="ok" /> : null}</td>
    </tr>
  );

  if (!tieneHijos || !isOpen) return [fila];
  return [fila, ...nodo.hijos.flatMap((h) => filas(h, depth + 1, open, toggle, puedeMapear, onAsignar, conteos, comentarios, onComentar))];
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
        {pending && <p className="text-[12px] text-ink-500">Asignando…</p>}
      </div>
    </Modal>
  );
}

/** Comentarios de una cuenta puntual del balance (anclados por su código). */
function ComentarModal({ nodo, balanceId, onClose }: { nodo: NodoBalance; balanceId: number; onClose: () => void }) {
  return (
    <Modal open onClose={onClose} title={`Comentarios · ${nodo.code} — ${nodo.name}`} size="2xl">
      <Conversacion tipo="balance" entityId={balanceId} anchor={nodo.code} titulo={`${NIVEL_LABEL[nodo.nivel]} ${nodo.code} · ${nodo.name}`} />
    </Modal>
  );
}

/** Saldos totales por clase contable (PUC) + indicador de cuadre. Chequeo rápido de completitud. */
function ClasesTab({ sums, balanced, diffCuadre }: { sums: Sums; balanced: boolean; diffCuadre: number }) {
  const fila = (label: string, valor: number, bold = false) => (
    <div className="flex items-center justify-between border-b border-ink-50 px-4 py-2.5 last:border-0">
      <span className={`text-[12.5px] ${bold ? "font-semibold text-ink-800" : "text-ink-600"}`}>{label}</span>
      <span className={`font-mono text-[13px] ${bold ? "font-semibold text-ink-800" : "text-ink-700"}`}>{fmt(valor)}</span>
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
  return (
    <Card>
      <div className="overflow-x-auto">
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="border-b border-ink-100 text-left text-[11px] uppercase tracking-wider text-ink-500">
              <th className="px-4 py-2 font-semibold">Regla</th>
              <th className="px-4 py-2 font-semibold">Estado</th>
              <th className="px-4 py-2 font-semibold">Detalle</th>
            </tr>
          </thead>
          <tbody>
            {validations.map((v) => (
              <tr key={v.id} className="border-b border-ink-50 last:border-0">
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
  return (
    <Card>
      <div className="overflow-x-auto">
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="border-b border-ink-100 text-left text-[11px] uppercase tracking-wider text-ink-500">
              <th className="px-4 py-2 font-semibold">Versión</th>
              <th className="px-4 py-2 font-semibold">Fecha</th>
              <th className="px-4 py-2 font-semibold">Cargado por</th>
              <th className="px-4 py-2 font-semibold">Archivo</th>
              <th className="px-4 py-2 text-right font-semibold">Cuentas</th>
              <th className="px-4 py-2 text-right font-semibold">Activo</th>
              <th className="px-4 py-2 font-semibold">Cuadrado</th>
              <th className="px-4 py-2 text-right font-semibold">Cambios</th>
              <th className="px-4 py-2 font-semibold">Nota</th>
            </tr>
          </thead>
          <tbody>
            {versions.map((v, i) => (
              <tr key={v.v} className="border-b border-ink-50 last:border-0 align-top">
                <td className="px-4 py-2.5">{v.v === officialVersion ? <Chip label={`${v.v} · oficial`} tone="ok" /> : <Chip label={v.v} tone="ink" />}</td>
                <td className="px-4 py-2.5 font-mono text-ink-500">{v.date}</td>
                <td className="px-4 py-2.5"><div className="font-medium text-ink-800">{v.uploadedBy}</div><div className="text-[11px] text-ink-400">{v.role}</div></td>
                <td className="px-4 py-2.5 text-ink-600">{v.file}<div className="text-[11px] text-ink-400">{v.size}</div></td>
                <td className="px-4 py-2.5 text-right font-mono text-ink-700">{v.rows}</td>
                <td className="px-4 py-2.5 text-right font-mono text-ink-700">{fmt(v.sumA)}</td>
                <td className="px-4 py-2.5">{v.balanced ? <Chip label="Sí" tone="ok" /> : <Chip label="Descuadra" tone="err" />}</td>
                <td className="px-4 py-2.5 text-right font-mono text-ink-600">{i === versions.length - 1 ? "—" : `+${v.changes}`}</td>
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

const MOTIVO_LABEL: Record<AlertaHomologacion["motivo"], string> = {
  sin_homologar: "Sin homologar",
  cambia_clase: "Cambia de clase",
  cambia_subgrupo: "Cambia de subgrupo",
};
const MOTIVO_CHIP: Record<AlertaHomologacion["motivo"], string> = {
  sin_homologar: "bg-ink-100 text-ink-600",
  cambia_clase: "bg-warn-100 text-warn-700",
  cambia_subgrupo: "bg-brand-50 text-brand-700",
};
function deATexto(a: AlertaHomologacion): string {
  if (a.motivo === "sin_homologar") return "— (sin cuenta estándar)";
  if (a.motivo === "cambia_clase") return `clase ${a.claseCliente} → ${a.claseRussell}`;
  return `subgrupo ${a.subgrupoCliente} → ${a.subgrupoRussell}`;
}

/** Modal del Prevalidador: cuadre de la homologación por clase/subgrupo + cuentas a reclasificar. */
function PrevalidadorModal({ data, onClose }: { data: Prevalidacion; onClose: () => void }) {
  const cuadraTodo = data.cuadradoClase && data.cuadradoSubgrupo && data.alertas.length === 0;
  const chip = (ok: boolean) => `rounded-full px-2 py-0.5 font-semibold ${ok ? "bg-ok-100 text-ok-700" : "bg-warn-100 text-warn-700"}`;
  return (
    <Modal open onClose={onClose} title="Prevalidador de cuentas homologadas" size="2xl">
      <div className="flex max-h-[68vh] flex-col gap-4 overflow-auto pr-1">
        <div className="flex flex-wrap items-center gap-2 text-[11.5px]">
          <span className="text-ink-500">{data.homologadas} de {data.totalCuentas} cuentas homologadas</span>
          <span className={chip(data.cuadradoClase)}>Clase: {data.cuadradoClase ? "cuadra" : "no cuadra"}</span>
          <span className={chip(data.cuadradoSubgrupo)}>Subgrupo: {data.cuadradoSubgrupo ? "cuadra" : "no cuadra"}</span>
        </div>

        {cuadraTodo ? (
          <div className="flex items-center gap-2 rounded-lg border border-ok-100 bg-ok-50 px-4 py-3 text-sm text-ok-700">
            <Icon name="check" size={16} />
            Las cuentas homologadas cuadran en valores a nivel de clase y subgrupo. No hay nada que reclasificar.
          </div>
        ) : (
          <>
            <p className="text-[11.5px] text-ink-500">
              La homologación movió o dejó sin clasificar valor. Cada nivel compara el total por el código del <b>cliente</b> contra el de la <b>cuenta estándar</b>; las cuentas que rompen el cuadre se listan abajo para reclasificar.
            </p>
            {data.clases.length > 0 && <NivelTabla titulo="Clases con descuadre" filas={data.clases} />}
            {data.subgrupos.length > 0 && <NivelTabla titulo="Subgrupos con descuadre" filas={data.subgrupos} />}
            {data.alertas.length > 0 && (
              <div>
                <h4 className="mb-1.5 text-xs font-semibold text-ink-700">Cuentas a revisar y reclasificar ({data.alertas.length})</h4>
                <div className="overflow-hidden rounded-lg border border-ink-100">
                  <table className="w-full text-[11.5px]">
                    <thead className="bg-ink-50 text-ink-500">
                      <tr>
                        <th className="px-2 py-1.5 text-left font-semibold">Cuenta</th>
                        <th className="px-2 py-1.5 text-left font-semibold">Motivo</th>
                        <th className="px-2 py-1.5 text-left font-semibold">De → A</th>
                        <th className="px-2 py-1.5 text-right font-semibold">Saldo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.alertas.map((a) => (
                        <tr key={a.code} className="border-t border-ink-50">
                          <td className="px-2 py-1.5"><span className="font-mono text-ink-700">{a.code}</span> <span className="text-ink-500">{a.name}</span></td>
                          <td className="px-2 py-1.5"><span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${MOTIVO_CHIP[a.motivo]}`}>{MOTIVO_LABEL[a.motivo]}</span></td>
                          <td className="px-2 py-1.5 text-ink-600">{deATexto(a)}</td>
                          <td className="px-2 py-1.5 text-right font-mono tabular-nums text-ink-700">{fmt(a.saldo)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="mt-2 text-[11px] text-ink-400">Para reclasificar: cierra este modal, abre la cuenta en «Detalle por niveles» y reasigna su cuenta estándar.</p>
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}

function NivelTabla({ titulo, filas }: { titulo: string; filas: DesfaseNivel[] }) {
  return (
    <div>
      <h4 className="mb-1.5 text-xs font-semibold text-ink-700">{titulo}</h4>
      <div className="overflow-hidden rounded-lg border border-ink-100">
        <table className="w-full text-[11.5px]">
          <thead className="bg-ink-50 text-ink-500">
            <tr>
              <th className="px-2 py-1.5 text-left font-semibold">Nivel</th>
              <th className="px-2 py-1.5 text-right font-semibold">Total cliente</th>
              <th className="px-2 py-1.5 text-right font-semibold">Total estándar</th>
              <th className="px-2 py-1.5 text-right font-semibold">Diferencia</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.codigo} className="border-t border-ink-50">
                <td className="px-2 py-1.5"><span className="font-mono text-ink-700">{f.codigo}</span> <span className="text-ink-500">{f.nombre}</span></td>
                <td className="px-2 py-1.5 text-right font-mono tabular-nums text-ink-600">{fmt(f.totalCliente)}</td>
                <td className="px-2 py-1.5 text-right font-mono tabular-nums text-ink-600">{fmt(f.totalRussell)}</td>
                <td className="px-2 py-1.5 text-right font-mono tabular-nums font-semibold text-warn-700">{fmt(f.diferencia)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
