import type { ManipulacionRiesgosaBorrador } from "./borrador";
import { MARGEN_CUADRE } from "./calcular";
import type { Hallazgo } from "./diagnostico";

export type ExplicacionClaseReubicacion = {
  diferenciaOriginal: number;
  flujoNeto: number;
  montoExplicado: number;
  residual: number;
  resuelta: boolean;
  sobreExplicada: boolean;
  filas: number[];
};

const CODIGO_CLASE_HALLAZGO: Readonly<Record<string, string>> = {
  Activo: "1",
  Pasivo: "2",
  Patrimonio: "3",
  Ingresos: "4",
  Gastos: "5",
  Costos: "6",
};

const claseValidacion = (clase: string): string | null => {
  if (clase === "7") return "6";
  return /^[1-6]$/.test(clase) ? clase : null;
};

/**
 * Concilia las diferencias crudas archivo↔detalle con reubicaciones entre clases
 * que ya fueron aprobadas. No altera la validación contable: produce una capa
 * derivada para decidir si el hallazgo sigue pendiente.
 */
export function calcularExplicacionesClaseReubicacion(
  riesgos: ManipulacionRiesgosaBorrador[],
  filasAprobadas: ReadonlySet<number>,
  filasContabilizadas: ReadonlySet<number>,
  diferencias: Readonly<Record<string, number | null>>,
  tolerancia = MARGEN_CUADRE,
): Map<string, ExplicacionClaseReubicacion> {
  const flujos = new Map<string, { flujoNeto: number; filas: Set<number> }>();
  const filasProcesadas = new Set<number>();

  const acumular = (clase: string, monto: number, filaNum: number) => {
    const actual = flujos.get(clase) ?? { flujoNeto: 0, filas: new Set<number>() };
    actual.flujoNeto += monto;
    actual.filas.add(filaNum);
    flujos.set(clase, actual);
  };

  for (const riesgo of riesgos) {
    if (filasProcesadas.has(riesgo.filaNum)) continue;
    filasProcesadas.add(riesgo.filaNum);
    if (!filasAprobadas.has(riesgo.filaNum) || !filasContabilizadas.has(riesgo.filaNum)) continue;

    const origen = claseValidacion(riesgo.claseOrigen);
    const destino = claseValidacion(riesgo.claseDestino);
    if (!origen || !destino || origen === destino || riesgo.monto === 0) continue;

    // El signo se conserva: movimientos contrarios y ciclos deben netearse en vez
    // de inflar artificialmente el valor explicado mediante sumas absolutas.
    acumular(origen, riesgo.monto, riesgo.filaNum);
    acumular(destino, -riesgo.monto, riesgo.filaNum);
  }

  const explicaciones = new Map<string, ExplicacionClaseReubicacion>();
  for (const [clase, flujo] of flujos) {
    const diferencia = diferencias[clase];
    if (diferencia == null) continue;

    const montoExplicado = Math.abs(flujo.flujoNeto);
    const residualCalculado = Math.abs(diferencia) - montoExplicado;
    // Los saldos llegan como punto flotante; una resta contablemente exacta puede
    // producir -5e-8 y renderizarse como "-$ 0". Se normaliza solo por debajo de
    // medio centavo, sin alterar el margen funcional de conciliación.
    const residual = Math.abs(residualCalculado) < 0.005 ? 0 : residualCalculado;
    explicaciones.set(clase, {
      diferenciaOriginal: diferencia,
      flujoNeto: flujo.flujoNeto,
      montoExplicado,
      residual,
      resuelta: Math.abs(residual) <= tolerancia,
      sobreExplicada: residual < -tolerancia,
      filas: [...flujo.filas].sort((a, b) => a - b),
    });
  }
  return explicaciones;
}

export function filtrarHallazgosClaseResueltos(
  hallazgos: Hallazgo[],
  explicaciones: ReadonlyMap<string, ExplicacionClaseReubicacion>,
): Hallazgo[] {
  return hallazgos.filter((hallazgo) => {
    if (hallazgo.tipo !== "clase" || !hallazgo.clase) return true;
    const clase = CODIGO_CLASE_HALLAZGO[hallazgo.clase];
    return !clase || !explicaciones.get(clase)?.resuelta;
  });
}
