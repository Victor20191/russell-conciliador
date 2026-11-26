"use server";

import * as z from "zod";
import { revalidatePath } from "next/cache";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/dal";
import { logAudit } from "@/lib/audit";
import { mensajeErrorBD } from "@/lib/errores";
import { authorizeReporteEjecutivo } from "@/lib/rbac/reporte-ejecutivo";
import {
  DestinatarioNotificacionSchema,
  ProgramacionNotificacionSchema,
  type ActionState,
} from "@/lib/definitions";
import { parseRangoReporte } from "@/lib/auditoria/reporte-ejecutivo/rango";
import { puedeAgregarDestinatario, TOPE_DESTINATARIOS } from "@/lib/notificaciones/destinatarios";
import type { PanelEnvioAutomatico } from "@/lib/notificaciones/panel";
import {
  calcularProximaAlGuardar,
  describirFrecuencia,
  describirPeriodo,
  TIPO_REPORTE_EJECUTIVO,
  type ModoPeriodo,
} from "@/lib/notificaciones/programacion";
import {
  enviarReporteAhora,
  leerPanelEnvio,
  obtenerOCrearProgramacion,
  RUTA_REPORTES_EJECUTIVOS,
  type ActorEnvio,
} from "@/lib/notificaciones/reporte-ejecutivo-servidor";

/**
 * Envío automático semanal del reporte para gerencia (panel de `/config/reportes-ejecutivos`).
 * Mismo permiso que el reporte: `auditoria:reporte_ejecutivo` y solo Superadministrador.
 * Cada acción autoriza primero, valida con Zod después y, al mutar, audita y revalida.
 * El disparo automático no pasa por aquí: lo hace `/api/tareas/notificaciones`.
 */

const IdSchema = z.coerce.number({ error: "El registro no es válido." }).int({ error: "El registro no es válido." }).positive({ error: "El registro no es válido." });
const FECHA_CALENDARIO = /^\d{4}-\d{2}-\d{2}$/;
/** Lo que lleva el correo: el período elegido arriba en la página y las novedades marcadas «Omitir». */
const AlcanceEnvioSchema = z.object({
  desde: z.string().regex(FECHA_CALENDARIO, "Selecciona una fecha inicial válida."),
  hasta: z.string().regex(FECHA_CALENDARIO, "Selecciona una fecha final válida."),
  cambiosOmitidos: z.array(z.number().int().positive()).max(5000).default([]),
});
type AlcanceEnvio = z.input<typeof AlcanceEnvioSchema>;

/** Valida el alcance que manda la pantalla; sin alcance, el envío decide su propio período. */
function leerAlcanceEnvio(
  alcance: AlcanceEnvio | undefined,
): { ok: true; alcance: z.output<typeof AlcanceEnvioSchema> | null } | { ok: false; estado: ActionState } {
  if (alcance === undefined) return { ok: true, alcance: null };
  const parsed = AlcanceEnvioSchema.safeParse(alcance);
  if (!parsed.success) {
    return {
      ok: false,
      estado: {
        ok: false,
        errors: z.flattenError(parsed.error).fieldErrors,
        message: parsed.error.issues[0]?.message ?? "Revisa el período del reporte.",
      },
    };
  }
  if (!parseRangoReporte(parsed.data.desde, parsed.data.hasta)) {
    return {
      ok: false,
      estado: { ok: false, message: "El rango de fechas no es válido o supera 366 días. Ajusta el período e inténtalo de nuevo." },
    };
  }
  return { ok: true, alcance: parsed.data };
}

/** Período y omisiones para `enviarReporteAhora`; nada si la pantalla no mandó alcance. */
function alcanceParaEnviar(alcance: z.output<typeof AlcanceEnvioSchema> | null) {
  return alcance
    ? { periodoElegido: { desde: alcance.desde, hasta: alcance.hasta }, cambiosOmitidos: alcance.cambiosOmitidos }
    : {};
}

/** Quién actúa: la persona de la sesión (la acción ya comprobó el permiso). */
async function actorDeSesion(userId: number): Promise<ActorEnvio> {
  const user = await getCurrentUser();
  return { id: user?.id ?? userId, nombre: user?.name ?? "Sistema" };
}

