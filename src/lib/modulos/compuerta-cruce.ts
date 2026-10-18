import { etiquetaApertura, parsearApertura } from "@/lib/balance/apertura-balance";

// COMPUERTA Y SELECCIÓN DEL BALANCE del cruce de un módulo — puro.
//
// Todos los módulos se concilian contra el SALDO FINAL del balance (21/Sep/2026, también Ingresos
// y Nómina): sirve un balance que TERMINE en el mes de corte del cargue, sin importar desde cuándo
// arranca (mensual, trimestral o acumulado del año). Desde el 18/Oct/2026 ese balance tiene que estar
// CERRADO y ser la versión vigente de su línea: cerrar exige que todos los balances del corte
// coincidan en saldos finales, así que cualquier cerrado del corte da el mismo cruce. Cartera y CxP
// exigen además que conserve el detalle por tercero, porque su cruce por tercero lo lee.

export type ContextoCompuertaCruce = {
  balance: {
    clienteId: number;
    periodoInicio: Date;
    periodoFin: Date;
    estaCongelado: boolean;
  };
  prevalidador:
    | { estado: "no_disponible"; mensaje: string }
    | { estado: "sin_catalogo" }
    | { estado: "bloqueado"; sinHomologar: { cuentas: number } }
    | {
        estado: "listo";
        modulos: readonly { codigo: string }[];
        anidamientos: readonly { cuenta8: string }[];
      };
  revision: {
    estado: "pendiente" | "aprobada" | "revocada" | "desactualizada";
    vigente: boolean;
  };
};

export type CandidatoBalanceCruce = {
  id: number;
  periodoInicio: Date;
  periodoFin: Date;
  estaCongelado: boolean;
  /** El balance conserva su detalle por tercero (captura ligada por `loteId`). */
  conDetalleTercero?: boolean;
};

/** Indica si la fecha final del balance pertenece al mes de corte del módulo («YYYY-MM»). */
export function balanceTerminaEnPeriodo(periodoFin: Date, periodoModulo: string): boolean {
  const coincidencia = /^(\d{4})-(\d{2})$/.exec(periodoModulo);
  if (!coincidencia) return false;
  const anio = Number(coincidencia[1]);
  const mes = Number(coincidencia[2]);
  if (!Number.isInteger(anio) || mes < 1 || mes > 12) return false;
  return periodoFin.getUTCFullYear() === anio && periodoFin.getUTCMonth() + 1 === mes;
}

export type OpcionesBalanceCruce = {
  /** Cartera y CxP: solo sirve un balance que conserve el detalle por tercero. */
  exigirDetalleTercero?: boolean;
  /** Ids de las versiones vigentes de su línea; ausente = no se filtra (pruebas, datos ya filtrados). */
  vigentes?: ReadonlySet<number>;
};

/**
 * Balance contra el que cruza un cargue: uno CERRADO y vigente que termine en su mes de corte (con
 * detalle por tercero si el módulo lo exige). Los candidatos llegan del más reciente al más antiguo
 * (fecha de corte, fecha de carga, id) y gana el primero. null = no hay contra qué cruzar
 * (`motivoSinBalanceCruce` dice por qué).
 */
export function seleccionarBalanceCruceModulo<T extends CandidatoBalanceCruce>(
  candidatos: readonly T[],
  periodoModulo: string,
  opciones: OpcionesBalanceCruce = {},
): T | null {
  return candidatos.find((c) =>
    balanceTerminaEnPeriodo(c.periodoFin, periodoModulo)
    && c.estaCongelado
    && (!opciones.vigentes || opciones.vigentes.has(c.id))
    && (!opciones.exigirDetalleTercero || c.conDetalleTercero === true),
  ) ?? null;
}

export type MotivoSinBalanceCruce = "sin_balance_en_mes" | "sin_balance_cerrado" | "sin_balance_cerrado_por_terceros";

/** Por qué un cargue no tiene balance contra el que cruzar (null = sí lo tiene). */
export function motivoSinBalanceCruce<T extends CandidatoBalanceCruce>(
  candidatos: readonly T[],
  periodoModulo: string,
  opciones: OpcionesBalanceCruce & { modulo?: string } = {},
): { motivo: MotivoSinBalanceCruce; mensaje: string } | null {
  if (seleccionarBalanceCruceModulo(candidatos, periodoModulo, opciones)) return null;
  const delMes = candidatos.filter((c) => balanceTerminaEnPeriodo(c.periodoFin, periodoModulo));
  if (delMes.length === 0) {
    return { motivo: "sin_balance_en_mes", mensaje: `No hay un balance con corte en ${periodoModulo}. Carga el balance del período en /balance y ciérralo para conciliar contra él.` };
  }
  const cerrados = delMes.filter((c) => c.estaCongelado && (!opciones.vigentes || opciones.vigentes.has(c.id)));
  if (cerrados.length === 0) {
    return { motivo: "sin_balance_cerrado", mensaje: `No hay un balance cerrado con corte en ${periodoModulo}. Cierra el balance del período en /balance para conciliar contra él.` };
  }
  return {
    motivo: "sin_balance_cerrado_por_terceros",
    mensaje: `El balance cerrado con corte en ${periodoModulo} no conserva el detalle por tercero, que ${opciones.modulo ?? "este módulo"} necesita. Carga uno «Por terceros» del mismo corte y ciérralo.`,
  };
}

