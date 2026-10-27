/**
 * Cálculos puros de las ventanas emergentes de la marca (listas, calendario y
 * avisos), que reemplazan a las que dibuja el sistema operativo.
 */

export type Caja = { top: number; left: number; bottom: number; right: number; width: number; height: number };
export type Tamano = { ancho: number; alto: number };

/** Debajo del control si cabe; si no, encima. Nunca fuera de la ventana. */
export function posicionEmergente(ancla: Caja, tam: Tamano, vista: Tamano, separacion = 4, margen = 8): { top: number; left: number; arriba: boolean } {
  const cabeAbajo = ancla.bottom + separacion + tam.alto <= vista.alto - margen;
  const cabeArriba = ancla.top - separacion - tam.alto >= margen;
  const arriba = !cabeAbajo && cabeArriba;
  const top = arriba
    ? ancla.top - separacion - tam.alto
    : Math.max(margen, Math.min(ancla.bottom + separacion, vista.alto - margen - tam.alto));
  const left = Math.max(margen, Math.min(ancla.left, vista.ancho - margen - tam.ancho));
  return { top, left, arriba };
}

/** Un aviso centrado bajo el control (o encima, si no cabe). */
export function posicionAviso(ancla: Caja, tam: Tamano, vista: Tamano, separacion = 6, margen = 8): { top: number; left: number } {
  const abajo = ancla.bottom + separacion;
  const top = abajo + tam.alto <= vista.alto - margen ? abajo : Math.max(margen, ancla.top - separacion - tam.alto);
  const centro = ancla.left + ancla.width / 2 - tam.ancho / 2;
  const left = Math.max(margen, Math.min(centro, vista.ancho - margen - tam.ancho));
  return { top, left };
}

/** Para buscar: minúsculas, sin tildes ni espacios repetidos. */
export function paraBuscar(texto: string): string {
  return texto.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();
}

export type Sugerencia = { valor: string; texto: string };

/** Las sugerencias que contienen lo escrito (en valor o en texto), las que empiezan igual primero. */
export function filtrarSugerencias(opciones: readonly Sugerencia[], consulta: string, maximo = 60): Sugerencia[] {
  const q = paraBuscar(consulta);
  if (!q) return opciones.slice(0, maximo);
  const empiezan: Sugerencia[] = [];
  const contienen: Sugerencia[] = [];
  for (const o of opciones) {
    const valor = paraBuscar(o.valor);
    const texto = paraBuscar(o.texto);
    if (valor.startsWith(q) || texto.startsWith(q)) empiezan.push(o);
    else if (valor.includes(q) || texto.includes(q)) contienen.push(o);
  }
  return [...empiezan, ...contienen].slice(0, maximo);
}

// ---------- Calendario ----------

export const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
export const DIAS_SEMANA = ["lu", "ma", "mi", "ju", "vi", "sá", "do"];

const dos = (n: number) => String(n).padStart(2, "0");

/** «2026-10-27» → { anio, mes (1–12), dia }; «2026-10» → { anio, mes, dia: null }. */
export function deIso(texto: string): { anio: number; mes: number; dia: number | null } | null {
  const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(texto.trim());
  if (!m) return null;
  const anio = Number(m[1]);
  const mes = Number(m[2]);
  const dia = m[3] ? Number(m[3]) : null;
  if (mes < 1 || mes > 12) return null;
  if (dia != null && (dia < 1 || dia > diasDelMes(anio, mes))) return null;
  return { anio, mes, dia };
}

export function aIso(anio: number, mes: number, dia?: number): string {
  return dia == null ? `${anio}-${dos(mes)}` : `${anio}-${dos(mes)}-${dos(dia)}`;
}

export function diasDelMes(anio: number, mes: number): number {
  return new Date(Date.UTC(anio, mes, 0)).getUTCDate();
}

export function sumarMeses(anio: number, mes: number, n: number): { anio: number; mes: number } {
  const total = anio * 12 + (mes - 1) + n;
  return { anio: Math.floor(total / 12), mes: (total % 12) + 1 };
}

