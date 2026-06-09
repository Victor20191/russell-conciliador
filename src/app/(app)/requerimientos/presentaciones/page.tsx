import Link from "next/link";
import prisma from "@/lib/prisma";
import { authorizePermiso, requirePermiso } from "@/lib/rbac";
import { PageHeader, Card, Chip, StatCard } from "@/components/ui";
import { Icon } from "@/components/icons";
import { createPresentation } from "@/app/actions/presentaciones";

export default async function PresentacionesPage() {
  await requirePermiso("presentaciones:ver");
  const puedeCrear = (await authorizePermiso("presentaciones:crear")).ok;
  const list = await prisma.reqPresentation.findMany({ orderBy: { id: "desc" } });
  const enviadas = list.filter((p) => p.status === "Enviada").length;
  const borradores = list.filter((p) => p.status === "Borrador").length;

  return (
    <div>
      <PageHeader
        title="Presentaciones a cliente"
        subtitle="Genera el informe ejecutivo en formato presentación a partir de los aspectos evaluados. Salida navegable y exportable."
        actions={puedeCrear ? <form action={createPresentation}><button type="submit" className="inline-flex items-center gap-1.5 rounded-md bg-navy-700 px-3 py-2 text-[12.5px] font-semibold text-white hover:bg-navy-600"><Icon name="plus" size={14} /> Nueva presentación</button></form> : null}
      />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Generadas (2025)" value={String(list.length)} hint="Aspectos legales y tributarios" tone="blue" />
        <StatCard label="Enviadas a cliente" value={String(enviadas)} hint="Vía repositorio o correo" tone="ok" />
        <StatCard label="En borrador" value={String(borradores)} hint="Pendientes de revisión interna" tone="warn" />
        <StatCard label="Tiempo medio" value="22 min" hint="Del asistente al informe" tone="ink" />
      </div>
      <Card className="mt-5">
        <div className="border-b border-ink-100 px-4 py-3 text-[13px] font-semibold text-ink-800">Histórico</div>
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead><tr className="border-b border-ink-100 text-left text-[11px] uppercase tracking-wider text-ink-500"><th className="px-4 py-2 font-semibold">Consec.</th><th className="px-4 py-2 font-semibold">Cliente</th><th className="px-4 py-2 font-semibold">Título</th><th className="px-4 py-2 text-right font-semibold">Slides</th><th className="px-4 py-2 font-semibold">Autor</th><th className="px-4 py-2 font-semibold">Fecha</th><th className="px-4 py-2 font-semibold">Estado</th><th className="px-4 py-2"></th></tr></thead>
            <tbody>
              {list.map((p) => (
                <tr key={p.id} className="border-b border-ink-50 last:border-0 hover:bg-ink-50">
                  <td className="px-4 py-2.5 font-mono text-[11.5px] text-ink-500">{p.id}</td>
                  <td className="px-4 py-2.5 text-ink-800">{p.clientName}</td>
                  <td className="px-4 py-2.5 text-ink-700">{p.title}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-ink-600">{p.slides}</td>
                  <td className="px-4 py-2.5 text-ink-600">{p.author}</td>
                  <td className="px-4 py-2.5 text-ink-500">{p.date}</td>
                  <td className="px-4 py-2.5"><Chip label={p.status} tone={p.status === "Enviada" ? "ok" : "warn"} /></td>
                  <td className="px-4 py-2.5 text-right"><Link href={`/requerimientos/presentaciones/${p.id}`} className="inline-flex items-center gap-1 text-[12px] font-medium text-blue-500 hover:underline">Ver <Icon name="chev-r" size={12} /></Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
