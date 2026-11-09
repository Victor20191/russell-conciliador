import { nucleoNit } from "@/lib/nit";
import { CONCEPTOS_RETENCION_F350 } from "./formularios/f350";

/**
 * Mapeos DIAN · formulario 350 → cuenta Russell (puro).
 *
 * Cada concepto del 350 suma sus dos columnas (Honorarios = 42 + 95) y se cruza contra el
 * saldo final de una cuenta Russell de 6 dígitos. El mapeo es GLOBAL (vale para todos los
 * clientes, como el plan Russell); lo editan Gerente, Socio y administradores en
 * «Mapeos DIAN». Valores de fábrica: pestaña «F350-Mapeo Russell» del levantamiento.
 */

export type SignoMapeo = "+" | "-";

export type FilaMapeoDian = {
  concepto: string;
  etiqueta: string;
  seccion: string;
  /** Renglón de retención de persona jurídica (o el único, en 129 a 137). */
  renglonPj: number | null;
  renglonPn: number | null;
  /** Cuenta Russell de 6 dígitos; null = sin cuenta (lo declarado no tiene contra qué cruzar). */
  cuentaRussell: string | null;
  signo: SignoMapeo;
  /** false = el concepto no entra al cruce contable (las sanciones solo van a Pagos efectuados). */
  enCruce: boolean;
  orden: number;
};

const RUSSELL_POR_CONCEPTO: Readonly<Record<string, string>> = {
  rentas_trabajo: "236505",
  rentas_pensiones: "236505",
  honorarios: "236515",
  comisiones: "236520",
  servicios: "236525",
  rendimientos: "236535",
  arrendamientos: "236530",
  regalias: "236570",
  dividendos: "236510",
  compras: "236540",
  tarjetas: "236570",
  construccion: "236570",
  enajenacion_activos: "236560",
  loterias: "236545",
  hidrocarburos: "236570",
  otros_pagos: "236570",
  exterior_sin_convenio: "236550",
  exterior_con_convenio: "236550",
  autorret_exonerados: "236575",
  autorret_ventas: "236575",
  autorret_honorarios: "236575",
  autorret_comisiones: "236575",
  autorret_servicios: "236575",
  autorret_rendimientos: "236575",
  autorret_pagos_provisionales: "236575",
  autorret_exportacion_hidrocarburos: "236575",
  autorret_otros: "236575",
};

const conceptosRetencion: FilaMapeoDian[] = CONCEPTOS_RETENCION_F350.map((c) => ({
  concepto: c.concepto,
  etiqueta: c.etiqueta,
  seccion: c.seccion,
  renglonPj: c.pj?.[1] ?? null,
  renglonPn: c.pn?.[1] ?? null,
  cuentaRussell: RUSSELL_POR_CONCEPTO[c.concepto] ?? null,
  signo: "+",
  enCruce: true,
  orden: 0,
}));

const unico = (concepto: string, etiqueta: string, seccion: string, renglon: number, cuentaRussell: string | null, signo: SignoMapeo, enCruce = true): FilaMapeoDian => ({
  concepto, etiqueta, seccion, renglonPj: renglon, renglonPn: null, cuentaRussell, signo, enCruce, orden: 0,
});

export const MAPEO_F350_FABRICA: readonly FilaMapeoDian[] = [
  ...conceptosRetencion,
  // Sin cuenta hasta que Russell lo defina: en el cruce resta del lado declarado del 130 (en la
  // contabilidad la reversión ya quedó en la cuenta de cada concepto).
  unico("menos_renta_exceso", "Menos retenciones de renta practicadas en exceso o indebidas", "Retenciones a título de renta", 129, null, "-"),
  unico("reteiva_responsables", "ReteIVA a responsables del impuesto sobre las ventas", "Retenciones a título de IVA", 131, "236705", "+"),
  unico("reteiva_no_residentes", "ReteIVA por servicios a no residentes o no domiciliados", "Retenciones a título de IVA", 132, "236705", "+"),
  unico("menos_reteiva_exceso", "Menos reteIVA practicadas en exceso o indebidas", "Retenciones a título de IVA", 133, "236705", "-"),
  unico("timbre", "Retención de timbre nacional", "Retención de timbre", 135, "236565", "+"),
  unico("sanciones", "Sanciones", "Totales", 137, null, "+", false),
].map((fila, i) => ({ ...fila, orden: (i + 1) * 10 }));

