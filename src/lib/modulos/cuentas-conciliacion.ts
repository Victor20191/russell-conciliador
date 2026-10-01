// Cuentas Russell de SEIS dígitos que concilia cada módulo con cédula a ese nivel (Ingresos,
// Cartera, Cuentas por pagar, Nómina). Hasta el 27/Sep/2026 vivían fijas en el descriptor
// (`crucePorTercero.cuentasRussell6`, `cedula.cuentas6`, `cedula.cuentasAdicionales`,
// `cuentasNacional`/`cuentasExterior`); ahora se administran en /config/prevalidador y el
// descriptor conserva esos valores solo como FÁBRICA (siembra y cierres anteriores al cambio).
// Inventarios y Activos fijos (cédula a 4) tienen su lista de subgrupos al final del archivo.
//
// CATEGORÍA (1/Oct/2026, solo Nómina): una cuenta `concilia` forma la cédula; una `visible` se
// muestra al final del cruce, colapsada, con su saldo y lo que el módulo le asigna, sin sumar a los
// totales, sin marcas y sin pesar en el cierre (`cedula.cuentasVisibles` del descriptor).
//
// Puro (sin BD ni `server-only`): la resolución contra la BD vive en
// `src/lib/parametros/cuentas-conciliacion.ts`.

import { normalizarPrefijo, PREVALIDADOR_CATALOGO_FABRICA } from "@/lib/balance/prevalidador/catalogo";
import { nivelCruceModulo, type DescriptorModulo } from "./descriptores";
import { filtrarSubgruposPorModulo } from "./cuentas-modulo";

export type OrigenCuentaConciliacion = "nacional" | "exterior";

/** `concilia`: forma la cédula. `visible`: se ve al final del cruce, sin conciliarse. */
export type CategoriaCuentaConciliacion = "concilia" | "visible";

export type CuentaConciliacion = {
  /** Cuenta Russell de 6 dígitos. */
  cuenta: string;
  /** Cartera y CxP: la cuenta decide el origen del saldo del tercero. `null` = no lo decide. */
  origen: OrigenCuentaConciliacion | null;
  categoria: CategoriaCuentaConciliacion;
};

export function esOrigenCuentaConciliacion(v: unknown): v is OrigenCuentaConciliacion {
  return v === "nacional" || v === "exterior";
}

export function esCategoriaCuentaConciliacion(v: unknown): v is CategoriaCuentaConciliacion {
  return v === "concilia" || v === "visible";
}

/** ¿El módulo distingue cuentas que concilian de cuentas solo visibles? (Nómina, por ahora). */
export function moduloConCategoria(descriptor: Pick<DescriptorModulo, "nomina"> | null | undefined): boolean {
  return descriptor?.nomina != null;
}

/** Una cuenta Russell de 6 dígitos (sin puntos ni espacios), o `null` si no lo es. */
export function normalizarCuentaConciliacion(v: string | null | undefined): string | null {
  const c = normalizarPrefijo(v);
  return /^\d{6}$/.test(c) ? c : null;
}

/** ¿El módulo concilia contra una lista de cuentas de 6 dígitos? (cédula a 6). */
export function moduloConCuentasConciliacion(descriptor: Pick<DescriptorModulo, "nivelCruce"> | null | undefined): boolean {
  return descriptor != null && nivelCruceModulo(descriptor) === 6;
}

/** ¿Sus cuentas deciden el origen nacional/exterior del saldo? (Cartera y CxP). */
export function moduloConOrigenPorCuenta(descriptor: Pick<DescriptorModulo, "crucePorTercero"> | null | undefined): boolean {
  return descriptor?.crucePorTercero.detalleTercero === true;
}

/**
 * Las cuentas que concilia el descriptor: la lista de la cédula (o la del cruce por tercero) más
 * las adicionales, con el origen de Cartera y CxP, y al final las solo visibles. Sobre el
 * descriptor estático son los valores de FÁBRICA; sobre uno ya resuelto, los vigentes (lo que se
 * congela en el cierre). `null` si el módulo no concilia a 6 dígitos.
 */
