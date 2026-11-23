// Movimientos por tercero del ERP para clientes SIN balance por terceros (MUMA, SAP).
//
// El cliente no entrega el balance por terceros, pero su ERP genera un reporte de los movimientos
// de enero a la fecha de corte, documento por documento, con la cuenta, el NIT y el nombre del
// tercero y su débito y crédito (o un importe con signo). Agregado por cuenta y tercero, ese
// movimiento es lo que el cruce de impuestos necesita: con un balance que empieza el 1 de enero,
// el cruce deja a la DIAN en cero y a cada tercero le resta su saldo inicial, o sea, trabaja con
// el movimiento del año. Por eso cada tercero se guarda con saldo inicial 0 y saldo final =
// débitos − créditos (la misma forma que la captura de un balance por terceros).
//
// Solo se guardan las cuentas de los grupos que conservan terceros (`conservaDetalleTercero`) y
// la captura se admite si el movimiento neto de cada cuenta AMARRA con el del balance.
//
// Módulo PURO (sin BD): la lectura del Excel vive en `movimientos-tercero-servidor.ts`.
import { z } from "zod";
import { normalizarTerceroModulo } from "@/lib/modulos/tercero";
import { claveTerceroCanonica } from "@/lib/nit";
import { reconocerIdentidadTercero, type IdentidadTercero } from "./identidad-tercero";
import { conservaDetalleTercero } from "./staging-tercero";
import { parseNumeroFlexible } from "./extraccion/transformar";
import type { FilaCapturaTercero } from "./staging-tercero";

import { NOMBRE_SIN_TERCERO } from "./movimientos-tercero-constantes";
import { IMPUESTOS } from "@/lib/impuestos/impuestos-dian";

export { esCapturaDeMovimientos, MENSAJE_SIN_MOVIMIENTOS_ERP, NOMBRE_SIN_TERCERO, ORIGEN_MOVIMIENTOS_ERP } from "./movimientos-tercero-constantes";

// ===== Mapeo de columnas =====

/** Columnas 1-based; 0 = no mapeada. */
export const MapeoMovimientosSchema = z.object({
  filaEncabezado: z.number().int().min(1).max(50),
  cuenta: z.number().int().min(1).max(200),
  nit: z.number().int().min(1).max(200),
  nombre: z.number().int().min(0).max(200),
  modo: z.enum(["debito_credito", "importe"]),
  debito: z.number().int().min(0).max(200),
  credito: z.number().int().min(0).max(200),
  importe: z.number().int().min(0).max(200),
}).superRefine((m, ctx) => {
  if (m.modo === "debito_credito" && (m.debito === 0 || m.credito === 0)) {
    ctx.addIssue({ code: "custom", message: "Indica la columna del débito y la del crédito." });
  }
  if (m.modo === "importe" && m.importe === 0) {
    ctx.addIssue({ code: "custom", message: "Indica la columna del importe." });
  }
  const usadas = [m.cuenta, m.nit, m.nombre, ...(m.modo === "importe" ? [m.importe] : [m.debito, m.credito])].filter((c) => c > 0);
  if (new Set(usadas).size !== usadas.length) {
    ctx.addIssue({ code: "custom", message: "Una misma columna no puede cumplir dos papeles." });
  }
});
export type MapeoMovimientos = z.infer<typeof MapeoMovimientosSchema>;

const claveEncabezado = (v: string) =>
  v.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

function buscarColumna(encabezados: readonly string[], patrones: readonly RegExp[], usadas: Set<number>): number {
  for (const patron of patrones) {
    const i = encabezados.findIndex((e, idx) => !usadas.has(idx + 1) && patron.test(claveEncabezado(e)));
    if (i >= 0) {
      usadas.add(i + 1);
      return i + 1;
    }
  }
  return 0;
}

/**
 * Sugerencia del mapeo a partir de los encabezados. El de SAP de MUMA: «Cuenta», «Importe en moneda
 * local», «DB», «CR», «Clave referencia 1» (NIT) y «Clave referencia 3» (nombre).
 */
