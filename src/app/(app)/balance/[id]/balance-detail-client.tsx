"use client";

import { useState } from "react";
import { Icon } from "@/components/icons";
import { Card, Chip } from "@/components/ui";
import { fmt, fmtPct } from "@/lib/format";

export type Sums = { activo: number; pasivo: number; patrimonio: number; ingresos: number; gastos: number; costos: number; utilidad: number };
export type Validation = { id: string; rule: string; status: string; detail: string; count?: number };
export type BreakdownItem = { code: string; name: string; prevBalance: number; balance: number; debe: number; haber: number; variation: number | null; std: string | null; coincidencia: number | null; saldoOk: boolean; critical: boolean };
export type BreakdownGroup = { code: string; name: string; prevBalance: number; balance: number; debe: number; haber: number; variation: number | null; mapped: boolean; saldoOk: boolean; critical: boolean; items: BreakdownItem[] };
export type Meta = { rows: number; mapped: number; unmapped: number; critical: number; file: string; fileSize: string; frozenBy: string; frozenAt: string; uploadedBy: string; uploadedAt: string };
export type Version = { v: string; date: string; uploadedBy: string; role: string; file: string; size: string; rows: number; sumA: number; balanced: boolean; note: string; changes: number };

type Tab = "breakdown" | "validations" | "versions";

export default function BalanceDetailClient({
  breakdown, validations, versions, officialVersion, warnCount,
}: {
  breakdown: BreakdownGroup[]; validations: Validation[]; versions: Version[]; officialVersion: string; warnCount: number;
}) {
  const [tab, setTab] = useState<Tab>("breakdown");
  return (
    <div className="mt-5">
      <div className="mb-3 flex items-center gap-2">
        <TabBtn on={tab === "breakdown"} onClick={() => setTab("breakdown")} label="Detalle por niveles" />
        <TabBtn on={tab === "validations"} onClick={() => setTab("validations")} label="Validaciones" count={warnCount} />
        <TabBtn on={tab === "versions"} onClick={() => setTab("versions")} label="Versiones" count={versions.length} />
      </div>
      {tab === "breakdown" && <BreakdownTab groups={breakdown} />}
      {tab === "validations" && <ValidationsTab validations={validations} />}
      {tab === "versions" && <VersionsTab versions={versions} officialVersion={officialVersion} />}
    </div>
  );
}

function BreakdownTab({ groups }: { groups: BreakdownGroup[] }) {
  const [open, setOpen] = useState<string[]>(groups.slice(0, 3).map((g) => g.code));
  const toggle = (code: string) => setOpen((o) => (o.includes(code) ? o.filter((c) => c !== code) : [...o, code]));
  return (
    <Card>
      <p className="border-b border-ink-100 px-4 py-2 text-[11.5px] text-ink-500">
        Balance normalizado al <span className="font-semibold text-ink-700">plan estándar Russell</span> (agrupado por cuenta estándar, con su nombre). Despliega para ver las cuentas del cliente (nivel 8).
      </p>
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
            {groups.map((g) => {
              const isOpen = open.includes(g.code);
              const sinMapeo = !g.mapped;
              return (
                <FragmentRows key={g.code}>
                  <tr className={`cursor-pointer border-b border-ink-100 ${sinMapeo ? "bg-warn-100" : "bg-ink-50"}`} onClick={() => toggle(g.code)}>
                    <td className="px-4 py-2 font-mono font-semibold text-ink-700">
                      <span className="mr-1 inline-block align-middle"><Icon name={isOpen ? "chev-d" : "chev-r"} size={12} /></span>{g.code}
                    </td>
                    <td className="px-4 py-2 font-semibold text-ink-800">{g.name}{g.critical && <span className="ml-2 align-middle text-warn-500"><Icon name="warn" size={12} /></span>}</td>
                    <td className="px-4 py-2">{g.mapped ? <Chip label="Russell" tone="ok" /> : <Chip label="Sin mapeo" tone="warn" />}</td>
                    <td className="px-4 py-2 text-right font-mono text-ink-400">{fmt(g.prevBalance)}</td>
                    <td className="px-4 py-2 text-right font-mono text-ink-600">{fmt(g.debe)}</td>
                    <td className="px-4 py-2 text-right font-mono text-ink-600">{fmt(g.haber)}</td>
                    <td className="px-4 py-2 text-right font-mono font-semibold text-ink-800">{fmt(g.balance)}</td>
                    <td className={`px-4 py-2 text-right font-mono ${g.variation != null && Math.abs(g.variation) > 25 ? "text-warn-700" : "text-ink-700"}`}>{fmtPct(g.variation)}</td>
                    <td className="px-4 py-2">{!g.saldoOk ? <Chip label="Saldo contrario" tone="err" /> : g.mapped ? <Chip label="OK" tone="ok" /> : null}</td>
                  </tr>
                  {isOpen && g.items.map((a) => (
                    <tr key={a.code} className="border-b border-ink-50 hover:bg-ink-50">
                      <td className="px-4 py-2 pl-9 font-mono text-[11.5px] text-ink-500">{a.code}</td>
                      <td className="px-4 py-2 text-ink-700">{a.name}{a.critical && <span className="ml-2"><Chip label="Crítica" tone="warn" /></span>}</td>
                      <td className="px-4 py-2">
                        {a.std ? (
                          <span className="inline-flex items-center gap-1.5 font-mono text-[11.5px] text-blue-500">
                            {a.coincidencia != null && a.coincidencia < 100 ? "≈" : "→"} {a.std}
                            {a.coincidencia != null && (
                              <span className={`rounded px-1 text-[10px] font-semibold ${a.coincidencia >= 85 ? "bg-ok-100 text-ok-700" : a.coincidencia >= 55 ? "bg-warn-100 text-warn-700" : "bg-err-100 text-err-700"}`}>{a.coincidencia}%</span>
                            )}
                          </span>
                        ) : (
                          <Chip label="Asignar" tone="warn" />
                        )}
                      </td>
                      <td className="px-4 py-2 text-right font-mono text-ink-400">{fmt(a.prevBalance)}</td>
                      <td className="px-4 py-2 text-right font-mono text-ink-500">{fmt(a.debe)}</td>
                      <td className="px-4 py-2 text-right font-mono text-ink-500">{fmt(a.haber)}</td>
                      <td className="px-4 py-2 text-right font-mono text-ink-700">{fmt(a.balance)}</td>
                      <td className={`px-4 py-2 text-right font-mono ${a.variation != null && Math.abs(a.variation) > 25 ? "text-warn-700" : "text-ink-500"}`}>{fmtPct(a.variation)}</td>
                      <td className="px-4 py-2">{!a.saldoOk && <Chip label="Naturaleza" tone="err" />}</td>
                    </tr>
                  ))}
                </FragmentRows>
              );
            })}
          </tbody>
        </table>
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

function FragmentRows({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

function TabBtn({ on, onClick, label, count }: { on: boolean; onClick: () => void; label: string; count?: number }) {
  return (
    <button onClick={onClick} className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12.5px] font-medium transition ${on ? "bg-navy-800 text-white" : "text-ink-600 hover:bg-ink-100"}`}>
      {label}
      {count != null && <span className={`rounded-full px-1.5 text-[10px] font-semibold ${on ? "bg-white/20 text-white" : "bg-ink-100 text-ink-500"}`}>{count}</span>}
    </button>
  );
}
