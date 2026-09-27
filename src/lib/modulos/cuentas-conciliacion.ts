// Cuentas Russell de SEIS dígitos que concilia cada módulo con cédula a ese nivel (Ingresos,
// Cartera, Cuentas por pagar, Nómina). Hasta el 27/Sep/2026 vivían fijas en el descriptor
// (`crucePorTercero.cuentasRussell6`, `cedula.cuentas6`, `cedula.cuentasAdicionales`,
// `cuentasNacional`/`cuentasExterior`); ahora se administran en /config/prevalidador y el
// descriptor conserva esos valores solo como FÁBRICA (siembra y cierres anteriores al cambio).
//
// Puro (sin BD ni `server-only`): la resolución contra la BD vive en
// `src/lib/parametros/cuentas-conciliacion.ts`.

import { normalizarPrefijo } from "@/lib/balance/prevalidador/catalogo";
import { nivelCruceModulo, type DescriptorModulo } from "./descriptores";

export type OrigenCuentaConciliacion = "nacional" | "exterior";

export type CuentaConciliacion = {
  /** Cuenta Russell de 6 dígitos. */
  cuenta: string;
  /** Cartera y CxP: la cuenta decide el origen del saldo del tercero. `null` = no lo decide. */
  origen: OrigenCuentaConciliacion | null;
};

export function esOrigenCuentaConciliacion(v: unknown): v is OrigenCuentaConciliacion {
  return v === "nacional" || v === "exterior";
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
 * las adicionales, con el origen de Cartera y CxP. Sobre el descriptor estático son los valores de
 * FÁBRICA; sobre uno ya resuelto, los vigentes (lo que se congela en el cierre). `null` si el
 * módulo no concilia a 6 dígitos.
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
    salida.push({ cuenta, origen: exterior.has(cuenta) ? "exterior" : nacional.has(cuenta) ? "nacional" : null });
  }
  return salida;
}

/**
 * El descriptor con las cuentas configuradas en lugar de las de fábrica. La lista completa va a
 * `cedula.cuentas6` (la cédula separa sola las que quedan fuera de los prefijos del prevalidador:
 * `cedulaModulo`) y, donde el descriptor ya acotaba el cruce por tercero, también a
 * `crucePorTercero.cuentasRussell6`. En Cartera y CxP el origen de cada cuenta reemplaza
 * `cuentasNacional`/`cuentasExterior`. Un módulo a 4 dígitos o `cuentas` null quedan intactos.
 */
export function aplicarCuentasConciliacion(
  descriptor: DescriptorModulo,
  cuentas: readonly CuentaConciliacion[] | null | undefined,
): DescriptorModulo {
  if (!cuentas || !moduloConCuentasConciliacion(descriptor)) return descriptor;
  const lista = [...new Set(cuentas.map((c) => normalizarCuentaConciliacion(c.cuenta)).filter((c): c is string => c != null))];
  const cpt = descriptor.crucePorTercero;
  const conOrigen = moduloConOrigenPorCuenta(descriptor);
  return {
    ...descriptor,
    cedula: { ...descriptor.cedula, cuentas6: lista, cuentasAdicionales: undefined },
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

/** Lee la copia guardada en el cierre (`cuentas_conciliacion`); `null` si no hay una válida. */
export function leerCuentasConciliacionGuardadas(valor: unknown): CuentaConciliacion[] | null {
  if (!Array.isArray(valor)) return null;
  const salida: CuentaConciliacion[] = [];
  for (const item of valor) {
    if (!item || typeof item !== "object") return null;
    const { cuenta, origen } = item as { cuenta?: unknown; origen?: unknown };
    const c = typeof cuenta === "string" ? normalizarCuentaConciliacion(cuenta) : null;
    if (!c) return null;
    salida.push({ cuenta: c, origen: esOrigenCuentaConciliacion(origen) ? origen : null });
  }
  return salida;
}
