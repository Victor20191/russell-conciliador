import type { BaseCalculo } from "@/lib/balance/prevalidador/catalogo";

export type ContextoCompuertaCruce = {
  balance: {
    clienteId: number;
    periodoInicio: Date;
    periodoFin: Date;
    esOficial: boolean;
    estaCongelado: boolean;
  };
  catalogo: readonly {
    moduloCodigo: string;
    baseCalculo: BaseCalculo;
    activa: boolean;
  }[];
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
};

type ReglaBaseModulo = {
  moduloCodigo: string;
  baseCalculo: BaseCalculo;
  activa: boolean;
};

/**
 * Rango de meses de un cargue («2025-01» a «2025-12»). Los módulos de un mes lo omiten; Nómina
 * lo declara (D7) y el balance tiene que cubrirlo exactamente o, si arranca en enero, ser el
 * balance del mes final (las cuentas de resultado acumulan el año: su saldo final ES el
 * movimiento enero–mes).
 */
export type RangoCargue = { desde: string; hasta: string };

/** Base contable con la que se lee el balance frente a un rango. */
export type BaseRangoBalance = "movimiento" | "saldo_acumulado";

const MES_RE = /^(\d{4})-(\d{2})$/;

/** ¿El balance cubre EXACTAMENTE el rango (día 1 del mes inicial → último día del mes final)? */
export function balanceCubreRangoExacto(periodoInicio: Date, periodoFin: Date, rango: RangoCargue): boolean {
  const ini = MES_RE.exec(rango.desde);
  const fin = MES_RE.exec(rango.hasta);
  if (!ini || !fin) return false;
  const [aI, mI] = [Number(ini[1]), Number(ini[2])];
  const [aF, mF] = [Number(fin[1]), Number(fin[2])];
  if (mI < 1 || mI > 12 || mF < 1 || mF > 12 || aI * 12 + mI > aF * 12 + mF) return false;
  const ultimoDia = new Date(Date.UTC(aF, mF, 0)).getUTCDate();
  return periodoInicio.getUTCFullYear() === aI
    && periodoInicio.getUTCMonth() + 1 === mI
    && periodoInicio.getUTCDate() === 1
    && periodoFin.getUTCFullYear() === aF
    && periodoFin.getUTCMonth() + 1 === mF
    && periodoFin.getUTCDate() === ultimoDia;
}

/**
 * Cómo leer un balance frente al rango del cargue: `movimiento` si lo cubre exacto;
 * `saldo_acumulado` si el rango arranca en enero y el balance termina en el mes final (su
 * saldo final acumula el año); `null` si no sirve.
 */
export function baseBalanceParaRango(periodoInicio: Date, periodoFin: Date, rango: RangoCargue): BaseRangoBalance | null {
  if (balanceCubreRangoExacto(periodoInicio, periodoFin, rango)) return "movimiento";
  if (rango.desde.endsWith("-01") && rango.desde.slice(0, 4) === rango.hasta.slice(0, 4) && balanceTerminaEnPeriodo(periodoFin, rango.hasta)) {
    return "saldo_acumulado";
  }
  return null;
}

/** Indica si la fecha final del balance pertenece al período mensual del módulo. */
export function balanceTerminaEnPeriodo(periodoFin: Date, periodoModulo: string): boolean {
  const coincidencia = /^(\d{4})-(\d{2})$/.exec(periodoModulo);
  if (!coincidencia) return false;
  const anio = Number(coincidencia[1]);
  const mes = Number(coincidencia[2]);
  if (!Number.isInteger(anio) || mes < 1 || mes > 12) return false;
  return periodoFin.getUTCFullYear() === anio && periodoFin.getUTCMonth() + 1 === mes;
}

function moduloUsaMovimiento(
  catalogo: readonly ReglaBaseModulo[],
  moduloCodigo: string,
): boolean {
  const codigo = moduloCodigo.trim().toUpperCase();
  return catalogo.some(
    (regla) => regla.activa && regla.moduloCodigo === codigo && regla.baseCalculo === "movimiento",
  );
}

