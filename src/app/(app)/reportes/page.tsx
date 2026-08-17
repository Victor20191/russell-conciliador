import Link from "next/link";
import prisma from "@/lib/prisma";
import { authorizePermiso, requirePermiso } from "@/lib/rbac";
import { getCurrentUser } from "@/lib/dal";
import { Chip, PageHeader } from "@/components/ui";
import { fmtDateTime } from "@/lib/format";
import { almacenamientoDisponible } from "@/lib/storage/objetos";
import {
  etiquetaEstadoTicket,
  tonoEstadoTicket,
} from "@/lib/soporte";
import NuevaNovedadForm from "./nueva-novedad-form";

export default async function ReportesPage() {
  await requirePermiso("soporte:ver");
  const [actor, puedeCrear, admin] = await Promise.all([
    getCurrentUser(),
    authorizePermiso("soporte:crear"),
    authorizePermiso("soporte:administrar"),
  ]);
  if (!actor) return null;

  const tickets = await prisma.supportTicket.findMany({
    where: { createdById: actor.id },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      id: true,
      code: true,
      subject: true,
      status: true,
      createdAt: true,
      _count: { select: { attachments: true } },
    },
  });

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Reportes"
        subtitle="Monta una novedad con la descripción y las capturas. Xentria la gestiona y te actualiza el estado."
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
            {puedeCrear.ok && <NuevaNovedadForm storageReady={almacenamientoDisponible()} />}
          </div>
        }
      />

      {tickets.length === 0 ? (
        <div className="rounded-lg border border-dashed border-ink-200 bg-paper px-6 py-12 text-center text-sm text-ink-500">
          Todavía no has reportado ninguna novedad.
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-ink-150 bg-paper">
          <table className="min-w-full text-left text-[13px]">
            <thead className="bg-ink-50 text-[11px] font-semibold uppercase tracking-wider text-ink-500">
              <tr>
                <th className="px-4 py-3">Código</th>
                <th className="px-4 py-3">Asunto</th>
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
