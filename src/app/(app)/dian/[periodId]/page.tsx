import { notFound } from "next/navigation";
import prisma from "@/lib/prisma";
import { PageHeader, StatCard, BackLink, EmptyState } from "@/components/ui";
import { Icon } from "@/components/icons";
import { fmtCompact, fmtPct } from "@/lib/format";
import DianDetailClient, { type Section, type Mapping, type Comment } from "./dian-detail-client";
import { parseId } from "@/lib/ids";

export default async function DianDetailPage({ params }: { params: Promise<{ periodId: string }> }) {
  const { periodId: rawPeriodId } = await params;
  const periodId = parseId(rawPeriodId);
  if (!periodId) notFound();
  const period = await prisma.dianPeriod.findUnique({ where: { id: periodId } });
  if (!period) notFound();

  const form = await prisma.dianForm.findUnique({
    where: { id: period.formId },
    include: { sections: { orderBy: { order: "asc" }, include: { lines: { orderBy: { order: "asc" } } } }, mappings: true, comments: { orderBy: { createdAt: "asc" } } },
  });
  if (!form) notFound();

  const sections: Section[] = form.sections.map((s) => ({
    id: s.id, key: s.key, title: s.title, side: s.side, note: s.note,
    lines: s.lines.map((l) => ({ k: l.k, label: l.label, decl: l.decl, cont: l.cont, diff: l.diff })),
  }));
  const mappings: Mapping[] = form.mappings.map((m) => ({ lineKey: m.lineKey, account: m.account, desc: m.desc, sign: m.sign }));
  const comments: Comment[] = form.comments.map((c) => ({ id: c.id, lineKey: c.lineKey, who: c.who, initials: c.initials, text: c.text, time: c.time, isAI: c.isAI }));

  // KPIs: totales excluyendo la sección de Ingresos (ID terminada en "-ING"), igual que el prototipo.
  const totalsSecs = sections.filter((s) => !s.key.endsWith("-ING") && s.key !== "ING");
  const totalDecl = totalsSecs.reduce((t, s) => t + s.lines.reduce((a, l) => a + l.decl, 0), 0);
  const totalCont = totalsSecs.reduce((t, s) => t + s.lines.reduce((a, l) => a + l.cont, 0), 0);
  const totalDiff = totalDecl - totalCont;
  const allLines = sections.flatMap((s) => s.lines);
  const linesWithDiff = allLines.filter((l) => l.diff !== 0).length;

  return (
    <div>
      <div className="mb-3"><BackLink href="/dian" label="Impuestos · DIAN" /></div>
      <PageHeader
        title={`${form.name} · ${period.label}`}
        subtitle={`Inversiones del Pacífico S.A.S · NIT 900.451.227-3${period.filed ? ` · Declaración presentada ${period.filed}` : ""}`}
        actions={
          <div className="flex items-center gap-2">
            <button disabled title="Exportación — fase posterior" className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-md bg-ink-100 px-2.5 py-2 text-[12px] font-semibold text-ink-400"><Icon name="download" size={13} /> Excel</button>
            <button disabled title="Exportación — fase posterior" className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-md bg-ink-100 px-2.5 py-2 text-[12px] font-semibold text-ink-400"><Icon name="download" size={13} /> PDF</button>
          </div>
        }
      />

      {form.objective && (
        <div className="mb-4 rounded-lg bg-navy-800 px-4 py-3 text-[12.5px] text-[#C9D4E2]">
          <div className="text-[10.5px] font-semibold uppercase tracking-wider text-[#7C8DA3]">Objetivo</div>
          <p className="mt-0.5">{form.objective}</p>
          <div className="mt-2 text-[10.5px] font-semibold uppercase tracking-wider text-[#7C8DA3]">Conclusión</div>
          <p className="mt-0.5 text-white">{form.conclusion}</p>
        </div>
      )}

      {allLines.length === 0 ? (
        <EmptyState icon="doc" title="Sin renglones" description="Este formato no tiene la estructura de renglones cargada." />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <StatCard label="Total declarado" value={fmtCompact(totalDecl)} tone="blue" />
            <StatCard label="Total contabilidad" value={fmtCompact(totalCont)} tone="ink" />
            <StatCard label="Diferencia neta" value={fmtCompact(totalDiff)} hint={fmtPct(totalDecl !== 0 ? (totalDiff / totalDecl) * 100 : 0)} tone={Math.abs(totalDiff) > 1 ? "err" : "ok"} />
            <StatCard label="Renglones con diferencia" value={`${linesWithDiff} / ${allLines.length}`} hint={`${comments.length} observación(es)`} tone="warn" />
          </div>
          <DianDetailClient formId={form.id} formName={form.name} periodId={periodId} sections={sections} mappings={mappings} comments={comments} />
        </>
      )}
    </div>
  );
}
