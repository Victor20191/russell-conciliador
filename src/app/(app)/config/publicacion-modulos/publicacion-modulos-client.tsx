"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { guardarPublicacionModulos, type CambioPublicacionModulo } from "@/app/actions/module-publication";
import { Card, Chip, PageHeader, StatCard } from "@/components/ui";
import { Icon, type IconName } from "@/components/icons";
import { notifyError, notifySuccess } from "@/lib/client-notifications";
import type { PlatformModuleState } from "@/lib/rbac/modulos-plataforma";

type Message = { tone: "ok" | "err"; text: string } | null;

const groupLabel: Record<string, string> = {
  Trabajo: "Trabajo",
  Configuración: "Configuración",
};

export default function PublicacionModulosClient({
  modules,
  nonSuperadminUsers,
}: {
  modules: PlatformModuleState[];
  nonSuperadminUsers: number;
}) {
  const initial = useMemo(
    () => Object.fromEntries(modules.map((m) => [m.key, m.enabledForNonAdmins])),
    [modules],
  );
  const [base, setBase] = useState<Record<string, boolean>>(initial);
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const [saving, startSaving] = useTransition();
  const [msg, setMsg] = useState<Message>(null);

  const value = (key: string) => pending[key] ?? base[key] ?? true;
  const dirtyKeys = Object.keys(pending).filter((key) => pending[key] !== base[key]);
  const dirty = dirtyKeys.length > 0;
  const totalConfigurable = modules.filter((m) => m.configurableForNonAdmins).length;
  const published = modules.filter((m) => m.configurableForNonAdmins && value(m.key)).length;
  const hidden = totalConfigurable - published;

  const groups = useMemo(() => {
    const grouped = new Map<string, PlatformModuleState[]>();
    for (const m of modules) {
      const list = grouped.get(m.group) ?? [];
      list.push(m);
      grouped.set(m.group, list);
    }
    return [...grouped.entries()];
  }, [modules]);

  function setModule(key: string, enabled: boolean) {
    setMsg(null);
    setPending((prev) => {
      const next = { ...prev };
      if (enabled === base[key]) delete next[key];
      else next[key] = enabled;
      return next;
    });
  }

  function descartar() {
    setPending({});
    setMsg(null);
  }

  function guardar() {
    if (!dirty) return;
    const cambios: CambioPublicacionModulo[] = dirtyKeys.map((key) => ({
      key,
      enabledForNonAdmins: pending[key],
    }));
    setMsg(null);
    startSaving(async () => {
      const res = await guardarPublicacionModulos(cambios);
      if (res.ok) {
        setBase((prev) => {
          const next = { ...prev };
          for (const key of dirtyKeys) next[key] = pending[key];
          return next;
        });
        setPending({});
        const text = `Publicación actualizada (${res.guardados ?? cambios.length}).`;
        setMsg({ tone: "ok", text });
        notifySuccess(text);
      } else {
        const text = res.message ?? "No se pudo guardar la publicación.";
        setMsg({ tone: "err", text });
        notifyError(text);
      }
    });
  }

  return (
    <div>
      <PageHeader
        title="Publicación de módulos"
        subtitle="Controla qué módulos están publicados para los usuarios que no son superadministradores. La matriz de permisos sigue definiendo el nivel de acceso."
        actions={
          <>
            <Link
              href="/config/permisos"
              className="inline-flex items-center gap-1.5 rounded-md border border-ink-200 bg-white px-3 py-2 text-[13px] font-medium text-ink-700 hover:bg-ink-50"
            >
              <Icon name="settings" size={14} /> Permisos por rol
            </Link>
            <button
              type="button"
              onClick={descartar}
              disabled={!dirty || saving}
              className="rounded-md border border-ink-200 bg-white px-3 py-2 text-[13px] font-medium text-ink-700 hover:bg-ink-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Descartar cambios
            </button>
            <button
              type="button"
              onClick={guardar}
              disabled={!dirty || saving}
              className="rounded-md bg-navy-700 px-4 py-2 text-[13px] font-semibold text-white hover:bg-navy-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? "Guardando..." : dirty ? `Guardar cambios (${dirtyKeys.length})` : "Guardar cambios"}
            </button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Usuarios no superadmin" value={String(nonSuperadminUsers)} tone="blue" />
        <StatCard label="Publicados" value={`${published}/${totalConfigurable}`} tone="ok" />
        <StatCard label="En desarrollo" value={String(hidden)} tone={hidden > 0 ? "warn" : "ink"} />
        <StatCard label="Cambios pendientes" value={String(dirtyKeys.length)} tone={dirty ? "warn" : "ink"} />
      </div>

      {msg && (
        <div
          className={`mt-4 rounded-md px-3 py-2 text-[12px] font-medium ${
            msg.tone === "ok" ? "bg-ok-100 text-ok-700" : "bg-err-100 text-err-700"
          }`}
        >
          {msg.text}
        </div>
      )}

      <div className="mt-5 flex flex-col gap-5">
        {groups.map(([group, items]) => (
          <Card key={group} className="overflow-hidden">
            <div className="border-b border-ink-100 bg-ink-50 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-ink-500">
              {groupLabel[group] ?? group}
            </div>
            <div className="divide-y divide-ink-100">
              {items.map((module) => (
                <ModuleRow
                  key={module.key}
                  module={module}
                  enabled={value(module.key)}
                  dirty={pending[module.key] !== undefined}
                  onChange={(enabled) => setModule(module.key, enabled)}
                />
              ))}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function ModuleRow({
  module,
  enabled,
  dirty,
  onChange,
}: {
  module: PlatformModuleState;
  enabled: boolean;
  dirty: boolean;
  onChange: (enabled: boolean) => void;
}) {
  const locked = !module.configurableForNonAdmins;
  return (
    <div className="grid grid-cols-[1fr_auto] items-center gap-4 px-4 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-blue-100 text-blue-500">
          <Icon name={module.icon as IconName} size={17} />
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-[13px] font-semibold text-ink-800">{module.label}</h2>
            {locked ? (
              <Chip label="Fijo" tone="ink" />
            ) : enabled ? (
              <Chip label="Publicado" tone="ok" />
            ) : (
              <Chip label="En desarrollo" tone="warn" />
            )}
            {dirty && <Chip label="Sin guardar" tone="blue" />}
          </div>
          <p className="mt-0.5 text-[12px] text-ink-500">{module.description}</p>
        </div>
      </div>

      <label
        className={`relative inline-flex h-6 w-11 shrink-0 items-center ${
          locked ? "cursor-not-allowed opacity-45" : "cursor-pointer"
        }`}
        title={locked ? "Siempre visible" : enabled ? "Publicado" : "En desarrollo"}
      >
        <input
          type="checkbox"
          checked={enabled}
          disabled={locked}
          onChange={(event) => onChange(event.target.checked)}
          className="peer sr-only"
          aria-label={`${module.label}: ${enabled ? "publicado" : "en desarrollo"}`}
        />
        <span className="h-6 w-11 rounded-full bg-ink-200 transition peer-checked:bg-navy-700" />
        <span className="absolute left-1 h-4 w-4 rounded-full bg-white shadow-sm transition peer-checked:translate-x-5" />
      </label>
    </div>
  );
}
