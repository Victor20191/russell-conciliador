/**
 * Periodicidad de presentación por cliente y formulario DIAN (puro).
 *
 * Se guarda en `formularios_dian_cliente.periodicidad`; nula = la del formulario
 * (`formularios_dian.periodicidad`). Retención en la fuente se declara siempre cada mes, así
 * que no se elige: la ficha del cliente solo pide la periodicidad cuando hay más de una opción.
 */

export type Periodicidad = "Mensual" | "Bimestral" | "Trimestral" | "Cuatrimestral" | "Semestral" | "Anual";

/** Meses que cubre cada período. */
const MESES_POR_PERIODO: Readonly<Record<Periodicidad, number>> = {
  Mensual: 1, Bimestral: 2, Trimestral: 3, Cuatrimestral: 4, Semestral: 6, Anual: 12,
};

/** Meses que cubre cada período de la periodicidad (1 si no se reconoce). */
export function mesesPorPeriodo(periodicidad: string): number {
  return esPeriodicidad(periodicidad) ? MESES_POR_PERIODO[periodicidad] : 1;
}

/** Cortes posibles de una revisión: los meses en que cierra un período (bimestral 2, 4… 12). */
export function mesesCorteValidos(periodicidad: string): number[] {
  const meses = mesesPorPeriodo(periodicidad);
  return Array.from({ length: Math.floor(12 / meses) }, (_, i) => (i + 1) * meses);
}

const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"] as const;
const NOMBRE_PERIODO: Readonly<Partial<Record<Periodicidad, string>>> = { Bimestral: "Bimestre", Trimestral: "Trimestre", Cuatrimestral: "Cuatrimestre", Semestral: "Semestre" };

/**
 * Nombre de un período: el mes con periodicidad mensual («Enero»), «Bimestre 01 · Enero-Febrero» o
 * «Cuatrimestre 02 · Mayo-Agosto», y «Año» con la anual.
 */
export function etiquetaPeriodo(periodicidad: string, periodo: number): string {
  const meses = mesesPorPeriodo(periodicidad);
  if (meses === 1) return MESES[periodo - 1] ?? `Período ${periodo}`;
  if (meses === 12) return "Año";
  const desde = MESES[(periodo - 1) * meses];
  const hasta = MESES[periodo * meses - 1];
  const nombre = NOMBRE_PERIODO[periodicidad as Periodicidad] ?? "Período";
  return desde && hasta ? `${nombre} ${String(periodo).padStart(2, "0")} · ${desde}-${hasta}` : `${nombre} ${periodo}`;
}

/** Opciones por clave de formulario. ICA no tiene: su periodicidad se define con su módulo. */
export const PERIODICIDADES_POR_FORMULARIO: Readonly<Record<string, readonly Periodicidad[]>> = {
  RETEFUENTE: ["Mensual"],
  IVA: ["Bimestral", "Cuatrimestral", "Anual"],
};

export function opcionesPeriodicidad(claveFormulario: string): readonly Periodicidad[] {
  return PERIODICIDADES_POR_FORMULARIO[claveFormulario] ?? [];
}

export function esPeriodicidad(valor: string): valor is Periodicidad {
  return valor in MESES_POR_PERIODO;
}

/** Periodicidad vigente: la del cliente o, si no la tiene (o no es válida para el formulario), la del formulario. */
export function periodicidadVigente(claveFormulario: string, delCliente: string | null | undefined, delFormulario: string): string {
  const opciones = opcionesPeriodicidad(claveFormulario);
  if (delCliente && (opciones.length === 0 || (opciones as readonly string[]).includes(delCliente))) return delCliente;
  return delFormulario;
}

/**
 * Validación del valor que llega de la ficha del cliente para un formulario. Vacío = sin
 * periodicidad propia (rige la del formulario).
 */
export function validarPeriodicidad(claveFormulario: string, valor: string | null | undefined): { ok: true; periodicidad: Periodicidad | null } | { ok: false; message: string } {
  const limpio = (valor ?? "").trim();
  if (limpio === "") return { ok: true, periodicidad: null };
  const opciones = opcionesPeriodicidad(claveFormulario);
  if (!esPeriodicidad(limpio) || !opciones.includes(limpio)) {
    return { ok: false, message: `Periodicidad no válida para ${claveFormulario}.` };
  }
  return { ok: true, periodicidad: limpio };
}

/**
 * Períodos que se esperan hasta el mes de corte: cada uno con su número (el «período» del
 * formulario) y el mes en que termina. Solo cuentan los que terminan a más tardar en el corte.
 */
export function periodosEsperados(periodicidad: string, mesCorte: number): { periodo: number; mesFin: number }[] {
  const meses = mesesPorPeriodo(periodicidad);
  const periodos: { periodo: number; mesFin: number }[] = [];
  for (let n = 1; n * meses <= 12; n++) {
    const mesFin = n * meses;
    if (mesFin > mesCorte) break;
    periodos.push({ periodo: n, mesFin });
  }
  return periodos;
}
