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

/** ¿Hay con qué enviar correo? `lista` si hay UNA conexión de notificaciones activa en Producción. */
export type ConexionCorreoPanel = {
  estado: "lista" | "sin_conexion" | "varias" | "error";
  mensaje: string | null;
};

/**
 * Qué cubrirá el próximo envío y de dónde sale (fechas de calendario AAAA-MM-DD). Se calcula en
 * el servidor con la próxima ejecución y el último reporte enviado (`calcularPeriodoEnvio`).
 */
export type PeriodoProximoPanel =
  | {
      estado: "nuevo";
      desde: string;
      hasta: string;
      /** `continua`: arranca el día siguiente al último reporte enviado; `primer_envio`: aún no hay reportes enviados. */
      origen: "continua" | "primer_envio";
      /** Período del último reporte enviado (null en el primer envío). */
      ultimoDesde: string | null;
      ultimoHasta: string | null;
      /** El período pasaba de 366 días y se recortó al tope. */
      recortado: boolean;
      desdeSinRecorte: string;
    }
  /** El último reporte ya llega hasta ese día: el próximo envío se omitirá. */
  | { estado: "cubierto"; hasta: string; cubiertoHasta: string };

/**
 * Rango sugerido por defecto cuando la persona abre «Enviar ahora a la lista» (desde el día
 * siguiente al último reporte enviado hasta hoy en hora de Colombia). El usuario puede ajustarlo.
 */
export type PeriodoManualSugerido = {
  desde: string;
  hasta: string;
  hoy: string;
  origen: "continua" | "primer_envio";
  ultimoDesde: string | null;
  ultimoHasta: string | null;
  recortado: boolean;
  desdeSinRecorte: string;
  yaCubiertoHoy: boolean;
};

export type PanelEnvioAutomatico = {
  /** `false` mientras nadie ha guardado nada: se muestran los valores por defecto. */
  existe: boolean;
  activa: boolean;
  diaSemana: number;
  hora: string;
  /** Próximo envío (ISO); null si está pausado. */
  proximaEjecucionEn: string | null;
  /** Lo que cubrirá ese próximo envío; null si está en pausa. */
  periodoProximo: PeriodoProximoPanel | null;
  /** Período sugerido por defecto para el envío manual desde la pantalla (siempre disponible). */
  periodoManualSugerido: PeriodoManualSugerido;
  destinatarios: DestinatarioPanel[];
  ejecuciones: EjecucionPanel[];
  conexion: ConexionCorreoPanel;
  /** `CRON_SECRET` está definido en el servidor: sin él el disparador responde 503 y nada se envía solo. */
  disparadorConfigurado: boolean;
  /** Debía haber salido hace más de 30 minutos y no salió: el cron no está corriendo. */
  atrasado: boolean;
  topeDestinatarios: number;
  /** Correo de la persona que mira la pantalla: el que «Enviar prueba» propone (se puede cambiar). */
  correoPrueba: string | null;
};

/** Valores de una programación que todavía no se ha guardado. */
export const PROGRAMACION_POR_DEFECTO = { activa: false, diaSemana: 1, hora: "07:00" } as const;