function esTablaNoDisponible(e: unknown): boolean {
  const code = e && typeof e === "object" && "code" in e ? (e as { code?: unknown }).code : undefined;
  return code === "P2021" || code === "P2022";
}

export type ResultadoPanelEnvio = { ok: true; panel: PanelEnvioAutomatico } | { ok: false; message: string };

/**
 * Todo lo que el panel necesita. Nunca lanza: si las tablas aún no existen en el entorno
 * (falta aplicar la migración) la pantalla sigue funcionando y solo el panel avisa.
 */
export async function obtenerPanelEnvioAutomatico(): Promise<ResultadoPanelEnvio> {
  const authz = await authorizeReporteEjecutivo();
  if (!authz.ok) return { ok: false, message: authz.message };
  try {
    const user = await getCurrentUser();
    return { ok: true, panel: await leerPanelEnvio({ correoPrueba: user?.email ?? null }) };
  } catch (e) {
    if (esTablaNoDisponible(e)) {
      return { ok: false, message: "El envío automático aún no está disponible en este entorno: falta aplicar la migración de notificaciones." };
    }
    return { ok: false, message: mensajeErrorBD("obtenerPanelEnvioAutomatico", e) };
  }
}

/** Activa o pausa el envío y guarda el día, la hora (hora de Colombia) y qué período cubre. */
export async function guardarProgramacionReporte(datos: {
  activa: boolean;
  diaSemana: number;
  hora: string;
  modoPeriodo?: ModoPeriodo;
  diasPeriodo?: number;
  incluirDiaEnvio?: boolean;
}): Promise<ActionState> {
  const authz = await authorizeReporteEjecutivo();
  if (!authz.ok) return { ok: false, message: authz.message };

  const parsed = ProgramacionNotificacionSchema.safeParse(datos);
  if (!parsed.success) {
    return { ok: false, errors: z.flattenError(parsed.error).fieldErrors, message: parsed.error.issues[0]?.message ?? "Revisa el día y la hora." };
  }
  const nueva = parsed.data;

  try {
    const actor = await actorDeSesion(authz.userId);
    const existente = await prisma.notificacionProgramada.findUnique({
      where: { tipo: TIPO_REPORTE_EJECUTIVO },
      select: { id: true, activa: true, diaSemana: true, hora: true, proximaEjecucionEn: true },
    });

    // Activar un envío que no tiene a quién llegar solo produciría un error cada semana.
    if (nueva.activa) {
      const activos = existente
        ? await prisma.notificacionDestinatario.count({ where: { programacionId: existente.id, activo: true } })
        : 0;
      if (activos === 0) {
        return { ok: false, message: "Agrega al menos un destinatario activo antes de activar el envío automático." };
      }
    }

    // Cambiar solo el período no mueve la próxima fecha: esa depende del día y la hora.
    const proximaEjecucionEn = calcularProximaAlGuardar({ previa: existente, nueva, ahora: new Date() });
    const configuracion = {
      activa: nueva.activa, diaSemana: nueva.diaSemana, hora: nueva.hora,
      modoPeriodo: nueva.modoPeriodo, diasPeriodo: nueva.diasPeriodo, incluirDiaEnvio: nueva.incluirDiaEnvio,
      proximaEjecucionEn,
    };
    await prisma.notificacionProgramada.upsert({
      where: { tipo: TIPO_REPORTE_EJECUTIVO },
      update: { ...configuracion, actualizadoPor: actor.nombre, actualizadoPorId: actor.id },
      create: {
        tipo: TIPO_REPORTE_EJECUTIVO, ...configuracion,
        creadoPor: actor.nombre, creadoPorId: actor.id, actualizadoPor: actor.nombre, actualizadoPorId: actor.id,
      },
    });

    await logAudit({
      user: actor.nombre,
      action: nueva.activa ? "ACTIVÓ ENVÍO AUTOMÁTICO DE REPORTE" : "PAUSÓ ENVÍO AUTOMÁTICO DE REPORTE",
      entity: "Uso y adopción",
      detail: `${nueva.activa ? "Envío semanal del reporte para gerencia activo" : "Envío semanal del reporte para gerencia en pausa"}: ${describirFrecuencia(nueva.diaSemana, nueva.hora).toLowerCase()}; cubre ${describirPeriodo({ modo: nueva.modoPeriodo, dias: nueva.diasPeriodo, incluirDiaEnvio: nueva.incluirDiaEnvio })}.`,
    });
    revalidatePath(RUTA_REPORTES_EJECUTIVOS);
    return { ok: true, message: nueva.activa ? "Envío automático guardado y activo." : "Envío automático guardado en pausa." };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("guardarProgramacionReporte", e) };
  }
}

