import Link from "next/link";
import prisma from "@/lib/prisma";
import { requirePermiso } from "@/lib/rbac";
import TicketGestionForm from "./ticket-gestion-form";
import AdjuntosGaleria from "@/app/(app)/reportes/adjuntos-galeria";
import { Chip } from "@/components/ui";
import { fmtDateTime } from "@/lib/format";
import {
  ESTADO_TICKET_ABIERTO,
  ESTADO_TICKET_EN_PROCESO,
  etiquetaEstadoTicket,
  tonoEstadoTicket,
} from "@/lib/soporte";
import { etiquetaUbicacionNovedad } from "@/lib/soporte-rutas";

export default async function SoporteAdminPage() {
  await requirePermiso("soporte:administrar");

  const tickets = await prisma.supportTicket.findMany({
    orderBy: [{ createdAt: "desc" }],
    take: 200,
    select: {
      id: true,
      code: true,
      createdById: true,
      reporterFirstName: true,
      reporterLastName: true,
      subject: true,
      description: true,
      routeLabel: true,
      menuLabel: true,
      status: true,
      solution: true,
      resolvedByName: true,
      resolvedAt: true,
      createdAt: true,
      updatedAt: true,
      attachments: {
        orderBy: { createdAt: "asc" },
        select: { id: true, fileName: true },
      },
    },
  });
  const pendientes = tickets.filter(
    (ticket) => ticket.status === ESTADO_TICKET_ABIERTO || ticket.status === ESTADO_TICKET_EN_PROCESO,
  ).length;

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-blue-500">Configuración · Xentria</p>
          <h1 className="mt-1 font-serif text-2xl text-ink-900">Gestión de reportes</h1>
          <p className="mt-1.5 text-sm text-ink-500">
            Revisa las novedades de los usuarios, cambia su estado y deja la respuesta visible para quien la reportó.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/reportes"
            className="rounded-md border border-ink-200 bg-white px-3.5 py-2 text-[12.5px] font-semibold text-ink-700 transition hover:bg-ink-50"
          >
            Mis reportes
          </Link>
          <div className="rounded-md border border-ink-150 bg-white px-3.5 py-2 text-xs text-ink-600">
            <strong className="text-ink-900">{pendientes}</strong> en gestión · {tickets.length} mostrados
          </div>
        </div>
      </div>

      {tickets.length === 0 ? (
        <div className="rounded-lg border border-dashed border-ink-200 bg-paper px-6 py-12 text-center text-sm text-ink-500">
          Todavía no hay novedades reportadas.
        </div>
      ) : (
        <div className="space-y-4">
          {tickets.map((ticket) => (
            <article key={ticket.id} className="rounded-lg border border-ink-150 bg-paper shadow-sm">
              <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.85fr)]">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/reportes/${ticket.id}`} className="font-mono text-xs font-semibold text-ink-700 hover:underline">
                      {ticket.code}
                    </Link>
                    <Chip label={etiquetaEstadoTicket(ticket.status)} tone={tonoEstadoTicket(ticket.status)} />
                    {!ticket.createdById && (
                      <span className="rounded-full bg-ink-100 px-2.5 py-0.5 text-[10px] font-semibold text-ink-600">
                        Público
                      </span>
                    )}
                  </div>
                  <h2 className="mt-3 font-serif text-xl text-ink-900">{ticket.subject}</h2>
                  <p className="mt-1 text-xs text-ink-500">
                    {ticket.reporterFirstName} {ticket.reporterLastName} · {fmtDateTime(ticket.createdAt)}
                    {etiquetaUbicacionNovedad(ticket.routeLabel, ticket.menuLabel)
                      ? ` · ${etiquetaUbicacionNovedad(ticket.routeLabel, ticket.menuLabel)}`
                      : ""}
                  </p>
                  <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-ink-700">{ticket.description}</p>
                  <AdjuntosGaleria adjuntos={ticket.attachments} />
                  {ticket.resolvedByName && ticket.resolvedAt && (
                    <p className="mt-4 text-xs text-ink-500">
                      Última gestión: {ticket.resolvedByName} · {fmtDateTime(ticket.resolvedAt)}
                    </p>
                  )}
                </div>

                <TicketGestionForm
                  ticket={{
                    id: ticket.id,
                    code: ticket.code,
                    status: ticket.status,
                    solution: ticket.solution,
                    updatedAt: ticket.updatedAt.toISOString(),
                  }}
                />
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