export function sugerirMapeoMovimientos(encabezados: readonly string[], filaEncabezado = 1): MapeoMovimientos {
  const usadas = new Set<number>();
  const cuenta = buscarColumna(encabezados, [/^cuenta$/, /^(codigo )?cuenta( contable)?$/, /^cuenta/], usadas);
  const nit = buscarColumna(encabezados, [/^nit( tercero)?$/, /^(documento|identificacion|nit)( del)? tercero$/, /^clave referencia 1$/, /\bnit\b/, /identificacion/], usadas);
  const nombre = buscarColumna(encabezados, [/^(nombre|razon social)( del)?( tercero)?$/, /^clave referencia 3$/, /^tercero$/, /nombre tercero|razon social/], usadas);
  const debito = buscarColumna(encabezados, [/^(db|deb|debe|debito|debitos)$/, /^debito/], usadas);
  const credito = buscarColumna(encabezados, [/^(cr|cre|haber|credito|creditos)$/, /^credito/], usadas);
  const importe = debito && credito ? 0 : buscarColumna(encabezados, [/^importe en moneda local$/, /^importe/, /^(valor|monto)$/], usadas);
  return {
    filaEncabezado,
    cuenta,
    nit,
    nombre,
    modo: debito && credito ? "debito_credito" : "importe",
    debito: debito && credito ? debito : 0,
    credito: debito && credito ? credito : 0,
    importe,
  };
}

/** Fila de encabezados: la primera (de las 20 primeras) que trae una columna «cuenta»; si ninguna, la 1. */
export function detectarFilaEncabezado(filas: readonly (readonly unknown[])[]): number {
  const i = filas.slice(0, 20).findIndex((f) => f.some((c) => typeof c === "string" && /^cuenta/.test(claveEncabezado(c))));
  return i >= 0 ? i + 1 : 1;
}

// ===== Valores de celda =====

/**
 * Valor útil de una celda tal como la entrega `exceljs`: las fórmulas traen `{ formula, result }`
 * (las columnas DB y CR del archivo de MUMA son fórmulas), el texto enriquecido `{ richText }`.
 */
export function valorCelda(v: unknown): unknown {
  if (v == null) return null;
  if (typeof v !== "object" || v instanceof Date) return v;
  const o = v as Record<string, unknown>;
  if ("result" in o) return valorCelda(o.result);
  if ("formula" in o || "sharedFormula" in o) return null;
  if (Array.isArray(o.richText)) return (o.richText as { text?: string }[]).map((t) => t.text ?? "").join("");
  if ("text" in o) return valorCelda(o.text);
  if ("error" in o) return null;
  return null;
}

export function textoCelda(v: unknown): string {
  const valor = valorCelda(v);
  if (valor == null) return "";
  if (valor instanceof Date) return valor.toISOString().slice(0, 10);
  return String(valor).trim();
}

/** Monto de una celda: número o texto con formato; null si no es numérico. */
export function montoCelda(v: unknown): number | null {
  const valor = valorCelda(v);
  if (valor == null || valor === "") return 0;
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : null;
  if (typeof valor === "boolean" || valor instanceof Date) return null;
  return parseNumeroFlexible(String(valor));
}

const redondear = (n: number) => Math.round(n * 100) / 100;

// ===== Agregación por cuenta y tercero =====

export type TerceroMovimientos = {
  nit: string | null;
  nombre: string;
  identidad: IdentidadTercero | null;
  debitos: number;
  creditos: number;
};

export type AgregadoMovimientos = {
  /** cuenta del archivo (solo dígitos) → clave del tercero → tercero. */
  cuentas: Map<string, Map<string, TerceroMovimientos>>;
  filasLeidas: number;
  /** Filas de las cuentas que se guardan. */
  filasUsadas: number;
  /** Filas de esas cuentas sin NIT ni nombre. */
  filasSinTercero: number;
  /** Filas con un monto que no se pudo leer (primeras 10, número de fila del archivo). */
  montosIlegibles: number[];
  cuentasDescartadas: number;
};