/** Agrega un destinatario (cualquier correo válido; no tiene que ser usuario de la plataforma). */
export async function agregarDestinatarioReporte(datos: { correo: string; nombre?: string }): Promise<ActionState> {
  const authz = await authorizeReporteEjecutivo();
  if (!authz.ok) return { ok: false, message: authz.message };

  const parsed = DestinatarioNotificacionSchema.safeParse(datos);
  if (!parsed.success) {
    return { ok: false, errors: z.flattenError(parsed.error).fieldErrors, message: parsed.error.issues[0]?.message ?? "Revisa el correo." };
  }

  try {
    const actor = await actorDeSesion(authz.userId);
    const programacion = await obtenerOCrearProgramacion(actor);
    const guardados = await prisma.notificacionDestinatario.count({ where: { programacionId: programacion.id } });
    if (!puedeAgregarDestinatario(guardados)) {
      return { ok: false, message: `La lista admite hasta ${TOPE_DESTINATARIOS} destinatarios. Quita alguno antes de agregar otro.` };
    }
    try {
      await prisma.notificacionDestinatario.create({
        data: {
          programacionId: programacion.id,
          correo: parsed.data.correo,
          nombre: parsed.data.nombre,
          creadoPor: actor.nombre,
          creadoPorId: actor.id,
        },
      });
    } catch (e) {
      if (e && typeof e === "object" && "code" in e && (e as { code?: unknown }).code === "P2002") {
        return { ok: false, errors: { correo: ["Ese correo ya está en la lista."] }, message: "Ese correo ya está en la lista." };
      }
      throw e;
    }

    await logAudit({
      user: actor.nombre,
      action: "AGREGÓ DESTINATARIO DEL REPORTE",
      entity: "Uso y adopción",
      detail: `Agregó ${parsed.data.correo} a los destinatarios del envío automático del reporte para gerencia.`,
    });
    revalidatePath(RUTA_REPORTES_EJECUTIVOS);
    return { ok: true, message: "Destinatario agregado." };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("agregarDestinatarioReporte", e) };
  }
}

/** Pausa o reactiva a un destinatario sin quitarlo de la lista. */
export async function cambiarEstadoDestinatarioReporte(id: number, activo: boolean): Promise<ActionState> {
  const authz = await authorizeReporteEjecutivo();
  if (!authz.ok) return { ok: false, message: authz.message };

  const parsed = z.object({ id: IdSchema, activo: z.boolean() }).safeParse({ id, activo });
  if (!parsed.success) return { ok: false, message: "El destinatario no es válido." };

  try {
    const actor = await actorDeSesion(authz.userId);
    const { count } = await prisma.notificacionDestinatario.updateMany({
      where: { id: parsed.data.id, programacion: { tipo: TIPO_REPORTE_EJECUTIVO } },
      data: { activo: parsed.data.activo },
    });
    if (count === 0) return { ok: false, message: "El destinatario ya no existe." };

    await logAudit({
      user: actor.nombre,
      action: parsed.data.activo ? "ACTIVÓ DESTINATARIO DEL REPORTE" : "PAUSÓ DESTINATARIO DEL REPORTE",
      entity: "Uso y adopción",
      detail: `${parsed.data.activo ? "Reactivó" : "Pausó"} al destinatario #${parsed.data.id} del envío automático del reporte para gerencia.`,
    });
    revalidatePath(RUTA_REPORTES_EJECUTIVOS);
    return { ok: true, message: parsed.data.activo ? "Destinatario activado." : "Destinatario en pausa." };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("cambiarEstadoDestinatarioReporte", e) };
  }
}

