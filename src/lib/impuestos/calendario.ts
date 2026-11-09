import { claveNit } from "@/lib/nit";
import { etiquetaPeriodo } from "./periodicidad";

/**
 * Calendario tributario DIAN · fechas límite por período y último dígito del NIT (puro).
 *
 * El usuario lo importa cada año desde el PDF de la DIAN (Claude propone una grilla por formulario
 * y el usuario la confirma) o lo escribe a mano. La fecha límite depende del ÚLTIMO dígito del
 * NIT sin el dígito de verificación: en un NIT de 9 dígitos, el 9.º. Nunca el DV.
 */

type DefCalendario = {
  etiqueta: string;
  periodos: number;
  mesesPorPeriodo: number;
  /** Nombre del período en la grilla; `anio` es el del calendario. */
  etiquetaPeriodo: (periodo: number, anio?: number) => string;
  /**
   * Año de los períodos frente al del calendario: 0 en todos salvo el IVA anual (−1), que el
   * calendario de un año publica para el año gravable anterior (vence en febrero).
   */
  desfaseAnio: number;
  /** La DIAN agrupa los dígitos de a dos (1-2, 3-4…): el código copia la fecha al otro dígito del par. */
  digitosPorPares: boolean;
  /** Qué sección del PDF leer y qué es cada período: va en el mensaje a la IA. */
  instruccionPdf: string;
};

/** Formularios con calendario: Retención en la fuente (mensual) e IVA (bimestral, cuatrimestral y anual). */
export const FORMULARIOS_CALENDARIO = {
  RETEFUENTE: {
    etiqueta: "Retención en la fuente",
    periodos: 12,
    mesesPorPeriodo: 1,
    etiquetaPeriodo: (p: number) => etiquetaPeriodo("Mensual", p),
    desfaseAnio: 0,
    digitosPorPares: false,
    instruccionPdf:
      "Sección: «Retención en la fuente» (declaración y pago mensual). Doce períodos: 1 = enero … 12 = diciembre, el mes de las retenciones, no el mes en que vence. El vencimiento cae en el mes siguiente al período; el de diciembre vence en enero del año siguiente.",
  },
  IVA_BIMESTRAL: {
    etiqueta: "IVA bimestral",
    periodos: 6,
    mesesPorPeriodo: 2,
    etiquetaPeriodo: (p: number) => etiquetaPeriodo("Bimestral", p),
    desfaseAnio: 0,
    digitosPorPares: false,
    instruccionPdf:
      "Sección: «IVA - Bimestral» (declaración y pago). Seis períodos: 1 = enero-febrero, 2 = marzo-abril, 3 = mayo-junio, 4 = julio-agosto, 5 = septiembre-octubre y 6 = noviembre-diciembre, que vence en enero del año siguiente. No la confundas con «RST - Anticipo bimestral» ni con el impuesto al consumo.",
  },
  IVA_CUATRIMESTRAL: {
    etiqueta: "IVA cuatrimestral",
    periodos: 3,
    mesesPorPeriodo: 4,
    etiquetaPeriodo: (p: number) => etiquetaPeriodo("Cuatrimestral", p),
    desfaseAnio: 0,
    digitosPorPares: false,
    instruccionPdf:
      "Sección: «IVA - Cuatrimestral» (declaración y pago). Tres períodos: 1 = enero-abril, 2 = mayo-agosto y 3 = septiembre-diciembre, que vence en enero del año siguiente.",
  },
  IVA_ANUAL: {
    etiqueta: "IVA anual",
    periodos: 1,
    mesesPorPeriodo: 12,
    etiquetaPeriodo: (_p: number, anio?: number) => (anio ? `Año gravable ${anio - 1}` : "Año gravable anterior"),
    desfaseAnio: -1,
    digitosPorPares: true,
    instruccionPdf:
      "Sección: «RST», columna «Consolidada de IVA» (declaración anual del IVA de los responsables del Régimen Simple de Tributación). Un solo período (1): el año gravable ANTERIOR al del calendario; su vencimiento cae en febrero del año del calendario. La tabla agrupa los dígitos de a dos (1-2, 3-4, 5-6, 7-8, 9-0): devuelve una fila por cada dígito, con la fecha de su par.",
  },
} as const satisfies Record<string, DefCalendario>;

export type FormularioCalendario = keyof typeof FORMULARIOS_CALENDARIO;