/** Semanas del mes, de lunes a domingo, con los días vecinos para completar la cuadrícula. */
export function semanasDelMes(anio: number, mes: number): { iso: string; dia: number; delMes: boolean }[][] {
  const primero = new Date(Date.UTC(anio, mes - 1, 1));
  const desplazamiento = (primero.getUTCDay() + 6) % 7; // lunes = 0
  const inicio = Date.UTC(anio, mes - 1, 1 - desplazamiento);
  const semanas: { iso: string; dia: number; delMes: boolean }[][] = [];
  for (let s = 0; s < 6; s++) {
    const semana = [];
    for (let d = 0; d < 7; d++) {
      const f = new Date(inicio + (s * 7 + d) * 86_400_000);
      semana.push({ iso: aIso(f.getUTCFullYear(), f.getUTCMonth() + 1, f.getUTCDate()), dia: f.getUTCDate(), delMes: f.getUTCMonth() + 1 === mes });
    }
    semanas.push(semana);
  }
  return semanas;
}

/** Dentro de los límites `min`/`max` del campo (las fechas ISO se comparan como texto). */
export function permitido(iso: string, min?: string | null, max?: string | null): boolean {
  return (!min || iso >= min) && (!max || iso <= max);
}

/** Hoy en el reloj del equipo, como lo entiende un `<input type="date">`. */
export function hoyIso(ahora = new Date()): string {
  return aIso(ahora.getFullYear(), ahora.getMonth() + 1, ahora.getDate());
}

/** «27 de octubre de 2026» / «octubre de 2026». */
export function fechaLegible(iso: string): string {
  const f = deIso(iso);
  if (!f) return iso;
  return f.dia == null ? `${MESES[f.mes - 1]} de ${f.anio}` : `${f.dia} de ${MESES[f.mes - 1]} de ${f.anio}`;
}

// ---------- Validación ----------

export type EstadoValidacion = {
  validez: Partial<Record<"valueMissing" | "typeMismatch" | "patternMismatch" | "tooShort" | "tooLong" | "rangeUnderflow" | "rangeOverflow" | "stepMismatch" | "badInput" | "customError", boolean>>;
  etiqueta: "select" | "textarea" | "input";
  tipo: string;
  min?: string;
  max?: string;
  minLength?: number;
  maxLength?: number;
  largo?: number;
  formato?: string | null;
  mensajePropio?: string;
};

/**
 * El mensaje, en español, de un campo que no pasa su validación. El del navegador
 * sale en el idioma del navegador; el que puso la plataforma (`setCustomValidity`) se
 * respeta tal cual.
 */
export function mensajeValidacion(e: EstadoValidacion): string {
  const v = e.validez;
  const esFecha = e.tipo === "date" || e.tipo === "month";
  const valor = (x?: string) => (x && esFecha ? fechaLegible(x) : x ?? "");
  if (v.customError && e.mensajePropio) return e.mensajePropio;
  if (v.valueMissing) {
    if (e.etiqueta === "select") return "Elige una opción de la lista.";
    if (e.tipo === "checkbox") return "Marca esta casilla para continuar.";
    if (e.tipo === "radio") return "Elige una de las opciones.";
    if (e.tipo === "file") return "Elige un archivo.";
    return "Completa este campo.";
  }
  if (v.typeMismatch) return e.tipo === "email" ? "Escribe un correo válido (nombre@dominio.com)." : e.tipo === "url" ? "Escribe una dirección web completa (https://…)." : "El valor no tiene el formato esperado.";
  if (v.patternMismatch) return e.formato ? `Usa el formato pedido: ${e.formato}` : "El valor no tiene el formato esperado.";
  if (v.tooShort) return `Escribe al menos ${e.minLength} caracteres${e.largo != null ? ` (llevas ${e.largo})` : ""}.`;
  if (v.tooLong) return `Escribe como máximo ${e.maxLength} caracteres.`;
  if (v.rangeUnderflow) return esFecha ? `La fecha debe ser desde ${valor(e.min)}.` : `El valor debe ser mayor o igual a ${e.min}.`;
  if (v.rangeOverflow) return esFecha ? `La fecha no puede ser posterior a ${valor(e.max)}.` : `El valor debe ser menor o igual a ${e.max}.`;
  if (v.badInput) return e.tipo === "number" ? "Escribe un número." : esFecha ? "Escribe una fecha completa." : "El valor no es válido.";
  if (v.stepMismatch) return "El valor no es válido para este campo.";
  return e.mensajePropio || "Revisa este campo.";
}
