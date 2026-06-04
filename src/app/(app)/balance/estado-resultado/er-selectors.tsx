"use client";

import { useRouter } from "next/navigation";

export default function ErSelectors({
  clientNames, cliente, periods, periodo,
}: {
  clientNames: string[]; cliente: string; periods: string[]; periodo: string;
}) {
  const router = useRouter();
  const go = (c: string, p: string) =>
    router.push(`/balance/estado-resultado?cliente=${encodeURIComponent(c)}&periodo=${encodeURIComponent(p)}`);
  return (
    <div className="flex items-center gap-2">
      <select value={cliente} onChange={(e) => go(e.target.value, "")} className="rounded-md border border-ink-200 px-2 py-1.5 text-[12.5px] text-ink-700 outline-none">
        {clientNames.map((n) => <option key={n} value={n}>{n}</option>)}
      </select>
      <select value={periodo} onChange={(e) => go(cliente, e.target.value)} className="rounded-md border border-ink-200 px-2 py-1.5 text-[12.5px] text-ink-700 outline-none">
        {periods.map((p) => <option key={p} value={p}>{p}</option>)}
      </select>
    </div>
  );
}
