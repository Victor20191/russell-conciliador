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
//
// Nómina con la cuenta contable en el archivo (30/Sep/2026): el renglón es (concepto, centro,
// cuenta del cliente). Su memoria se reemplaza SOLO en las filas de esa cuenta del cliente —así
// guardar un renglón hermano no pisa al otro— y guarda la cuenta, la subcuenta PUC y el grupo que
// trae el archivo, para que un reporte posterior sin columna de cuenta los aproveche. La
// asignación del período sigue siendo del par (concepto, centro).
import { filasPeriodoDeCuentas } from "./asignacion-periodo";
import { grupoPorSubcuentaPuc } from "./nomina/grupos-concepto";
import { subcuentaPucDe } from "./nomina/homologacion";

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
  /** Nómina: cuenta contable del cliente que trae el archivo para el renglón (parte la memoria). */
  cuentaArchivo?: string | null;
};

export type LlaveRenglon = { clasificador: string; agrupador: string };

/** Filas de la memoria que se borran: las del par o, con cuenta del archivo, solo las de esa cuenta. */
export type LlaveMemoria = LlaveRenglon & { cuentaCliente?: string };

export type PlanEscrituraConsolidacion = {
  /** Renglones cuya memoria se reemplaza (se borra y se vuelve a crear). */
  memoriaBorrar: LlaveMemoria[];
  memoriaCrear: (LlaveRenglon & {
    cuenta4: string;
    cuenta6: string;
    descripcion: string | null;
    grupo: string | null;
    subcuentaPuc: string | null;
    cuentaCliente: string;
    /** «archivo» cuando la fila guarda la cuenta que trajo el archivo; si no, lo decide el llamador. */
    origen?: "archivo";
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
  const periodoVisto = new Set<string>();
  for (const r of renglones) {
    const llave = { clasificador: r.clasificador, agrupador: r.agrupador };
    if (r.extras.length === 0) {
      const cuentaArchivo = r.cuentaArchivo?.trim() || null;
      const subArchivo = cuentaArchivo ? subcuentaPucDe(cuentaArchivo) : null;
      plan.memoriaBorrar.push(cuentaArchivo ? { ...llave, cuentaCliente: cuentaArchivo } : llave);
      for (const cuenta of [...new Set(r.deCedula)]) {
        plan.memoriaCrear.push({
          ...llave,
          cuenta4: cuenta.slice(0, 4),
          cuenta6: cuenta.length === 6 ? cuenta : "",
          descripcion: r.memoria?.descripcion ?? null,
          grupo: r.memoria?.grupo ?? (cuentaArchivo ? grupoPorSubcuentaPuc(subArchivo) : null),
          subcuentaPuc: r.memoria?.subcuentaPuc ?? subArchivo,
          cuentaCliente: cuentaArchivo ?? r.memoria?.cuentaCliente ?? "",
          ...(cuentaArchivo ? { origen: "archivo" as const } : {}),
        });
      }
      // La memoria vuelve a regir: si el renglón tenía cuenta solo del período, se retira.
      if (r.teniaPeriodo) plan.periodoBorrar.push(llave);
      continue;
    }
    plan.periodoBorrar.push(llave);
    // Dos renglones hermanos (mismo concepto y centro, otra cuenta del archivo) comparten la
    // asignación del período: sus filas no se repiten.
    for (const fila of filasPeriodoDeCuentas(r.clasificador, r.agrupador, [...r.deCedula, ...r.extras])) {
      const k = [fila.clasificador, fila.agrupador, fila.cuenta4, fila.cuenta6].join("|");
      if (periodoVisto.has(k)) continue;
      periodoVisto.add(k);
      plan.periodoCrear.push(fila);
    }
  }
  return plan;
}
