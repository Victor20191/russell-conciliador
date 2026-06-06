import { notFound } from "next/navigation";
import prisma from "@/lib/prisma";
import VisorClient, { type PresData, type Observed, type Evaluated } from "./visor-client";
import { parseId } from "@/lib/ids";

export default async function VisorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;
  const id = parseId(rawId);
  if (!id) notFound();
  const p = await prisma.reqPresentation.findUnique({ where: { id } });
  if (!p) notFound();

  const data: PresData = {
    id: p.id, clientName: p.clientName, nit: p.nit, title: p.title, year: p.year, presented: p.presented, preparedBy: p.preparedBy,
    positives: p.positives,
    observed: (p.observed as Observed[] | null) ?? [],
    evaluated: (p.evaluated as Evaluated | null) ?? { mercantil: [], tributario: [], otros: [] },
  };
  return <VisorClient data={data} />;
}
