import Link from "next/link";
import { notFound } from "next/navigation";
import prisma from "@/lib/prisma";
import { authorizePermiso, requirePermiso } from "@/lib/rbac";
import { BackLink, Chip } from "@/components/ui";
import { fmtDate, fmtDateTime, fmtHora12 } from "@/lib/format";
import { etiquetaEstadoTicket, tonoEstadoTicket } from "@/lib/soporte";
import { etiquetaUbicacionNovedad } from "@/lib/soporte-rutas";
import TicketHistorial from "@/components/ticket-historial";
import { historialDeTicket, SELECT_HISTORIAL } from "@/lib/soporte-historial";
import TicketGestionForm from "../ticket-gestion-form";
import TicketEliminarBoton from "../ticket-eliminar-boton";

/**
 * Detalle de un ticket para Xentria: los datos del reporte, el hilo completo y,
 * al pie de ese hilo, la única caja de gestión (texto + estado). El listado
 * (`/config/soporte`) solo enlaza aquí; nunca gestiona en línea.
 */
export default async function SoporteTicketDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermiso("soporte:administrar");
  // Borrado definitivo: exclusivo del Superadministrador (`soporte:eliminar`).
  const puedeEliminar = (await authorizePermiso("soporte:eliminar")).ok;
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
      ...SELECT_HISTORIAL,
    },
  });
  if (!ticket) notFound();

  const ubicacion = etiquetaUbicacionNovedad(ticket.routeLabel, ticket.menuLabel);
  const reportante = `${ticket.reporterFirstName} ${ticket.reporterLastName}`;
  // El hilo se arma con el MISMO helper que usan la página del usuario y el
  // modal: las tres pantallas cuentan la misma historia, en el mismo orden.
  const historial = historialDeTicket(ticket);

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
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Link
            href={`/reportes/${ticket.id}`}
            className="shrink-0 rounded-md border border-ink-200 bg-white px-3.5 py-2 text-[12.5px] font-semibold text-ink-700 transition hover:bg-ink-50"
          >
            Ver como usuario
          </Link>
          {puedeEliminar && (
            <TicketEliminarBoton
              ticket={{
                id: ticket.id,
                code: ticket.code,
                subject: ticket.subject,
                adjuntos: ticket.attachments.length,
              }}
            />
          )}
        </div>
      </div>

      <div className="max-w-3xl">
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

          {/* Historial completo: el reporte original, la conversación con quien
              lo abrió y los cambios de estado. Va en esta columna —y no en el
              panel de gestión— porque es historia del ticket, no un control:
              sigue creciendo aunque el panel esté congelado por el cierre.
              La descripción y las imágenes NO se repiten arriba: son la primera
              entrada del hilo. */}
          <section className="mt-5 border-t border-ink-100 pt-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-ink-500">
              Historial del ticket
            </p>
            <div className="mt-3">
              <TicketHistorial entradas={historial} />
            </div>
            {/* La gestión vive AQUÍ, al pie del hilo, y no en un panel aparte:
                escribirle a quien reportó y mover el estado son el mismo acto.
                Tenerlos en dos formularios obligaba a elegir entre dos cajas de
                texto que hacían lo mismo. */}
            <TicketGestionForm
              ticket={{
                id: ticket.id,
                code: ticket.code,
                status: ticket.status,
                tieneRespuesta: Boolean(ticket.solution),
                updatedAt: ticket.updatedAt.toISOString(),
              }}
            />
          </section>
        </article>
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
