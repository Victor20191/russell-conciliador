import { notFound } from "next/navigation";
import prisma from "@/lib/prisma";
import VisorClient, { type PresData, type Observed, type Evaluated } from "./visor-client";

export default async function VisorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
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
