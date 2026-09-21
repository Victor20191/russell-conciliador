// Qué costó la IA en el período del reporte.
//
// El reporte ya dice cuánto se usó la plataforma; esta sección dice cuánto
// costó esa operación en pesos. Tres decisiones la definen:
//
//  1. **Mismo alcance que el resto del reporte.** Se cuenta el consumo que
//     generó el equipo de Russell. Las cuentas de Xentria, que construyen y
//     prueban la plataforma, quedan fuera aquí también (ver `usuarios-reporte`):
//     en el período del 11 al 20 de septiembre eran el 42 % del gasto, así que
//     incluirlas le cobraría al cliente el costo de las pruebas internas.
//  2. **Ningún proveedor ni modelo por su nombre**, igual que en los avances
//     (`texto-avances.ts`): el gasto se agrupa por OPERACIÓN DEL NEGOCIO —leer
//     un balance, homologar cuentas—, que es lo que gerencia reconoce, y un
//     tipo de operación desconocido cae en «Otras operaciones con IA» en vez de
//     imprimir su código interno.
//  3. **El costo en pesos es el que se congeló al momento de cada llamada**
//     (`consumo_ia.costo_cop`, con su TRM), no una reconversión de hoy: el
//     histórico no se mueve cuando cambia la tasa o la tarifa del proveedor.
//
// Módulo PURO: recibe los tres resúmenes ya agregados y arma las variaciones.
import { MESES_LARGOS } from "@/lib/format";
import { variacion, type BaseComparativo, type VariacionUso } from "./comparativo";

/** Gasto de una operación del negocio (varias familias técnicas pueden fundirse en una). */
export type CostoPorOperacion = {
  nombre: string;
  llamadas: number;
  costoCop: number;
  tokens: number;
};

export type ResumenCostoIA = {
  /** Ventana medida, en ISO. */
  desde: string;
  hasta: string;
  /** Llamadas a la IA (una lectura de archivo o un lote de homologación). */
  llamadas: number;
  costoCop: number;
  costoUsd: number;
  /** Suma de los cuatro componentes del consumo (entrada, salida y caché). */
  tokens: number;
  porOperacion: CostoPorOperacion[];
};

export type CostosIA = {
  actual: ResumenCostoIA;
  /** Ventana del reporte anterior; null cuando no hay con qué comparar. */
  previo: ResumenCostoIA | null;
  base: BaseComparativo | null;
  /** Acumulado del mes en el que cierra el período. */
  mes: ResumenCostoIA | null;
  mesEtiqueta: string | null;
  /** Gasto, tokens y llamadas del período actual contra el anterior. */
  variaciones: VariacionUso[];
};

/**
 * Nombre de la operación tal como se le cuenta al cliente. El `tipoOperacion`
 * de la bitácora es técnico y alguno lleva el nombre del proveedor dentro, así
 * que NUNCA se imprime crudo: lo desconocido queda como «Otras operaciones».
 */
const ETIQUETAS_OPERACION: Record<string, string> = {
  extraccion_tabular: "Lectura de balances (Excel o CSV)",
  extraccion_pdf: "Lectura de balances (PDF)",
  mapeo_ia: "Homologación de cuentas",
  mapeo_jev: "Homologación de cuentas",
  diagnostico_ia: "Diagnóstico asistido",
};

export function etiquetaOperacionIA(tipo: string): string {
  return ETIQUETAS_OPERACION[tipo] ?? "Otras operaciones con IA";
}

/** Agrupa el consumo técnico por operación de negocio (dos tipos pueden ser la misma). */
export function agruparPorOperacion(
  filas: readonly { tipo: string; llamadas: number; costoCop: number; tokens: number }[],
): CostoPorOperacion[] {
  const mapa = new Map<string, CostoPorOperacion>();
  for (const fila of filas) {
    const nombre = etiquetaOperacionIA(fila.tipo);
    const acumulado = mapa.get(nombre) ?? { nombre, llamadas: 0, costoCop: 0, tokens: 0 };
    acumulado.llamadas += fila.llamadas;
    acumulado.costoCop += fila.costoCop;
    acumulado.tokens += fila.tokens;
    mapa.set(nombre, acumulado);
  }
  return [...mapa.values()].sort(
    (a, b) => b.costoCop - a.costoCop || a.nombre.localeCompare(b.nombre, "es"),
  );
}

export function resumenCostoVacio(desde: string, hasta: string): ResumenCostoIA {
  return { desde, hasta, llamadas: 0, costoCop: 0, costoUsd: 0, tokens: 0, porOperacion: [] };
}

/** «septiembre de 2026» a partir del cierre del mes acumulado (calendario UTC, como el período). */
export function etiquetaMes(iso: string): string | null {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const fecha = new Date(t);
  // En minúscula: la etiqueta se lee dentro de una frase («acumulado de
  // septiembre de 2026»), y en español el mes no va en mayúscula ahí.
  return `${MESES_LARGOS[fecha.getUTCMonth()].toLocaleLowerCase("es")} de ${fecha.getUTCFullYear()}`;
}

export function construirCostosIA(params: {
  actual: ResumenCostoIA;
  previo?: ResumenCostoIA | null;
  base?: BaseComparativo | null;
  mes?: ResumenCostoIA | null;
}): CostosIA {
  const previo = params.previo ?? null;
  const mes = params.mes ?? null;
  return {
    actual: params.actual,
    previo,
    base: previo ? params.base ?? null : null,
    mes,
    mesEtiqueta: mes ? etiquetaMes(mes.hasta) : null,
    variaciones: previo
      ? [
          variacion("Gasto en IA (pesos)", params.actual.costoCop, previo.costoCop),
          variacion("Tokens consumidos", params.actual.tokens, previo.tokens),
          variacion("Operaciones con IA", params.actual.llamadas, previo.llamadas),
        ]
      : [],
  };
}

/** Sin una sola llamada en ninguna ventana no hay nada que reportar y la sección se omite. */
export function hayConsumoIA(c: CostosIA | null | undefined): boolean {
  if (!c) return false;
  return c.actual.llamadas > 0 || (c.previo?.llamadas ?? 0) > 0 || (c.mes?.llamadas ?? 0) > 0;
}
