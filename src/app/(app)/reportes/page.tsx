import Link from "next/link";
import prisma from "@/lib/prisma";
import { authorizePermiso, requirePermiso } from "@/lib/rbac";
import { getCurrentUser } from "@/lib/dal";
import { PageHeader } from "@/components/ui";
import { almacenamientoEvidenciasTicketsDisponible } from "@/lib/storage/evidencias-tickets";
import { catalogoUbicacionesNovedad, etiquetaUbicacionNovedad } from "@/lib/soporte-rutas";
import type { TicketKanban } from "@/lib/soporte-kanban";
import { clasificarDominioReporte } from "@/lib/soporte-dominios";
import { getPublicacionModulos } from "@/lib/rbac/publicacion";
import { getMatriz } from "@/lib/rbac/contexto";
import NuevaNovedadForm from "./nueva-novedad-form";
import TicketsVista from "./tickets-vista";

export default async function ReportesPage() {
  await requirePermiso("soporte:ver");
  const [actor, puedeCrear, admin, puedeEliminar, publicacionModulos, matriz] = await Promise.all([
    getCurrentUser(),
    authorizePermiso("soporte:crear"),
    authorizePermiso("soporte:administrar"),
    // Borrado definitivo: exclusivo del Superadministrador (`soporte:eliminar`).
    authorizePermiso("soporte:eliminar"),
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

  // Los tickets creados dentro de la plataforma son visibles para todos los
  // usuarios. Los tickets públicos (sin usuario creador) conservan su acceso
  // privado por token y solo aparecen en la bandeja de Xentria.
  //
  // El tope de 200 recorta por fecha ANTES de que el listado filtre por origen:
  // lo que se ve es «las 200 novedades más recientes», y filtrar por Russell o
  // Xentria reparte esas 200, no rebusca más atrás en el histórico.
  const whereBandejaInterna = { createdById: { not: null } };
  const tickets = await prisma.supportTicket.findMany({
    where: whereBandejaInterna,
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
      // El tablero mueve tickets y `cambiarEstadoTicket` compara `updatedAt`
      // para no pisar el cambio de otra persona.
      updatedAt: true,
      _count: { select: { attachments: true } },
    },
  });

  // El ticket guarda quién lo creó, no su correo, y `createdById` es una FK
  // SUAVE (sin @relation), así que el dominio del reportante no se puede pedir
  // en el mismo `select`. Se resuelve aparte: una consulta por clave primaria
  // sobre los ids únicos, no un N+1. Un id sin correo —usuario ya borrado—
  // termina en «otros» y el ticket sigue apareciendo en el listado.
  const idsCreadores = [
    ...new Set(tickets.map((ticket) => ticket.createdById).filter((id): id is number => id !== null)),
  ];
  const usuarios =
    idsCreadores.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: idsCreadores } },
          select: { id: true, email: true },
        })
      : [];
  const correoPorId = new Map(usuarios.map((usuario) => [usuario.id, usuario.email]));

  const filas: TicketKanban[] = tickets.map((ticket) => ({
    id: ticket.id,
    code: ticket.code,
    subject: ticket.subject,
    reportante: `${ticket.reporterFirstName} ${ticket.reporterLastName}`,
    esMio: ticket.createdById === actor.id,
    ubicacion: etiquetaUbicacionNovedad(ticket.routeLabel, ticket.menuLabel),
    dominio: clasificarDominioReporte(
      ticket.createdById === null ? null : correoPorId.get(ticket.createdById),
    ),
    status: ticket.status,
    adjuntos: ticket._count.attachments,
    createdAt: ticket.createdAt.toISOString(),
    updatedAt: ticket.updatedAt.toISOString(),
  }));

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

      <TicketsVista tickets={filas} puedeMover={admin.ok} puedeEliminar={puedeEliminar.ok} />
    </div>
  );
}
