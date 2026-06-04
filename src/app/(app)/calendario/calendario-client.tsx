"use client";

import { useMemo, useState } from "react";
import { Icon } from "@/components/icons";
import { Card, Chip } from "@/components/ui";
import { Modal } from "@/components/modal";
import { createCalendarEvent } from "@/app/actions/calendario";

export type Evt = { id: string; day: number; month: number; year: number; type: string; title: string; subtitle: string; clientId: string | null };

const CAL_CLIENTS: { id: string; name: string; nit: string; color: string }[] = [
  { id: "zarzal", name: "El Zarzal S.A", nit: "900.451.227-3", color: "#1f6feb" },
  { id: "pacif", name: "Inversiones del Pacífico", nit: "901.224.118-6", color: "#a855f7" },
  { id: "andina", name: "Comercializadora Andina", nit: "830.114.998-2", color: "#0a8048" },
  { id: "valle", name: "Distribuciones del Valle", nit: "890.331.052-5", color: "#b9651b" },
  { id: "agrocol", name: "Agrocol S.A.S", nit: "900.512.770-1", color: "#dc2626" },
];
const TYPE_COLOR: Record<string, string> = { dian: "#dc2626", ica: "#b9651b", req: "#1f6feb" };
const TYPE_LABEL: Record<string, string> = { dian: "DIAN", ica: "ICA", req: "Requerimiento" };
const MONTHS = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const DAYNAMES = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

function clientOf(id: string | null) { return CAL_CLIENTS.find((c) => c.id === id) ?? null; }
function colorOf(e: Evt) { return e.type === "req" ? clientOf(e.clientId)?.color ?? "#1f6feb" : TYPE_COLOR[e.type]; }

