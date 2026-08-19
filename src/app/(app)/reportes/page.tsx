import Link from "next/link";
import prisma from "@/lib/prisma";
import { authorizePermiso, requirePermiso } from "@/lib/rbac";
import { getCurrentUser } from "@/lib/dal";
import { Chip, PageHeader } from "@/components/ui";
import { fmtDateTime } from "@/lib/format";
import { almacenamientoEvidenciasTicketsDisponible } from "@/lib/storage/evidencias-tickets";
import {
  etiquetaEstadoTicket,
  tonoEstadoTicket,
} from "@/lib/soporte";
import { catalogoUbicacionesNovedad, etiquetaUbicacionNovedad } from "@/lib/soporte-rutas";
import { getPublicacionModulos } from "@/lib/rbac/publicacion";
import { getMatriz } from "@/lib/rbac/contexto";
import NuevaNovedadForm from "./nueva-novedad-form";

export default async function ReportesPage() {
  await requirePermiso("soporte:ver");
  const [actor, puedeCrear, admin, publicacionModulos, matriz] = await Promise.all([
    getCurrentUser(),
    authorizePermiso("soporte:crear"),
    authorizePermiso("soporte:administrar"),
    getPublicacionModulos(),
    getMatriz(),
  ]);
  if (!actor) return null;

  const permisosUsuario = matriz[actor.role] ?? [];
  const catalogo = catalogoUbicacionesNovedad({
    modulos: publicacionModulos,
    permisos: permisosUsuario,
    rol: actor.role,
  });

  const tickets = await prisma.supportTicket.findMany({
    // Los tickets creados dentro de la plataforma son visibles para todos los
    // usuarios. Los tickets públicos (sin usuario creador) conservan su acceso
    // privado por token y solo aparecen en la bandeja de Xentria.
    where: { createdById: { not: null } },
    orderBy: { createdAt: "desc" },
    take: 200,
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
      createdAt: true,
      _count: { select: { attachments: true } },
    },
  });

  return (
    <div className="w-full">
      <PageHeader
        title="Ayuda"
        subtitle="Consulta las novedades reportadas en la plataforma. Solo Xentria puede cambiar su estado o documentar la solución."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {admin.ok && (
              <Link
                href="/config/soporte"
                className="rounded-md border border-ink-200 bg-white px-3.5 py-2 text-[12.5px] font-semibold text-ink-700 transition hover:bg-ink-50"
              >
                Bandeja de Xentria
              </Link>
            )}
            {puedeCrear.ok && (
              <NuevaNovedadForm
                storageReady={almacenamientoEvidenciasTicketsDisponible()}
                catalogo={catalogo}
              />
            )}
          </div>
        }
      />

      {tickets.length === 0 ? (
        <div className="rounded-lg border border-dashed border-ink-200 bg-paper px-6 py-12 text-center text-sm text-ink-500">
          Todavía no hay novedades reportadas en la plataforma.
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-ink-150 bg-paper">
          <table className="min-w-full text-left text-[13px]">
            <thead className="bg-ink-50 text-[11px] font-semibold uppercase tracking-wider text-ink-500">
              <tr>
                <th className="px-4 py-3">Código</th>
                <th className="px-4 py-3">Asunto</th>
                <th className="px-4 py-3">Reportado por</th>
                <th className="px-4 py-3">Ubicación</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3">Imágenes</th>
                <th className="px-4 py-3">Creado</th>
              </tr>
            </thead>
            <tbody>
              {tickets.map((ticket) => (
                <tr key={ticket.id} className="border-t border-ink-100">
                  <td className="px-4 py-3 font-mono text-xs font-semibold text-ink-700">
                    <Link href={`/reportes/${ticket.id}`} className="hover:text-navy-700 hover:underline">
                      {ticket.code}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-ink-800">
                    <Link href={`/reportes/${ticket.id}`} className="hover:underline">
                      {ticket.subject}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-ink-600">
                    {ticket.createdById === actor.id
                      ? "Tú"
                      : `${ticket.reporterFirstName} ${ticket.reporterLastName}`}
                  </td>
                  <td className="px-4 py-3 text-ink-600">
                    {etiquetaUbicacionNovedad(ticket.routeLabel, ticket.menuLabel) ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <Chip label={etiquetaEstadoTicket(ticket.status)} tone={tonoEstadoTicket(ticket.status)} />
                  </td>
                  <td className="px-4 py-3 text-ink-600">{ticket._count.attachments}</td>
                  <td className="px-4 py-3 text-ink-500">{fmtDateTime(ticket.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
