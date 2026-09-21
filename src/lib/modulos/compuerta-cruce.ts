import { etiquetaApertura, parsearApertura } from "@/lib/balance/apertura-balance";

// COMPUERTA Y SELECCIÓN DEL BALANCE del cruce de un módulo — puro.
//
// Todos los módulos se concilian contra el SALDO FINAL del balance (21/Sep/2026, también Ingresos
// y Nómina): sirve cualquier balance confirmado que TERMINE en el mes de corte del cargue, sin
// importar desde cuándo arranca (mensual, trimestral o acumulado del año). Ya no se exige un
// balance que cubra exactamente el mes ni el rango del cargue.

export type ContextoCompuertaCruce = {
  balance: {
    clienteId: number;
    periodoInicio: Date;
    periodoFin: Date;
    esOficial: boolean;
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
  periodoInicio: Date;
  periodoFin: Date;
  esOficial: boolean;
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

/** El oficial (congelado) del período si lo hay; si no, el primero en el orden recibido (la versión más reciente). */
function preferirOficial<T extends CandidatoBalanceCruce>(candidatos: readonly T[]): T | null {
  return candidatos.find((c) => c.esOficial) ?? candidatos[0] ?? null;
}

/**
 * Balance contra el que cruza un cargue: uno confirmado que termine en su mes de corte. Congelar
 * NO es requisito: se usa el oficial (congelado) del período si existe y, si no, la versión más
 * reciente confirmada (los candidatos llegan con el oficial primero y luego por recencia).
 *
 * Con `preferirDetalleTercero` (Cartera y CxP) antes se queda con las versiones del mes que
 * conservan el detalle por tercero, si alguna lo hace: el cruce por tercero solo lee el detalle
 * LIGADO al balance elegido, y así las dos pestañas cruzan contra el mismo balance aunque la
 * oficial sea «Por cuenta».
 */
export function seleccionarBalanceCruceModulo<T extends CandidatoBalanceCruce>(
  candidatos: readonly T[],
  periodoModulo: string,
  opciones: { preferirDetalleTercero?: boolean } = {},
): T | null {
  const terminanEnPeriodo = candidatos.filter((candidato) => balanceTerminaEnPeriodo(candidato.periodoFin, periodoModulo));
  if (terminanEnPeriodo.length === 0) return null;
  const conDetalle = opciones.preferirDetalleTercero ? terminanEnPeriodo.filter((c) => c.conDetalleTercero === true) : [];
  return preferirOficial(conDetalle.length > 0 ? conDetalle : terminanEnPeriodo);
}

export type BalanceDescribible = CandidatoBalanceCruce & { id: unknown; version: string; aperturaBalance?: string | null };

const fechaISO = (fecha: Date): string => fecha.toISOString().slice(0, 10);

/** «v1 «Por terceros» (2025-01-01 a 2025-12-31)»: la versión sola no distingue dos aperturas del mes. */
export function describirBalanceCruce(balance: Pick<BalanceDescribible, "version" | "aperturaBalance" | "periodoInicio" | "periodoFin">): string {
  const apertura = parsearApertura(balance.aperturaBalance);
  return `${balance.version}${apertura ? ` «${etiquetaApertura(apertura)}»` : ""} (${fechaISO(balance.periodoInicio)} a ${fechaISO(balance.periodoFin)})`;
}

/**
 * Lo que hay que saber de la elección del balance: que el mes de corte tiene VARIAS oficiales o
 * (Cartera y CxP) que no se usó la oficial porque no trae el detalle por tercero. Lo primero pasa
 * porque congelar desmarca solo las versiones con el mismo TEXTO de período —«Diciembre 2025» y
 * «Enero 2025 – Diciembre 2025» quedan oficiales las dos— mientras el cruce toma todo balance
 * que termina en el mes. Sin nada que avisar devuelve null.
 */
export function avisoSeleccionBalance<T extends BalanceDescribible>(
  candidatos: readonly T[],
  elegido: T | null,
  periodoModulo: string,
): string | null {
  if (!elegido) return null;
  const oficiales = candidatos.filter((c) => c.esOficial && balanceTerminaEnPeriodo(c.periodoFin, periodoModulo));
  const lista = oficiales.map((c) => describirBalanceCruce(c)).join(", ");
  const porDetalle = elegido.conDetalleTercero === true && oficiales.some((c) => c.conDetalleTercero !== true);
  if (oficiales.length > 1) {
    return `Hay ${oficiales.length} balances oficiales que terminan en ${periodoModulo}: ${lista}. Se cruza contra el ${describirBalanceCruce(elegido)}, ${porDetalle ? "el que conserva el detalle por tercero" : "el cargado más recientemente"}.`;
  }
  if (!elegido.esOficial && oficiales.length === 1 && porDetalle) {
    return `Se cruza contra el balance ${describirBalanceCruce(elegido)} porque conserva el detalle por tercero; el oficial del período, ${lista}, no lo trae.`;
  }
  return null;
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
 * Compuerta compartida por el conciliador formal y el cruce dentro del módulo.
 *
 * Congelar el balance NO es requisito para conciliar: lo que queda en firme son las
 * cuentas del módulo, y eso lo hace el CIERRE de la conciliación (`cerrarConciliacionModulo`),
 * no un congelado previo de toda la versión. La compuerta solo exige que el balance sea del
 * cliente, que el prevalidador esté listo para el módulo y que conserve una aprobación vigente.
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
