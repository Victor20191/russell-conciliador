// Programación semanal de las notificaciones por correo: cálculos PUROS.
//
// Nada aquí lee la base de datos ni el reloj: quien llama pasa `ahora`. Colombia no
// tiene horario de verano, así que su desfase con UTC es fijo (UTC−5) y las cuentas
// no dependen de la zona del proceso ni de la sesión de la BD.
//
// Diseño y despliegue: docs/notificaciones/reporte-ejecutivo-programado.md.

import { sumarDias, ultimosDias } from "@/lib/auditoria/reporte-ejecutivo/periodo-sugerido";

/** Tipo de la notificación del reporte para gerencia (`notificacion_programada.tipo`). */
export const TIPO_REPORTE_EJECUTIVO = "reporte_ejecutivo";
export const FRECUENCIA_SEMANAL = "semanal";

export type OrigenEjecucion = "programada" | "manual" | "prueba";
export type EstadoEjecucion = "en_curso" | "ok" | "parcial" | "error" | "omitida";

/** Colombia = UTC−5 todo el año. */
export const DESFASE_COLOMBIA_MS = -5 * 3_600_000;
const DIA_MS = 86_400_000;

/** Si el cron llega más de 24 h tarde, ese envío ya no tiene sentido: se omite. */
export const RETRASO_MAXIMO_MS = 24 * 3_600_000;
/** Una ejecución «en curso» tan vieja se dio por perdida (el proceso se reinició). */
export const EN_CURSO_MAXIMO_MS = 30 * 60_000;

/** 1 = lunes … 7 = domingo (numeración ISO). */
export const DIAS_SEMANA = [
  { valor: 1, etiqueta: "Lunes" },
  { valor: 2, etiqueta: "Martes" },
  { valor: 3, etiqueta: "Miércoles" },
  { valor: 4, etiqueta: "Jueves" },
  { valor: 5, etiqueta: "Viernes" },
  { valor: 6, etiqueta: "Sábado" },
  { valor: 7, etiqueta: "Domingo" },
] as const;

/** HH:mm de 24 horas. */
export const PATRON_HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

export function etiquetaDiaSemana(valor: number): string {
  return DIAS_SEMANA.find((d) => d.valor === valor)?.etiqueta ?? "—";
}

export function esDiaSemanaValido(valor: unknown): valor is number {
  return typeof valor === "number" && Number.isInteger(valor) && valor >= 1 && valor <= 7;
}

export function esHoraValida(valor: unknown): valor is string {
  return typeof valor === "string" && PATRON_HORA.test(valor);
}

/** El reloj de pared de Colombia: sus getters UTC leen la fecha y hora de allá. */
function paredColombia(instante: Date): Date {
  return new Date(instante.getTime() + DESFASE_COLOMBIA_MS);
}

/** Fecha de calendario de Colombia (AAAA-MM-DD) de un instante. */
export function fechaColombia(instante: Date): string {
  return paredColombia(instante).toISOString().slice(0, 10);
}

/** Día de la semana en Colombia: 1 = lunes … 7 = domingo. */
export function diaSemanaColombia(instante: Date): number {
  return ((paredColombia(instante).getUTCDay() + 6) % 7) + 1;
}

/**
 * El primer instante ESTRICTAMENTE posterior a `ahora` que cae en `diaSemana` a la
 * `hora` (HH:mm) de Colombia. Con la hora exacta ya vencida, el siguiente es el de
 * la semana próxima. Lanza si el día o la hora no son válidos (es un error de
 * programación: la entrada del usuario se valida antes con Zod).
 */
export function proximaEjecucion(params: { ahora: Date; diaSemana: number; hora: string }): Date {
  const { ahora, diaSemana, hora } = params;
  if (!esDiaSemanaValido(diaSemana)) throw new RangeError("El día de la semana debe ir de 1 (lunes) a 7 (domingo).");
  if (!esHoraValida(hora)) throw new RangeError("La hora debe tener el formato HH:mm.");
  if (Number.isNaN(ahora.getTime())) throw new RangeError("La fecha de referencia no es válida.");

  const [horas, minutos] = hora.split(":").map(Number);
  const pared = paredColombia(ahora);
  // Hoy a esa hora, en reloj de pared; luego se adelanta hasta el día pedido.
  const hoyALaHora = Date.UTC(pared.getUTCFullYear(), pared.getUTCMonth(), pared.getUTCDate(), horas, minutos);
  const hoy = diaSemanaColombia(ahora);
  let candidato = hoyALaHora + ((diaSemana - hoy + 7) % 7) * DIA_MS;
  if (candidato - DESFASE_COLOMBIA_MS <= ahora.getTime()) candidato += 7 * DIA_MS;
  return new Date(candidato - DESFASE_COLOMBIA_MS);
}