export function nuevoAgregado(): AgregadoMovimientos {
  return { cuentas: new Map(), filasLeidas: 0, filasUsadas: 0, filasSinTercero: 0, montosIlegibles: [], cuentasDescartadas: 0 };
}

const descartadas = new WeakMap<AgregadoMovimientos, Set<string>>();

/**
 * Suma una fila de datos al agregado. `celdas` es la fila 1-based de `exceljs` (`row.values`) o
 * cualquier arreglo donde `celdas[n]` es la columna n. Solo entran las cuentas de los grupos que
 * conservan terceros; las demás se cuentan y se ignoran.
 */
export function agregarFilaMovimiento(agregado: AgregadoMovimientos, celdas: readonly unknown[], mapeo: MapeoMovimientos, numeroFila: number): void {
  const cuenta = textoCelda(celdas[mapeo.cuenta]).replace(/\D/g, "");
  if (!cuenta) return;
  agregado.filasLeidas += 1;
  if (!conservaDetalleTercero(cuenta)) {
    const set = descartadas.get(agregado) ?? new Set<string>();
    if (!set.has(cuenta)) {
      set.add(cuenta);
      agregado.cuentasDescartadas += 1;
    }
    descartadas.set(agregado, set);
    return;
  }

  let debito: number | null;
  let credito: number | null;
  if (mapeo.modo === "importe") {
    const importe = montoCelda(celdas[mapeo.importe]);
    debito = importe == null ? null : Math.max(importe, 0);
    credito = importe == null ? null : Math.max(-importe, 0);
  } else {
    debito = montoCelda(celdas[mapeo.debito]);
    credito = montoCelda(celdas[mapeo.credito]);
  }
  if (debito == null || credito == null) {
    if (agregado.montosIlegibles.length < 10) agregado.montosIlegibles.push(numeroFila);
    return;
  }
  agregado.filasUsadas += 1;

  const documento = textoCelda(celdas[mapeo.nit]);
  const nombreArchivo = mapeo.nombre ? textoCelda(celdas[mapeo.nombre]) : "";
  const normalizado = normalizarTerceroModulo(documento);
  const nit = normalizado.nitCanonico;
  const nombre = nombreArchivo || (nit ? "" : (normalizado.nombre ?? ""));
  const clave = claveTerceroCanonica(documento) ?? (documento ? `doc:${documento.toUpperCase()}` : nombre ? `nombre:${nombre.toUpperCase()}` : "sin_tercero");
  if (clave === "sin_tercero") agregado.filasSinTercero += 1;

  const terceros = agregado.cuentas.get(cuenta) ?? new Map<string, TerceroMovimientos>();
  agregado.cuentas.set(cuenta, terceros);
  let t = terceros.get(clave);
  if (!t) {
    const sinTercero = clave === "sin_tercero";
    t = {
      nit,
      // Un documento que no es NIT (extranjero) y no trae nombre queda con el documento como nombre.
      nombre: sinTercero ? NOMBRE_SIN_TERCERO : nombre || (nit ? "" : documento),
      identidad: sinTercero ? null : reconocerIdentidadTercero({ documento, nombre: nombreArchivo || null }),
      debitos: 0,
      creditos: 0,
    };
    terceros.set(clave, t);
  } else if (!t.nombre && nombre) {
    t.nombre = nombre;
  }
  t.debitos += debito;
  t.creditos += credito;
}

// ===== Enlace con el balance y amarre =====

export type CuentaBalanceAmarre = {
  cuenta8: string;
  nombreCuenta: string;
  cuenta6Russell: string | null;
  coincidencia: number | null;
  saldoInicial: number;
  debitos: number;
  creditos: number;
  saldoFinal: number;
};