export const CLAVES_CALENDARIO = Object.keys(FORMULARIOS_CALENDARIO) as FormularioCalendario[];

export function esFormularioCalendario(valor: string): valor is FormularioCalendario {
  return valor in FORMULARIOS_CALENDARIO;
}

export const NOMBRES_MES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
] as const;

/** Orden en que la DIAN publica los dígitos (y en que crecen las fechas). */
export const ORDEN_DIGITOS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 0] as const;

/** Pares de dígitos con la misma fecha cuando la DIAN los agrupa de a dos. */
const PARES_DIGITOS = [[1, 2], [3, 4], [5, 6], [7, 8], [9, 0]] as const;

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

/** Último día del período (AAAA-MM-DD). */
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

/**
 * Cuando la DIAN agrupa los dígitos de a dos, copia la fecha de un dígito al otro de su par si
 * falta. Una casilla ya escrita no se toca (si el par quedó con fechas distintas, lo avisa
 * `validarCalendario`).
 */
export function completarPares(formulario: FormularioCalendario, filas: readonly VencimientoDian[]): VencimientoDian[] {
  if (!FORMULARIOS_CALENDARIO[formulario].digitosPorPares) return [...filas];
  const resultado = [...filas];
  const hay = (periodo: number, digito: number) => resultado.some((f) => f.periodo === periodo && f.ultimoDigito === digito);
  for (const periodo of [...new Set(filas.map((f) => f.periodo))]) {
    for (const [a, b] of PARES_DIGITOS) {
      const fuente = resultado.find((f) => f.periodo === periodo && (f.ultimoDigito === a || f.ultimoDigito === b));
      if (!fuente) continue;
      for (const d of [a, b]) if (!hay(periodo, d)) resultado.push({ periodo, ultimoDigito: d, fecha: fuente.fecha });
    }
  }
  return resultado;
}

export type ResultadoCalendario = { errores: string[]; avisos: string[] };

/**
 * Valida una grilla completa antes de guardarla. Errores (impiden guardar): faltan o sobran
 * casillas, fechas inválidas o anteriores al cierre del período. Avisos (se guardan, pero se
 * muestran): fechas más de dos meses después del período, que no crecen con el dígito o, en los
 * formularios por pares, un par con fechas distintas.
 */
export function validarCalendario(anio: number, formulario: FormularioCalendario, filas: readonly VencimientoDian[]): ResultadoCalendario {
  const def: DefCalendario = FORMULARIOS_CALENDARIO[formulario];
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
    const nombre = def.etiquetaPeriodo(periodo, anio);
    const fin = finDelPeriodo(anio + def.desfaseAnio, periodo, def.mesesPorPeriodo);
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
    if (def.digitosPorPares) {
      for (const [a, b] of PARES_DIGITOS) {
        const fa = porCasilla.get(`${periodo}:${a}`)?.[0]?.fecha;
        const fb = porCasilla.get(`${periodo}:${b}`)?.[0]?.fecha;
        if (fa && fb && fa !== fb) avisos.push(`${nombre}: los dígitos ${a} y ${b} vencen el mismo día en la DIAN y aquí tienen fechas distintas.`);
      }
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
export function grillaCalendario(formulario: FormularioCalendario, filas: readonly VencimientoDian[], anio?: number): { periodo: number; etiqueta: string; fechas: (string | null)[] }[] {
  const def: DefCalendario = FORMULARIOS_CALENDARIO[formulario];
  const indice = new Map(filas.map((f) => [`${f.periodo}:${f.ultimoDigito}`, f.fecha]));
  return Array.from({ length: def.periodos }, (_, i) => {
    const periodo = i + 1;
    return { periodo, etiqueta: def.etiquetaPeriodo(periodo, anio), fechas: ORDEN_DIGITOS.map((d) => indice.get(`${periodo}:${d}`) ?? null) };
  });
}

/** Una propuesta leída del PDF para un formulario del calendario. */
export type PropuestaCalendario = { anio: number; formulario: FormularioCalendario; filas: VencimientoDian[]; errores: string[]; avisos: string[] };

/**
 * Respuesta de «Importar desde el PDF de la DIAN»: una propuesta por formulario (Retención en la
 * fuente e IVA bimestral, cuatrimestral y anual) que el usuario revisa antes de guardar.
 */
export type ResultadoLecturaCalendario = {
  ok?: boolean;
  message?: string;
  propuestas?: PropuestaCalendario[];
};
