// Cuentas estándar Russell (nivel 4) asociadas a un módulo de conciliación.
// La fuente de verdad del vínculo módulo → prefijo es el catálogo del
// prevalidador (`prevalidador_cuentas` / fábrica). El consolidado del módulo
// solo ofrece las cuentas de 4 dígitos cuyo código cae bajo esos prefijos.

import {
  normalizarPrefijo,
  PREVALIDADOR_CATALOGO_FABRICA,
} from "@/lib/balance/prevalidador/catalogo";

export type PrefijoModulo = { moduloCodigo: string; cuentaRussell: string; activa?: boolean };
export type SubgrupoOpcion = { codigo: string; nombre: string };

/**
 * Prefijos Russell (2 o 4 dígitos) del módulo. Si el catálogo vivo no trae filas
 * para ese módulo, cae al catálogo de fábrica (mismo criterio del prevalidador).
 */
export function prefijosCuentaModulo(
  moduloCodigo: string,
  catalogo: readonly PrefijoModulo[],
): string[] {
  const codigo = (moduloCodigo ?? "").trim().toUpperCase();
  if (!codigo) return [];

  const vivos = catalogo
    .filter((f) => f.moduloCodigo === codigo && f.activa !== false)
    .map((f) => normalizarPrefijo(f.cuentaRussell))
    .filter((p) => p.length === 2 || p.length === 4);

  const fuente = vivos.length > 0
    ? vivos
    : PREVALIDADOR_CATALOGO_FABRICA
        .filter((f) => f.moduloCodigo === codigo)
        .map((f) => normalizarPrefijo(f.cuentaRussell));

  return [...new Set(fuente)].sort();
}

/** ¿La cuenta de 4 dígitos pertenece a alguno de los prefijos del módulo? */
export function cuenta4DelModulo(cuenta4: string, prefijos: readonly string[]): boolean {
  const codigo = normalizarPrefijo(cuenta4).slice(0, 4);
  if (codigo.length !== 4 || prefijos.length === 0) return false;
  return prefijos.some((prefijo) => {
    const p = normalizarPrefijo(prefijo);
    if (!p) return false;
    // Prefijo de grupo (2): todas las cuentas 14xx. Prefijo exacto (4): solo esa.
    return codigo === p || codigo.startsWith(p);
  });
}

/** Filtra el catálogo de subgrupos estándar a las cuentas del módulo. */
export function filtrarSubgruposPorModulo<T extends SubgrupoOpcion>(
  subgrupos: readonly T[],
  prefijos: readonly string[],
): T[] {
  if (prefijos.length === 0) return [];
  return subgrupos.filter((s) => cuenta4DelModulo(s.codigo, prefijos));
}

// ===== Cédula contable a 6 dígitos (`nivelCruce: 6` del descriptor) =====
// Nómina cruza contra la cuenta Russell completa (510506 «Sueldos» y 510530 «Cesantías» son
// renglones distintos, RF-NOM-05). Los módulos a 4 dígitos siguen llaveando por el subgrupo;
// estas funciones deciden la clave de cada fila del balance y qué cuentas ofrece el módulo
// para homologar, según el nivel.

export type NivelCruce = 4 | 6;

/**
 * Clave de la cédula contable de una fila del balance homologada a `cuenta6Russell`: el
 * subgrupo (4) o la cuenta completa (6). `null` si la homologación no alcanza ese nivel (una
 * fila homologada a un subgrupo de 4 dígitos no puede entrar a una cédula de 6).
 */
export function claveCruceContable(cuenta6Russell: string | null | undefined, nivel: NivelCruce): string | null {
  const digitos = normalizarPrefijo(cuenta6Russell);
  if (digitos.length < nivel) return null;
  return digitos.slice(0, nivel);
}

/**
 * ¿La cuenta Russell (del nivel del cruce) pertenece al módulo? A 4 dígitos manda el prefijo
 * del prevalidador; a 6, además, la lista explícita de cuentas del descriptor
 * (`crucePorTercero.cuentasRussell6`) cuando la hay: Nómina concilia 510506 pero no 510548.
 */
export function cuentaDelModulo(
  cuenta: string,
  nivel: NivelCruce,
  prefijos: readonly string[],
  cuentasRussell6?: readonly string[] | null,
): boolean {
  const codigo = normalizarPrefijo(cuenta);
  if (codigo.length !== nivel) return false;
  if (!cuenta4DelModulo(codigo.slice(0, 4), prefijos)) return false;
  if (nivel === 6 && cuentasRussell6?.length) return cuentasRussell6.includes(codigo);
  return true;
}

/**
 * Cuentas estándar de 6 dígitos que el módulo ofrece para homologar (el datalist del
 * consolidado y la validación de la Server Action), en el orden del plan.
 */
export function filtrarCuentasEstandarPorModulo<T extends SubgrupoOpcion>(
  cuentas: readonly T[],
  prefijos: readonly string[],
  cuentasRussell6?: readonly string[] | null,
): T[] {
  return cuentas.filter((c) => cuentaDelModulo(c.codigo, 6, prefijos, cuentasRussell6));
}
