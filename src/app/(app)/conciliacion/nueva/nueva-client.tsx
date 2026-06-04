"use client";

import { useState } from "react";
import { Icon, type IconName } from "@/components/icons";
import { Card, Chip } from "@/components/ui";
import { Stepper } from "@/components/stepper";
import { confidenceClass } from "@/lib/format";
import { executeReconciliation } from "@/app/actions/reconciliation";

export type ClientOpt = { id: string; name: string; nit: string; erp: string; sector: string; configured: string[] };
export type ModuleOpt = { id: string; name: string; icon: string };
export type StdField = { key: string; label: string; type: string; required: boolean };

// IA simulada — columnas del archivo del cliente y su inferencia.
const FILE_COLUMNS = [
  { src: "COD_CTA", sample: "143505", inferred: "cuenta", confidence: 0.98, ai: "Coincide patrón de código contable PUC (6 dígitos)." },
  { src: "NOMBRE_CUENTA", sample: "Mercancías no fabricadas", inferred: "descripcion_cuenta", confidence: 0.96, ai: "Texto de longitud variable asociado al campo cuenta." },
  { src: "REF_ITEM", sample: "INV-44-A102", inferred: "codigo_item", confidence: 0.94, ai: "SKU alfanumérico. Prefijo + código." },
  { src: "DESC_PRODUCTO", sample: "Tornillo hexagonal 1/2''", inferred: "descripcion_item", confidence: 0.97, ai: "Texto descriptivo de producto." },
  { src: "UM", sample: "UND", inferred: "unidad", confidence: 0.99, ai: "Valores cortos (UND, KG, MT)." },
  { src: "EXISTENCIA", sample: "1.250,00", inferred: "cantidad", confidence: 0.93, ai: "Numérico positivo. Afín a cantidad/stock." },
  { src: "VR_UNIT", sample: "$ 14.250", inferred: "costo_unitario", confidence: 0.91, ai: "Numérico con símbolo monetario." },
  { src: "VR_TOTAL", sample: "$ 17.812.500", inferred: "valor_total", confidence: 0.95, ai: "Producto cantidad × costo en muestreo." },
  { src: "CENTRO", sample: "BOD-01 NORTE", inferred: "bodega", confidence: 0.72, ai: "Candidatos: 'bodega' o 'centro de costo'. Revisar." },
  { src: "FCH_REPORTE", sample: "31/03/2026", inferred: "fecha_corte", confidence: 0.99, ai: "Patrón de fecha DD/MM/YYYY constante." },
  { src: "USUARIO_REPORTE", sample: "siesauser01", inferred: "", confidence: 0.3, ai: "Sin coincidencia. Recomienda omitir." },
  { src: "OBSERVACIONES", sample: "—", inferred: "", confidence: 0.2, ai: "Mayoría de filas vacías. Recomienda omitir." },
];
const ACCOUNT_MAPPINGS = [
  { src: "143505", desc: "Mercancías no fabricadas por la empresa", std: "143505", confidence: 0.99, status: "auto" },
  { src: "143510", desc: "Materias primas", std: "143510", confidence: 0.99, status: "auto" },
  { src: "143515", desc: "Productos en proceso", std: "143515", confidence: 0.97, status: "auto" },
  { src: "143520", desc: "Materiales, repuestos y accesorios", std: "143520", confidence: 0.94, status: "auto" },
  { src: "INV-PT", desc: "Producto terminado (interno)", std: "143524", confidence: 0.78, status: "review", note: "Código no estándar — reasignado por similitud." },
  { src: "143530", desc: "Inv. envases y empaques", std: "143530", confidence: 0.92, status: "auto" },
  { src: "143599", desc: "Otros inventarios", std: "143599", confidence: 0.88, status: "auto" },
  { src: "INV-OBSOL", desc: "Obsoletos pendientes baja", std: "", confidence: 0.32, status: "unmapped", note: "No existe equivalencia directa." },
];
const STEPS = ["Archivo", "Campos", "Cuentas", "Confirmar"];

