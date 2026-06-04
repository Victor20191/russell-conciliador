import prisma from "@/lib/prisma";
import { PageHeader, Card } from "@/components/ui";

export default async function AuditoriaPage() {
  const entries = await prisma.auditEntry.findMany({
    orderBy: { ts: "desc" },
  });

  const actionTone = (a: string) => {
    if (a.includes("EJECUTÓ") || a.includes("INICIÓ")) return "bg-blue-100 text-navy-700";
    if (a.includes("GUARDÓ") || a.includes("CARGÓ")) return "bg-ok-100 text-ok-700";
    if (a.includes("ASIGNÓ")) return "bg-ai-100 text-ai-700";
    return "bg-ink-100 text-ink-600";
  };

  return (
    <div>
      <PageHeader
        title="Auditoría"
        subtitle="Registro de actividad y trazabilidad de acciones del sistema"
      />
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="border-b border-ink-100 text-left text-[11px] uppercase tracking-wider text-ink-500">
                <th className="px-4 py-2.5 font-semibold">Fecha y hora</th>
                <th className="px-4 py-2.5 font-semibold">Usuario</th>
                <th className="px-4 py-2.5 font-semibold">Acción</th>
                <th className="px-4 py-2.5 font-semibold">Entidad</th>
                <th className="px-4 py-2.5 font-semibold">Detalle</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id} className="border-b border-ink-50 last:border-0 hover:bg-ink-50">
                  <td className="whitespace-nowrap px-4 py-2.5 font-mono text-[11.5px] text-ink-500">{e.ts}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-ink-800">{e.user}</td>
                  <td className="px-4 py-2.5">
                    <span className={`inline-flex rounded px-2 py-0.5 text-[10.5px] font-semibold ${actionTone(e.action)}`}>
                      {e.action}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-ink-700">{e.entity}</td>
                  <td className="px-4 py-2.5 text-ink-500">{e.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
