import prisma from "@/lib/prisma";
import { PageHeader } from "@/components/ui";
import ConfigDianClient, { type DianFormData } from "./config-dian-client";
import { requireRole } from "@/lib/rbac";

export default async function ConfigDianPage() {
  await requireRole("Líder");
  const forms = await prisma.dianForm.findMany({
    include: { sections: { orderBy: { order: "asc" }, include: { lines: { orderBy: { order: "asc" } } } }, mappings: true },
    orderBy: { code: "asc" },
  });

  const data: DianFormData[] = forms.map((f) => ({
    id: f.id, name: f.name, code: f.code,
    sections: f.sections.map((s) => ({ id: s.id, title: s.title, lines: s.lines.map((l) => ({ k: l.k, label: l.label })) })),
    mappings: f.mappings.map((m) => ({ lineKey: m.lineKey, account: m.account, desc: m.desc, sign: m.sign })),
  }));

  return (
    <div>
      <PageHeader title="Mapeos DIAN" subtitle="Configura qué cuentas contables suman o restan al saldo de cada renglón de los formatos DIAN. Plantilla estándar reutilizable por cliente." />
      <ConfigDianClient forms={data} />
    </div>
  );
}
