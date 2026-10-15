// Alcance de la eliminación de datos cargados de un MÓDULO (Inventarios, Cartera,
// CxP, Ingresos, Activos Fijos, Nómina). Mismo contrato que el de balance
// (`src/lib/balance/alcance-eliminacion.ts`): lógica PURA, sin BD, para que la
// Server Action solo ejecute los filtros que aquí se resuelven.
//
// La eliminación NUNCA toca al cliente, sus borradores, sus preferencias de
// carga, sus correcciones por fila ni la consolidación clasificador→cuenta: eso
// es memoria de configuración, no el archivo cargado.

export const ALCANCES_ELIMINACION_MODULO = [
  "version",
  "periodo",
  "cliente_perfiles",
] as const;

export type AlcanceEliminacionModulo =
  (typeof ALCANCES_ELIMINACION_MODULO)[number];

export function parseAlcanceEliminacionModulo(
  value: unknown,
): AlcanceEliminacionModulo | null {
  return ALCANCES_ELIMINACION_MODULO.includes(value as AlcanceEliminacionModulo)
    ? (value as AlcanceEliminacionModulo)
    : null;
}

export type ReferenciaEliminacionModulo = {
  id: number;
  clienteId: number;
  moduloCodigo: string;
  periodo: string;
};

export type PlanEliminacionModulo = {
  /** Filtro Prisma de los encabezados a borrar (el detalle cae por cascada). */
  filtroEncabezado:
    | { id: number }
    | { clienteId: number; moduloCodigo: string; periodo: string }
    | { clienteId: number; moduloCodigo: string };
  /**
   * Filtro de las marcas de auditoría del cruce que dejan de tener sentido.
   * `null` al borrar UNA versión: la marca vive por período, no por cargue, así
   * que las demás versiones del período la siguen respaldando.
   */
  filtroMarcas:
    | { clienteId: number; moduloCodigo: string; periodo: string }
    | { clienteId: number; moduloCodigo: string }
    | null;
  /** Solo el alcance total del cliente se lleva los perfiles de formato. */
  eliminaPerfiles: boolean;
};

export function resolverAlcanceEliminacionModulo(
  alcance: AlcanceEliminacionModulo,
  referencia: ReferenciaEliminacionModulo,
): PlanEliminacionModulo {
  const { id, clienteId, moduloCodigo, periodo } = referencia;
  if (alcance === "version") {
    return { filtroEncabezado: { id }, filtroMarcas: null, eliminaPerfiles: false };
  }
  if (alcance === "periodo") {
    return {
      filtroEncabezado: { clienteId, moduloCodigo, periodo },
      filtroMarcas: { clienteId, moduloCodigo, periodo },
      eliminaPerfiles: false,
    };
  }
  return {
    filtroEncabezado: { clienteId, moduloCodigo },
    filtroMarcas: { clienteId, moduloCodigo },
    eliminaPerfiles: true,
  };
}

/** Cierre en firme de un período que alcanza la eliminación. */
export type CierreQueImpideEliminar = {
  moduloCodigo: string;
  periodo: string;
  cerradoPor: string;
  moduloDatoEncabezadoId: number;
};

/**
 * Con la conciliación de un período EN FIRME no se elimina ningún cargue de ese período —ni la
 * versión conciliada ni otra— y por lo tanto tampoco el período entero ni el historial del cliente:
 * el cierre se quedaría sin su papel de trabajo y sin pantalla desde la que desbloquearlo. Hay que
 * desbloquear primero. null = se puede eliminar.
 */
export function motivoEliminacionPorCierre(
  alcance: AlcanceEliminacionModulo,
  cierres: readonly CierreQueImpideEliminar[],
): string | null {
  if (cierres.length === 0) return null;
  const que = alcance === "version" ? "esta versión" : alcance === "periodo" ? "los cargues de este período" : "el historial del cliente";
  const lista = [...cierres]
    .sort((a, b) => a.periodo.localeCompare(b.periodo))
    .map((c) => `${c.periodo} (cargue #${c.moduloDatoEncabezadoId}, cerró ${c.cerradoPor})`)
    .join("; ");
  return `No se puede eliminar ${que}: la conciliación de ${cierres[0].moduloCodigo} está en firme en ${lista}. Pide al senior o gerente del cliente que la desbloquee primero.`;
}