export default function CalendarioClient({ events }: { events: Evt[] }) {
  const [my, setMy] = useState({ y: 2026, m: 4 });
  const [view, setView] = useState<"month" | "week" | "day">("month");
  const [filter, setFilter] = useState({ dian: true, ica: true, req: true, client: "all" });
  const [selectedDay, setSelectedDay] = useState(11);
  const [creating, setCreating] = useState(false);

  const monthEvents = useMemo(() => events.filter((e) => e.year === my.y && e.month === my.m), [events, my]);
  const visible = useMemo(() => monthEvents.filter((e) => {
    if (!filter[e.type as "dian" | "ica" | "req"]) return false;
    if (filter.client !== "all") { if (!e.clientId) return false; if (e.clientId !== filter.client) return false; }
    return true;
  }), [monthEvents, filter]);

  const eventsByDay = useMemo(() => {
    const m: Record<number, Evt[]> = {};
    visible.forEach((e) => { (m[e.day] ??= []).push(e); });
    return m;
  }, [visible]);

  const cells = useMemo(() => {
    const first = new Date(my.y, my.m, 1);
    const last = new Date(my.y, my.m + 1, 0);
    const start = (first.getDay() + 6) % 7;
    const arr: (number | null)[] = [];
    for (let i = 0; i < start; i++) arr.push(null);
    for (let d = 1; d <= last.getDate(); d++) arr.push(d);
    while (arr.length % 7 !== 0) arr.push(null);
    return arr;
  }, [my]);

  const goPrev = () => setMy((s) => (s.m === 0 ? { y: s.y - 1, m: 11 } : { y: s.y, m: s.m - 1 }));
  const goNext = () => setMy((s) => (s.m === 11 ? { y: s.y + 1, m: 0 } : { y: s.y, m: s.m + 1 }));

  const dianCount = monthEvents.filter((e) => e.type === "dian").length;
  const icaCount = monthEvents.filter((e) => e.type === "ica").length;
  const reqCount = monthEvents.filter((e) => e.type === "req").length;

  // Semana: la que contiene selectedDay (Lun-Dom)
  const weekDays = useMemo(() => {
    const d = new Date(my.y, my.m, selectedDay);
    const off = (d.getDay() + 6) % 7;
    const monday = selectedDay - off;
    return Array.from({ length: 7 }, (_, i) => monday + i).filter((x) => x >= 1 && x <= new Date(my.y, my.m + 1, 0).getDate());
  }, [my, selectedDay]);

  const upcoming = useMemo(() => visible.filter((e) => e.day >= 10 && e.day <= 18).sort((a, b) => a.day - b.day), [visible]);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button disabled title="Exportación — fase posterior" className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-md bg-ink-100 px-2.5 py-2 text-[12px] font-semibold text-ink-400"><Icon name="download" size={13} /> Exportar iCal</button>
        <button onClick={() => setCreating(true)} className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-navy-700 px-3 py-2 text-[12.5px] font-semibold text-white hover:bg-navy-600"><Icon name="plus" size={14} /> Nuevo evento</button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label="Eventos del mes" value={visible.length} hint={`${MONTHS[my.m]} ${my.y}`} color="#142b4a" />
        <Kpi label="Requerimientos clientes" value={reqCount} hint={`${CAL_CLIENTS.length} clientes activos`} color="#1f6feb" />
        <Kpi label="Vencimientos DIAN" value={dianCount} hint="IVA · Retención · Exógena" color="#dc2626" />
        <Kpi label="ICA municipal" value={icaCount} hint="3 municipios" color="#b9651b" />
      </div>

      {/* Control */}
      <Card className="mt-5">
        <div className="flex flex-wrap items-center gap-3 border-b border-ink-100 px-4 py-3">
          <div className="flex items-center gap-1">
            <button onClick={goPrev} className="rounded p-1.5 text-ink-500 hover:bg-ink-100"><Icon name="chev-l" size={15} /></button>
            <span className="min-w-[130px] text-center text-[13px] font-semibold text-ink-800">{MONTHS[my.m]} {my.y}</span>
            <button onClick={goNext} className="rounded p-1.5 text-ink-500 hover:bg-ink-100"><Icon name="chev-r" size={15} /></button>
            <button onClick={() => setMy({ y: 2026, m: 4 })} className="ml-1 rounded-md border border-ink-200 px-2.5 py-1 text-[12px] text-ink-600 hover:bg-ink-50">Hoy</button>
          </div>
          <div className="flex overflow-hidden rounded-md border border-ink-200 text-[12px]">
            {(["day", "week", "month"] as const).map((v) => (
              <button key={v} onClick={() => setView(v)} className={`px-2.5 py-1 ${view === v ? "bg-navy-900 text-white" : "bg-white text-ink-600 hover:bg-ink-50"}`}>{v === "day" ? "Día" : v === "week" ? "Semana" : "Mes"}</button>
            ))}
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-3">
            {(["req", "dian", "ica"] as const).map((t) => (
              <label key={t} className="flex items-center gap-1.5 text-[12px] text-ink-600"><input type="checkbox" checked={filter[t]} onChange={() => setFilter((f) => ({ ...f, [t]: !f[t] }))} /><span className="h-2 w-2 rounded-full" style={{ background: TYPE_COLOR[t] }} />{TYPE_LABEL[t]}</label>
            ))}
            <select value={filter.client} onChange={(e) => setFilter((f) => ({ ...f, client: e.target.value }))} className="rounded-md border border-ink-200 px-2 py-1 text-[12px] outline-none">
              <option value="all">Todos los clientes</option>
              {CAL_CLIENTS.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        </div>

        {view === "month" && (
          <div>
            <div className="grid grid-cols-7 border-b border-ink-100 text-[11px] font-semibold uppercase tracking-wider text-ink-400">{DAYNAMES.map((d) => <div key={d} className="px-3 py-1.5">{d}</div>)}</div>
            <div className="grid grid-cols-7">
              {cells.map((d, idx) => (
                <div key={idx} className="min-h-[108px] border-b border-r border-ink-50 p-1.5" style={d === 11 && my.m === 4 && my.y === 2026 ? { background: "#fffdf3" } : undefined}>
                  {d != null && (
                    <>
                      <button onClick={() => { setSelectedDay(d); setView("day"); }} className="mb-1 text-[12px] font-medium text-ink-600 hover:text-blue-500">{d}</button>
                      <div className="flex flex-col gap-1">
                        {(eventsByDay[d] ?? []).slice(0, 3).map((e) => (
                          <div key={e.id} className="truncate rounded px-1.5 py-0.5 text-[10.5px] text-ink-700" style={{ background: colorOf(e) + "1f", borderLeft: `2px solid ${colorOf(e)}` }} title={e.title}>{e.title}</div>
                        ))}
                        {(eventsByDay[d]?.length ?? 0) > 3 && <span className="text-[10px] text-ink-400">+{eventsByDay[d].length - 3} más</span>}
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {view === "week" && (
          <div className="grid grid-cols-7">
            {weekDays.map((d) => (
              <div key={d} className="min-h-[320px] border-r border-ink-50 p-2" style={d === 11 && my.m === 4 ? { background: "#fffdf3" } : undefined}>
                <div className="mb-2 text-[12px] font-semibold text-ink-700">{d}</div>
                <div className="flex flex-col gap-1.5">
                  {(eventsByDay[d] ?? []).map((e) => (
                    <div key={e.id} className="rounded px-2 py-1 text-[11px] text-ink-700" style={{ background: colorOf(e) + "1f", borderLeft: `3px solid ${colorOf(e)}` }}><div className="font-medium">{e.title}</div>{e.type === "req" && <div className="text-[10px] text-ink-500">{clientOf(e.clientId)?.name}</div>}</div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {view === "day" && (
          <div className="p-4">
            <div className="mb-3 text-[13px] font-semibold text-ink-800">{selectedDay} de {MONTHS[my.m].toLowerCase()}, {my.y}</div>
            <div className="flex flex-col gap-2">
              {(eventsByDay[selectedDay] ?? []).length === 0 && <div className="text-[12.5px] text-ink-400">Sin eventos programados para este día.</div>}
              {(eventsByDay[selectedDay] ?? []).map((e) => (
                <div key={e.id} className="flex items-center gap-3 rounded-md border border-ink-150 px-3 py-2.5" style={{ borderLeft: `4px solid ${colorOf(e)}` }}>
                  <div className="flex-1"><div className="text-[13px] font-semibold text-ink-800">{e.title}</div><div className="text-[11.5px] text-ink-500">{e.type === "req" ? `${clientOf(e.clientId)?.name} · NIT ${clientOf(e.clientId)?.nit}` : e.subtitle}</div></div>
                  <Chip label={TYPE_LABEL[e.type]} tone="ink" />
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* Paneles */}
      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <div className="border-b border-ink-100 px-4 py-3 text-[13px] font-semibold text-ink-800">Próximos vencimientos · 7 días</div>
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead><tr className="border-b border-ink-100 text-left text-[11px] uppercase tracking-wider text-ink-500"><th className="px-4 py-2 font-semibold">Fecha</th><th className="px-4 py-2 font-semibold">Tipo</th><th className="px-4 py-2 font-semibold">Evento</th><th className="px-4 py-2 font-semibold">Cliente / Detalle</th><th className="px-4 py-2 font-semibold">Estado</th></tr></thead>
              <tbody>
                {upcoming.map((e) => (
                  <tr key={e.id} className="border-b border-ink-50 last:border-0">
                    <td className="px-4 py-2 font-mono text-ink-600">{String(e.day).padStart(2, "0")}/{MONTHS[my.m].slice(0, 3)}</td>
                    <td className="px-4 py-2"><span className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: TYPE_COLOR[e.type] + "1f", color: TYPE_COLOR[e.type] }}>{TYPE_LABEL[e.type]}</span></td>
                    <td className="px-4 py-2 text-ink-800">{e.title}</td>
                    <td className="px-4 py-2 text-ink-500">{e.type === "req" ? clientOf(e.clientId)?.name : e.subtitle}</td>
                    <td className="px-4 py-2"><Chip label={e.day <= 12 ? "Próximo" : "Programado"} tone={e.day <= 12 ? "warn" : "ink"} /></td>
                  </tr>
                ))}
                {upcoming.length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-center text-ink-400">Sin vencimientos en la ventana.</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
        <Card className="lg:col-span-2">
          <div className="border-b border-ink-100 px-4 py-3 text-[13px] font-semibold text-ink-800">Asignación por cliente · {MONTHS[my.m]}</div>
          <div className="divide-y divide-ink-50">
            {CAL_CLIENTS.map((c) => {
              const n = monthEvents.filter((e) => e.clientId === c.id).length;
              return (
                <div key={c.id} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="h-8 w-2 rounded" style={{ background: c.color }} />
                  <div className="flex-1"><div className="text-[12.5px] font-medium text-ink-800">{c.name}</div><div className="font-mono text-[11px] text-ink-400">NIT {c.nit}</div></div>
                  <div className="text-right"><div className="font-mono text-[15px] font-semibold" style={{ color: c.color }}>{n}</div><div className="text-[10px] text-ink-400">requerim.</div></div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      {creating && (
        <Modal open onClose={() => setCreating(false)} title="Nuevo evento">
          <form action={createCalendarEvent} className="flex flex-col gap-3">
            <label className="flex flex-col gap-1"><span className="text-[11.5px] font-medium text-ink-600">Fecha</span><input type="date" name="date" defaultValue="2026-05-15" className="rounded-md border border-ink-200 px-2.5 py-1.5 text-[12.5px] outline-none focus:border-blue-400" /></label>
            <label className="flex flex-col gap-1"><span className="text-[11.5px] font-medium text-ink-600">Tipo</span><select name="type" defaultValue="req" className="rounded-md border border-ink-200 px-2.5 py-1.5 text-[12.5px] outline-none"><option value="req">Requerimiento</option><option value="dian">DIAN</option><option value="ica">ICA</option></select></label>
            <label className="flex flex-col gap-1"><span className="text-[11.5px] font-medium text-ink-600">Título</span><input name="title" placeholder="Título del evento" className="rounded-md border border-ink-200 px-2.5 py-1.5 text-[12.5px] outline-none focus:border-blue-400" /></label>
            <label className="flex flex-col gap-1"><span className="text-[11.5px] font-medium text-ink-600">Subtítulo / detalle</span><input name="subtitle" className="rounded-md border border-ink-200 px-2.5 py-1.5 text-[12.5px] outline-none focus:border-blue-400" /></label>
            <label className="flex flex-col gap-1"><span className="text-[11.5px] font-medium text-ink-600">Cliente (si es requerimiento)</span><select name="clientId" defaultValue="zarzal" className="rounded-md border border-ink-200 px-2.5 py-1.5 text-[12.5px] outline-none">{CAL_CLIENTS.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
            <div className="mt-1 flex justify-end gap-2"><button type="button" onClick={() => setCreating(false)} className="rounded-md border border-ink-200 px-3 py-1.5 text-[12.5px] text-ink-600 hover:bg-ink-50">Cancelar</button><button type="submit" className="rounded-md bg-navy-700 px-3 py-1.5 text-[12.5px] font-semibold text-white hover:bg-navy-600">Crear evento</button></div>
          </form>
        </Modal>
      )}
    </div>
  );
}

function Kpi({ label, value, hint, color }: { label: string; value: number; hint: string; color: string }) {
  return (
    <Card className="p-4">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">{label}</div>
      <div className="mt-1.5 font-mono text-2xl font-semibold" style={{ color }}>{value}</div>
      <div className="mt-1 text-[12px] text-ink-500">{hint}</div>
    </Card>
  );
}
