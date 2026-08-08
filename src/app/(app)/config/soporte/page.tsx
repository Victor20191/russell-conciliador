import prisma from "@/lib/prisma";
import { requirePermiso } from "@/lib/rbac";
import TicketSolucionForm from "./ticket-solucion-form";
import { ESTADO_TICKET_RESUELTO } from "@/lib/soporte";
import { fmtDateTime } from "@/lib/format";

export default async function SoporteAdminPage() {
  await requirePermiso("soporte:administrar");

  const tickets = await prisma.supportTicket.findMany({
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 200,
    // La credencial publica no se necesita en la bandeja y no debe viajar ni
    // siquiera dentro del objeto del loader administrativo.
    select: {
      id: true,
      code: true,
      reporterFirstName: true,
      reporterLastName: true,
      subject: true,
      description: true,
      status: true,
      solution: true,
      resolvedByName: true,
      resolvedAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  const abiertos = tickets.filter((ticket) => ticket.status !== ESTADO_TICKET_RESUELTO).length;

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-blue-500">Configuración · Mesa de ayuda</p>
          <h1 className="mt-1 font-serif text-2xl text-ink-900">Tickets de soporte</h1>
          <p className="mt-1.5 text-sm text-ink-500">Documenta cómo se resolvió cada solicitud; el reportante verá la respuesta en su enlace privado.</p>
        </div>
        <div className="rounded-md border border-ink-150 bg-white px-3.5 py-2 text-xs text-ink-600">
          <strong className="text-ink-900">{abiertos}</strong> abiertos · {tickets.length} mostrados
        </div>
      </div>

      {tickets.length === 0 ? (
        <div className="rounded-lg border border-dashed border-ink-200 bg-paper px-6 py-12 text-center text-sm text-ink-500">
          Todavía no hay tickets reportados.
        </div>
      ) : (
        <div className="space-y-4">
          {tickets.map((ticket) => {
            const resuelto = ticket.status === ESTADO_TICKET_RESUELTO && Boolean(ticket.solution);
            return (
              <article key={ticket.id} className="rounded-lg border border-ink-150 bg-paper shadow-sm">
                <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.85fr)]">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-semibold text-ink-700">{ticket.code}</span>
                      <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${resuelto ? "bg-ok-100 text-ok-700" : "bg-warn-100 text-warn-700"}`}>
                        {resuelto ? "Resuelto" : "Abierto"}
                      </span>
                    </div>
                    <h2 className="mt-3 font-serif text-xl text-ink-900">{ticket.subject}</h2>
                    <p className="mt-1 text-xs text-ink-500">
                      {ticket.reporterFirstName} {ticket.reporterLastName} · {fmtDateTime(ticket.createdAt)}
                    </p>
                    <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-ink-700">{ticket.description}</p>
                    {ticket.resolvedByName && ticket.resolvedAt && (
                      <p className="mt-4 text-xs text-ink-500">Última solución: {ticket.resolvedByName} · {fmtDateTime(ticket.resolvedAt)}</p>
                    )}
                  </div>

                  <TicketSolucionForm
                    ticket={{
                      id: ticket.id,
                      code: ticket.code,
                      solution: ticket.solution,
                      updatedAt: ticket.updatedAt.toISOString(),
                    }}
                  />
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
