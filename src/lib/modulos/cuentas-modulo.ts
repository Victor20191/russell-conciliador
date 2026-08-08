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
