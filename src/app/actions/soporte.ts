"use server";

import { randomBytes } from "node:crypto";
import * as z from "zod";
import { revalidatePath } from "next/cache";
import prisma from "@/lib/prisma";
import { authorizePermiso } from "@/lib/rbac";
import { getCurrentUser } from "@/lib/dal";
import { logAudit } from "@/lib/audit";
import { mensajeErrorBD } from "@/lib/errores";
import {
  SupportTicketCreateSchema,
  SupportTicketDeleteSchema,
  SupportTicketDetailSchema,
  SupportTicketInternalCreateSchema,
  SupportTicketSolutionSchema,
  SupportTicketStatusSchema,
  type ActionState,
  type DetalleTicketState,
  type SupportTicketCreateState,
  type SupportTicketInternalCreateState,
} from "@/lib/definitions";
import {
  ADJUNTO_MAX_BYTES,
  ADJUNTOS_MAX,
  crearCodigoTicket,
  crearTokenAccesoTicket,
  crearUrlSeguimiento,
  ESTADO_TICKET_RESUELTO,
  etiquetaEstadoTicket,
  huellaTokenAcceso,
  keyAdjuntoTicket,
  nombreReportanteDesdeSesion,
  requiereSolucion,
} from "@/lib/soporte";
import {
  etiquetaUbicacionNovedad as resolverEtiquetaUbicacion,
  resolverUbicacionNovedad,
} from "@/lib/soporte-rutas";
import { getPublicacionModulos } from "@/lib/rbac/publicacion";
import { getMatriz } from "@/lib/rbac/contexto";
import { validarAdjuntoTicket } from "@/lib/soporte-adjuntos";
import {
  almacenamientoEvidenciasTicketsDisponible,
  eliminarEvidenciaTicket,
  subirEvidenciaTicket,
} from "@/lib/storage/evidencias-tickets";

const ADMIN_PATH = "/config/soporte";
const USER_PATH = "/reportes";

function archivosAdjuntos(formData: FormData): File[] {
  return formData
    .getAll("adjuntos")
    .filter((valor): valor is File => valor instanceof File && valor.size > 0);
}

async function persistirAdjuntos(ticketId: number, archivos: File[]): Promise<void> {
  if (archivos.length === 0) return;
  if (archivos.length > ADJUNTOS_MAX) {
    throw new Error(`Puedes adjuntar hasta ${ADJUNTOS_MAX} imágenes.`);
  }
  if (!almacenamientoEvidenciasTicketsDisponible()) {
    throw new Error("El almacenamiento de imágenes no está configurado. Avisa al administrador o envía la novedad sin capturas.");
  }

  const preparados: {
    bytes: Uint8Array;
    tipo: "jpg" | "png" | "webp" | "gif" | "svg";
    contentType: string;
    fileName: string;
    size: number;
  }[] = [];
  for (const archivo of archivos) {
    if (archivo.size > ADJUNTO_MAX_BYTES) {
      throw new Error(`«${archivo.name}» supera ${Math.round(ADJUNTO_MAX_BYTES / 1024 / 1024)} MB.`);
    }
    const bytes = new Uint8Array(await archivo.arrayBuffer());
    const val = validarAdjuntoTicket(bytes, archivo.name);
    if (!val.ok) throw new Error(val.error);
    preparados.push({
      bytes,
      tipo: val.tipo,
      contentType: val.contentType,
      fileName: archivo.name.replace(/[/\\]/g, "").slice(0, 180) || `captura.${val.tipo}`,
      size: bytes.length,
    });
  }

  const keys: string[] = [];
  try {
    for (const item of preparados) {
      const key = keyAdjuntoTicket(ticketId, randomBytes(8).toString("hex"), item.tipo);
      await subirEvidenciaTicket({ key, cuerpo: item.bytes, contentType: item.contentType });
      keys.push(key);
      await prisma.supportTicketAttachment.create({
        data: {
          ticketId,
          objectKey: key,
          fileName: item.fileName,
          contentType: item.contentType,
          sizeBytes: item.size,
        },
      });
    }
  } catch (e) {
    await Promise.all(keys.map((key) => eliminarEvidenciaTicket(key).catch(() => {})));
    throw e;
  }
}

