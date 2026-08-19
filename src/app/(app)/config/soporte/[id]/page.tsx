import Link from "next/link";
import { notFound } from "next/navigation";
import prisma from "@/lib/prisma";
import { requirePermiso } from "@/lib/rbac";
import AdjuntosGaleria from "@/app/(app)/reportes/adjuntos-galeria";
import { BackLink, Chip } from "@/components/ui";
import { fmtDate, fmtDateTime, fmtHora12 } from "@/lib/format";
import { etiquetaEstadoTicket, tonoEstadoTicket } from "@/lib/soporte";
import { etiquetaUbicacionNovedad } from "@/lib/soporte-rutas";
import TicketGestionForm from "../ticket-gestion-form";

/**
 * Detalle de un ticket para Xentria: descripción, imágenes y el panel para
 * cambiar el estado o documentar la solución. El listado (`/config/soporte`)
 * solo enlaza aquí; nunca gestiona en línea.
 */
export default async function SoporteTicketDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermiso("soporte:administrar");
  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const ticket = await prisma.supportTicket.findUnique({
    where: { id },
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
  if (!ticket) notFound();

  const ubicacion = etiquetaUbicacionNovedad(ticket.routeLabel, ticket.menuLabel);
  const reportante = `${ticket.reporterFirstName} ${ticket.reporterLastName}`;

  return (
    <div className="w-full">
      <BackLink href="/config/soporte" label="Volver a gestión de reportes" />

      <div className="mb-5 mt-4 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs font-semibold text-ink-700">{ticket.code}</span>
            <Chip label={etiquetaEstadoTicket(ticket.status)} tone={tonoEstadoTicket(ticket.status)} />
            {ticket.createdById === null && (
              <span className="rounded-full bg-ink-100 px-2.5 py-0.5 text-[10px] font-semibold text-ink-600">
                Público
              </span>
            )}
          </div>
          <h1 className="mt-2 font-serif text-2xl text-ink-900">{ticket.subject}</h1>
          <p className="mt-1 text-[13px] text-ink-500">
            Reportado por {reportante} · {fmtDateTime(ticket.createdAt)}
          </p>
        </div>
        <Link
          href={`/reportes/${ticket.id}`}
          className="shrink-0 rounded-md border border-ink-200 bg-white px-3.5 py-2 text-[12.5px] font-semibold text-ink-700 transition hover:bg-ink-50"
        >
          Ver como usuario
        </Link>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(340px,0.8fr)] lg:items-start">
        <article className="min-w-0 rounded-lg border border-ink-150 bg-paper p-5 shadow-sm">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
            <Dato etiqueta="Reportado por" valor={reportante} />
            <Dato etiqueta="Fecha" valor={fmtDate(ticket.createdAt)} />
            <Dato etiqueta="Hora" valor={fmtHora12(ticket.createdAt)} />
            <Dato etiqueta="Origen" valor={ticket.createdById === null ? "Formulario público" : "Plataforma"} />
            <div className="col-span-2 sm:col-span-4">
              <Dato etiqueta="Ubicación" valor={ubicacion ?? "Sin ubicación indicada"} apagado={!ubicacion} />
            </div>
          </dl>

          <div className="mt-5 border-t border-ink-100 pt-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-ink-500">Descripción</p>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-ink-700">{ticket.description}</p>
          </div>

          {ticket.attachments.length > 0 ? (
            <div className="mt-5 border-t border-ink-100 pt-1">
              <AdjuntosGaleria adjuntos={ticket.attachments} />
            </div>
          ) : (
            <p className="mt-5 border-t border-ink-100 pt-4 text-xs text-ink-400">Este ticket no tiene imágenes adjuntas.</p>
          )}
        </article>

        <aside className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-16">
          <TicketGestionForm
            ticket={{
              id: ticket.id,
              code: ticket.code,
              status: ticket.status,
              solution: ticket.solution,
              updatedAt: ticket.updatedAt.toISOString(),
            }}
          />
          <div className="rounded-md border border-ink-150 bg-white px-4 py-3 text-xs text-ink-500">
            {ticket.resolvedByName && ticket.resolvedAt ? (
              <>
                <span className="font-semibold text-ink-700">Última gestión:</span> {ticket.resolvedByName} ·{" "}
                {fmtDateTime(ticket.resolvedAt)}
              </>
            ) : (
              "Este ticket todavía no ha sido gestionado por Xentria."
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

function Dato({ etiqueta, valor, apagado = false }: { etiqueta: string; valor: string; apagado?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">{etiqueta}</dt>
      <dd className={`mt-1 break-words text-[13px] ${apagado ? "text-ink-400" : "text-ink-800"}`}>{valor}</dd>
    </div>
  );
}