export function cuentasConciliacionDe(descriptor: DescriptorModulo | null | undefined): CuentaConciliacion[] | null {
  if (!descriptor || !moduloConCuentasConciliacion(descriptor)) return null;
  const cpt = descriptor.crucePorTercero;
  const lista = descriptor.cedula?.cuentas6 ?? cpt.cuentasRussell6 ?? [];
  const adicionales = (descriptor.cedula?.cuentasAdicionales ?? []).map((a) => a.cuenta);
  const nacional = new Set(cpt.cuentasNacional ?? []);
  const exterior = new Set(cpt.cuentasExterior ?? []);
  const vistos = new Set<string>();
  const salida: CuentaConciliacion[] = [];
  for (const bruta of [...lista, ...adicionales]) {
    const cuenta = normalizarCuentaConciliacion(bruta);
    if (!cuenta || vistos.has(cuenta)) continue;
    vistos.add(cuenta);
    salida.push({ cuenta, origen: exterior.has(cuenta) ? "exterior" : nacional.has(cuenta) ? "nacional" : null, categoria: "concilia" });
  }
  for (const bruta of descriptor.cedula?.cuentasVisibles ?? []) {
    const cuenta = normalizarCuentaConciliacion(bruta);
    if (!cuenta || vistos.has(cuenta)) continue;
    vistos.add(cuenta);
    salida.push({ cuenta, origen: null, categoria: "visible" });
  }
  return salida;
}

/**
 * El descriptor con las cuentas configuradas en lugar de las de fábrica. La lista completa va a
 * `cedula.cuentas6` (la cédula separa sola las que quedan fuera de los prefijos del prevalidador:
 * `cedulaModulo`) y, donde el descriptor ya acotaba el cruce por tercero, también a
 * `crucePorTercero.cuentasRussell6`. En Cartera y CxP el origen de cada cuenta reemplaza
 * `cuentasNacional`/`cuentasExterior`. Las solo visibles (módulos con categoría) van aparte, a
 * `cedula.cuentasVisibles`: no acotan ni amplían lo que se concilia. En un módulo sin categoría
 * todas concilian. Un módulo a 4 dígitos o `cuentas` null quedan intactos.
 */
export function aplicarCuentasConciliacion(
  descriptor: DescriptorModulo,
  cuentas: readonly CuentaConciliacion[] | null | undefined,
): DescriptorModulo {
  if (!cuentas || !moduloConCuentasConciliacion(descriptor)) return descriptor;
  const limpias = (filas: readonly CuentaConciliacion[]) =>
    [...new Set(filas.map((c) => normalizarCuentaConciliacion(c.cuenta)).filter((c): c is string => c != null))];
  const conCategoria = moduloConCategoria(descriptor);
  const lista = limpias(conCategoria ? cuentas.filter((c) => c.categoria !== "visible") : cuentas);
  const enLista = new Set(lista);
  const visibles = conCategoria ? limpias(cuentas.filter((c) => c.categoria === "visible")).filter((c) => !enLista.has(c)) : [];
  const cpt = descriptor.crucePorTercero;
  const conOrigen = moduloConOrigenPorCuenta(descriptor);
  return {
    ...descriptor,
    cedula: { ...descriptor.cedula, cuentas6: lista, cuentasAdicionales: undefined, cuentasVisibles: visibles.length > 0 ? visibles : undefined },
    crucePorTercero: {
      ...cpt,
      ...(cpt.cuentasRussell6 !== undefined ? { cuentasRussell6: lista } : {}),
      ...(conOrigen
        ? {
            cuentasNacional: cuentas.filter((c) => c.origen === "nacional").map((c) => c.cuenta),
            cuentasExterior: cuentas.filter((c) => c.origen === "exterior").map((c) => c.cuenta),
          }
        : {}),
    },
  };
}

/**
 * Lee la copia guardada en el cierre (`cuentas_conciliacion`); `null` si no hay una válida. Las
 * copias anteriores al 1/Oct/2026 no traen categoría: entonces todas conciliaban.
 */
export function leerCuentasConciliacionGuardadas(valor: unknown): CuentaConciliacion[] | null {
  if (!Array.isArray(valor)) return null;
  const salida: CuentaConciliacion[] = [];
  for (const item of valor) {
    if (!item || typeof item !== "object") return null;
    const { cuenta, origen, categoria } = item as { cuenta?: unknown; origen?: unknown; categoria?: unknown };
    const c = typeof cuenta === "string" ? normalizarCuentaConciliacion(cuenta) : null;
    if (!c) return null;
    salida.push({ cuenta: c, origen: esOrigenCuentaConciliacion(origen) ? origen : null, categoria: categoria === "visible" ? "visible" : "concilia" });
  }
  return salida;
}

// ===== Subgrupos de CUATRO dígitos (Inventarios, Activos fijos) =====
// Desde el 29/Sep/2026 las cédulas a 4 también tienen lista propia (`subgrupos_conciliacion_modulo`):
// las cuentas PROPIAS del módulo, que deciden qué entra al cruce contable. Las reglas del prevalidador
// quedan solo para validar el balance; cambiarlas no cambia esta lista. Los subgrupos abiertos (la
// 1592 de Activos fijos) son fijos en código: siempre concilian y no se administran aquí.

/** ¿El módulo concilia contra una lista de subgrupos de 4 dígitos? (cédula a 4). */
export function moduloConSubgruposConciliacion(descriptor: Pick<DescriptorModulo, "nivelCruce"> | null | undefined): boolean {
  return descriptor != null && nivelCruceModulo(descriptor) === 4;
}

