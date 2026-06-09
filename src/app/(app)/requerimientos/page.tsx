import prisma from "@/lib/prisma";
import { requirePermiso } from "@/lib/rbac";
import { PageHeader } from "@/components/ui";
import RequerimientosClient, { type Template, type Submission } from "./requerimientos-client";

export default async function RequerimientosPage() {
  await requirePermiso("requerimientos:ver");
  const [templates, history] = await Promise.all([
    prisma.reqTemplate.findMany({ orderBy: { timesUsed: "desc" } }),
    prisma.reqSubmission.findMany({ orderBy: { createdAt: "desc" } }),
  ]);
  const tpl: Template[] = templates.map((t) => ({ id: t.id, code: t.code, name: t.name, description: t.description, activeVersion: t.activeVersion, families: t.families, items: t.items, timesUsed: t.timesUsed, lastUpdated: t.lastUpdated, lastUpdatedBy: t.lastUpdatedBy }));
  const hist: Submission[] = history.map((h) => ({ id: h.id, consec: h.consec, templateCode: h.templateCode, templateVersion: h.templateVersion, clientName: h.clientName, period: h.period, recipients: h.recipients, status: h.status, date: h.date }));

  return (
    <div>
      <PageHeader title="Requerimientos de información" subtitle="Plantillas parametrizadas con versionamiento, encabezado de carta y documentos por familia. Genera y envía a los contactos del cliente." />
      <RequerimientosClient templates={tpl} history={hist} />
    </div>
  );
}
