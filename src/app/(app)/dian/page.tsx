import Link from "next/link";
import prisma from "@/lib/prisma";
import { requirePermiso } from "@/lib/rbac";
import { PageHeader, Card, Chip } from "@/components/ui";
import { Icon, type IconName } from "@/components/icons";
import { fmtCalendarDate } from "@/lib/format";

export default async function DianPage() {
  await requirePermiso("dian:ver");
  const forms = await prisma.dianForm.findMany({ include: { periods: { orderBy: { periodKey: "desc" } } } });
  const tone = (s: string) => (s === "OK" ? "ok" : s === "DIFF" ? "err" : "warn");
  const label = (s: string) => (s === "OK" ? "Conciliado" : s === "DIFF" ? "Diferencia" : "Pendiente");

  return (
    <div>
      <PageHeader title="Impuestos · DIAN" subtitle="Carga los formatos presentados a la DIAN y crúzalos contra la contabilidad del cliente." />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {forms.map((f) => (
          <Card key={f.id}>
            <div className="flex items-center gap-3 border-b border-ink-100 px-4 py-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-md bg-blue-100 text-blue-500"><Icon name={f.icon as IconName} size={17} /></div>
              <div className="flex-1"><h2 className="text-[13px] font-semibold text-ink-800">{f.name}</h2><div className="text-[11.5px] text-ink-500"><span className="font-mono">{f.code}</span> · {f.periodicity}</div></div>
            </div>
            <div className="divide-y divide-ink-50">
              {f.periods.map((p) => (
                <Link key={p.id} href={`/dian/${p.id}`} className="flex items-center justify-between px-4 py-2.5 hover:bg-ink-50">
                  <div>
                    <div className="text-[12.5px] text-ink-800">{p.label}</div>
                    {p.filed && <div className="text-[11px] text-ink-400">Presentado: {fmtCalendarDate(p.filed)}</div>}
                  </div>
                  <div className="flex items-center gap-2"><Chip label={label(p.status)} tone={tone(p.status)} /><Icon name="chev-r" size={13} className="text-ink-400" /></div>
                </Link>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
