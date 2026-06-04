import { notFound } from "next/navigation";
import prisma from "@/lib/prisma";
import { PageHeader, StatCard, BackLink } from "@/components/ui";
import { Icon } from "@/components/icons";
import { sendRepoReminder } from "@/app/actions/repositorios";
import RepoClient, { type Family, type Activity } from "./repo-client";

export default async function RepoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const repo = await prisma.reqRepository.findUnique({
    where: { id },
    include: { families: { orderBy: { order: "asc" }, include: { items: { orderBy: { order: "asc" } } } }, activity: { orderBy: { order: "asc" } } },
  });
  if (!repo) notFound();

  const families: Family[] = repo.families.map((f) => ({ id: f.id, code: f.code, name: f.name, total: f.total, received: f.received, pending: f.pending, items: f.items.map((it) => ({ id: it.id, idx: it.idx, doc: it.doc, due: it.due, status: it.status, file: it.file, size: it.size, by: it.by, at: it.at })) }));
  const activity: Activity[] = repo.activity.map((a) => ({ id: a.id, at: a.at, actor: a.actor, role: a.role, action: a.action, detail: a.detail }));

  return (
    <div>
      <div className="mb-3"><BackLink href="/requerimientos/repositorios" label="Repositorios" /></div>
      <PageHeader
        title={`Repositorio ${repo.consec}`}
        subtitle={`${repo.clientName} · ${repo.period} · Enviado ${repo.sentAt} por ${repo.sentBy} · Vencimiento ${repo.deadline} · ${repo.templateCode}`}
        actions={
          <div className="flex items-center gap-2">
            <form action={sendRepoReminder}><input type="hidden" name="repositoryId" value={repo.id} /><button type="submit" className="inline-flex items-center gap-1.5 rounded-md border border-ink-200 px-3 py-2 text-[12.5px] font-medium text-ink-700 hover:bg-ink-50"><Icon name="send" size={14} /> Enviar recordatorio</button></form>
            <button disabled title="Descarga — fase posterior" className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-md bg-ink-100 px-3 py-2 text-[12px] font-semibold text-ink-400"><Icon name="download" size={14} /> Descargar todo</button>
            <button disabled title="Presentaciones — Fase 6C" className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-md bg-ink-100 px-3 py-2 text-[12px] font-semibold text-ink-400"><Icon name="play" size={14} /> Generar presentación</button>
          </div>
        }
      />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Total ítems" value={String(repo.total)} tone="blue" />
        <StatCard label="Recibidos" value={String(repo.received)} tone="ok" />
        <StatCard label="Pendientes" value={String(repo.pending)} tone="warn" />
        <StatCard label="Vencidos" value={String(repo.overdue)} tone="err" />
      </div>
      <RepoClient repositoryId={repo.id} families={families} activity={activity} />
    </div>
  );
}
