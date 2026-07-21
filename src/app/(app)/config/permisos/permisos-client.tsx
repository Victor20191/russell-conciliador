"use client";

import { EstadoProcesando } from "@/components/estado-procesando";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { Card, PageHeader } from "@/components/ui";
import { Icon } from "@/components/icons";
import { guardarNiveles, type CambioNivel } from "@/app/actions/permisos";
import { NIVEL_META, type Nivel, type NivelTone } from "@/lib/rbac/niveles";
import { notifyError, notifySuccess } from "@/lib/client-notifications";

export type RoleCol = { id: number; code: string; name: string };
export type ModuloRow = {
  module: string;
  label: string;
  depth: 0 | 1;
  niveles: Nivel[]; // opciones disponibles del dropdown
};
export type GrupoMatriz = { titulo: string; filas: ModuloRow[] };

const key = (roleId: number, module: string) => `${roleId}:${module}`;

// Clases por tono semántico del nivel (definido en niveles.ts).
const TONO: Record<NivelTone, string> = {
  ink: "border-ink-200 bg-ink-50 text-ink-500",
  ok: "border-ok-100 bg-ok-100 text-ok-700",
  blue: "border-blue-100 bg-blue-100 text-navy-700",
  warn: "border-warn-100 bg-warn-100 text-warn-700",
  ai: "border-ai-100 bg-ai-100 text-ai-700",
};

// Agrupa filas planas (depth 0/1) en ítems padre→hijos para expandir/colapsar.
type Item = { padre: ModuloRow; hijos: ModuloRow[] };
function aItems(filas: ModuloRow[]): Item[] {
  const items: Item[] = [];
  for (const f of filas) {
    if (f.depth === 0) items.push({ padre: f, hijos: [] });
    else if (items.length) items[items.length - 1].hijos.push(f);
  }
  return items;
}

