"use server";

import { revalidatePath } from "next/cache";
import * as z from "zod";
import prisma from "@/lib/prisma";
import { authorizePermiso } from "@/lib/rbac";
import { getCurrentUser } from "@/lib/dal";
import { logAudit } from "@/lib/audit";
import { mensajeErrorBD } from "@/lib/errores";
import { ESTADOS_TICKET, type EstadoTicket } from "@/lib/soporte-estados";
import { resolverEstadosOcultosTickets, type GuardarEstadosOcultosTicketsState } from "@/lib/soporte-preferencias";

const EstadosOcultosSchema = z.array(z.enum(ESTADOS_TICKET)).max(ESTADOS_TICKET.length);

/** Autoservicio: solo modifica la preferencia del usuario de la sesión. */
export async function guardarEstadosOcultosTickets(estados: EstadoTicket[]): Promise<GuardarEstadosOcultosTicketsState> {
  const auth = await authorizePermiso("soporte:ver");
  if (!auth.ok) return auth;
  const actor = await getCurrentUser();
  if (!actor || actor.id !== auth.userId) return { ok: false, message: "Sesión no válida." };

  const parsed = EstadosOcultosSchema.safeParse(estados);
  if (!parsed.success) return { ok: false, message: "Selecciona solo estados válidos de los tickets." };
  const estadosOcultos = resolverEstadosOcultosTickets(parsed.data);

  try {
    await prisma.supportUserPreference.upsert({
      where: { userId: actor.id },
      create: { userId: actor.id, hiddenStatuses: estadosOcultos },
      update: { hiddenStatuses: estadosOcultos },
    });
    await logAudit({
      user: actor.name,
      action: "ACTUALIZÓ SUS PREFERENCIAS DE AYUDA",
      entity: "preferencias_soporte_usuario",
      detail: `usuario ${actor.id} · estados ocultos: ${estadosOcultos.join(", ") || "ninguno"}`,
    });
    revalidatePath("/reportes");
    return { ok: true, estadosOcultos };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("guardarEstadosOcultosTickets", e) };
  }
}
