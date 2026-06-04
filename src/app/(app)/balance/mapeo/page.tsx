import prisma from "@/lib/prisma";
import { PageHeader, Card, Chip } from "@/components/ui";

export default async function MapeoPage() {
  const accounts = await prisma.standardAccount.findMany({
    orderBy: { code: "asc" },
  });

  return (
    <div>
      <PageHeader
        title="Mapeo plan estándar"
        subtitle="Plan único de cuentas (PUC) de la firma al que se mapean los planes de cada cliente"
      />
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="border-b border-ink-100 text-left text-[11px] uppercase tracking-wider text-ink-500">
                <th className="px-4 py-2.5 font-semibold">Código</th>
                <th className="px-4 py-2.5 font-semibold">Cuenta</th>
                <th className="px-4 py-2.5 font-semibold">Nivel</th>
                <th className="px-4 py-2.5 font-semibold">Naturaleza</th>
                <th className="px-4 py-2.5 font-semibold">Crítica</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((a) => (
                <tr key={a.code} className="border-b border-ink-50 last:border-0 hover:bg-ink-50">
                  <td className="px-4 py-2 font-mono text-ink-700" style={{ paddingLeft: `${16 + (a.level - 1) * 16}px` }}>
                    {a.code}
                  </td>
                  <td className={`px-4 py-2 ${a.level === 1 ? "font-semibold text-ink-900" : "text-ink-700"}`}>
                    {a.name}
                  </td>
                  <td className="px-4 py-2 text-ink-500">{a.level}</td>
                  <td className="px-4 py-2">
                    <span className="font-mono text-[11.5px] text-ink-600">{a.nature === "D" ? "Débito" : "Crédito"}</span>
                  </td>
                  <td className="px-4 py-2">{a.critical && <Chip label="crítica" tone="err" />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
