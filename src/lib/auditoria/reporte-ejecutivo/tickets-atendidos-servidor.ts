// Lectura de los tickets de soporte para la sección «Tickets atendidos».
//
// Solo lee. La consulta es deliberadamente más ancha que la regla (trae todo
// ticket que ahora está resuelto o cerrado y que tuvo algún movimiento hacia
// esos estados, o un `resolvedAt`, dentro de la ventana) y la decisión final de
// qué cuenta como «atendido» la toma `construirTicketsAtendidos`, que es pura y
// está probada: la regla vive en un solo lugar.
//
// Las fechas se comparan EXACTAMENTE como las demás consultas del reporte
// (bitácora, accesos, consumo de IA): mismos extremos `gte desde` / `lte corte`,
// con `Date` de Prisma y sin ninguna conversión de zona propia. El desfase de
// horas que arrastran los datos escritos antes de poner la base en UTC se
// corrige en los datos (`corregir-desfase-zona-horaria`), no aquí.
//
// Nunca lanza: ante un fallo de consulta devuelve null y el documento omite la
// sección en vez de afirmar que no hubo tickets.
import "server-only";
import prisma from "@/lib/prisma";
import {
  construirTicketsAtendidos,
  ESTADOS_ATENDIDOS,
  type TicketCandidato,
  type TicketsAtendidos,
} from "./tickets-atendidos";

export async function construirTicketsAtendidosReporte(params: {
  desde: Date;
  hasta: Date;
  /** Cierre efectivo de la consulta cuando el período llega hasta hoy. */
  corte?: Date | null;
}): Promise<TicketsAtendidos | null> {
  try {
    const corte = params.corte && params.corte < params.hasta ? params.corte : params.hasta;
    const estados = [...ESTADOS_ATENDIDOS];

    const filas = await prisma.supportTicket.findMany({
      where: {
        // Bandeja interna: los públicos (sin creador) se ven solo por su token.
        createdById: { not: null },
        status: { in: estados },
        OR: [
          { events: { some: { newStatus: { in: estados }, createdAt: { gte: params.desde, lte: corte } } } },
          { resolvedAt: { gte: params.desde, lte: corte } },
        ],
      },
      orderBy: { id: "asc" },
      select: {
        code: true,
        subject: true,
        menuLabel: true,
        routeLabel: true,
        reporterFirstName: true,
        reporterLastName: true,
        createdById: true,
        status: true,
        solution: true,
        resolvedAt: true,
        // Toda la historia: decidir si un cierre es una atención nueva o la
        // continuación de una resolución anterior necesita lo que pasó antes.
        events: {
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          select: { previousStatus: true, newStatus: true, createdAt: true },
        },
        messages: {
          where: { authorSide: "xentria" },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: 1,
          select: { body: true },
        },
      },
    });

    // El creador es una FK suave: se resuelve su correo aparte, y el que ya no
    // existe queda en null (el ticket sale del reporte: no se le puede atribuir
    // al cliente, igual que el uso de las cuentas borradas).
    const idsCreadores = [...new Set(filas.map((f) => f.createdById).filter((id): id is number => id !== null))];
    const creadores = idsCreadores.length
      ? await prisma.user.findMany({ where: { id: { in: idsCreadores } }, select: { id: true, email: true } })
      : [];
    const correoPorId = new Map(creadores.map((u) => [u.id, u.email]));

    const candidatos: TicketCandidato[] = filas.map((f) => ({
      codigo: f.code,
      asunto: f.subject,
      menuEtiqueta: f.menuLabel,
      rutaEtiqueta: f.routeLabel,
      reportante: `${f.reporterFirstName} ${f.reporterLastName}`,
      correoCreador: f.createdById === null ? null : correoPorId.get(f.createdById) ?? null,
      estado: f.status,
      solucion: f.solution,
      resueltoEn: f.resolvedAt ? f.resolvedAt.toISOString() : null,
      eventos: f.events.map((e) => ({
        estadoAnterior: e.previousStatus,
        estadoNuevo: e.newStatus,
        creadoEn: e.createdAt.toISOString(),
      })),
      ultimoMensajeXentria: f.messages[0]?.body ?? null,
    }));

    return construirTicketsAtendidos({
      candidatos,
      desde: params.desde.toISOString(),
      hasta: params.hasta.toISOString(),
      corte: corte.toISOString(),
    });
  } catch {
    return null;
  }
}
