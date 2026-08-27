import Link from "next/link";
import { notFound } from "next/navigation";
import prisma from "@/lib/prisma";
import { authorizePermiso, requirePermiso } from "@/lib/rbac";
import { getCurrentUser } from "@/lib/dal";
import { BackLink, Chip, PageHeader } from "@/components/ui";
import { etiquetaEstadoTicket, tonoEstadoTicket } from "@/lib/soporte";
import { etiquetaUbicacionNovedad } from "@/lib/soporte-rutas";
import TicketHistorial from "@/components/ticket-historial";
import TicketMensajeForm from "@/components/ticket-mensaje-form";
import { historialDeTicket, ladoParaEscribir, SELECT_HISTORIAL } from "@/lib/soporte-historial";

export default async function ReporteDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermiso("soporte:ver");
  const [{ id: rawId }, actor, admin] = await Promise.all([
    params,
    getCurrentUser(),
    authorizePermiso("soporte:administrar"),
  ]);
  const id = Number(rawId);
  if (!actor || !Number.isInteger(id) || id <= 0) notFound();

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
      attachments: {
        orderBy: { createdAt: "asc" },
        select: { id: true, fileName: true },
      },
      ...SELECT_HISTORIAL,
    },
  });
  if (!ticket) notFound();
  // Los tickets internos son visibles para cualquier usuario de la plataforma.
  // Los tickets públicos permanecen privados por token salvo para Xentria.
  if (!admin.ok && ticket.createdById === null) notFound();

  const historial = historialDeTicket(ticket);
  // Escribir en el hilo es más estrecho que verlo: cualquiera con `soporte:ver`
  // lee las novedades de la plataforma, pero responder solo pueden Xentria y
  // quien abrió ESTE ticket. La Server Action revalida lo mismo.
  const lado = ladoParaEscribir({
    administra: admin.ok,
    usuarioId: actor.id,
    creadoPorId: ticket.createdById,
  });

  const ubicacion = etiquetaUbicacionNovedad(ticket.routeLabel, ticket.menuLabel);

  return (
    <div className="mx-auto max-w-3xl">
      <BackLink href="/reportes" label="Volver a ayuda" />
      <div className="mt-4">
        <PageHeader
          title={ticket.subject}
          subtitle={`${ticket.code} · ${ticket.reporterFirstName} ${ticket.reporterLastName}`}
          actions={<Chip label={etiquetaEstadoTicket(ticket.status)} tone={tonoEstadoTicket(ticket.status)} />}
        />
      </div>

      {/* El hilo completo: el reporte original con sus imágenes, la conversación
          con Xentria y los cambios de estado. La descripción no se repite
          arriba porque es la primera entrada del historial. */}
      <section className="rounded-lg border border-ink-150 bg-paper p-5 shadow-sm">
        {ubicacion && (
          <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-ink-500">{ubicacion}</p>
        )}
        <TicketHistorial entradas={historial} />
        {lado !== null && (
          <TicketMensajeForm ticketId={ticket.id} code={ticket.code} lado={lado} />
        )}
      </section>

      {admin.ok && (
        <p className="mt-4 text-xs text-ink-500">
          <Link href={`/config/soporte/${ticket.id}`} className="font-semibold text-blue-500 hover:underline">
            Gestionar este ticket
          </Link>
        </p>
      )}
    </div>
  );
}
