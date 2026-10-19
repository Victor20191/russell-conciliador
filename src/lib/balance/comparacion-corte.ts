// Comparación de SALDOS FINALES entre dos balances del mismo corte (18/Oct/2026) — puro.
//
// Los módulos concilian contra el saldo final, así que dos balances con la misma fecha de corte
// —el mensual y el anual, el por cuenta y el por terceros— tienen que coincidir cuenta a cuenta en
// esa columna. El saldo inicial y los movimientos NO se comparan: un balance anual y uno mensual
// los traen distintos por definición.
//
// Reglas (las mismas a centavos del control anterior entre aperturas):
//  - La llave es el código completo de la cuenta del cliente (`cuenta8`); las filas repetidas se suman.
//  - Una cuenta ausente en un balance vale 0: si el otro la trae en 0, coincide.
//  - Se guardan TODAS las diferencias a centavos. Solo las que alcanzan el umbral «Diferencia entre
//    balances del mismo corte» (`corte_saldo_final` de /config/parametros, inclusive) vuelven
//    inconsistente el par; las menores se muestran pero no impiden cerrar. El umbral se aplica al
//    LEER (`resumenDiferenciasCorte`), como los demás parámetros de alertas: cambiarlo rige de
//    inmediato sin recalcular las comparaciones guardadas.
import { z } from "zod";
import { redondearMonto } from "./montos-cruce";

export type FilaSaldoFinal = { cuenta8: string; nombreCuenta: string; saldoFinal: number };

export type EstadoDiferenciaCorte = "descuadre" | "solo_a" | "solo_b";

export type DiferenciaCorte = {
  cuenta8: string;
  nombre: string;
  saldoA: number;
  saldoB: number;
  /** A − B. */
  diferencia: number;
  estado: EstadoDiferenciaCorte;
};

export type ResultadoComparacionCorte = {
  coincide: boolean;
  cuentasComparadas: number;
  diferencias: DiferenciaCorte[];
};

/** Suma por cuenta (redondeada a centavos), con el primer nombre que aparezca. */
export function agregarSaldosFinales(filas: readonly FilaSaldoFinal[]): Map<string, { nombre: string; saldoFinal: number }> {
  const porCuenta = new Map<string, { nombre: string; saldoFinal: number }>();
  for (const f of filas) {
    const previo = porCuenta.get(f.cuenta8);
    if (previo) previo.saldoFinal = redondearMonto(previo.saldoFinal + Number(f.saldoFinal));
    else porCuenta.set(f.cuenta8, { nombre: f.nombreCuenta, saldoFinal: redondearMonto(Number(f.saldoFinal)) });
  }
  return porCuenta;
}

export function compararSaldosFinales(filasA: readonly FilaSaldoFinal[], filasB: readonly FilaSaldoFinal[]): ResultadoComparacionCorte {
  const a = agregarSaldosFinales(filasA);
  const b = agregarSaldosFinales(filasB);
  const cuentas = [...new Set([...a.keys(), ...b.keys()])].sort();
  const diferencias: DiferenciaCorte[] = [];
  for (const cuenta8 of cuentas) {
    const ladoA = a.get(cuenta8);
    const ladoB = b.get(cuenta8);
    const saldoA = ladoA?.saldoFinal ?? 0;
    const saldoB = ladoB?.saldoFinal ?? 0;
    const diferencia = redondearMonto(saldoA - saldoB);
    if (diferencia === 0) continue;
    diferencias.push({
      cuenta8,
      nombre: ladoA?.nombre ?? ladoB?.nombre ?? cuenta8,
      saldoA,
      saldoB,
      diferencia,
      estado: !ladoB ? "solo_a" : !ladoA ? "solo_b" : "descuadre",
    });
  }
  return { coincide: diferencias.length === 0, cuentasComparadas: cuentas.length, diferencias };
}

/**
 * ¿Esta diferencia vuelve inconsistentes los dos balances? Desde el umbral, INCLUSIVE (la misma
 * regla de los demás umbrales). Con el umbral en cero, cualquier diferencia de un centavo cuenta.
 */
export function esDiferenciaMaterialCorte(diferencia: number, umbral: number): boolean {
  const monto = Math.abs(redondearMonto(diferencia));
  return monto > 0 && monto >= umbral;
}

export type ResumenDiferenciasCorte = {
  /** Alguna cuenta difiere desde el umbral: el par es inconsistente e impide cerrar. */
  inconsistente: boolean;
  /** Cuentas que difieren desde el umbral. */
  materiales: number;
  /** Cuentas que difieren por debajo del umbral: se muestran, no bloquean. */
  menores: number;
};

export function resumenDiferenciasCorte(diferencias: readonly Pick<DiferenciaCorte, "diferencia">[], umbral: number): ResumenDiferenciasCorte {
  const materiales = diferencias.filter((d) => esDiferenciaMaterialCorte(d.diferencia, umbral)).length;
  return { inconsistente: materiales > 0, materiales, menores: diferencias.length - materiales };
}

/** Lo que se guarda en `balance_comparacion_corte.resultado`: solo las cuentas con diferencia. */
export const REVISION_COMPARACION_CORTE = 1;

const DiferenciaSchema = z.object({
  cuenta8: z.string(),
  nombre: z.string(),
  saldoA: z.number().finite(),
  saldoB: z.number().finite(),
  diferencia: z.number().finite(),
  estado: z.enum(["descuadre", "solo_a", "solo_b"]),
});

export const SnapshotComparacionCorteSchema = z.object({
  revision: z.literal(REVISION_COMPARACION_CORTE),
  precision: z.literal(0.01),
  cuentasComparadas: z.number().int().nonnegative(),
  diferencias: z.array(DiferenciaSchema),
});

export type SnapshotComparacionCorte = z.infer<typeof SnapshotComparacionCorteSchema>;

export function snapshotComparacion(resultado: ResultadoComparacionCorte): SnapshotComparacionCorte {
  return { revision: REVISION_COMPARACION_CORTE, precision: 0.01, cuentasComparadas: resultado.cuentasComparadas, diferencias: resultado.diferencias };
}

/** Diferencias vistas desde el balance `desde`: A/B se reordenan para que «este» quede primero. */
export function diferenciasDesde(diferencias: readonly DiferenciaCorte[], desdeEsA: boolean): DiferenciaCorte[] {
  if (desdeEsA) return [...diferencias];
  return diferencias.map((d) => ({
    ...d,
    saldoA: d.saldoB,
    saldoB: d.saldoA,
    diferencia: redondearMonto(-d.diferencia),
    estado: d.estado === "solo_a" ? "solo_b" : d.estado === "solo_b" ? "solo_a" : d.estado,
  }));
}