/**
 * Contra qué se amarra el movimiento de enero al corte del archivo:
 * - `inicio_enero`: el balance empieza el 1 de enero; su saldo inicial es el de apertura del año.
 * - `cierre_diciembre`: el balance es de otro período (p. ej. el mensual del corte, cuyo saldo
 *   anterior es el del mes anterior); la apertura del año es el saldo final del balance cerrado al
 *   31 de diciembre del año anterior. Del balance del corte solo cuenta su saldo final.
 */
export type BaseAmarre =
  | { tipo: "inicio_enero" }
  | { tipo: "cierre_diciembre"; balanceId: number; descripcion: string };

export type SaldoCierreDiciembre = { cuenta8: string; nombreCuenta: string; cuenta6Russell: string | null; saldoFinal: number };

/**
 * Regla 2: el saldo inicial de cada cuenta pasa a ser su saldo final al 31 de diciembre (0 si no
 * existía), así el movimiento del año = saldo final del corte − saldo final de diciembre. Los débitos
 * y créditos del balance del corte no son del año: van en 0 y no se comparan. Las cuentas que solo
 * están en diciembre (se saldaron o se cerraron en el año) entran con saldo final 0.
 */
export function cuentasConBaseDiciembre(balance: readonly CuentaBalanceAmarre[], diciembre: readonly SaldoCierreDiciembre[]): CuentaBalanceAmarre[] {
  const digitos = (c: string) => c.replace(/\D/g, "");
  const cierre = new Map<string, SaldoCierreDiciembre>();
  for (const d of diciembre) {
    const previo = cierre.get(digitos(d.cuenta8));
    cierre.set(digitos(d.cuenta8), previo ? { ...previo, saldoFinal: previo.saldoFinal + d.saldoFinal } : { ...d });
  }
  const delCorte = new Set(balance.map((b) => digitos(b.cuenta8)));
  const cuentas: CuentaBalanceAmarre[] = balance.map((b) => ({
    ...b, saldoInicial: cierre.get(digitos(b.cuenta8))?.saldoFinal ?? 0, debitos: 0, creditos: 0,
  }));
  for (const [codigo, d] of cierre) {
    if (delCorte.has(codigo) || d.saldoFinal === 0) continue;
    cuentas.push({ cuenta8: d.cuenta8, nombreCuenta: d.nombreCuenta, cuenta6Russell: d.cuenta6Russell, coincidencia: null, saldoInicial: d.saldoFinal, debitos: 0, creditos: 0, saldoFinal: 0 });
  }
  return cuentas;
}

export type DescuadreMovimientos = {
  cuenta8: string;
  nombreCuenta: string;
  /** Movimiento neto del balance: saldo final − saldo inicial (débitos − créditos). */
  movimientoBalance: number;
  /** Σ débitos − Σ créditos del archivo. */
  movimientoArchivo: number;
  diferencia: number;
  debitosBalance: number;
  debitosArchivo: number;
  creditosBalance: number;
  creditosArchivo: number;
  /** Cuenta que usa el cruce de impuestos: su descuadre impide guardar. Las demás son informativas. */
  bloquea: boolean;
};

export type ResultadoAmarre = {
  filas: FilaCapturaTercero[];
  descuadres: DescuadreMovimientos[];
  /** Cuentas del archivo (de los grupos que se guardan) que no existen en el balance. */
  sinCuentaEnBalance: { cuenta: string; movimiento: number; bloquea: boolean }[];
  cuentasAmarradas: number;
  /** Descuadres (o cuentas sin balance) en cuentas de impuestos: si hay alguno no se guarda nada. */
  bloqueantes: number;
  terceros: number;
};

/**
 * ¿La cuenta la usa el cruce de impuestos (Retención, IVA o RST)? Por su homologación Russell (los
 * prefijos que el cruce lee por tercero: 2365, 2367, 2408, 135517, 135595, 249505) o, sin ella, por
 * la cuenta del cliente (2365, 2367, 2408). Solo estas impiden guardar si no amarran.
 */
