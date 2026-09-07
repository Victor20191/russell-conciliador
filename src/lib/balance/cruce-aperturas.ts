import { esFilaPropiaDeCuenta, filasEfectivasTercero } from "./staging-tercero";
import { diferenciasMontos, MONTOS_CERO, montosCuadran, sumarMontos, type Montos4 } from "./montos-cruce";

export type FilaCuentaCruce = Montos4 & { cuenta8: string; nombreCuenta: string };
export type FilaTerceroCruce = FilaCuentaCruce & { nitTercero: string | null; nombreTercero: string | null };
export type FilaCruceApertura = {
  cuenta8: string;
  nombre: string;
  cuenta: Montos4;
  tercero: Montos4;
  diff: Montos4;
  estado: "cuadra" | "descuadre" | "solo_cuenta" | "solo_tercero";
  sinDesgloseTercero: boolean;
};
export type ResultadoCruceAperturas = {
  filas: FilaCruceApertura[];
  cuadra: boolean;
  totales: { cuenta: Montos4; tercero: Montos4; diff: Montos4 };
};

/** `cuenta8` ya contiene el código imputable COMPLETO, incluso de 10–30 dígitos. */
export function agregarCuentaPorCuenta(filas: readonly FilaCuentaCruce[]): Map<string, FilaCuentaCruce> {
  const cuentas = new Map<string, FilaCuentaCruce>();
  for (const fila of filas) {
    const previa = cuentas.get(fila.cuenta8);
    cuentas.set(fila.cuenta8, {
      cuenta8: fila.cuenta8, nombreCuenta: previa?.nombreCuenta || fila.nombreCuenta,
      ...sumarMontos(previa ?? MONTOS_CERO, fila),
    });
  }
  return cuentas;
}

export function agregarTerceroPorCuenta(filas: readonly FilaTerceroCruce[]): Map<string, FilaCuentaCruce> {
  return agregarCuentaPorCuenta(filasEfectivasTercero(filas));
}

export function construirCruceAperturas(porCuenta: readonly FilaCuentaCruce[], porTercero: readonly FilaTerceroCruce[]): ResultadoCruceAperturas {
  const cuentas = agregarCuentaPorCuenta(porCuenta);
  const terceros = agregarTerceroPorCuenta(porTercero);
  const conDesglose = new Set(porTercero.filter((f) => !esFilaPropiaDeCuenta(f)).map((f) => f.cuenta8));
  let totalCuenta = { ...MONTOS_CERO };
  let totalTercero = { ...MONTOS_CERO };
  const filas: FilaCruceApertura[] = [...new Set([...cuentas.keys(), ...terceros.keys()])].sort().map((cuenta8) => {
    const c = cuentas.get(cuenta8);
    const t = terceros.get(cuenta8);
    const cuenta = sumarMontos(MONTOS_CERO, c ?? MONTOS_CERO);
    const tercero = sumarMontos(MONTOS_CERO, t ?? MONTOS_CERO);
    const diff = diferenciasMontos(cuenta, tercero);
    totalCuenta = sumarMontos(totalCuenta, cuenta);
    totalTercero = sumarMontos(totalTercero, tercero);
    return {
      cuenta8, nombre: c?.nombreCuenta || t?.nombreCuenta || cuenta8, cuenta, tercero, diff,
      // El veredicto lo dan los IMPORTES, no la presencia. Una cuenta que falta en un
      // archivo y en el otro viene TODA en ceros es el mismo hecho económico —no hubo
      // movimiento— y contarla como diferencia inundaba el informe: en el par de IGB
      // (1.348 filas) 765 eran exactamente eso, el 57 %. Si el lado presente trae algún
      // importe, la ausencia sí es una diferencia y se conserva como `solo_*`.
      estado: montosCuadran(diff) ? "cuadra" : !c ? "solo_tercero" : !t ? "solo_cuenta" : "descuadre",
      sinDesgloseTercero: !!t && !conDesglose.has(cuenta8),
    };
  });
  return { filas, cuadra: filas.every((f) => f.estado === "cuadra"), totales: { cuenta: totalCuenta, tercero: totalTercero, diff: diferenciasMontos(totalCuenta, totalTercero) } };
}

/**
 * ¿Esta fila del informe es una diferencia REAL? Único criterio: que algún importe
 * difiera. La ausencia de la cuenta en un archivo no basta —si el otro lado viene en
 * ceros, no hubo movimiento y no hay nada que conciliar.
 *
 * Se exporta porque los informes YA GUARDADOS se calcularon con el criterio anterior y
 * no se recalculan: un par marcado inconsistente es adherente por regla de producto
 * (`revisarCrucesAperturas` lo salta), así que la lectura los depura con este mismo
 * predicado en vez de reescribir la base.
 */
export function esDiferenciaReal(fila: { diff: Montos4 }): boolean {
  return !montosCuadran(fila.diff);
}

export type CandidatoApertura = {
  id: number; clienteId: number; aperturaBalance: string | null; loteId: string | null;
  periodoInicio: Date; periodoFin: Date;
};
export type CapturaApertura = { id: number; clienteId: number; loteId: string | null };
export type ParAperturas = { balanceCuentaId: number; balanceTerceroId: number; terceroId: number };

/** Todos los pares independientes del archivo: una nueva versión no borra los anteriores. */
export function seleccionarParesAperturas(balanceId: number, candidatos: readonly CandidatoApertura[], capturas: readonly CapturaApertura[]): ParAperturas[] {
  const referencia = candidatos.find((b) => b.id === balanceId);
  if (!referencia) return [];
  const capturasPorLote = new Map(capturas.filter((t) => t.loteId && t.clienteId === referencia.clienteId).map((t) => [t.loteId, t.id]));
  const periodo = candidatos.filter((b) => b.clienteId === referencia.clienteId && b.periodoInicio.getTime() === referencia.periodoInicio.getTime() && b.periodoFin.getTime() === referencia.periodoFin.getTime());
  const cuentas = periodo.filter((b) => b.aperturaBalance === "cuenta" && (!b.loteId || !capturasPorLote.has(b.loteId)));
  const terceros = periodo.filter((b) => b.aperturaBalance === "tercero" && b.loteId && capturasPorLote.has(b.loteId));
  return cuentas.flatMap((cuenta) => terceros
    .filter((tercero) => cuenta.id === balanceId || tercero.id === balanceId)
    .map((tercero) => ({ balanceCuentaId: cuenta.id, balanceTerceroId: tercero.id, terceroId: capturasPorLote.get(tercero.loteId!)! })));
}