export default function NuevaClient({
  clients, modules, fieldsByModule,
}: {
  clients: ClientOpt[]; modules: ModuleOpt[]; fieldsByModule: Record<string, StdField[]>;
}) {
  const [phase, setPhase] = useState<"scope" | "wizard">("scope");
  const [step, setStep] = useState(0);
  const [clientId, setClientId] = useState(clients[0]?.id ?? "");
  const [moduleId, setModuleId] = useState("INV");
  const [period, setPeriod] = useState("2026-03");
  const [cutoff, setCutoff] = useState("2026-03-31");

  const client = clients.find((c) => c.id === clientId);
  const mod = modules.find((m) => m.id === moduleId);
  const fields = fieldsByModule[moduleId] ?? [];
  const isConfigured = client?.configured.includes(moduleId) ?? false;

  if (phase === "scope") {
    return (
      <ScopeStep
        clients={clients} modules={modules} clientId={clientId} setClientId={setClientId}
        moduleId={moduleId} setModuleId={setModuleId} period={period} setPeriod={setPeriod}
        cutoff={cutoff} setCutoff={setCutoff} isConfigured={isConfigured}
        onContinue={() => { setStep(0); setPhase("wizard"); }}
      />
    );
  }

  return (
    <div>
      <button onClick={() => setPhase("scope")} className="mb-3 inline-flex items-center gap-1.5 text-[12.5px] font-medium text-blue-500 hover:underline">
        <Icon name="chev-l" size={13} /> Cambiar alcance
      </button>
      <Stepper steps={STEPS} current={step} />
      <div className="mb-3 text-[12.5px] text-ink-500">
        <b className="text-ink-800">{client?.name}</b> · {mod?.name} · {period} · corte {cutoff}
      </div>

      {step === 0 && <FileStep fields={fields} onNext={() => setStep(1)} />}
      {step === 1 && <FieldsStep fields={fields} onBack={() => setStep(0)} onNext={() => setStep(2)} />}
      {step === 2 && <AccountsStep onBack={() => setStep(1)} onNext={() => setStep(3)} />}
      {step === 3 && <ConfirmStep clientId={clientId} moduleId={moduleId} period={period} cutoff={cutoff} clientName={client?.name ?? ""} moduleName={mod?.name ?? ""} onBack={() => setStep(2)} />}
    </div>
  );
}

function ScopeStep({
  clients, modules, clientId, setClientId, moduleId, setModuleId, period, setPeriod, cutoff, setCutoff, isConfigured, onContinue,
}: {
  clients: ClientOpt[]; modules: ModuleOpt[]; clientId: string; setClientId: (v: string) => void;
  moduleId: string; setModuleId: (v: string) => void; period: string; setPeriod: (v: string) => void;
  cutoff: string; setCutoff: (v: string) => void; isConfigured: boolean; onContinue: () => void;
}) {
  const client = clients.find((c) => c.id === clientId);
  return (
    <Card className="p-5">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <label className="flex flex-col gap-1">
          <span className="text-[11.5px] font-medium text-ink-600">Cliente</span>
          <select value={clientId} onChange={(e) => setClientId(e.target.value)} className="rounded-md border border-ink-200 px-2.5 py-1.5 text-[12.5px] outline-none focus:border-blue-400">
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name} — {c.nit} — {c.erp}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11.5px] font-medium text-ink-600">Período a conciliar</span>
          <input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} className="rounded-md border border-ink-200 px-2.5 py-1.5 text-[12.5px] outline-none focus:border-blue-400" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11.5px] font-medium text-ink-600">Fecha de corte</span>
          <input type="date" value={cutoff} onChange={(e) => setCutoff(e.target.value)} className="rounded-md border border-ink-200 px-2.5 py-1.5 text-[12.5px] outline-none focus:border-blue-400" />
        </label>
      </div>

      {client && <div className="mt-2 text-[12px] text-ink-500">Sector: {client.sector} · {client.configured.length}/6 módulos parametrizados</div>}

      <div className="mt-4 text-[11.5px] font-medium text-ink-600">Módulo a conciliar</div>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {modules.map((m) => {
          const on = m.id === moduleId;
          const conf = client?.configured.includes(m.id) ?? false;
          return (
            <button key={m.id} onClick={() => setModuleId(m.id)} className={`flex items-center gap-2.5 rounded-md border px-3 py-2.5 text-left ${on ? "border-blue-400 bg-blue-50" : "border-ink-150 hover:bg-ink-50"}`}>
              <Icon name={m.icon as IconName} size={18} />
              <div>
                <div className="text-[12.5px] font-semibold text-ink-800">{m.name}</div>
                <div className={`text-[11px] ${conf ? "text-ok-700" : "text-warn-700"}`}>● {conf ? "Parametrizado" : "Sin parametrizar"}</div>
              </div>
            </button>
          );
        })}
      </div>

      <div className={`mt-4 rounded-md px-3 py-2 text-[12px] ${isConfigured ? "bg-ok-100 text-ok-700" : "bg-warn-100 text-warn-700"}`}>
        {isConfigured ? "Este módulo ya está parametrizado: el asistente confirmará el mapeo antes de ejecutar." : "Este módulo no está parametrizado: el asistente te guiará para mapear campos y cuentas."}
      </div>

      <div className="mt-4 flex justify-end">
        <button onClick={onContinue} className="inline-flex items-center gap-1.5 rounded-md bg-navy-700 px-4 py-2 text-[12.5px] font-semibold text-white hover:bg-navy-600">
          Continuar <Icon name="chev-r" size={14} />
        </button>
      </div>
    </Card>
  );
}