/** Quita a un destinatario de la lista. */
export async function quitarDestinatarioReporte(id: number): Promise<ActionState> {
  const authz = await authorizeReporteEjecutivo();
  if (!authz.ok) return { ok: false, message: authz.message };

  const parsed = IdSchema.safeParse(id);
  if (!parsed.success) return { ok: false, message: "El destinatario no es válido." };

  try {
    const actor = await actorDeSesion(authz.userId);
    const fila = await prisma.notificacionDestinatario.findFirst({
      where: { id: parsed.data, programacion: { tipo: TIPO_REPORTE_EJECUTIVO } },
      select: { id: true, correo: true },
    });
    if (!fila) return { ok: false, message: "El destinatario ya no existe." };
    await prisma.notificacionDestinatario.delete({ where: { id: fila.id } });

    await logAudit({
      user: actor.nombre,
      action: "QUITÓ DESTINATARIO DEL REPORTE",
      entity: "Uso y adopción",
      detail: `Quitó a ${fila.correo} de los destinatarios del envío automático del reporte para gerencia.`,
    });
    revalidatePath(RUTA_REPORTES_EJECUTIVOS);
    return { ok: true, message: "Destinatario quitado." };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("quitarDestinatarioReporte", e) };
  }
}

const CorreoPruebaSchema = DestinatarioNotificacionSchema.pick({ correo: true });

/**
 * Envía el reporte SOLO al correo que escribe quien lo pide (sin escribir ninguno, al de su
 * cuenta), con el período y las omisiones de la página. No cuenta como entregado al cliente;
 * la bitácora anota a qué correo fue.
 */
export async function enviarPruebaDelReporte(datos?: {
  correo?: string | null;
  alcance?: AlcanceEnvio;
}): Promise<ActionState> {
  const authz = await authorizeReporteEjecutivo();
  if (!authz.ok) return { ok: false, message: authz.message };

  let correo: string | null = null;
  if (datos?.correo?.trim()) {
    const parsed = CorreoPruebaSchema.safeParse({ correo: datos.correo });
    if (!parsed.success) {
      return { ok: false, message: parsed.error.issues[0]?.message ?? "Escribe un correo válido." };
    }
    correo = parsed.data.correo;
  }
  const alcance = leerAlcanceEnvio(datos?.alcance);
  if (!alcance.ok) return alcance.estado;

  try {
    const user = await getCurrentUser();
    correo ??= user?.email?.trim().toLowerCase() || null;
    if (!correo) return { ok: false, message: "Escribe el correo al que quieres enviar la prueba." };
    const actor = await actorDeSesion(authz.userId);
    const r = await enviarReporteAhora({ origen: "prueba", actor, correoPrueba: correo, ...alcanceParaEnviar(alcance.alcance) });
    const periodo = alcance.alcance ? ` del ${alcance.alcance.desde} al ${alcance.alcance.hasta}` : "";
    await logAudit({
      user: actor.nombre,
      action: "ENVIÓ PRUEBA DEL REPORTE",
      entity: "Uso y adopción",
      detail: `Envió una prueba del reporte para gerencia${periodo} a ${correo}${r.ok ? "" : ` (no salió: ${r.message ?? "sin detalle"})`}.`,
    });
    revalidatePath(RUTA_REPORTES_EJECUTIVOS);
    return { ok: r.ok, message: r.message };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("enviarPruebaDelReporte", e) };
  }
}

/**
 * Envía el reporte ahora a toda la lista activa, con el período y las omisiones de la página,
 * y deja constancia en «Reportes enviados».
 */
export async function enviarReporteAhoraALista(alcance?: AlcanceEnvio): Promise<ActionState> {
  const authz = await authorizeReporteEjecutivo();
  if (!authz.ok) return { ok: false, message: authz.message };

  const leido = leerAlcanceEnvio(alcance);
  if (!leido.ok) return leido.estado;

  try {
    const actor = await actorDeSesion(authz.userId);
    const r = await enviarReporteAhora({ origen: "manual", actor, ...alcanceParaEnviar(leido.alcance) });
    revalidatePath(RUTA_REPORTES_EJECUTIVOS);
    return { ok: r.ok, message: r.message };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("enviarReporteAhoraALista", e) };
  }
}
