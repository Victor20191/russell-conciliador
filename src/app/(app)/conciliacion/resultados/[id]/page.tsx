import { notFound } from "next/navigation";
import prisma from "@/lib/prisma";
import { authorizePermiso, requirePermiso } from "@/lib/rbac";
import { clientIdPorNombre } from "@/lib/rbac/contexto";
import { PageHeader, StatCard, BackLink, EmptyState } from "@/components/ui";
import { Icon } from "@/components/icons";
import { fmtCalendarDate, fmtCompact, fmtDateTime, fmtPct } from "@/lib/format";
import CruceClient, { type Row, type Comment } from "./cruce-client";
import Conversacion from "@/components/conversacion";
import { parseId } from "@/lib/ids";
import { SendToReviewerButton } from "./send-to-reviewer-button";
import { FlashToast } from "@/components/flash-toast";

export default async function CruceDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ejecutada?: string }>;
}) {
  await requirePermiso("conciliaciones:ver");
  const { id: rawId } = await params;
  const { ejecutada } = await searchParams;
  const id = parseId(rawId);
  if (!id) notFound();
  const rec = await prisma.reconciliation.findUnique({
    where: { id },
    include: { rows: { orderBy: { order: "asc" } }, comments: { orderBy: { createdAt: "asc" } } },
  });
  if (!rec) notFound();

  // Alcance por cartera: leer este cruce exige READ sobre su cliente. Quien no
  // lo alcanza (cliente ajeno) es redirigido; Admin/Superadmin ven todo.
  const clientId = rec.clientId ?? (await clientIdPorNombre(rec.clientName));
  await requirePermiso("conciliaciones:ver", { clientId });

  // Editar exige, además, ALCANCE de escritura sobre el cliente de ESTE cruce:
  // los controles se ocultan fuera de ella.
  const puedeEditar = (await authorizePermiso("conciliaciones:editar", { clientId })).ok;

  const rows: Row[] = rec.rows.map((r) => ({ id: r.id, cuenta: r.cuenta, desc: r.desc, cont: r.cont, mod: r.mod, diff: r.diff, items: r.items, manualStatus: r.manualStatus }));
  const comments: Comment[] = rec.comments.map((c) => ({ id: c.id, cuenta: c.cuenta, who: c.who, initials: c.initials, text: c.text, time: fmtDateTime(c.createdAt) }));

  const totals = rows.reduce((t, r) => ({ cont: t.cont + r.cont, mod: t.mod + r.mod, diff: t.diff + r.diff }), { cont: 0, mod: 0, diff: 0 });
  const itemsDiff = rows.filter((r) => r.diff !== 0).length;
  const diffPct = totals.cont !== 0 ? (totals.diff / totals.cont) * 100 : 0;

  return (
    <div>
      {ejecutada === "1" && (
        <FlashToast
          tone="success"
          title="Conciliación ejecutada correctamente."
          message="El cruce se generó y está listo para revisión."
          clearParam="ejecutada"
        />
      )}
      <div className="mb-3"><BackLink href="/conciliacion/resultados" label="Resultados de conciliación" /></div>
      <PageHeader
        title={`${rec.clientName} · ${rec.module}`}
        subtitle={`Resultado del cruce #${rec.id} · ${rec.code} · Período ${rec.period}${rec.cutoff ? ` · Corte ${fmtCalendarDate(rec.cutoff)}` : ""} · ERP ${rec.erp}${rec.runAt ? ` · Ejecutado ${fmtDateTime(rec.runAt)} por ${rec.runBy}` : ""}`}
        actions={
          <div className="flex items-center gap-2">
            <button disabled title="Exportación — fase posterior" className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-md bg-ink-100 px-2.5 py-2 text-[12px] font-semibold text-ink-400"><Icon name="download" size={13} /> Excel</button>
            <button disabled title="Exportación — fase posterior" className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-md bg-ink-100 px-2.5 py-2 text-[12px] font-semibold text-ink-400"><Icon name="download" size={13} /> PDF</button>
            {puedeEditar && <SendToReviewerButton id={rec.id} />}
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

      <div className="mt-6">
        <Conversacion
          tipo="conciliaciones"
          entityId={rec.id}
          titulo={`Conversación · ${rec.clientName} · cruce #${rec.id}`}
        />
      </div>
    </div>
  );
}