/** Alta publica deliberada: no exige sesion, pero valida todos los campos. */
export async function crearTicketSoporte(
  _prev: SupportTicketCreateState | undefined,
  formData: FormData,
): Promise<SupportTicketCreateState> {
  const parsed = SupportTicketCreateSchema.safeParse({
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    subject: formData.get("subject"),
    description: formData.get("description"),
    website: formData.get("website") ?? "",
  });
  if (!parsed.success) {
    return { ok: false, errors: z.flattenError(parsed.error).fieldErrors };
  }

  const code = crearCodigoTicket();
  const token = crearTokenAccesoTicket();
  try {
    await prisma.supportTicket.create({
      data: {
        code,
        reporterFirstName: parsed.data.firstName,
        reporterLastName: parsed.data.lastName,
        subject: parsed.data.subject,
        description: parsed.data.description,
        publicAccessTokenHash: huellaTokenAcceso(token),
      },
    });
    await logAudit({
      user: `${parsed.data.firstName} ${parsed.data.lastName}`,
      action: "REPORTÓ TICKET DE SOPORTE",
      entity: code,
      detail: parsed.data.subject,
    });
    revalidatePath(ADMIN_PATH);
    revalidatePath(USER_PATH);
    return {
      ok: true,
      code,
      trackingUrl: crearUrlSeguimiento(code, token),
    };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("crearTicketSoporte", e) };
  }
}

export async function crearNovedadInterna(
  _prev: SupportTicketInternalCreateState | undefined,
  formData: FormData,
): Promise<SupportTicketInternalCreateState> {
  const authz = await authorizePermiso("soporte:crear");
  if (!authz.ok) return { ok: false, message: authz.message };

  const parsed = SupportTicketInternalCreateSchema.safeParse({
    subject: formData.get("subject"),
    description: formData.get("description"),
    routeKey: formData.get("routeKey"),
    menuKey: formData.get("menuKey"),
  });
  if (!parsed.success) {
    return { ok: false, errors: z.flattenError(parsed.error).fieldErrors };
  }
  const [publicacionModulos, matriz] = await Promise.all([
    getPublicacionModulos(),
    getMatriz(),
  ]);
  const permisosUsuario = matriz[authz.role] ?? [];
  const ubicacion = resolverUbicacionNovedad(parsed.data.routeKey, parsed.data.menuKey, {
    modulos: publicacionModulos,
    permisos: permisosUsuario,
    rol: authz.role,
  });
  if (!ubicacion) {
    return { ok: false, errors: { menuKey: ["Selecciona una ruta y el menú de esa ruta."] } };
  }

  const actor = await getCurrentUser();
  if (!actor) return { ok: false, message: "Sesión no válida." };

  const adjuntos = archivosAdjuntos(formData);
  if (adjuntos.length > ADJUNTOS_MAX) {
    return { ok: false, message: `Puedes adjuntar hasta ${ADJUNTOS_MAX} imágenes.` };
  }
  if (adjuntos.length > 0 && !almacenamientoEvidenciasTicketsDisponible()) {
    return {
      ok: false,
      message: "El almacenamiento de imágenes no está configurado. Avisa al administrador o envía la novedad sin capturas.",
    };
  }

  const reportante = nombreReportanteDesdeSesion(actor.name);
  const code = crearCodigoTicket();
  const token = crearTokenAccesoTicket();
  try {
    const ticket = await prisma.supportTicket.create({
      data: {
        code,
        createdById: actor.id,
        reporterFirstName: reportante.firstName,
        reporterLastName: reportante.lastName,
        subject: parsed.data.subject,
        description: parsed.data.description,
        routeKey: ubicacion.ruta.clave,
        routeLabel: ubicacion.ruta.etiqueta,
        menuKey: ubicacion.menu.clave,
        menuLabel: ubicacion.menu.etiqueta,
        publicAccessTokenHash: huellaTokenAcceso(token),
      },
      select: { id: true },
    });
    try {
      await persistirAdjuntos(ticket.id, adjuntos);
    } catch (e) {
      await prisma.supportTicket.delete({ where: { id: ticket.id } }).catch(() => {});
      throw e;
    }

    await logAudit({
      user: actor.name,
      action: "REPORTÓ NOVEDAD",
      entity: code,
      detail: `${ubicacion.ruta.etiqueta} · ${ubicacion.menu.etiqueta}: ${parsed.data.subject}`,
    });
    revalidatePath(ADMIN_PATH);
    revalidatePath(USER_PATH);
    return { ok: true, ticketId: ticket.id, code };
  } catch (e) {
    if (e instanceof Error && !("code" in e)) {
      return { ok: false, message: e.message };
    }
    return { ok: false, message: mensajeErrorBD("crearNovedadInterna", e) };
  }
}

/**
 * Detalle de una novedad para el modal de `/reportes`, que lo pide al abrir la
 * tarjeta en vez de traer la descripción y los adjuntos de los 200 tickets del
 * listado. Es una LECTURA, así que replica exactamente el gate de
 * `/reportes/[id]`: permiso `soporte:ver` y, para los tickets públicos (sin
 * usuario creador), solo Xentria — su acceso normal es el token de seguimiento.
 */