/**
 * Los 7 días de calendario que terminan el día ANTERIOR al envío, en hora de
 * Colombia: enviado un lunes, cubre del lunes al domingo anteriores. Se mide desde
 * `referencia` (para un envío programado, el instante programado, no el real: un
 * retraso que cruce la medianoche no corre la ventana).
 */
export function periodoEnvioSemanal(referencia: Date): { desde: string; hasta: string } {
  return ultimosDias(sumarDias(fechaColombia(referencia), -1), 7);
}

export type DecisionVencimiento =
  /** Todavía no es la hora. */
  | { accion: "esperar" }
  /** Ya toca y el retraso es tolerable: se genera y se envía. */
  | { accion: "enviar"; retrasoMs: number }
  /** Pasó de 24 h: no se envía, solo se avanza la próxima fecha. */
  | { accion: "omitir"; retrasoMs: number };

/** ¿Qué hacer con una programación activa cuya próxima ejecución es `proximaEjecucionEn`? */
export function decidirVencimiento(params: { proximaEjecucionEn: Date; ahora: Date }): DecisionVencimiento {
  const retrasoMs = params.ahora.getTime() - params.proximaEjecucionEn.getTime();
  if (retrasoMs < 0) return { accion: "esperar" };
  return retrasoMs > RETRASO_MAXIMO_MS ? { accion: "omitir", retrasoMs } : { accion: "enviar", retrasoMs };
}

/** ¿Una ejecución que sigue «en curso» ya pasó de 30 minutos y debe darse por perdida? */
export function ejecucionEnCursoVencida(params: { iniciadaEn: Date; ahora: Date }): boolean {
  return params.ahora.getTime() - params.iniciadaEn.getTime() > EN_CURSO_MAXIMO_MS;
}

/** Instante antes del cual una ejecución «en curso» se da por perdida. */
export function limiteEnCurso(ahora: Date): Date {
  return new Date(ahora.getTime() - EN_CURSO_MAXIMO_MS);
}

/** Estado final de un envío según los correos que el servidor SMTP aceptó. */
export function estadoDeEnvio(aceptados: number, fallidos: number): Extract<EstadoEjecucion, "ok" | "parcial" | "error"> {
  if (aceptados > 0 && fallidos === 0) return "ok";
  return aceptados > 0 ? "parcial" : "error";
}

/** Texto corto de la frecuencia para la pantalla: «Cada lunes a las 07:00». */
export function describirFrecuencia(diaSemana: number, hora: string): string {
  return `Cada ${etiquetaDiaSemana(diaSemana).toLowerCase()} a las ${hora} (hora de Colombia)`;
}

/** Cuánto se tolera que el cron llegue tarde antes de avisar en pantalla que no está corriendo. */
export const TOLERANCIA_DISPARADOR_MS = 30 * 60_000;

/**
 * ¿El envío debía haber salido y no ha salido? Con el cron llamando cada 10 minutos, una
 * programación activa con la próxima ejecución vencida por más de la tolerancia indica que
 * el disparador del servidor no está corriendo (o no tiene el `CRON_SECRET` correcto).
 */
export function envioAtrasado(params: { activa: boolean; proximaEjecucionEn: Date | null; ahora: Date }): boolean {
  const { activa, proximaEjecucionEn, ahora } = params;
  if (!activa || !proximaEjecucionEn) return false;
  return ahora.getTime() - proximaEjecucionEn.getTime() > TOLERANCIA_DISPARADOR_MS;
}

/**
 * La próxima ejecución que queda al GUARDAR la configuración desde la pantalla.
 *
 * - Pausada: no hay próxima.
 * - Activa y sin cambios de día u hora: se conserva la que ya había. Así guardar «por si
 *   acaso» no se come un envío que ya venció y que el cron aún no atendió.
 * - Activa y con cambios (o recién activada): la primera ocurrencia futura del nuevo día y hora.
 */
export function calcularProximaAlGuardar(params: {
  previa: { activa: boolean; diaSemana: number; hora: string; proximaEjecucionEn: Date | null } | null;
  nueva: { activa: boolean; diaSemana: number; hora: string };
  ahora: Date;
}): Date | null {
  const { previa, nueva, ahora } = params;
  if (!nueva.activa) return null;
  if (
    previa?.activa &&
    previa.proximaEjecucionEn &&
    previa.diaSemana === nueva.diaSemana &&
    previa.hora === nueva.hora
  ) {
    return previa.proximaEjecucionEn;
  }
  return proximaEjecucion({ ahora, diaSemana: nueva.diaSemana, hora: nueva.hora });
}