export default function PermisosClient({
  roles,
  grupos,
  valores,
  parciales,
}: {
  roles: RoleCol[];
  grupos: GrupoMatriz[];
  valores: Record<string, Nivel>;
  parciales: Record<string, true>;
}) {
  // `base` = verdad del servidor; `pending` = cambios sin guardar.
  const [base, setBase] = useState<Record<string, Nivel>>(valores);
  const [pending, setPending] = useState<Record<string, Nivel>>({});
  const [expandido, setExpandido] = useState<Set<string>>(() => new Set());
  const [saving, startSaving] = useTransition();
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  const valor = (roleId: number, module: string): Nivel => {
    const k = key(roleId, module);
    return pending[k] ?? base[k] ?? "ninguno";
  };

  // Una celda es "Parcial" si su concesión real (servidor) no cubre todo su nivel
  // Y el usuario no la ha cambiado: al elegir un nivel nuevo, al guardar se
  // materializa completo, dejando de ser parcial.
  const esParcialCelda = (roleId: number, module: string): boolean => {
    const k = key(roleId, module);
    return !!parciales[k] && pending[k] === undefined;
  };

  const sucios = useMemo(
    () => Object.keys(pending).filter((k) => pending[k] !== base[k]),
    [pending, base],
  );

  function setCelda(roleId: number, module: string, nivel: Nivel) {
    setMsg(null);
    const k = key(roleId, module);
    setPending((prev) => {
      const next = { ...prev };
      if (nivel === (base[k] ?? "ninguno")) delete next[k];
      else next[k] = nivel;
      return next;
    });
  }

  function toggleItem(module: string) {
    setExpandido((prev) => {
      const next = new Set(prev);
      if (next.has(module)) next.delete(module);
      else next.add(module);
      return next;
    });
  }

  function descartar() {
    setPending({});
    setMsg(null);
  }

  function guardar() {
    if (sucios.length === 0) return;
    const cambios: CambioNivel[] = sucios.map((k) => {
      const [roleId, module] = k.split(":");
      return { roleId: Number(roleId), module, nivel: pending[k] };
    });
    setMsg(null);
    startSaving(async () => {
      const res = await guardarNiveles(cambios);
      if (res.ok) {
        // Promueve los cambios a la base local y limpia el pendiente.
        setBase((prev) => {
          const next = { ...prev };
          for (const k of sucios) next[k] = pending[k];
          return next;
        });
        setPending({});
        const text = `Cambios guardados (${res.guardados ?? cambios.length} celdas).`;
        setMsg({ tone: "ok", text });
        notifySuccess(text);
      } else {
        const text = res.message ?? "No se pudieron guardar los cambios.";
        setMsg({ tone: "err", text });
        notifyError(text);
      }
    });
  }

  function exportarCsv() {
    const sep = ";";
    const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
    const head = ["Módulo", ...roles.map((r) => r.name)].map(esc).join(sep);
    const lines = [head];
    for (const g of grupos) {
      for (const f of g.filas) {
        const etiqueta = (f.depth === 1 ? "— " : "") + f.label;
        const celdas = roles.map((r) => {
          const lvl = NIVEL_META[valor(r.id, f.module)].label;
          return esParcialCelda(r.id, f.module) ? `${lvl} (parcial)` : lvl;
        });
        lines.push([etiqueta, ...celdas].map(esc).join(sep));
      }
    }
    const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "matriz-permisos.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  const dirty = sucios.length > 0;

  return (
    <div>
      <PageHeader
        title="Matriz de permisos"
        subtitle="Define el nivel de acceso que cada cargo tiene sobre los módulos y submódulos de la plataforma."
        actions={
          <>
            <Link
              href="/auditoria"
              className="inline-flex items-center gap-1.5 rounded-md border border-ink-200 bg-white px-3 py-2 text-[13px] font-medium text-ink-700 hover:bg-ink-50"
            >
              <Icon name="log" size={14} /> Historial de cambios
            </Link>
            <button
              onClick={exportarCsv}
              className="inline-flex items-center gap-1.5 rounded-md border border-ink-200 bg-white px-3 py-2 text-[13px] font-medium text-ink-700 hover:bg-ink-50"
            >
              <Icon name="download" size={14} /> Exportar
            </button>
            <button
              onClick={descartar}
              disabled={!dirty || saving}
              className="inline-flex items-center gap-1.5 rounded-md border border-ink-200 bg-white px-3 py-2 text-[13px] font-medium text-ink-700 hover:bg-ink-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Descartar cambios
            </button>
            <button
              onClick={guardar}
              disabled={!dirty || saving}
              className="inline-flex items-center gap-1.5 rounded-md bg-navy-700 px-4 py-2 text-[13px] font-semibold text-white hover:bg-navy-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? <EstadoProcesando>Guardando</EstadoProcesando> : dirty ? `Guardar cambios (${sucios.length})` : "Guardar cambios"}
            </button>
          </>
        }
      />

      {/* Leyenda de niveles */}
      <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-md border border-ink-150 bg-white px-4 py-2.5">
        {(["ver", "comentar", "operar", "administrar", "ninguno"] as Nivel[]).map((n) => {
          const m = NIVEL_META[n];
          return (
            <span key={n} className="inline-flex items-center gap-1.5 text-[12px] text-ink-600" title={m.hint}>
              <NivelBadge nivel={n} />
              <span>{m.hint}</span>
            </span>
          );
        })}
        <span
          className="inline-flex items-center gap-1.5 text-[12px] text-ink-600"
          title="La concesión real no cubre todas las acciones de este nivel. Al guardar el nivel se completará."
        >
          <span className="inline-flex items-center gap-1 rounded-full border border-warn-100 bg-warn-100 px-2 py-0.5 text-[11px] font-semibold text-warn-700">
            <Icon name="warn" size={11} /> Parcial
          </span>
          <span>Concesión incompleta para su nivel; se completa al guardar.</span>
        </span>
      </div>

      <div className="mb-4 flex items-start gap-2 rounded-md bg-blue-50 px-3 py-2.5 text-[12px] text-navy-700">
        <span className="mt-0.5 shrink-0"><Icon name="warn" size={14} /></span>
        <p>
          Selecciona el nivel de acceso que tendrá cada cargo sobre cada módulo. Cada nivel
          concede de forma acumulativa los permisos del nivel y los inferiores. Los cambios
          se aplican a la autorización real de la app al guardar.
        </p>
      </div>

      {msg && (
        <div
          className={`mb-4 rounded-md px-3 py-2 text-[12px] font-medium ${
            msg.tone === "ok" ? "bg-ok-100 text-ok-700" : "bg-err-100 text-err-700"
          }`}
        >
          {msg.text}
        </div>
      )}

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[12.5px]">
            <thead>
              <tr className="border-b border-ink-200 bg-ink-50">
                <th className="sticky left-0 z-10 min-w-[240px] bg-ink-50 px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-ink-500">
                  Módulo
                </th>
                {roles.map((r) => (
                  <th
                    key={r.id}
                    className="min-w-[140px] px-3 py-2.5 text-center text-[11px] font-semibold text-ink-700"
                    title={r.code}
                  >
                    {r.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grupos.map((g) => (
                <Grupo
                  key={g.titulo}
                  grupo={g}
                  roles={roles}
                  expandido={expandido}
                  onToggleItem={toggleItem}
                  valor={valor}
                  setCelda={setCelda}
                  esParcial={esParcialCelda}
                  cols={roles.length + 1}
                />
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function Grupo({
  grupo,
  roles,
  expandido,
  onToggleItem,
  valor,
  setCelda,
  esParcial,
  cols,
}: {
  grupo: GrupoMatriz;
  roles: RoleCol[];
  expandido: Set<string>;
  onToggleItem: (module: string) => void;
  valor: (roleId: number, module: string) => Nivel;
  setCelda: (roleId: number, module: string, nivel: Nivel) => void;
  esParcial: (roleId: number, module: string) => boolean;
  cols: number;
}) {
  const items = useMemo(() => aItems(grupo.filas), [grupo.filas]);
  return (
    <>
      <tr className="border-b border-ink-100 bg-ink-50/60">
        <td
          colSpan={cols}
          className="sticky left-0 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-500"
        >
          {grupo.titulo}
        </td>
      </tr>
      {items.map((it) => {
        const abierto = expandido.has(it.padre.module);
        const tieneHijos = it.hijos.length > 0;
        return (
          <FilaModulo
            key={it.padre.module}
            fila={it.padre}
            roles={roles}
            valor={valor}
            setCelda={setCelda}
            esParcial={esParcial}
            tieneHijos={tieneHijos}
            abierto={abierto}
            onToggle={() => onToggleItem(it.padre.module)}
            extra={
              tieneHijos && abierto
                ? it.hijos.map((h) => (
                    <FilaModulo
                      key={h.module}
                      fila={h}
                      roles={roles}
                      valor={valor}
                      setCelda={setCelda}
                      esParcial={esParcial}
                    />
                  ))
                : null
            }
          />
        );
      })}
    </>
  );
}

function FilaModulo({
  fila,
  roles,
  valor,
  setCelda,
  esParcial,
  tieneHijos = false,
  abierto = false,
  onToggle,
  extra = null,
}: {
  fila: ModuloRow;
  roles: RoleCol[];
  valor: (roleId: number, module: string) => Nivel;
  setCelda: (roleId: number, module: string, nivel: Nivel) => void;
  esParcial: (roleId: number, module: string) => boolean;
  tieneHijos?: boolean;
  abierto?: boolean;
  onToggle?: () => void;
  extra?: React.ReactNode;
}) {
  const hijo = fila.depth === 1;
  return (
    <>
      <tr className="border-b border-ink-100 hover:bg-ink-50/40">
        <td className={`sticky left-0 z-10 bg-white px-4 py-2 ${hijo ? "pl-10" : ""}`}>
          <div className="flex items-center gap-1.5">
            {tieneHijos ? (
              <button
                onClick={onToggle}
                className="-ml-1 rounded p-0.5 text-ink-400 hover:bg-ink-100 hover:text-ink-600"
                aria-label={abierto ? "Contraer" : "Expandir"}
              >
                <Icon name={abierto ? "chev-d" : "chev-r"} size={14} />
              </button>
            ) : (
              !hijo && <span className="inline-block w-[19px]" />
            )}
            <span className={hijo ? "text-ink-600" : "font-medium text-ink-800"}>{fila.label}</span>
          </div>
        </td>
        {roles.map((r) => (
          <td key={r.id} className="px-3 py-2 text-center">
            <CeldaNivel
              value={valor(r.id, fila.module)}
              niveles={fila.niveles}
              parcial={esParcial(r.id, fila.module)}
              onChange={(n) => setCelda(r.id, fila.module, n)}
              aria-label={`${r.name}: ${fila.label}`}
            />
          </td>
        ))}
      </tr>
      {extra}
    </>
  );
}

function NivelBadge({ nivel }: { nivel: Nivel }) {
  const m = NIVEL_META[nivel];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${TONO[m.tone]}`}>
      {m.icon ? <Icon name={m.icon} size={12} /> : <span className="font-bold">—</span>}
      {m.label}
    </span>
  );
}

function CeldaNivel({
  value,
  niveles,
  parcial = false,
  onChange,
  "aria-label": ariaLabel,
}: {
  value: Nivel;
  niveles: Nivel[];
  parcial?: boolean;
  onChange: (n: Nivel) => void;
  "aria-label": string;
}) {
  const m = NIVEL_META[value];
  // Si el valor actual no está entre las opciones del módulo, lo añade para no perderlo.
  const opciones = niveles.includes(value) ? niveles : [value, ...niveles];
  return (
    <div className="mx-auto w-full max-w-[150px]">
      <div className="relative">
        {/* Icono del nivel actual (a la izquierda del texto del select) */}
        <span className="pointer-events-none absolute left-2.5 top-1/2 flex -translate-y-1/2 items-center">
          {m.icon ? <Icon name={m.icon} size={13} /> : <span className="text-[12px] font-bold leading-none">—</span>}
        </span>
        <select
          value={value}
          onChange={(e) => onChange(e.target.value as Nivel)}
          aria-label={ariaLabel}
          className={`w-full cursor-pointer appearance-none rounded-md border py-1.5 pl-8 pr-7 text-[12px] font-semibold focus:outline-none focus:ring-2 focus:ring-navy-600 ${TONO[m.tone]}`}
        >
          {opciones.map((n) => (
            <option key={n} value={n}>
              {NIVEL_META[n].label}
            </option>
          ))}
        </select>
        {/* Flecha propia (la nativa se oculta con appearance-none) */}
        <span className="pointer-events-none absolute right-2 top-1/2 flex -translate-y-1/2 items-center opacity-70">
          <Icon name="chev-d" size={12} />
        </span>
      </div>
      {parcial && (
        <div
          className="mt-1 flex items-center justify-center gap-1 text-[10px] font-medium text-warn-700"
          title="Concesión parcial: este rol no tiene todas las acciones de este nivel. Si guardas este nivel, se completarán todas."
        >
          <Icon name="warn" size={10} /> Parcial
        </div>
      )}
    </div>
  );
}