export async function obtenerDetalleTicket(ticketId: number): Promise<DetalleTicketState> {
  const authz = await authorizePermiso("soporte:ver");
  if (!authz.ok) return { ok: false, message: authz.message };

  const parsed = SupportTicketDetailSchema.safeParse({ ticketId });
  if (!parsed.success) return { ok: false, message: "Reporte inválido." };

  try {
    const [ticket, admin] = await Promise.all([
      prisma.supportTicket.findUnique({
        where: { id: parsed.data.ticketId },
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
      }),
      authorizePermiso("soporte:administrar"),
    ]);
    if (!ticket) return { ok: false, message: "Este reporte ya no existe." };
    if (!admin.ok && ticket.createdById === null) {
      return { ok: false, message: "Este reporte no está disponible." };
    }

    return {
      ok: true,
      ticket: {
        id: ticket.id,
        code: ticket.code,
        subject: ticket.subject,
        description: ticket.description,
        reportante: `${ticket.reporterFirstName} ${ticket.reporterLastName}`,
        ubicacion: resolverEtiquetaUbicacion(ticket.routeLabel, ticket.menuLabel),
        status: ticket.status,
        solution: ticket.solution,
        resolvedByName: ticket.resolvedByName,
        resolvedAt: ticket.resolvedAt?.toISOString() ?? null,
        createdAt: ticket.createdAt.toISOString(),
        adjuntos: ticket.attachments,
      },
    };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("obtenerDetalleTicket", e) };
  }
}

export async function guardarSolucionTicket(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  // Autorizacion antes de interpretar el payload: el panel es interno y solo
  // Administrador/Superadministrador deben poder leer o resolver tickets.
  const authz = await authorizePermiso("soporte:administrar");
  if (!authz.ok) return { ok: false, message: authz.message };

  const parsed = SupportTicketSolutionSchema.safeParse({
    ticketId: formData.get("ticketId"),
    updatedAt: formData.get("updatedAt"),
    solution: formData.get("solution"),
  });
  if (!parsed.success) {
    return { ok: false, errors: z.flattenError(parsed.error).fieldErrors };
  }

  try {
    const [ticket, actor] = await Promise.all([
      prisma.supportTicket.findUnique({
        where: { id: parsed.data.ticketId },
        select: { code: true },
      }),
      getCurrentUser(),
    ]);
    if (!ticket) return { ok: false, message: "El ticket ya no existe." };

    const actualizado = await prisma.supportTicket.updateMany({
      where: {
        id: parsed.data.ticketId,
        updatedAt: new Date(parsed.data.updatedAt),
      },
      data: {
        solution: parsed.data.solution,
        status: ESTADO_TICKET_RESUELTO,
        resolvedById: authz.userId,
        resolvedByName: actor?.name ?? "Administrador",
        resolvedAt: new Date(),
      },
    });
    if (actualizado.count !== 1) {
      return {
        ok: false,
        message: "Otra persona actualizó este ticket. Recarga la página antes de guardar.",
      };
    }

    await logAudit({
      user: actor?.name ?? "Administrador",
      action: "DOCUMENTÓ SOLUCIÓN DE TICKET",
      entity: ticket.code,
      detail: "El ticket quedó resuelto y la solución está visible en su enlace de seguimiento.",
    });
    revalidatePath(ADMIN_PATH);
    revalidatePath(`${ADMIN_PATH}/${parsed.data.ticketId}`);
    revalidatePath(USER_PATH);
    revalidatePath(`${USER_PATH}/${parsed.data.ticketId}`);
    revalidatePath(`/soporte/tickets/${ticket.code}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("guardarSolucionTicket", e) };
  }
}

export async function cambiarEstadoTicket(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  const authz = await authorizePermiso("soporte:administrar");
  if (!authz.ok) return { ok: false, message: authz.message };

  const parsed = SupportTicketStatusSchema.safeParse({
    ticketId: formData.get("ticketId"),
    updatedAt: formData.get("updatedAt"),
    status: formData.get("status"),
    solution: formData.get("solution") || undefined,
  });
  if (!parsed.success) {
    return { ok: false, errors: z.flattenError(parsed.error).fieldErrors };
  }
  if (requiereSolucion(parsed.data.status) && !parsed.data.solution) {
    return { ok: false, errors: { solution: ["Explica cómo se solucionó la solicitud."] } };
  }

  try {
    const [ticket, actor] = await Promise.all([
      prisma.supportTicket.findUnique({
        where: { id: parsed.data.ticketId },
        select: { code: true },
      }),
      getCurrentUser(),
    ]);
    if (!ticket) return { ok: false, message: "El ticket ya no existe." };

    const resuelto = parsed.data.status === ESTADO_TICKET_RESUELTO;
    const actualizado = await prisma.supportTicket.updateMany({
      where: {
        id: parsed.data.ticketId,
        updatedAt: new Date(parsed.data.updatedAt),
      },
      data: {
        status: parsed.data.status,
        ...(parsed.data.solution ? { solution: parsed.data.solution } : {}),
        ...(resuelto
          ? {
              resolvedById: authz.userId,
              resolvedByName: actor?.name ?? "Administrador",
              resolvedAt: new Date(),
            }
          : {}),
      },
    });
    if (actualizado.count !== 1) {
      return {
        ok: false,
        message: "Otra persona actualizó este ticket. Recarga la página antes de guardar.",
      };
    }

    await logAudit({
      user: actor?.name ?? "Administrador",
      action: "ACTUALIZÓ ESTADO DE REPORTE",
      entity: ticket.code,
      detail: `Estado: ${etiquetaEstadoTicket(parsed.data.status)}.`,
    });
    revalidatePath(ADMIN_PATH);
    revalidatePath(`${ADMIN_PATH}/${parsed.data.ticketId}`);
    revalidatePath(USER_PATH);
    revalidatePath(`${USER_PATH}/${parsed.data.ticketId}`);
    revalidatePath(`/soporte/tickets/${ticket.code}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("cambiarEstadoTicket", e) };
  }
}

