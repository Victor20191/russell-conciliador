"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { Card, Chip } from "@/components/ui";
import { Modal } from "@/components/modal";
import { fmt, fmtPct } from "@/lib/format";
import { notifyError, notifySuccess } from "@/lib/client-notifications";
import { asignarCuentaEstandar } from "@/app/actions/balance";
import type { NodoBalance } from "@/lib/balance/calcular";

export type Sums = { activo: number; pasivo: number; patrimonio: number; ingresos: number; gastos: number; costos: number; utilidad: number };
export type Validation = { id: string; rule: string; status: string; detail: string; count?: number };
export type EstandarOpcion = { code: string; name: string };
export type Meta = { rows: number; mapped: number; unmapped: number; critical: number; file: string; fileSize: string; frozenBy: string; frozenAt: string; uploadedBy: string; uploadedAt: string };
export type Version = { v: string; date: string; uploadedBy: string; role: string; file: string; size: string; rows: number; sumA: number; balanced: boolean; note: string; changes: number };

type Tab = "breakdown" | "validations" | "versions";
type Filtro = "todo" | "balance" | "er";

const CLASES_BALANCE = new Set(["1", "2", "3"]);
const CLASES_ER = new Set(["4", "5", "6", "7"]);

export default function BalanceDetailClient({
  arbol, estandar, puedeMapear, validations, versions, officialVersion, warnCount,
}: {
  arbol: NodoBalance[]; estandar: EstandarOpcion[]; puedeMapear: boolean; validations: Validation[]; versions: Version[]; officialVersion: string; warnCount: number;
}) {
  const [tab, setTab] = useState<Tab>("breakdown");
  return (
    <div className="mt-5">
      <div className="mb-3 flex items-center gap-2">
        <TabBtn on={tab === "breakdown"} onClick={() => setTab("breakdown")} label="Detalle por niveles" />
        <TabBtn on={tab === "validations"} onClick={() => setTab("validations")} label="Validaciones" count={warnCount} />
        <TabBtn on={tab === "versions"} onClick={() => setTab("versions")} label="Versiones" count={versions.length} />
      </div>
      {tab === "breakdown" && <BreakdownTab arbol={arbol} estandar={estandar} puedeMapear={puedeMapear} />}
      {tab === "validations" && <ValidationsTab validations={validations} />}
      {tab === "versions" && <VersionsTab versions={versions} officialVersion={officialVersion} />}
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

function BreakdownTab({ arbol, estandar, puedeMapear }: { arbol: NodoBalance[]; estandar: EstandarOpcion[]; puedeMapear: boolean }) {
  const [filtro, setFiltro] = useState<Filtro>("todo");
  // Por defecto: expandido hasta nivel 6 (clase y subgrupo abiertos; cuentas del cliente colapsadas).
  const [open, setOpen] = useState<Set<string>>(() => new Set(keysConHijos(arbol).filter((k) => k.split("/").length <= 2)));
  const [asignar, setAsignar] = useState<NodoBalance | null>(null);

  const visible = useMemo(
    () => arbol.filter((n) => (filtro === "todo" ? true : filtro === "balance" ? CLASES_BALANCE.has(n.clase) : CLASES_ER.has(n.clase))),
    [arbol, filtro],
  );

  const toggle = (key: string) => setOpen((o) => { const n = new Set(o); if (n.has(key)) n.delete(key); else n.add(key); return n; });
  const expandirTodo = () => setOpen(new Set(keysConHijos(arbol)));
  const contraerTodo = () => setOpen(new Set());

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2 border-b border-ink-100 px-4 py-2.5">
        <span className="text-[11.5px] text-ink-500">Normalizado al <span className="font-semibold text-ink-700">plan estándar Russell</span>: clase → subgrupo → cuenta estándar → cuenta del cliente.</span>
        <div className="ml-auto flex items-center gap-1.5">
          <FiltroBtn on={filtro === "todo"} onClick={() => setFiltro("todo")} label="Todo" />
          <FiltroBtn on={filtro === "balance"} onClick={() => setFiltro("balance")} label="Balance" />
          <FiltroBtn on={filtro === "er"} onClick={() => setFiltro("er")} label="Estado de Resultado" />
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
              <tr><td colSpan={9} className="px-4 py-6 text-center text-[12.5px] text-ink-400">Sin cuentas para este filtro.</td></tr>
            ) : (
              visible.flatMap((n) => filas(n, 0, open, toggle, puedeMapear, setAsignar))
            )}
          </tbody>
        </table>
      </div>
      {asignar && <AsignarModal nodo={asignar} estandar={estandar} onClose={() => setAsignar(null)} />}
    </Card>
  );
}

/** Renderiza recursivamente las filas (nodo + hijos si está expandido). */
function filas(nodo: NodoBalance, depth: number, open: Set<string>, toggle: (k: string) => void, puedeMapear: boolean, onAsignar: (n: NodoBalance) => void): React.ReactElement[] {
  const tieneHijos = nodo.hijos.length > 0;
  const isOpen = open.has(nodo.key);
  const esGrupo = nodo.nivel !== 8;
  const sinMapeo = nodo.nivel === 6 && !nodo.mapped;
  const pad = 16 + depth * 18;

  const fila = (
    <tr
      key={nodo.key}
      className={`border-b border-ink-50 ${esGrupo ? (sinMapeo ? "bg-warn-100" : nodo.nivel <= 2 ? "bg-ink-100" : "bg-ink-50") : "hover:bg-ink-50"} ${tieneHijos ? "cursor-pointer" : ""}`}
      onClick={tieneHijos ? () => toggle(nodo.key) : undefined}
    >
      <td className="px-4 py-2 font-mono text-ink-600" style={{ paddingLeft: pad }}>
        {tieneHijos && <span className="mr-1 inline-block align-middle text-ink-400"><Icon name={isOpen ? "chev-d" : "chev-r"} size={12} /></span>}
        <span className={esGrupo ? "font-semibold text-ink-700" : "text-[11.5px] text-ink-500"}>{nodo.code}</span>
      </td>
      <td className={`px-4 py-2 ${esGrupo ? "font-semibold text-ink-800" : "text-ink-700"}`}>
        {nodo.name}
        {nodo.critical && nodo.nivel === 8 && <span className="ml-2"><Chip label="Crítica" tone="warn" /></span>}
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
  return [fila, ...nodo.hijos.flatMap((h) => filas(h, depth + 1, open, toggle, puedeMapear, onAsignar))];
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

function FiltroBtn({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button onClick={onClick} className={`rounded-md px-2.5 py-1 text-[11.5px] font-medium transition ${on ? "bg-navy-700 text-white" : "border border-ink-200 text-ink-600 hover:bg-ink-50"}`}>
      {label}
    </button>
  );
}
