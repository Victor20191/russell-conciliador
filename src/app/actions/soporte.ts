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
  SupportTicketInternalCreateSchema,
  SupportTicketSolutionSchema,
  SupportTicketStatusSchema,
  type ActionState,
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
import { resolverUbicacionNovedad } from "@/lib/soporte-rutas";
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
