"use client";

import { useRouter, useSearchParams } from "next/navigation";

const RANGOS = [
  { value: "7", label: "Últimos 7 días" },
  { value: "30", label: "Últimos 30 días" },
  { value: "90", label: "Últimos 90 días" },
  { value: "todo", label: "Todo el histórico" },
];

const TIPOS = [
  { value: "", label: "Todos los eventos" },
  { value: "navegacion", label: "Navegaciones" },
  { value: "ingreso", label: "Ingresos" },
  { value: "salida", label: "Cierres de sesión" },
];

export default function AccesosFilters({ users }: { users: string[] }) {
  const router = useRouter();
  const sp = useSearchParams();
  const set = (key: string, value: string) => {
    const next = new URLSearchParams(sp.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    router.push(`/auditoria/accesos?${next.toString()}`);
  };

  const selectCls =
    "rounded-md border border-ink-200 px-2 py-1.5 text-[12.5px] text-ink-700 outline-none";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select value={sp.get("dias") ?? "30"} onChange={(e) => set("dias", e.target.value)} className={selectCls}>
        {RANGOS.map((r) => (
          <option key={r.value} value={r.value}>{r.label}</option>
        ))}
      </select>
      <select value={sp.get("user") ?? ""} onChange={(e) => set("user", e.target.value)} className={selectCls}>
        <option value="">Todos los usuarios</option>
        {users.map((u) => (
          <option key={u} value={u}>{u}</option>
        ))}
      </select>
      <select value={sp.get("kind") ?? ""} onChange={(e) => set("kind", e.target.value)} className={selectCls}>
        {TIPOS.map((t) => (
          <option key={t.value} value={t.value}>{t.label}</option>
        ))}
      </select>
    </div>
  );
}
