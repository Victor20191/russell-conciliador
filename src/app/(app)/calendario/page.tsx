import prisma from "@/lib/prisma";
import { PageHeader } from "@/components/ui";
import CalendarioClient, { type Evt } from "./calendario-client";

export default async function CalendarioPage() {
  const events = await prisma.calendarEvent.findMany({ orderBy: { date: "asc" } });
  const evts: Evt[] = events.map((e) => {
    const d = new Date(e.date);
    return { id: e.id, day: d.getDate(), month: d.getMonth(), year: d.getFullYear(), type: e.type, title: e.title, subtitle: e.subtitle, clientKey: e.clientKey };
  });
  return (
    <div>
      <PageHeader title="Calendario" subtitle="Requerimientos por cliente, vencimientos tributarios DIAN y declaraciones ICA municipales en una sola vista." />
      <CalendarioClient events={evts} />
    </div>
  );
}
