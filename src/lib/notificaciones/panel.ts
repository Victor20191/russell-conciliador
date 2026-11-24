// Lo que el panel «Envío automático» recibe del servidor: datos planos y serializables
// (fechas en ISO), sin tipos de Prisma. Compartido por la acción que lo arma y por la
// pantalla que lo pinta.

import type { EstadoEjecucion, OrigenEjecucion } from "./programacion";

export type DestinatarioPanel = {
  id: number;
  correo: string;
  nombre: string | null;
  activo: boolean;
};

export type EjecucionPanel = {
  id: number;
  origen: OrigenEjecucion;
  estado: EstadoEjecucion;
  aceptados: number;
  fallidos: number;
  mensaje: string | null;
  /** Instante para el que estaba programado (en manual y prueba, el de la solicitud). */
  programadaPara: string;
  iniciadaEn: string;
  terminadaEn: string | null;
  periodoDesde: string | null;
  periodoHasta: string | null;
  ejecutadoPor: string | null;
};

/** ¿Hay con qué enviar correo? `lista` solo si hay UNA conexión de notificaciones con la dirección de Russell. */
export type ConexionCorreoPanel = {
  estado: "lista" | "sin_conexion" | "varias" | "sin_direccion" | "error";
  mensaje: string | null;
};

export type PanelEnvioAutomatico = {
  /** `false` mientras nadie ha guardado nada: se muestran los valores por defecto. */
  existe: boolean;
  activa: boolean;
  diaSemana: number;
  hora: string;
  /** Próximo envío (ISO); null si está pausado. */
  proximaEjecucionEn: string | null;
  destinatarios: DestinatarioPanel[];
  ejecuciones: EjecucionPanel[];
  conexion: ConexionCorreoPanel;
  /** `CRON_SECRET` está definido en el servidor: sin él el disparador responde 503 y nada se envía solo. */
  disparadorConfigurado: boolean;
  /** Debía haber salido hace más de 30 minutos y no salió: el cron no está corriendo. */
  atrasado: boolean;
  topeDestinatarios: number;
  /** Correo de la persona que mira la pantalla: a donde va «Enviar prueba». */
  correoPrueba: string | null;
};

/** Valores de una programación que todavía no se ha guardado. */
export const PROGRAMACION_POR_DEFECTO = { activa: false, diaSemana: 1, hora: "07:00" } as const;