export function esCuentaDeImpuestos(cuentaCliente: string, cuenta6Russell: string | null): boolean {
  const russell = (cuenta6Russell ?? "").replace(/\D/g, "");
  const cliente = cuentaCliente.replace(/\D/g, "");
  return IMPUESTOS.some((i) =>
    (russell !== "" && i.cruce.prefijosTercero.some((p) => russell.startsWith(p)))
    || i.cruce.prefijosCliente.some((p) => cliente.startsWith(p))
    || (russell === "" && i.cruce.prefijosTercero.some((p) => cliente.startsWith(p))));
}

/**
 * Cuenta del balance a la que pertenece una del archivo: la misma o, si el balance llega a menos
 * dígitos, la más larga del balance que sea su prefijo (el ERP puede detallar más que el balance).
 */
export function cuentaDelBalance(cuenta: string, cuentasBalance: readonly string[]): string | null {
  let mejor: string | null = null;
  for (const c of cuentasBalance) {
    if (cuenta === c) return c;
    if (cuenta.startsWith(c) && c.length >= 4 && (!mejor || c.length > mejor.length)) mejor = c;
  }
  return mejor;
}

/**
 * Liga el agregado con el balance (cuenta, nombre y homologación de la cuenta del balance) y
 * comprueba el amarre: por cada cuenta de los grupos que se guardan, el movimiento neto del archivo
 * debe igualar el del balance dentro de `tolerancia`. Una cuenta del balance con movimiento que no
 * está en el archivo también descuadra. Solo bloquean las cuentas de impuestos (`esCuentaDeImpuestos`);
 * las demás se informan y sus terceros se guardan.
 */