function FileStep({ fields, onNext }: { fields: StdField[]; onNext: () => void }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <Card className="p-5">
      {!loaded ? (
        <button onClick={() => setLoaded(true)} className="flex w-full flex-col items-center gap-2 rounded-lg border-2 border-dashed border-ink-200 py-10 text-ink-400 hover:border-blue-400 hover:text-blue-500">
          <Icon name="upload" size={28} />
          <span className="text-[13px] font-medium">Cargar archivo de muestra (Excel/CSV)</span>
          <span className="text-[11.5px]">Click para simular la carga del archivo del ERP</span>
        </button>
      ) : (
        <div className="flex items-center gap-3 rounded-md border border-ink-150 bg-ink-50 px-4 py-3">
          <Icon name="doc" size={20} />
          <div className="flex-1">
            <div className="text-[12.5px] font-semibold text-ink-800">INV_PACIFICO_MAR2026.xlsx</div>
            <div className="text-[11.5px] text-ink-500">4.821 filas · 12 columnas · 1,4 MB</div>
          </div>
          <Chip label="Leído correctamente" tone="ok" />
        </div>
      )}

      {loaded && (
        <>
          <div className="mt-4 rounded-md bg-ai-100 px-3 py-2 text-[12px] text-ai-700"><Icon name="ai" size={13} className="mr-1 inline" /> Detectamos 10 de 10 campos requeridos. 2 columnas adicionales sin información estándar.</div>
          <div className="mt-4 text-[12px] font-semibold text-ink-700">Campos mínimos requeridos · módulo</div>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead><tr className="border-b border-ink-100 text-left text-[11px] uppercase tracking-wider text-ink-500"><th className="px-3 py-1.5 font-semibold">Clave</th><th className="px-3 py-1.5 font-semibold">Etiqueta</th><th className="px-3 py-1.5 font-semibold">Tipo</th><th className="px-3 py-1.5 font-semibold">Requerido</th></tr></thead>
              <tbody>
                {fields.map((f) => (
                  <tr key={f.key} className="border-b border-ink-50 last:border-0"><td className="px-3 py-1.5 font-mono text-ink-600">{f.key}</td><td className="px-3 py-1.5 text-ink-800">{f.label}</td><td className="px-3 py-1.5"><Chip label={f.type} tone="ink" /></td><td className="px-3 py-1.5">{f.required ? <Chip label="Sí" tone="err" /> : <Chip label="No" tone="ink" />}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex justify-end"><button onClick={onNext} className="inline-flex items-center gap-1.5 rounded-md bg-navy-700 px-4 py-2 text-[12.5px] font-semibold text-white hover:bg-navy-600">Continuar a mapeo de campos <Icon name="chev-r" size={14} /></button></div>
        </>
      )}
    </Card>
  );
}

function FieldsStep({ fields, onBack, onNext }: { fields: StdField[]; onBack: () => void; onNext: () => void }) {
  const [map, setMap] = useState<Record<string, string>>(() => Object.fromEntries(FILE_COLUMNS.map((c) => [c.src, c.inferred])));
  const requiredKeys = fields.filter((f) => f.required).map((f) => f.key);
  const coveredKeys = new Set(Object.values(map).filter(Boolean));
  const missing = requiredKeys.filter((k) => !coveredKeys.has(k));

  return (
    <Card>
      <div className="flex items-center gap-2 border-b border-ink-100 px-4 py-3">
        <h2 className="text-[13px] font-semibold text-ink-800">Mapeo de campos asistido por IA</h2>
        <Chip label="claude-haiku-4.5" tone="ai" />
        <span className="ml-auto text-[11.5px] text-ink-500">12 columnas detectadas</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead><tr className="border-b border-ink-100 text-left text-[11px] uppercase tracking-wider text-ink-500"><th className="px-3 py-2 font-semibold">Columna archivo</th><th className="px-3 py-2 font-semibold">Muestra</th><th className="px-3 py-2 font-semibold">Campo estándar</th><th className="px-3 py-2 font-semibold">Confianza</th><th className="px-3 py-2 font-semibold">Justificación IA</th></tr></thead>
          <tbody>
            {FILE_COLUMNS.map((c) => {
              const tone = confidenceClass(c.confidence);
              return (
                <tr key={c.src} className="border-b border-ink-50 last:border-0">
                  <td className="px-3 py-2 font-mono text-ink-700">{c.src}</td>
                  <td className="px-3 py-2 text-ink-500">{c.sample}</td>
                  <td className="px-3 py-2">
                    <select value={map[c.src] ?? ""} onChange={(e) => setMap((m) => ({ ...m, [c.src]: e.target.value }))} className="rounded-md border border-ink-200 px-2 py-1 text-[12px] outline-none focus:border-blue-400">
                      <option value="">— Ignorar —</option>
                      {fields.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                    </select>
                  </td>
                  <td className="px-3 py-2"><span className={`inline-block rounded-full px-1.5 py-0.5 text-[11px] font-semibold ${tone === "ok" ? "bg-ok-100 text-ok-700" : tone === "warn" ? "bg-warn-100 text-warn-700" : "bg-err-100 text-err-700"}`}>{Math.round(c.confidence * 100)}%</span></td>
                  <td className="px-3 py-2 text-[11.5px] text-ink-500">{c.ai}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className={`mx-4 my-3 rounded-md px-3 py-2 text-[12px] ${missing.length === 0 ? "bg-ok-100 text-ok-700" : "bg-err-100 text-err-700"}`}>
        {missing.length === 0 ? "Todos los campos requeridos están cubiertos." : `Faltan ${missing.length} campo(s) requerido(s): ${missing.join(", ")}`}
      </div>
      <div className="flex justify-between border-t border-ink-100 px-4 py-3">
        <button onClick={onBack} className="rounded-md border border-ink-200 px-3 py-1.5 text-[12.5px] text-ink-600 hover:bg-ink-50">Atrás</button>
        <button onClick={onNext} disabled={missing.length > 0} className="inline-flex items-center gap-1.5 rounded-md bg-navy-700 px-4 py-1.5 text-[12.5px] font-semibold text-white hover:bg-navy-600 disabled:opacity-50">Continuar a cuentas <Icon name="chev-r" size={14} /></button>
      </div>
    </Card>
  );
}

function AccountsStep({ onBack, onNext }: { onBack: () => void; onNext: () => void }) {
  const [filter, setFilter] = useState<"all" | "auto" | "review" | "unmapped">("all");
  const counts = { all: ACCOUNT_MAPPINGS.length, auto: ACCOUNT_MAPPINGS.filter((a) => a.status === "auto").length, review: ACCOUNT_MAPPINGS.filter((a) => a.status === "review").length, unmapped: ACCOUNT_MAPPINGS.filter((a) => a.status === "unmapped").length };
  const rows = ACCOUNT_MAPPINGS.filter((a) => filter === "all" || a.status === filter);
  const statusChipTone = (s: string) => (s === "auto" ? "ok" : s === "review" ? "warn" : "err") as "ok" | "warn" | "err";
  const statusLabel = (s: string) => (s === "auto" ? "Auto" : s === "review" ? "Revisar" : "Sin mapeo");

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2 border-b border-ink-100 px-4 py-3">
        <h2 className="text-[13px] font-semibold text-ink-800">Mapeo de cuentas</h2>
        <Chip label="IA por similitud semántica" tone="ai" />
        <div className="ml-auto flex gap-1.5">
          {(["all", "auto", "review", "unmapped"] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)} className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${filter === f ? "bg-navy-800 text-white" : "bg-ink-100 text-ink-600"}`}>{f === "all" ? "Todas" : f === "auto" ? "Auto" : f === "review" ? "Revisar" : "Sin mapeo"} {counts[f]}</button>
          ))}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead><tr className="border-b border-ink-100 text-left text-[11px] uppercase tracking-wider text-ink-500"><th className="px-3 py-2 font-semibold">Cuenta cliente</th><th className="px-3 py-2 font-semibold"></th><th className="px-3 py-2 font-semibold">Cuenta estándar</th><th className="px-3 py-2 font-semibold">Confianza</th><th className="px-3 py-2 font-semibold">Estado</th><th className="px-3 py-2 font-semibold">Nota IA</th></tr></thead>
          <tbody>
            {rows.map((a) => {
              const tone = confidenceClass(a.confidence);
              return (
                <tr key={a.src} className="border-b border-ink-50 last:border-0">
                  <td className="px-3 py-2"><div className="font-mono text-ink-700">{a.src}</div><div className="text-[11px] text-ink-500">{a.desc}</div></td>
                  <td className="px-3 py-2 text-ink-300"><Icon name="chev-r" size={14} /></td>
                  <td className="px-3 py-2 font-mono text-ink-700">{a.std || <span className="italic text-ink-400">crear auxiliar…</span>}</td>
                  <td className="px-3 py-2"><span className={`inline-block rounded-full px-1.5 py-0.5 text-[11px] font-semibold ${tone === "ok" ? "bg-ok-100 text-ok-700" : tone === "warn" ? "bg-warn-100 text-warn-700" : "bg-err-100 text-err-700"}`}>{Math.round(a.confidence * 100)}%</span></td>
                  <td className="px-3 py-2"><Chip label={statusLabel(a.status)} tone={statusChipTone(a.status)} /></td>
                  <td className="px-3 py-2 text-[11.5px] text-ink-500">{a.note ?? "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {counts.unmapped > 0 && <div className="mx-4 my-3 rounded-md bg-warn-100 px-3 py-2 text-[12px] text-warn-700">{counts.unmapped} cuenta(s) sin mapeo — se podrán crear como auxiliares antes de ejecutar.</div>}
      <div className="flex justify-between border-t border-ink-100 px-4 py-3">
        <button onClick={onBack} className="rounded-md border border-ink-200 px-3 py-1.5 text-[12.5px] text-ink-600 hover:bg-ink-50">Atrás</button>
        <button onClick={onNext} className="inline-flex items-center gap-1.5 rounded-md bg-navy-700 px-4 py-2 text-[12.5px] font-semibold text-white hover:bg-navy-600">Continuar a confirmación <Icon name="chev-r" size={14} /></button>
      </div>
    </Card>
  );
}

function ConfirmStep({
  clientId, moduleId, period, cutoff, clientName, moduleName, onBack,
}: {
  clientId: string; moduleId: string; period: string; cutoff: string; clientName: string; moduleName: string; onBack: () => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
      <Card className="p-5 lg:col-span-2">
        <h2 className="text-[13px] font-semibold text-ink-800">Resumen de la parametrización</h2>
        <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2.5 text-[12.5px]">
          <KV label="Cliente" value={clientName} />
          <KV label="Módulo" value={moduleName} />
          <KV label="Período" value={period} />
          <KV label="Corte" value={cutoff} />
          <KV label="Campos" value="10 de 10 requeridos" />
          <KV label="Cuentas" value="6 auto · 1 revisada · 1 sin mapeo" />
        </div>
        <div className="mt-4 rounded-md bg-ai-100 px-3 py-2 text-[12px] text-ai-700"><Icon name="ai" size={13} className="mr-1 inline" /> Al ejecutar se convertirá el archivo al estándar, se validará y se cruzará contra el balance contable.</div>
      </Card>
      <Card className="p-5">
        <h3 className="text-[12.5px] font-semibold text-ink-800">Próximo paso</h3>
        <ul className="mt-2 space-y-1.5 text-[12px] text-ink-600">
          <li className="flex items-center gap-2"><Icon name="check" size={12} className="text-ok-500" /> Conversión al plan estándar</li>
          <li className="flex items-center gap-2"><Icon name="check" size={12} className="text-ok-500" /> Validación de integridad</li>
          <li className="flex items-center gap-2"><Icon name="check" size={12} className="text-ok-500" /> Cruce contable vs. auxiliar</li>
          <li className="flex items-center gap-2"><Icon name="check" size={12} className="text-ok-500" /> Resumen de partidas</li>
        </ul>
        <form action={executeReconciliation} className="mt-4">
          <input type="hidden" name="clientId" value={clientId} />
          <input type="hidden" name="moduleId" value={moduleId} />
          <input type="hidden" name="period" value={period} />
          <input type="hidden" name="cutoff" value={cutoff} />
          <button type="submit" className="inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-navy-700 px-4 py-2.5 text-[12.5px] font-semibold text-white hover:bg-navy-600"><Icon name="play" size={14} /> Guardar y ejecutar cargue</button>
        </form>
        <button onClick={onBack} className="mt-2 w-full rounded-md border border-ink-200 px-3 py-1.5 text-[12.5px] text-ink-600 hover:bg-ink-50">Atrás</button>
      </Card>
    </div>
  );
}

function KV({ label, value }: { label: string; value: string }) {
  return <div><div className="text-[10.5px] uppercase tracking-wider text-ink-400">{label}</div><div className="mt-0.5 text-ink-800">{value}</div></div>;
}