/** Un subgrupo Russell de 4 dígitos (sin puntos ni espacios), o `null` si no lo es. */
export function normalizarSubgrupoConciliacion(v: string | null | undefined): string | null {
  const c = normalizarPrefijo(v);
  return /^\d{4}$/.test(c) ? c : null;
}

/** Subgrupos fijos en código (abiertos a 6 dígitos): siempre concilian y no se agregan ni se quitan. */
export function subgruposFijosDe(descriptor: Pick<DescriptorModulo, "cedula"> | null | undefined): string[] {
  return [...new Set((descriptor?.cedula?.subgruposAbiertos ?? []).map((s) => normalizarPrefijo(s.subgrupo)))].sort();
}

/** Lista limpia: subgrupos de 4 dígitos válidos, sin repetir y en orden. */
function listaSubgrupos(valores: readonly (string | null | undefined)[]): string[] {
  return [...new Set(valores.map((v) => normalizarSubgrupoConciliacion(v)).filter((c): c is string => c != null))].sort();
}

/**
 * Subgrupos de FÁBRICA del módulo: los del plan bajo sus prefijos de fábrica del prevalidador
 * (constantes del código, nunca el catálogo vivo), sin los fijos. Es el respaldo cuando el módulo no
 * tiene filas en la configuración o un cierre no se puede leer. `null` si el módulo no concilia a 4.
 */
export function subgruposConciliacionDeFabrica(
  descriptor: DescriptorModulo | null | undefined,
  plan: readonly { codigo: string; nombre?: string }[],
): string[] | null {
  if (!descriptor || !moduloConSubgruposConciliacion(descriptor)) return null;
  const prefijos = PREVALIDADOR_CATALOGO_FABRICA
    .filter((f) => f.moduloCodigo === descriptor.codigo)
    .map((f) => normalizarPrefijo(f.cuentaRussell));
  const fijos = new Set(subgruposFijosDe(descriptor));
  const plan4 = plan.map((s) => ({ codigo: s.codigo, nombre: s.nombre ?? "" }));
  return listaSubgrupos(filtrarSubgruposPorModulo(plan4, prefijos).map((s) => s.codigo)).filter((c) => !fijos.has(c));
}

/**
 * Los subgrupos que concilia el descriptor, sin los fijos. Sobre uno ya resuelto son los vigentes
 * (lo que se congela en el cierre); sobre el estático, `null`: sin lista, la cédula toma los prefijos.
 */
export function subgruposConciliacionDe(descriptor: DescriptorModulo | null | undefined): string[] | null {
  if (!descriptor || !moduloConSubgruposConciliacion(descriptor)) return null;
  const lista = descriptor.cedula?.subgrupos4;
  if (!lista) return null;
  const fijos = new Set(subgruposFijosDe(descriptor));
  return listaSubgrupos(lista).filter((c) => !fijos.has(c));
}

/**
 * El descriptor con los subgrupos configurados en `cedula.subgrupos4` (la cédula suma sola los fijos y
 * separa los que quedan fuera de los prefijos: `cedulaModulo`). Un módulo a 6 dígitos o `subgrupos`
 * null quedan intactos.
 */
export function aplicarSubgruposConciliacion(
  descriptor: DescriptorModulo,
  subgrupos: readonly string[] | null | undefined,
): DescriptorModulo {
  if (!subgrupos || !moduloConSubgruposConciliacion(descriptor)) return descriptor;
  return { ...descriptor, cedula: { ...descriptor.cedula, subgrupos4: listaSubgrupos(subgrupos) } };
}

/** Lee la copia guardada en el cierre (`subgrupos_conciliacion`); `null` si no hay una válida. */
export function leerSubgruposConciliacionGuardados(valor: unknown): string[] | null {
  if (!Array.isArray(valor)) return null;
  const salida: string[] = [];
  for (const item of valor) {
    const c = typeof item === "string" ? normalizarSubgrupoConciliacion(item) : null;
    if (!c) return null;
    salida.push(c);
  }
  return listaSubgrupos(salida);
}

/**
 * Cierres anteriores a la lista (sin `subgrupos_conciliacion`): los subgrupos que quedaron en firme en
 * ese cierre (`cuentas_russell`, las cuentas de 4 del cruce que se cerró). `null` si no se pueden leer.
 */
export function subgruposDeCuentasRussellCierre(valor: unknown): string[] | null {
  if (!Array.isArray(valor)) return null;
  const lista = listaSubgrupos(valor.map((v) => (typeof v === "string" ? normalizarPrefijo(v).slice(0, 4) : null)));
  return lista.length > 0 ? lista : null;
}