export type BalanceDescribible = Omit<CandidatoBalanceCruce, "id"> & { id: unknown; version: string; aperturaBalance?: string | null };

const fechaISO = (fecha: Date): string => fecha.toISOString().slice(0, 10);

/** «v1 «Por terceros» (2025-01-01 a 2025-12-31)»: la versión sola no distingue dos aperturas del mes. */
export function describirBalanceCruce(balance: Pick<BalanceDescribible, "version" | "aperturaBalance" | "periodoInicio" | "periodoFin">): string {
  const apertura = parsearApertura(balance.aperturaBalance);
  return `${balance.version}${apertura ? ` «${etiquetaApertura(apertura)}»` : ""} (${fechaISO(balance.periodoInicio)} a ${fechaISO(balance.periodoFin)})`;
}

/**
 * El balance de un período con la conciliación EN FIRME: el que guardó el cierre, no el que hoy
 * elegiría `seleccionarBalanceCruceModulo`. Así una versión nueva del mes no cambia contra qué se
 * concilió. null si ese balance ya no existe.
 */
export function balanceFijadoDelCierre<T extends { id: number }>(candidatos: readonly T[], balanceEncabezadoId: number): T | null {
  return candidatos.find((c) => c.id === balanceEncabezadoId) ?? null;
}

/**
 * Compuerta del balance FIJADO por un cierre en firme. La aprobación del prevalidador se verificó bajo
 * candado al cerrar y sus cuentas en firme no pueden cambiar, así que ya no se exige que siga vigente:
 * editar otra cuenta del balance, revocar la aprobación o cargar otra versión no debe tumbar la
 * cédula conciliada. Sí tiene que ser del cliente y, sin copia congelada (cierre anterior), el
 * prevalidador tiene que poder calcularse, porque de él salen las agrupadoras que se excluyen.
 */
export function validarBalanceFijado(contexto: ContextoCompuertaCruce, clientId: number, conCopia: boolean): string | null {
  if (contexto.balance.clienteId !== clientId) {
    return "El balance con que se cerró la conciliación no pertenece al cliente.";
  }
  if (conCopia) return null;
  if (contexto.prevalidador.estado === "sin_catalogo") return "No hay cuentas activas configuradas para el prevalidador.";
  if (contexto.prevalidador.estado === "bloqueado") {
    return `El prevalidador del balance conciliado está bloqueado: quedan ${contexto.prevalidador.sinHomologar.cuentas} cuenta(s) sin homologar.`;
  }
  if (contexto.prevalidador.estado === "no_disponible") return contexto.prevalidador.mensaje;
  return null;
}

/**
 * Aviso cuando hoy el cruce elegiría otro balance que el de la conciliación en firme (se cerró otro
 * balance del mes): el cruce se sigue mostrando contra el conciliado.
 */
export function avisoBalanceFijado<T extends BalanceDescribible>(fijado: T, vivo: T | null): string | null {
  if (!vivo || vivo.id === fijado.id) return null;
  return `La conciliación está en firme: el cruce se muestra contra el balance con que se cerró, ${describirBalanceCruce(fijado)}. Hoy el período también tiene el ${describirBalanceCruce(vivo)}, que no la cambia.`;
}

/** Códigos de agrupadoras que el prevalidador ya excluyó para evitar doble conteo. */
export function cuentasAgrupadorasExcluidas(
  prevalidador: ContextoCompuertaCruce["prevalidador"],
): ReadonlySet<string> {
  if (prevalidador.estado !== "listo") return new Set<string>();
  return new Set(
    prevalidador.anidamientos
      .map((fila) => fila.cuenta8.replace(/\D/g, ""))
      .filter((cuenta8) => cuenta8 !== ""),
  );
}

/**
 * Compuerta compartida por el conciliador formal y el cruce dentro del módulo: el balance (ya
 * elegido entre los CERRADOS del mes, `seleccionarBalanceCruceModulo`) tiene que ser del cliente,
 * tener el prevalidador listo para el módulo y conservar una aprobación vigente.
 */
export function validarCompuertaPrevalidador(
  contexto: ContextoCompuertaCruce,
  clientId: number,
  moduloCodigo: string,
): string | null {
  if (contexto.balance.clienteId !== clientId) {
    return "El balance seleccionado no pertenece al cliente de la conciliación.";
  }
  if (contexto.prevalidador.estado === "sin_catalogo") {
    return "No hay cuentas activas configuradas para el prevalidador.";
  }
  if (contexto.prevalidador.estado === "bloqueado") {
    return `El prevalidador está bloqueado: quedan ${contexto.prevalidador.sinHomologar.cuentas} cuenta(s) sin homologar.`;
  }
  if (contexto.prevalidador.estado === "no_disponible") return contexto.prevalidador.mensaje;
  if (!contexto.prevalidador.modulos.some((modulo) => modulo.codigo === moduloCodigo)) {
    return "El módulo seleccionado no está cubierto por el catálogo vigente del prevalidador.";
  }
  if (!contexto.revision.vigente) {
    return contexto.revision.estado === "desactualizada"
      ? "La aprobación del prevalidador quedó desactualizada. Revísalo y apruébalo nuevamente antes de conciliar."
      : contexto.revision.estado === "revocada"
        ? "La aprobación del prevalidador fue revocada. Debe aprobarse nuevamente antes de conciliar."
        : "El balance todavía no tiene una aprobación vigente del prevalidador.";
  }
  return null;
}
