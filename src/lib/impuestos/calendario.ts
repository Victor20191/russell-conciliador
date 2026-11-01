import { claveNit } from "@/lib/nit";

/**
 * Calendario tributario DIAN · fechas límite por período y último dígito del NIT (puro).
 *
 * El usuario lo importa cada año desde el PDF de la DIAN (Claude propone la grilla y el
 * usuario la confirma) o lo escribe a mano. La fecha límite depende del ÚLTIMO dígito del
 * NIT sin el dígito de verificación: en un NIT de 9 dígitos, el 9.º. Nunca el DV.
 */

/** Formularios con calendario. Hoy solo Retención en la fuente (mensual, 12 períodos). */
export const FORMULARIOS_CALENDARIO = {
  RETEFUENTE: { etiqueta: "Retención en la fuente", periodos: 12, etiquetaPeriodo: (p: number) => NOMBRES_MES[p - 1] ?? `Período ${p}`, mesesPorPeriodo: 1 },
} as const;

export type FormularioCalendario = keyof typeof FORMULARIOS_CALENDARIO;

export function esFormularioCalendario(valor: string): valor is FormularioCalendario {
  return valor in FORMULARIOS_CALENDARIO;
}

export const NOMBRES_MES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
] as const;

/** Orden en que la DIAN publica los dígitos (y en que crecen las fechas). */
export const ORDEN_DIGITOS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 0] as const;

export type VencimientoDian = { periodo: number; ultimoDigito: number; fecha: string };

/**
 * Último dígito del NIT sin el DV. El NIT del cliente se guarda sin DV; si viniera con guion
 * («901427659-5»), se descarta lo que va después del guion.
 */
export function ultimoDigitoNit(nit: string | null | undefined): number | null {
  const base = claveNit((nit ?? "").split("-")[0] ?? "");
  if (base.length === 0) return null;
  return Number(base[base.length - 1]);
}

const FECHA_ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

/** ¿Es una fecha de calendario real en formato AAAA-MM-DD? */
export function esFechaIso(valor: string): boolean {
  const m = FECHA_ISO.exec(valor);
  if (!m) return false;
  const [anio, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = new Date(Date.UTC(anio, mes - 1, dia));
  return d.getUTCFullYear() === anio && d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia;
}

/** Último día del período (AAAA-MM-DD) para un formulario mensual. */
function finDelPeriodo(anio: number, periodo: number, mesesPorPeriodo: number): string {
  const mesFin = periodo * mesesPorPeriodo; // 1..12
  const ultimo = new Date(Date.UTC(anio, mesFin, 0));
  return ultimo.toISOString().slice(0, 10);
}

/** Suma meses a una fecha ISO (para la ventana razonable de vencimiento). */
function sumarMeses(fechaIso: string, meses: number): string {
  const [a, m, d] = fechaIso.split("-").map(Number);
  const f = new Date(Date.UTC(a, m - 1 + meses, d));
  return f.toISOString().slice(0, 10);
}

export type ResultadoCalendario = { errores: string[]; avisos: string[] };

/**
 * Valida una grilla completa antes de guardarla. Errores (impiden guardar): faltan o sobran
 * casillas, fechas inválidas o anteriores al cierre del período. Avisos (se guardan, pero se
 * muestran): fechas más de dos meses después del período o que no crecen con el dígito.
 */
export function validarCalendario(anio: number, formulario: FormularioCalendario, filas: readonly VencimientoDian[]): ResultadoCalendario {
  const def = FORMULARIOS_CALENDARIO[formulario];
  const errores: string[] = [];
  const avisos: string[] = [];
  const porCasilla = new Map<string, VencimientoDian[]>();
  for (const f of filas) {
    const clave = `${f.periodo}:${f.ultimoDigito}`;
    porCasilla.set(clave, [...(porCasilla.get(clave) ?? []), f]);
  }
  for (const f of filas) {
    if (!Number.isInteger(f.periodo) || f.periodo < 1 || f.periodo > def.periodos) errores.push(`Período ${f.periodo} no existe en ${def.etiqueta}.`);
    if (!Number.isInteger(f.ultimoDigito) || f.ultimoDigito < 0 || f.ultimoDigito > 9) errores.push(`Dígito ${f.ultimoDigito} no válido (0 a 9).`);
  }
  for (let periodo = 1; periodo <= def.periodos; periodo++) {
    const nombre = def.etiquetaPeriodo(periodo);
    const fin = finDelPeriodo(anio, periodo, def.mesesPorPeriodo);
    const limite = sumarMeses(fin, 2);
    let anterior: string | null = null;
    for (const digito of ORDEN_DIGITOS) {
      const casillas = porCasilla.get(`${periodo}:${digito}`) ?? [];
      if (casillas.length === 0) { errores.push(`${nombre}: falta la fecha del dígito ${digito}.`); continue; }
      if (casillas.length > 1) errores.push(`${nombre}: el dígito ${digito} está repetido.`);
      const { fecha } = casillas[0];
      if (!esFechaIso(fecha)) { errores.push(`${nombre}, dígito ${digito}: «${fecha}» no es una fecha válida.`); continue; }
      if (fecha <= fin) errores.push(`${nombre}, dígito ${digito}: vence el ${fecha}, antes de terminar el período.`);
      else if (fecha > limite) avisos.push(`${nombre}, dígito ${digito}: vence el ${fecha}, más de dos meses después del período.`);
      if (anterior && fecha < anterior) avisos.push(`${nombre}: la fecha del dígito ${digito} es anterior a la del dígito que lo precede.`);
      anterior = fecha;
    }
  }
  return { errores, avisos };
}

/** Fecha límite de un período para un NIT, o null si el calendario no la tiene. */
export function fechaVencimiento(filas: readonly VencimientoDian[], periodo: number, nit: string | null | undefined): string | null {
  const digito = ultimoDigitoNit(nit);
  if (digito == null) return null;
  return filas.find((f) => f.periodo === periodo && f.ultimoDigito === digito)?.fecha ?? null;
}

/** Grilla ordenada período × dígito (1..9, 0) para la pantalla y el Excel. */
export function grillaCalendario(formulario: FormularioCalendario, filas: readonly VencimientoDian[]): { periodo: number; etiqueta: string; fechas: (string | null)[] }[] {
  const def = FORMULARIOS_CALENDARIO[formulario];
  const indice = new Map(filas.map((f) => [`${f.periodo}:${f.ultimoDigito}`, f.fecha]));
  return Array.from({ length: def.periodos }, (_, i) => {
    const periodo = i + 1;
    return { periodo, etiqueta: def.etiquetaPeriodo(periodo), fechas: ORDEN_DIGITOS.map((d) => indice.get(`${periodo}:${d}`) ?? null) };
  });
}

/** Respuesta de «Importar desde el PDF de la DIAN»: la propuesta que el usuario revisa antes de guardar. */
export type ResultadoLecturaCalendario = {
  ok?: boolean;
  message?: string;
  propuesta?: { anio: number; formulario: FormularioCalendario; filas: VencimientoDian[]; errores: string[]; avisos: string[] };
};
