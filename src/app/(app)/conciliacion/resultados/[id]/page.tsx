import { notFound } from "next/navigation";
import prisma from "@/lib/prisma";
import { PageHeader, StatCard, BackLink, EmptyState } from "@/components/ui";
import { Icon } from "@/components/icons";
import { fmtCompact, fmtPct } from "@/lib/format";
import { sendToReviewer } from "@/app/actions/reconciliation";
import CruceClient, { type Row, type Comment } from "./cruce-client";
import { parseId } from "@/lib/ids";

export default async function CruceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;
  const id = parseId(rawId);
  if (!id) notFound();
  const rec = await prisma.reconciliation.findUnique({
    where: { id },
    include: { rows: { orderBy: { order: "asc" } }, comments: { orderBy: { createdAt: "asc" } } },
  });
  if (!rec) notFound();

  const rows: Row[] = rec.rows.map((r) => ({ id: r.id, cuenta: r.cuenta, desc: r.desc, cont: r.cont, mod: r.mod, diff: r.diff, items: r.items, manualStatus: r.manualStatus }));
  const comments: Comment[] = rec.comments.map((c) => ({ id: c.id, cuenta: c.cuenta, who: c.who, initials: c.initials, text: c.text, time: c.time }));

  const totals = rows.reduce((t, r) => ({ cont: t.cont + r.cont, mod: t.mod + r.mod, diff: t.diff + r.diff }), { cont: 0, mod: 0, diff: 0 });
  const itemsDiff = rows.filter((r) => r.diff !== 0).length;
  const diffPct = totals.cont !== 0 ? (totals.diff / totals.cont) * 100 : 0;

  return (
    <div>
      <div className="mb-3"><BackLink href="/conciliacion/resultados" label="Resultados de conciliación" /></div>
      <PageHeader
        title={`${rec.clientName} · ${rec.module}`}
        subtitle={`Resultado del cruce #${rec.id} · ${rec.code} · Período ${rec.period}${rec.cutoff ? ` · Corte ${rec.cutoff}` : ""} · ERP ${rec.erp}${rec.runAt ? ` · Ejecutado ${rec.runAt} por ${rec.runBy}` : ""}`}
        actions={
          <div className="flex items-center gap-2">
            <button disabled title="Exportación — fase posterior" className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-md bg-ink-100 px-2.5 py-2 text-[12px] font-semibold text-ink-400"><Icon name="download" size={13} /> Excel</button>
            <button disabled title="Exportación — fase posterior" className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-md bg-ink-100 px-2.5 py-2 text-[12px] font-semibold text-ink-400"><Icon name="download" size={13} /> PDF</button>
            <form action={sendToReviewer}>
              <input type="hidden" name="id" value={rec.id} />
              <button type="submit" className="inline-flex items-center gap-1.5 rounded-md bg-navy-700 px-3 py-2 text-[12.5px] font-semibold text-white hover:bg-navy-600"><Icon name="send" size={14} /> Enviar a revisor</button>
            </form>
          </div>
        }
      />

      {rows.length === 0 ? (
        <EmptyState icon="play" title="Sin detalle de cruce" description="Esta conciliación no tiene el detalle por cuenta cargado en el repositorio." />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <StatCard label="Saldo contabilidad" value={fmtCompact(totals.cont)} tone="blue" />
            <StatCard label="Saldo módulo" value={fmtCompact(totals.mod)} tone="ink" />
            <StatCard label="Diferencia neta" value={fmtCompact(totals.diff)} hint={fmtPct(diffPct)} tone={totals.diff !== 0 ? "err" : "ok"} />
            <StatCard label="Partidas con diferencia" value={`${itemsDiff} / ${rows.length}`} hint={`${comments.length} comentario(s)`} tone="warn" />
          </div>
          <CruceClient reconciliationId={rec.id} materiality={rec.materiality} rows={rows} comments={comments} totals={totals} diffPct={diffPct} />
        </>
      )}
    </div>
  );
}