/** El oficial (congelado) del período si lo hay; si no, el primero en el orden recibido (la versión más reciente). */
function preferirOficial<T extends CandidatoBalanceCruce>(candidatos: readonly T[]): T | null {
  return candidatos.find((c) => c.esOficial) ?? candidatos[0] ?? null;
}

/**
 * Balance del período contra el que cruza un cargue. Congelar NO es requisito: se usa el
 * balance oficial (congelado) del período si existe y, si no, la versión más reciente
 * confirmada (los candidatos llegan con el oficial primero y luego por recencia). Para
 * módulos de movimiento antepone el que cubre el mes calendario exacto (o el rango del
 * cargue) a cualquier acumulado/YTD que termine ese mes.
 */
export function seleccionarBalanceCruceModulo<T extends CandidatoBalanceCruce>(
  candidatos: readonly T[],
  catalogo: readonly ReglaBaseModulo[],
  moduloCodigo: string,
  periodoModulo: string,
  rango?: RangoCargue | null,
): T | null {
  const delPeriodo = candidatos.filter((candidato) => balanceTerminaEnPeriodo(candidato.periodoFin, periodoModulo));
  if (delPeriodo.length === 0) return null;
  if (!moduloUsaMovimiento(catalogo, moduloCodigo)) return preferirOficial(delPeriodo);

  // Con rango (Nómina): primero el que lo cubre exacto, luego el del mes final leído por saldo.
  if (rango) {
    return preferirOficial(delPeriodo.filter((c) => baseBalanceParaRango(c.periodoInicio, c.periodoFin, rango) === "movimiento"))
      ?? preferirOficial(delPeriodo.filter((c) => baseBalanceParaRango(c.periodoInicio, c.periodoFin, rango) === "saldo_acumulado"))
      ?? preferirOficial(delPeriodo);
  }
  return preferirOficial(delPeriodo.filter((c) => balanceCubreMesExacto(c.periodoInicio, c.periodoFin, periodoModulo)))
    ?? preferirOficial(delPeriodo);
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

export function balanceCubreMesExacto(
  periodoInicio: Date,
  periodoFin: Date,
  periodoModulo: string,
): boolean {
  const coincidencia = /^(\d{4})-(\d{2})$/.exec(periodoModulo);
  if (!coincidencia) return false;
  const anio = Number(coincidencia[1]);
  const mes = Number(coincidencia[2]);
  if (!Number.isInteger(anio) || mes < 1 || mes > 12) return false;
  const ultimoDia = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
  return periodoInicio.getUTCFullYear() === anio
    && periodoInicio.getUTCMonth() + 1 === mes
    && periodoInicio.getUTCDate() === 1
    && periodoFin.getUTCFullYear() === anio
    && periodoFin.getUTCMonth() + 1 === mes
    && periodoFin.getUTCDate() === ultimoDia;
}

/** Los módulos con base movimiento solo son comparables contra el mismo mes completo. */
export function validarRangoBalanceModulo(
  contexto: Pick<ContextoCompuertaCruce, "balance" | "catalogo">,
  moduloCodigo: string,
  periodoModulo: string,
  rango?: RangoCargue | null,
): string | null {
  const codigo = moduloCodigo.trim().toUpperCase();
  const usaMovimiento = moduloUsaMovimiento(contexto.catalogo, codigo);
  if (!usaMovimiento) return null;
  if (rango && rango.desde !== rango.hasta) {
    if (baseBalanceParaRango(contexto.balance.periodoInicio, contexto.balance.periodoFin, rango)) return null;
    return `El cargue de ${codigo} cubre ${rango.desde} a ${rango.hasta} y exige un balance que cubra exactamente ese rango, o —si arranca en enero— el balance del mes ${rango.hasta} leído por saldo acumulado. El balance seleccionado va de ${contexto.balance.periodoInicio.toISOString().slice(0, 10)} a ${contexto.balance.periodoFin.toISOString().slice(0, 10)}.`;
  }
  if (balanceCubreMesExacto(contexto.balance.periodoInicio, contexto.balance.periodoFin, periodoModulo)) {
    return null;
  }
  return `El módulo ${codigo} usa movimientos del período y exige un balance que cubra exactamente el mes ${periodoModulo}, desde el primer hasta el último día. Un balance acumulado, trimestral o YTD produciría un cruce incorrecto.`;
}
