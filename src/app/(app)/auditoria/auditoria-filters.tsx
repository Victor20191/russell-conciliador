"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Icon } from "@/components/icons";

export default function AuditoriaFilters({ users, actions }: { users: string[]; actions: string[] }) {
  const router = useRouter();
  const sp = useSearchParams();
  const set = (key: string, value: string) => {
    const next = new URLSearchParams(sp.toString());
    if (value) next.set(key, value); else next.delete(key);
    router.push(`/auditoria?${next.toString()}`);
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-2 rounded-md border border-ink-200 bg-ink-50 px-2.5 py-1.5 text-ink-400">
        <Icon name="search" size={14} />
        <input defaultValue={sp.get("q") ?? ""} onChange={(e) => set("q", e.target.value)} placeholder="Buscar entidad o detalle…" className="w-52 bg-transparent text-[12.5px] text-ink-700 outline-none placeholder:text-ink-400" />
      </div>
      <select value={sp.get("user") ?? ""} onChange={(e) => set("user", e.target.value)} className="rounded-md border border-ink-200 px-2 py-1.5 text-[12.5px] text-ink-700 outline-none"><option value="">Todos los usuarios</option>{users.map((u) => <option key={u} value={u}>{u}</option>)}</select>
      <select value={sp.get("action") ?? ""} onChange={(e) => set("action", e.target.value)} className="rounded-md border border-ink-200 px-2 py-1.5 text-[12.5px] text-ink-700 outline-none"><option value="">Todas las acciones</option>{actions.map((a) => <option key={a} value={a}>{a}</option>)}</select>
      <button disabled title="Exportación — fase posterior" className="ml-auto inline-flex cursor-not-allowed items-center gap-1.5 rounded-md bg-ink-100 px-2.5 py-1.5 text-[12px] font-semibold text-ink-400"><Icon name="download" size={13} /> Exportar CSV</button>
    </div>
  );
}
