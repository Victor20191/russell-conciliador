"use server";

import * as z from "zod";
import { revalidatePath } from "next/cache";
import prisma from "@/lib/prisma";
import { authorizePermiso } from "@/lib/rbac";
import { getCurrentUser } from "@/lib/dal";
import { logAudit } from "@/lib/audit";
import { mensajeErrorBD } from "@/lib/errores";
import {
  SupportTicketCreateSchema,
  SupportTicketSolutionSchema,
  type ActionState,
  type SupportTicketCreateState,
} from "@/lib/definitions";
import {
  crearCodigoTicket,
  crearTokenAccesoTicket,
  crearUrlSeguimiento,
  ESTADO_TICKET_RESUELTO,
  huellaTokenAcceso,
} from "@/lib/soporte";

const ADMIN_PATH = "/config/soporte";

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
    return {
      ok: true,
      code,
      trackingUrl: crearUrlSeguimiento(code, token),
    };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("crearTicketSoporte", e) };
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
    revalidatePath(`/soporte/tickets/${ticket.code}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("guardarSolucionTicket", e) };
  }
}
