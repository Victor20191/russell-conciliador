import { VALORES_F300 } from "../formularios/f300";
import { SECCIONES_MAPEO_F300 } from "../impuestos-dian";
import type { FilaMapeoDian } from "../mapeo-dian";

/**
 * Mapeos DIAN · formulario 300 (IVA) → cuenta Russell, valores de fábrica (pestaña «F300-Mapeo
 * Russell» del levantamiento). Un concepto por renglón (el 300 no tiene columnas por persona). Las
 * devoluciones en ventas (42) y el ajuste de descontables (80) restan en el subtotal de su sección;
 * el saldo a favor anterior (84) y las sanciones (87) no tienen cuenta ni entran al cruce. El 40
 * (operaciones no gravadas) suma once cuentas de ingresos no operacionales.
 */

const CUENTA_POR_RENGLON: Readonly<Record<number, string>> = {
  27: "410510",
  28: "410505",
  29: "410520",
  30: "410525",
  31: "410525",
  32: "410525",
  33: "410525",
  34: "410505",
  35: "410525",
  36: "410505",
  37: "410505",
  38: "410510",
  39: "410530",
  40: "420505+421005+421020+421095+421505+422005+423005+423505+424515+425005+429595",
  42: "417505",
  58: "240807",
  59: "240830",
  60: "240808",
  61: "240834",
  62: "240835",
  63: "240836",
  64: "240837",
  65: "240809",
  66: "240815",
  68: "240845",
  69: "240844",
  70: "240847",
  71: "240841",
  72: "240840",
  73: "240848",
  74: "240843",
  75: "240842",
  76: "240849",
  78: "240846",
  79: "240820",
  80: "240850",
};

/** Renglones que restan en el subtotal de su sección del cruce. */
const RESTAN: ReadonlySet<number> = new Set([42, 80]);

const fila = (renglon: number, concepto: string, etiqueta: string, seccion: string, cuentaRussell: string | null, enCruce = true): FilaMapeoDian => ({
  concepto, etiqueta, seccion, renglonPj: renglon, renglonPn: null, cuentaRussell, signo: RESTAN.has(renglon) ? "-" : "+", enCruce, orden: 0,
});

export const MAPEO_F300_FABRICA: readonly FilaMapeoDian[] = [
  ...VALORES_F300.map((v) => fila(v.renglon, v.concepto, v.etiqueta, v.seccion, CUENTA_POR_RENGLON[v.renglon] ?? null)),
  fila(84, "saldo_favor_anterior", "Saldo a favor del período fiscal anterior", SECCIONES_MAPEO_F300.liquidacion, null, false),
  fila(85, "retenciones_iva", "Retenciones por IVA que le practicaron", SECCIONES_MAPEO_F300.reteiva, "135517"),
  fila(87, "sanciones", "Sanciones", SECCIONES_MAPEO_F300.liquidacion, null, false),
].map((f, i) => ({ ...f, orden: (i + 1) * 10 }));
