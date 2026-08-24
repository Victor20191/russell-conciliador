import Link from "next/link";
import prisma from "@/lib/prisma";
import { authorizePermiso, requirePermiso } from "@/lib/rbac";
import { esTicketEnGestion, type TicketFilaGestion } from "@/lib/soporte-bandeja";
import TicketsGestionTabla from "./tickets-gestion-tabla";

// Tope de la bandeja: la tabla pagina en memoria, así que basta con traer los
// más recientes con las columnas mínimas (nada de descripción ni adjuntos).
const MAX_TICKETS = 500;

export default async function SoporteAdminPage() {
  await requirePermiso("soporte:administrar");
  // El borrado definitivo es exclusivo del Superadministrador: la tabla solo
  // pinta el control si el permiso existe (la Server Action lo revalida).
  const puedeEliminar = (await authorizePermiso("soporte:eliminar")).ok;

  const tickets = await prisma.supportTicket.findMany({
    orderBy: [{ createdAt: "desc" }],
    take: MAX_TICKETS,
    select: {
      id: true,
      code: true,
      createdById: true,
      reporterFirstName: true,
      reporterLastName: true,
      subject: true,
      routeLabel: true,
      menuLabel: true,
      status: true,
      resolvedByName: true,
      resolvedAt: true,
      createdAt: true,
      _count: { select: { attachments: true } },
    },
  });

  const filas: TicketFilaGestion[] = tickets.map((ticket) => ({
    id: ticket.id,
    code: ticket.code,
    createdById: ticket.createdById,
    reporterFirstName: ticket.reporterFirstName,
    reporterLastName: ticket.reporterLastName,
    subject: ticket.subject,
    routeLabel: ticket.routeLabel,
    menuLabel: ticket.menuLabel,
    status: ticket.status,
    adjuntos: ticket._count.attachments,
    resolvedByName: ticket.resolvedByName,
    resolvedAt: ticket.resolvedAt?.toISOString() ?? null,
    createdAt: ticket.createdAt.toISOString(),
  }));
  const pendientes = filas.filter((ticket) => esTicketEnGestion(ticket.status)).length;

  return (
    <div className="w-full">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-blue-500">Configuración · Xentria</p>
          <h1 className="mt-1 font-serif text-2xl text-ink-900">Gestión de reportes</h1>
          <p className="mt-1.5 text-sm text-ink-500">
            Bandeja de novedades reportadas. Abre un ticket para ver sus imágenes, cambiar su estado y documentar la solución.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/reportes"
            className="rounded-md border border-ink-200 bg-white px-3.5 py-2 text-[12.5px] font-semibold text-ink-700 transition hover:bg-ink-50"
          >
            Ver reportes
          </Link>
          <div className="rounded-md border border-ink-150 bg-white px-3.5 py-2 text-xs text-ink-600">
            <strong className="text-ink-900">{pendientes}</strong> en gestión · {filas.length} mostrados
          </div>
        </div>
      </div>

      <TicketsGestionTabla tickets={filas} puedeEliminar={puedeEliminar} />
    </div>
  );
}