/**
 * Borrado definitivo de un ticket. Reservado al Superadministrador
 * (`soporte:eliminar`): el Administrador gestiona y cierra, pero no destruye la
 * trazabilidad de lo reportado. Sirve para depurar pruebas y duplicados.
 *
 * El detalle en BD lo arrastra la cascada de `SupportTicketAttachment`; los
 * objetos del bucket aislado se borran a mano ANTES (una vez borrada la fila ya
 * no habría forma de saber qué claves quedaron huérfanas). Si el almacenamiento
 * falla, el borrado sigue: se registra en la auditoría cuántas imágenes
 * quedaron sin limpiar.
 */
export async function eliminarTicketSoporte(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  const authz = await authorizePermiso("soporte:eliminar");
  if (!authz.ok) return { ok: false, message: authz.message };

  const parsed = SupportTicketDeleteSchema.safeParse({
    ticketId: formData.get("ticketId"),
    code: formData.get("code"),
  });
  if (!parsed.success) {
    return { ok: false, errors: z.flattenError(parsed.error).fieldErrors };
  }

  try {
    const [ticket, actor] = await Promise.all([
      prisma.supportTicket.findUnique({
        where: { id: parsed.data.ticketId },
        select: {
          code: true,
          subject: true,
          attachments: { select: { objectKey: true } },
        },
      }),
      getCurrentUser(),
    ]);
    if (!ticket) return { ok: false, message: "El ticket ya no existe." };
    // La confirmación viaja con el código visible: si la bandeja estaba
    // desactualizada y el id apunta ya a otro ticket, no se borra el equivocado.
    if (ticket.code !== parsed.data.code) {
      return { ok: false, message: "Este ticket cambió. Recarga la página antes de eliminarlo." };
    }

    let sinLimpiar = 0;
    if (ticket.attachments.length > 0 && almacenamientoEvidenciasTicketsDisponible()) {
      const resultados = await Promise.all(
        ticket.attachments.map((adjunto) =>
          eliminarEvidenciaTicket(adjunto.objectKey).then(
            () => true,
            () => false,
          ),
        ),
      );
      sinLimpiar = resultados.filter((ok) => !ok).length;
    } else {
      sinLimpiar = ticket.attachments.length;
    }

    await prisma.supportTicket.delete({ where: { id: parsed.data.ticketId } });

    await logAudit({
      user: actor?.name ?? "Superadministrador",
      action: "ELIMINÓ REPORTE",
      entity: ticket.code,
      detail:
        `${ticket.subject}. Borrado definitivo del ticket y sus ${ticket.attachments.length} imagen(es).` +
        (sinLimpiar > 0 ? ` ${sinLimpiar} archivo(s) no se pudieron borrar del almacenamiento.` : ""),
    });
    revalidatePath(ADMIN_PATH);
    revalidatePath(`${ADMIN_PATH}/${parsed.data.ticketId}`);
    revalidatePath(USER_PATH);
    revalidatePath(`${USER_PATH}/${parsed.data.ticketId}`);
    revalidatePath(`/soporte/tickets/${ticket.code}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("eliminarTicketSoporte", e) };
  }
}
