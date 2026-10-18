// Apertura bajo la que se agrupa cada encabezado de un período.
//
// Un cliente puede entregar el mismo período dos veces: el balance POR CUENTA y el
// balance POR TERCEROS. No son versiones sucesivas de un archivo —son dos líneas de
// versiones distintas del mismo corte, que deben coincidir en sus saldos finales
// (`corte.ts` y `comparacion-corte.ts`). Aquí se decide a qué línea pertenece cada
// encabezado.
//
// El punto delicado son los cargues LEGADOS, anteriores al campo `apertura_balance`
// (85 de 118 pares cliente/período tienen alguno). Partir por «apertura distinta» a
// secas convertiría `v1..v6 sin declarar + v7 cuenta` en dos renglones, y el primero
// mostraría datos obsoletos como si fueran un balance vigente. Por eso solo se parte
// cuando hay DOS aperturas DECLARADAS distintas; las legadas se pliegan sobre la única
// declarada del período, que es su misma línea de versiones.
//
// Módulo PURO (sin BD ni `server-only`): lo usa `corte.ts`.
import { parsearApertura, type AperturaBalance } from "./apertura-balance";

/** Encabezado reducido a lo que necesita la agrupación. `clave` identifica el
 *  período dentro de su cliente (el nombre del período NO basta: se repite entre
 *  clientes). */
export type EncabezadoAgrupable = { clave: string; aperturaBalance: string | null };

/** Etiqueta del grupo que reúne los cargues sin apertura declarada. */
export const CLAVE_APERTURA_SIN_DECLARAR = "sin-declarar";

/**
 * Aperturas DECLARADAS presentes en cada grupo. Los cargues sin declarar no suman:
 * no son una apertura, son la ausencia del dato.
 */
export function aperturasDeclaradasPorGrupo(
  encabezados: readonly EncabezadoAgrupable[],
): Map<string, Set<AperturaBalance>> {
  const porGrupo = new Map<string, Set<AperturaBalance>>();
  for (const e of encabezados) {
    let declaradas = porGrupo.get(e.clave);
    if (!declaradas) {
      declaradas = new Set<AperturaBalance>();
      porGrupo.set(e.clave, declaradas);
    }
    const apertura = parsearApertura(e.aperturaBalance);
    if (apertura) declaradas.add(apertura);
  }
  return porGrupo;
}

/**
 * Apertura bajo la que se lista un encabezado dentro de su período.
 *
 *  - Declarada → esa misma.
 *  - Sin declarar y el período tiene UNA sola apertura declarada → se pliega sobre
 *    ella: es un cargue viejo de esa misma línea, no un balance aparte.
 *  - Sin declarar y el período tiene dos (o ninguna) → `null`, su propio grupo. No se
 *    adivina a cuál de las dos pertenece.
 */
export function aperturaDeListado(
  aperturaBalance: string | null,
  declaradas: ReadonlySet<AperturaBalance> | undefined,
): AperturaBalance | null {
  const propia = parsearApertura(aperturaBalance);
  if (propia) return propia;
  if (declaradas && declaradas.size === 1) return [...declaradas][0];
  return null;
}

/**
 * Clave estable del renglón: período + apertura bajo la que se lista. `clavePeriodo` ya
 * trae el cliente adentro, y ni el nombre del período ni la apertura pueden contener
 * `::`, así que la concatenación no colisiona.
 */
export function claveRenglonApertura(clavePeriodo: string, apertura: AperturaBalance | null): string {
  return `${clavePeriodo}::${apertura ?? CLAVE_APERTURA_SIN_DECLARAR}`;
}
