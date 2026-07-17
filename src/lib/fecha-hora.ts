/**
 * Política temporal única de la plataforma.
 *
 * - Los instantes se transportan como `Date`/ISO y se guardan con zona en PostgreSQL.
 * - Toda fecha u hora de negocio se calcula y presenta en Colombia.
 * - Las fechas contables puras (`DATE`) no se convierten como si fueran instantes.
 */
export const ZONA_HORARIA_COLOMBIA = "America/Bogota";
export const LOCALE_COLOMBIA = "es-CO";

export type EntradaFecha = Date | string | number;

export type PartesFechaHoraColombia = {
  anio: number;
  mes: number;
  dia: number;
  hora: number;
  minuto: number;
  segundo: number;
};

const FORMATEADOR_PARTES = new Intl.DateTimeFormat("en-CA", {
  timeZone: ZONA_HORARIA_COLOMBIA,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

const FORMATEADOR_DESFASE = new Intl.DateTimeFormat("en-US", {
  timeZone: ZONA_HORARIA_COLOMBIA,
  timeZoneName: "longOffset",
});

const ISO_FECHA = /^(\d{4})-(\d{2})-(\d{2})$/;
const p2 = (n: number): string => String(n).padStart(2, "0");

export function aFecha(input: EntradaFecha): Date | null {
  const fecha = input instanceof Date ? input : new Date(input);
  return Number.isNaN(fecha.getTime()) ? null : fecha;
}

export function partesFechaHoraColombia(input: EntradaFecha): PartesFechaHoraColombia | null {
  const fecha = aFecha(input);
  if (!fecha) return null;
  const partes = Object.fromEntries(
    FORMATEADOR_PARTES.formatToParts(fecha).map((parte) => [parte.type, parte.value]),
  );
  return {
    anio: Number(partes.year),
    mes: Number(partes.month),
    dia: Number(partes.day),
    hora: Number(partes.hour),
    minuto: Number(partes.minute),
    segundo: Number(partes.second),
  };
}

function desfaseColombiaMs(fecha: Date): number {
  const nombre = FORMATEADOR_DESFASE.formatToParts(fecha).find((p) => p.type === "timeZoneName")?.value;
  const match = /^GMT([+-])(\d{2}):(\d{2})$/.exec(nombre ?? "");
  if (!match) throw new Error(`No fue posible resolver el desfase de ${ZONA_HORARIA_COLOMBIA}.`);
  const minutos = Number(match[2]) * 60 + Number(match[3]);
  return (match[1] === "+" ? 1 : -1) * minutos * 60_000;
}

function fechaLocalColombiaAInstante(
  anio: number,
  mes: number,
  dia: number,
  hora = 0,
  minuto = 0,
  segundo = 0,
  milisegundo = 0,
): Date {
  const paredUTC = Date.UTC(anio, mes - 1, dia, hora, minuto, segundo, milisegundo);
  let candidato = new Date(paredUTC);
  candidato = new Date(paredUTC - desfaseColombiaMs(candidato));
  // Segunda pasada: mantiene el helper correcto incluso ante un cambio histórico
  // de desfase entre la aproximación inicial y el instante definitivo.
  return new Date(paredUTC - desfaseColombiaMs(candidato));
}

function partesISOFecha(fechaISO: string): { anio: number; mes: number; dia: number } | null {
  const match = ISO_FECHA.exec(fechaISO);
  if (!match) return null;
  const anio = Number(match[1]);
  const mes = Number(match[2]);
  const dia = Number(match[3]);
  const control = new Date(Date.UTC(anio, mes - 1, dia));
  if (control.getUTCFullYear() !== anio || control.getUTCMonth() !== mes - 1 || control.getUTCDate() !== dia) {
    return null;
  }
  return { anio, mes, dia };
}

/** Medianoche colombiana de una fecha de calendario `AAAA-MM-DD`. */
export function inicioDiaColombiaDesdeISO(fechaISO: string): Date {
  const partes = partesISOFecha(fechaISO);
  if (!partes) throw new Error(`Fecha ISO inválida: ${fechaISO}`);
  return fechaLocalColombiaAInstante(partes.anio, partes.mes, partes.dia);
}

/** Valor seguro para una columna PostgreSQL `DATE` a partir de `AAAA-MM-DD`. */
export function fechaCalendarioPrisma(fechaISO: string): Date {
  const partes = partesISOFecha(fechaISO);
  if (!partes) throw new Error(`Fecha ISO inválida: ${fechaISO}`);
  return new Date(Date.UTC(partes.anio, partes.mes - 1, partes.dia));
}

/** Serializa un valor PostgreSQL `DATE` sin tratarlo como un instante. */
export function fechaCalendarioISO(input: Date | string): string {
  if (typeof input === "string") {
    const partes = partesISOFecha(input);
    if (partes) return `${partes.anio}-${p2(partes.mes)}-${p2(partes.dia)}`;
  }
  const fecha = aFecha(input);
  if (!fecha) throw new Error("Fecha calendario inválida.");
  return `${fecha.getUTCFullYear()}-${p2(fecha.getUTCMonth() + 1)}-${p2(fecha.getUTCDate())}`;
}

/** Fecha de calendario vigente en Colombia, sin depender de la zona del proceso. */
export function fechaColombiaISO(input: EntradaFecha = new Date()): string {
  const partes = partesFechaHoraColombia(input);
  if (!partes) throw new Error("Fecha inválida.");
  return `${partes.anio}-${p2(partes.mes)}-${p2(partes.dia)}`;
}

/** ISO con el reloj y el desfase real de Colombia, útil en exportaciones legibles. */
export function fechaHoraColombiaISO(input: EntradaFecha = new Date()): string {
  const fecha = aFecha(input);
  const partes = fecha ? partesFechaHoraColombia(fecha) : null;
  if (!fecha || !partes) throw new Error("Fecha inválida.");
  const desfase = desfaseColombiaMs(fecha);
  const signo = desfase >= 0 ? "+" : "-";
  const minutosDesfase = Math.abs(desfase) / 60_000;
  const offset = `${signo}${p2(Math.floor(minutosDesfase / 60))}:${p2(minutosDesfase % 60)}`;
  return `${fechaColombiaISO(fecha)}T${p2(partes.hora)}:${p2(partes.minuto)}:${p2(partes.segundo)}.${String(fecha.getUTCMilliseconds()).padStart(3, "0")}${offset}`;
}

export function anioColombia(input: EntradaFecha = new Date()): number {
  const partes = partesFechaHoraColombia(input);
  if (!partes) throw new Error("Fecha inválida.");
  return partes.anio;
}

export function inicioMesColombia(input: EntradaFecha = new Date()): Date {
  const partes = partesFechaHoraColombia(input);
  if (!partes) throw new Error("Fecha inválida.");
  return fechaLocalColombiaAInstante(partes.anio, partes.mes, 1);
}

/**
 * Resta meses conservando el reloj de Colombia. Ajusta días inexistentes al
 * último día del mes destino (31 de agosto - 6 meses = 28/29 de febrero).
 */
export function restarMesesColombia(input: EntradaFecha, meses: number): Date {
  const fecha = aFecha(input);
  const partes = fecha ? partesFechaHoraColombia(fecha) : null;
  if (!fecha || !partes || !Number.isInteger(meses) || meses < 0) throw new Error("Parámetros de fecha inválidos.");
  const indiceMes = partes.anio * 12 + (partes.mes - 1) - meses;
  const anio = Math.floor(indiceMes / 12);
  const mesCero = ((indiceMes % 12) + 12) % 12;
  const ultimoDia = new Date(Date.UTC(anio, mesCero + 1, 0)).getUTCDate();
  return fechaLocalColombiaAInstante(
    anio,
    mesCero + 1,
    Math.min(partes.dia, ultimoDia),
    partes.hora,
    partes.minuto,
    partes.segundo,
    fecha.getUTCMilliseconds(),
  );
}
