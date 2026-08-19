import Link from "next/link";
import { notFound } from "next/navigation";
import prisma from "@/lib/prisma";
import { authorizePermiso, requirePermiso } from "@/lib/rbac";
import { getCurrentUser } from "@/lib/dal";
import { BackLink, Chip, PageHeader } from "@/components/ui";
import { fmtDateTime } from "@/lib/format";
import {
  ESTADO_TICKET_RESUELTO,
  etiquetaEstadoTicket,
  tonoEstadoTicket,
} from "@/lib/soporte";
import { etiquetaUbicacionNovedad } from "@/lib/soporte-rutas";
import AdjuntosGaleria from "../adjuntos-galeria";

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
    },
  });
  if (!ticket) notFound();
  // Los tickets internos son visibles para cualquier usuario de la plataforma.
  // Los tickets públicos permanecen privados por token salvo para Xentria.
  if (!admin.ok && ticket.createdById === null) notFound();

  const resuelto = ticket.status === ESTADO_TICKET_RESUELTO && Boolean(ticket.solution);

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

      <article className="rounded-lg border border-ink-150 bg-paper p-5 shadow-sm">
        {etiquetaUbicacionNovedad(ticket.routeLabel, ticket.menuLabel) && (
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-ink-500">
            {etiquetaUbicacionNovedad(ticket.routeLabel, ticket.menuLabel)}
          </p>
        )}
        <p className="whitespace-pre-wrap text-sm leading-6 text-ink-700">{ticket.description}</p>
        <p className="mt-4 text-xs text-ink-500">Reportado el {fmtDateTime(ticket.createdAt)}</p>
        <AdjuntosGaleria adjuntos={ticket.attachments} />
      </article>

      <section
        className={`mt-4 rounded-lg border p-5 ${
          resuelto ? "border-ok-100 bg-ok-100" : "border-ink-150 bg-ink-50"
        }`}
      >
        <p className={`text-xs font-semibold uppercase tracking-wider ${resuelto ? "text-ok-700" : "text-ink-500"}`}>
          Gestión de Xentria
        </p>
        {ticket.solution ? (
          <>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-ink-800">{ticket.solution}</p>
            <p className="mt-4 text-xs text-ink-600">
              {ticket.resolvedByName ?? "Xentria"}
              {ticket.resolvedAt ? ` · ${fmtDateTime(ticket.resolvedAt)}` : ""}
            </p>
          </>
        ) : (
          <p className="mt-3 text-sm leading-6 text-ink-700">
            Xentria recibió esta novedad. Aquí se verá la respuesta cuando el equipo actualice el ticket.
          </p>
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
