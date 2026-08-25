// Agregación PURA (sin BD) de aportes YA resueltos a un NIT canónico (o `null`), por
// NIT. La comparten el lado contable (balance por tercero, `nitTercero` ya canónico
// en `balance_tercero_detalle`) y el lado módulo (auxiliar CAR/CXP, NIT extraído con
// `normalizarTerceroModulo`) del cruce por tercero (`cruce-tercero.ts`): cada llamador
// resuelve su NIT con su propia fuente y le pasa a este helper una lista uniforme para
// sumar por NIT y separar aparte los ítems sin NIT (`sinNit`), que quedan fuera del
// cruce por no tener con qué emparejar.

import type { AporteTercero } from "./cruce-tercero";

export type ItemConNit = { nit: string | null; nombre: string | null; saldo: number };

export type ResultadoAgregarPorNit = {
  /** Un aporte por NIT único, con el saldo sumado y un nombre representativo. */
  aportes: AporteTercero[];
  /** Total y conteo de ítems sin NIT identificado; `null` si no hubo ninguno. */
  sinNit: { total: number; filas: number } | null;
};

/**
 * Suma `saldo` por `nit`. Si el mismo NIT aparece en varios ítems, sus saldos se
 * ACUMULAN (no se reemplazan). El `nombre` que se conserva por NIT es el del PRIMER
 * ítem que traiga uno no vacío (orden de `items`). Los ítems con `nit: null` no
 * participan en la agregación: se acumulan aparte en `sinNit`.
 */
export function agregarPorNit(items: readonly ItemConNit[]): ResultadoAgregarPorNit {
  const saldos = new Map<string, number>();
  const nombres = new Map<string, string>();
  let sinNitTotal = 0;
  let sinNitFilas = 0;

  for (const item of items) {
    if (!item.nit) {
      sinNitTotal += item.saldo;
      sinNitFilas += 1;
      continue;
    }
    saldos.set(item.nit, (saldos.get(item.nit) ?? 0) + item.saldo);
    if (item.nombre && !nombres.has(item.nit)) nombres.set(item.nit, item.nombre);
  }

  const aportes: AporteTercero[] = [...saldos.entries()].map(([nit, saldo]) => ({
    nit,
    nombre: nombres.get(nit) ?? null,
    saldo,
  }));

  return {
    aportes,
    sinNit: sinNitFilas > 0 ? { total: sinNitTotal, filas: sinNitFilas } : null,
  };
}
