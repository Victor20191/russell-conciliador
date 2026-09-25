// PLAN DE ESCRITURA del Consolidado — puro, sin BD.
//
// Guardar las cuentas de N renglones se hacía con dos sentencias POR RENGLÓN dentro de una
// transacción. Con 33 renglones eran más de 60 idas y vueltas a la base remota y la transacción
// se pasaba del tiempo permitido: «La carga tardó más de lo permitido…» (P2028) al pulsar
// «Guardar propuestas» en un cargue de nómina (INCODOL, 25/Sep/2026). Es el mismo problema que
// ya tuvo la carga masiva de conceptos, y la misma salida: un plan de pocas sentencias.
//
// La regla de negocio no cambia, y está en `asignacion-periodo.ts`:
//  - renglón con solo cuentas de la cédula → memoria del cliente (todos los meses) y se retira
//    la asignación del período que tuviera;
//  - renglón con alguna cuenta de fuera → TODAS sus cuentas van a la asignación del período y la
//    memoria del cliente no se toca.
import { filasPeriodoDeCuentas } from "./asignacion-periodo";

/** Lo descriptivo del concepto que se conserva al reemplazar sus cuentas. */
export type MemoriaRenglon = {
  descripcion?: string | null;
  grupo?: string | null;
  subcuentaPuc?: string | null;
  cuentaCliente?: string | null;
};

export type RenglonAGuardar = {
  clasificador: string;
  agrupador: string;
  /** Cuentas que SÍ son de la cédula del módulo. */
  deCedula: string[];
  /** Cuentas del plan Russell fuera de la cédula: valen solo para el período. */
  extras: string[];
  /** Lo ya guardado del concepto (nombre, grupo, subcuenta, cuenta del cliente). */
  memoria?: MemoriaRenglon | null;
  /** ¿El renglón tenía una asignación del período antes de este guardado? */
  teniaPeriodo?: boolean;
};

export type LlaveRenglon = { clasificador: string; agrupador: string };

export type PlanEscrituraConsolidacion = {
  /** Renglones cuya memoria se reemplaza (se borra y se vuelve a crear). */
  memoriaBorrar: LlaveRenglon[];
  memoriaCrear: (LlaveRenglon & {
    cuenta4: string;
    cuenta6: string;
    descripcion: string | null;
    grupo: string | null;
    subcuentaPuc: string | null;
    cuentaCliente: string;
  })[];
  /** Renglones cuya asignación del período se borra (la reemplazan o la retiran). */
  periodoBorrar: LlaveRenglon[];
  periodoCrear: (LlaveRenglon & { cuenta4: string; cuenta6: string })[];
};

/**
 * Qué hay que borrar y qué crear para guardar estos renglones. El llamador lo traduce a CUATRO
 * sentencias (dos por tabla), sin importar cuántos renglones vengan.
 */
export function planEscrituraConsolidacion(renglones: readonly RenglonAGuardar[]): PlanEscrituraConsolidacion {
  const plan: PlanEscrituraConsolidacion = { memoriaBorrar: [], memoriaCrear: [], periodoBorrar: [], periodoCrear: [] };
  for (const r of renglones) {
    const llave = { clasificador: r.clasificador, agrupador: r.agrupador };
    if (r.extras.length === 0) {
      plan.memoriaBorrar.push(llave);
      for (const cuenta of [...new Set(r.deCedula)]) {
        plan.memoriaCrear.push({
          ...llave,
          cuenta4: cuenta.slice(0, 4),
          cuenta6: cuenta.length === 6 ? cuenta : "",
          descripcion: r.memoria?.descripcion ?? null,
          grupo: r.memoria?.grupo ?? null,
          subcuentaPuc: r.memoria?.subcuentaPuc ?? null,
          cuentaCliente: r.memoria?.cuentaCliente ?? "",
        });
      }
      // La memoria vuelve a regir: si el renglón tenía cuenta solo del período, se retira.
      if (r.teniaPeriodo) plan.periodoBorrar.push(llave);
      continue;
    }
    plan.periodoBorrar.push(llave);
    plan.periodoCrear.push(...filasPeriodoDeCuentas(r.clasificador, r.agrupador, [...r.deCedula, ...r.extras]));
  }
  return plan;
}