/** Cuentas Russell en las que NO se resta el tercero DIAN: sus movimientos con la DIAN son la
 *  autorretención misma. Cualquier otra cuenta lo resta salvo que «Mapeos DIAN» diga otra cosa. */
export const CUENTAS_SIN_RESTA_DIAN_FABRICA: readonly string[] = ["236575"];

export type TerceroDian = { nit: string; etiqueta: string };

export const TERCEROS_DIAN_FABRICA: readonly TerceroDian[] = [
  { nit: "800197268", etiqueta: "U.A.E. Dirección de Impuestos y Aduanas Nacionales (DIAN)" },
  { nit: "800197384", etiqueta: "NIT del levantamiento de Russell" },
];

/** ¿El tercero es la DIAN? Compara por núcleo de 9 dígitos (con o sin DV). */
export function esTerceroDian(nit: string | null | undefined, terceros: readonly Pick<TerceroDian, "nit">[]): boolean {
  const nucleo = nucleoNit(nit ?? "");
  return nucleo.length === 9 && terceros.some((t) => nucleoNit(t.nit) === nucleo);
}

/** Nombre que delata a la DIAN sin NIT: se PROPONE (nunca se aplica solo). «DIAN» suelto no
 *  basta: hay terceros llamados Diana. */
export function pareceNombreDian(nombre: string | null | undefined): boolean {
  const n = (nombre ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
  return n.includes("IMPUESTOS Y ADUANAS");
}

/** ¿En esta cuenta Russell se resta el tercero DIAN? */
export function restaTerceroDian(cuentaRussell: string, sinResta: ReadonlySet<string>): boolean {
  return !sinResta.has(cuentaRussell);
}

/** Renglones del 350 que suma un concepto (sus dos columnas). */
export function renglonesDeFila(fila: Pick<FilaMapeoDian, "renglonPj" | "renglonPn">): number[] {
  return [fila.renglonPj, fila.renglonPn].filter((r): r is number => r != null);
}

/**
 * Clave de varias cuentas Russell en una fila del mapeo: únicas, ordenadas y unidas con «+»
 * («420505+421005»), el mismo formato de las claves de grupo del cruce de los módulos.
 */
export function claveCuentasMapeo(cuentas: readonly string[]): string {
  return [...new Set(cuentas)].sort().join("+");
}

/** Las cuentas Russell de una fila del mapeo (una sola en el 350; varias en el renglón 40 del 300). */
export function cuentasDeMapeo(fila: Pick<FilaMapeoDian, "cuentaRussell">): string[] {
  return fila.cuentaRussell ? fila.cuentaRussell.split("+").filter((c) => c !== "") : [];
}

/**
 * Valida la cuenta Russell escrita en «Mapeos DIAN»: vacío (sin cuenta) o una o varias cuentas de
 * 6 dígitos separadas con «+», coma o punto y coma (los espacios se ignoran). Varias se guardan
 * ordenadas y unidas con «+».
 */
export function normalizarCuentaMapeo(valor: string | null | undefined): { ok: true; cuenta: string | null } | { ok: false; message: string } {
  const partes = (valor ?? "").replace(/\s/g, "").split(/[+,;]+/).filter((p) => p !== "");
  if (partes.length === 0) return { ok: true, cuenta: null };
  if (partes.some((p) => !/^\d{6}$/.test(p))) return { ok: false, message: "Cada cuenta Russell debe tener 6 dígitos (varias se separan con +)." };
  return { ok: true, cuenta: claveCuentasMapeo(partes) };
}

/** Valida un NIT de la lista de la DIAN: 9 dígitos (núcleo, sin DV). */
export function normalizarNitDian(valor: string | null | undefined): { ok: true; nit: string } | { ok: false; message: string } {
  const digitos = (valor ?? "").replace(/\D/g, "");
  if (digitos.length < 9 || digitos.length > 10) return { ok: false, message: "Escribe el NIT de 9 dígitos (con o sin DV)." };
  return { ok: true, nit: digitos.slice(0, 9) };
}