export function amarrarConBalance(agregado: AgregadoMovimientos, balance: readonly CuentaBalanceAmarre[], tolerancia: number): ResultadoAmarre {
  const delBalance = balance.filter((b) => conservaDetalleTercero(b.cuenta8.replace(/\D/g, "")));
  const porCodigo = new Map(delBalance.map((b) => [b.cuenta8.replace(/\D/g, ""), b]));
  const codigos = [...porCodigo.keys()];

  // cuenta del balance → clave del tercero → tercero (el archivo puede traer varias cuentas por una del balance).
  const porCuentaBalance = new Map<string, Map<string, TerceroMovimientos>>();
  const sinCuentaEnBalance: ResultadoAmarre["sinCuentaEnBalance"] = [];
  for (const [cuenta, terceros] of agregado.cuentas) {
    const destino = cuentaDelBalance(cuenta, codigos);
    if (!destino) {
      const movimiento = redondear([...terceros.values()].reduce((s, t) => s + t.debitos - t.creditos, 0));
      sinCuentaEnBalance.push({ cuenta, movimiento, bloquea: esCuentaDeImpuestos(cuenta, null) });
      continue;
    }
    const acumulado = porCuentaBalance.get(destino) ?? new Map<string, TerceroMovimientos>();
    porCuentaBalance.set(destino, acumulado);
    for (const [clave, t] of terceros) {
      const previo = acumulado.get(clave);
      if (previo) {
        previo.debitos += t.debitos;
        previo.creditos += t.creditos;
        if (!previo.nombre && t.nombre) previo.nombre = t.nombre;
      } else {
        acumulado.set(clave, { ...t });
      }
    }
  }

  const descuadres: DescuadreMovimientos[] = [];
  const filas: FilaCapturaTercero[] = [];
  let cuentasAmarradas = 0;
  for (const [codigo, b] of [...porCodigo.entries()].sort(([a], [c]) => a.localeCompare(c))) {
    const terceros = [...(porCuentaBalance.get(codigo)?.values() ?? [])];
    const debitosArchivo = redondear(terceros.reduce((s, t) => s + t.debitos, 0));
    const creditosArchivo = redondear(terceros.reduce((s, t) => s + t.creditos, 0));
    const movimientoArchivo = redondear(debitosArchivo - creditosArchivo);
    const movimientoBalance = redondear(b.saldoFinal - b.saldoInicial);
    const diferencia = redondear(movimientoBalance - movimientoArchivo);
    if (terceros.length === 0 && movimientoBalance === 0) continue;
    if (Math.abs(diferencia) > tolerancia) {
      const bloquea = esCuentaDeImpuestos(codigo, b.cuenta6Russell);
      descuadres.push({
        cuenta8: b.cuenta8, nombreCuenta: b.nombreCuenta, movimientoBalance, movimientoArchivo, diferencia,
        debitosBalance: b.debitos, debitosArchivo, creditosBalance: b.creditos, creditosArchivo, bloquea,
      });
      // Fuera de impuestos el descuadre es informativo: sus terceros se guardan igual (ningún cruce los usa).
      if (bloquea) continue;
    } else {
      cuentasAmarradas += 1;
    }
    for (const t of terceros) {
      const debitos = redondear(t.debitos);
      const creditos = redondear(t.creditos);
      if (debitos === 0 && creditos === 0) continue;
      filas.push({
        cuenta2: codigo.slice(0, 2), cuenta4: codigo.slice(0, 4), cuenta6: codigo.slice(0, 6), cuenta8: b.cuenta8,
        nombreCuenta: b.nombreCuenta, cuenta6Russell: b.cuenta6Russell, coincidencia: b.coincidencia,
        nitTercero: t.nit, nombreTercero: t.nombre || null, identidadTercero: t.identidad ?? undefined,
        saldoInicial: 0, debitos, creditos, saldoFinal: redondear(debitos - creditos),
      });
    }
  }
  const sinCuenta = sinCuentaEnBalance.filter((s) => s.movimiento !== 0).sort((a, b) => a.cuenta.localeCompare(b.cuenta));
  return {
    filas,
    // Primero los que bloquean.
    descuadres: [...descuadres.filter((d) => d.bloquea), ...descuadres.filter((d) => !d.bloquea)],
    sinCuentaEnBalance: sinCuenta,
    cuentasAmarradas,
    bloqueantes: descuadres.filter((d) => d.bloquea).length + sinCuenta.filter((x) => x.bloquea).length,
    terceros: filas.length,
  };
}

/**
 * Rehace el agregado desde los terceros ya guardados (sin el archivo): cada renglón cuenta–tercero
 * con sus débitos y créditos. Con él `amarrarConBalance` vuelve a dar las diferencias del amarre, para
 * mostrarlas y exportarlas después de guardar.
 */
export function agregadoDesdeCaptura(filas: readonly { cuenta8: string; nitTercero: string | null; nombreTercero: string | null; debitos: number; creditos: number }[]): AgregadoMovimientos {
  const agregado = nuevoAgregado();
  for (const [i, f] of filas.entries()) {
    const cuenta = f.cuenta8.replace(/\D/g, "");
    const terceros = agregado.cuentas.get(cuenta) ?? new Map<string, TerceroMovimientos>();
    agregado.cuentas.set(cuenta, terceros);
    // Cada renglón guardado ya es un tercero distinto de su cuenta.
    terceros.set(`${f.nitTercero ?? ""}|${f.nombreTercero ?? ""}|${i}`, {
      nit: f.nitTercero, nombre: f.nombreTercero ?? "", identidad: null, debitos: f.debitos, creditos: f.creditos,
    });
    agregado.filasUsadas += 1;
  }
  return agregado;
}

/** ¿El balance sirve para adjuntarle movimientos? Debe empezar el 1 de enero del año de su corte. */
export function balanceAdmiteMovimientos(periodoInicio: Date, periodoFin: Date): boolean {
  return periodoInicio.getUTCMonth() === 0 && periodoInicio.getUTCDate() === 1 && periodoInicio.getUTCFullYear() === periodoFin.getUTCFullYear();
}
