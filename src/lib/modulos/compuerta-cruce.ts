import { etiquetaApertura, parsearApertura } from "@/lib/balance/apertura-balance";
import { fechaCorteISO } from "@/lib/balance/corte";

// COMPUERTA Y SELECCIÓN DEL BALANCE del cruce de un módulo — puro.
//
// Todos los módulos se concilian contra el SALDO FINAL del balance (21/Sep/2026, también Ingresos
// y Nómina): sirve un balance que TERMINE en la fecha de corte del cargue, sin importar desde cuándo
// arranca (mensual, trimestral o acumulado del año). Desde el 6/Nov/2026 la fecha es EXACTA: la fecha
// de corte del cargue (Cartera y CxP la guardan) o, sin ella, el último día del mes de corte. Antes
// bastaba con el mismo mes, y un balance al 30 o con la fecha mal digitada (01/01 en «Enero») podía
// servir sin que nada lo comparara con el del 31: los balances del corte se agrupan por fecha exacta.
// Desde el 18/Oct/2026 ese balance tiene que estar CERRADO y ser la versión vigente de su línea.
// Cartera, CxP y Retención exigen además que conserve el detalle por tercero, porque su cruce por
// tercero lo lee. Cerrar exige que los balances del corte coincidan en saldos finales por cuenta del
// cliente, pero no en la homologación (la del cliente solo se propaga a los abiertos): por eso, desde
// el 7/Nov/2026, cuando sirve más de uno el usuario escoge contra cuál concilia
// (`resolverBalanceCruce`; sin elección, el de modificación más reciente).

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

/**
 * Indica si la fecha final del balance pertenece al mes de corte del módulo («YYYY-MM»). Ya no elige
 * el balance (ver `fechaCorteDelCruce`): solo distingue «no hay balance del mes» de «hay, pero termina
 * otro día».
 */
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
  /** Fecha de corte del cargue (Cartera y CxP); sin ella, el último día del mes de corte. */
  fechaCorte?: Date | string | null;
};

/** Último día del mes de corte «YYYY-MM» (AAAA-MM-DD); null si el período no es válido. */
export function ultimoDiaDelMes(periodoModulo: string): string | null {
  const coincidencia = /^(\d{4})-(\d{2})$/.exec(periodoModulo);
  if (!coincidencia) return null;
  const anio = Number(coincidencia[1]);
  const mes = Number(coincidencia[2]);
  if (!Number.isInteger(anio) || mes < 1 || mes > 12) return null;
  return new Date(Date.UTC(anio, mes, 0)).toISOString().slice(0, 10);
}

/** Fecha EXACTA en que tiene que terminar el balance del cruce (AAAA-MM-DD). */
export function fechaCorteDelCruce(periodoModulo: string, fechaCorte?: Date | string | null): string | null {
  return fechaCorte ? fechaCorteISO(fechaCorte) : ultimoDiaDelMes(periodoModulo);
}

const terminaEn = (periodoFin: Date, fecha: string | null): boolean => fecha != null && fechaCorteISO(periodoFin) === fecha;

/** «31/12/2025». */
const fechaLegible = (fecha: string): string => fecha.split("-").reverse().join("/");

/**
 * Balances que SIRVEN para el cruce de un cargue: CERRADOS, vigentes de su línea, que terminen
 * EXACTAMENTE en su fecha de corte (con detalle por tercero si el módulo lo exige), en el orden
 * recibido. Si hay más de uno, el usuario escoge (`resolverBalanceCruce`).
 */
export function balancesQueSirvenCruce<T extends CandidatoBalanceCruce>(
  candidatos: readonly T[],
  periodoModulo: string,
  opciones: OpcionesBalanceCruce = {},
): T[] {
  const fecha = fechaCorteDelCruce(periodoModulo, opciones.fechaCorte);
  return candidatos.filter((c) =>
    terminaEn(c.periodoFin, fecha)
    && c.estaCongelado
    && (!opciones.vigentes || opciones.vigentes.has(c.id))
    && (!opciones.exigirDetalleTercero || c.conDetalleTercero === true),
  );
}

/**
 * El primero de los que sirven (`balancesQueSirvenCruce`) en el orden recibido: del más reciente al
 * más antiguo (fecha de corte, fecha de carga, id). null = no hay contra qué cruzar
 * (`motivoSinBalanceCruce` dice por qué). Con varios, el cruce usa `resolverBalanceCruce`.
 */
export function seleccionarBalanceCruceModulo<T extends CandidatoBalanceCruce>(
  candidatos: readonly T[],
  periodoModulo: string,
  opciones: OpcionesBalanceCruce = {},
): T | null {
  return balancesQueSirvenCruce(candidatos, periodoModulo, opciones)[0] ?? null;
}

/**
 * De dónde sale el balance del cruce: `unico` (solo uno sirve), `elegido` (el usuario lo escogió
 * entre varios) o `preseleccionado` (varios sirven y nadie ha escogido: el de modificación más
 * reciente).
 */
export type OrigenBalanceCruce = "unico" | "elegido" | "preseleccionado";

export type BalanceCruceResuelto<T> = {
  balance: T | null;
  origen: OrigenBalanceCruce | null;
  /** Los que sirven, del de modificación más reciente al más antiguo (empate: el orden recibido). */
  opciones: T[];
  /** Había una elección guardada y ese balance ya no sirve (se abrió, otra versión lo reemplazó…). */
  eleccionCaida: boolean;
};

const instanteDe = (v: Date | string | null | undefined): number => (v == null ? Number.NEGATIVE_INFINITY : new Date(v).getTime());

/**
 * Balance del cruce entre los que sirven (7/Nov/2026). Dos balances cerrados del mismo corte coinciden
 * en saldos finales, pero no necesariamente en la homologación: la del cliente solo se propaga a los
 * balances abiertos. Por eso, con varios, manda la elección del usuario y, sin ella, se preselecciona
 * el de modificación más reciente (`ultimaModificacion` por id).
 */
export function resolverBalanceCruce<T extends { id: number }>(
  sirven: readonly T[],
  ultimaModificacion: ReadonlyMap<number, Date | string | null>,
  eleccion: { balanceId: number } | null,
): BalanceCruceResuelto<T> {
  const opciones = sirven
    .map((b, i) => ({ b, i, t: instanteDe(ultimaModificacion.get(b.id)) }))
    .sort((x, y) => y.t - x.t || x.i - y.i)
    .map((x) => x.b);
  const elegido = eleccion ? opciones.find((b) => b.id === eleccion.balanceId) ?? null : null;
  const eleccionCaida = eleccion != null && elegido == null;
  if (opciones.length === 0) return { balance: null, origen: null, opciones, eleccionCaida };
  if (opciones.length === 1) return { balance: opciones[0], origen: "unico", opciones, eleccionCaida };
  if (elegido) return { balance: elegido, origen: "elegido", opciones, eleccionCaida: false };
  return { balance: opciones[0], origen: "preseleccionado", opciones, eleccionCaida };
}

/** Un balance de la lista para escoger: lo que el usuario necesita para distinguirlos. */
export type OpcionBalanceCruce = {
  id: number;
  /** Texto del período del balance («Agosto 2026», «Enero – Agosto 2026»). */
  periodo: string;
  version: string;
  /** Apertura declarada («cuenta» | «tercero»); null en cargues anteriores a ese dato. */
  aperturaBalance: string | null;
  periodoInicio: string;
  periodoFin: string;
  /** Carga, último cambio de homologación o ajuste del prevalidador, lo más reciente (ISO). */
  ultimaModificacion: string | null;
};

export function opcionBalanceCruce(
  b: { id: number; periodo: string; version: string; aperturaBalance?: string | null; periodoInicio: Date; periodoFin: Date },
  ultimaModificacion: Date | string | null | undefined,
): OpcionBalanceCruce {
  return {
    id: b.id,
    periodo: b.periodo,
    version: b.version,
    aperturaBalance: b.aperturaBalance ?? null,
    periodoInicio: fechaCorteISO(b.periodoInicio),
    periodoFin: fechaCorteISO(b.periodoFin),
    ultimaModificacion: ultimaModificacion == null ? null : new Date(ultimaModificacion).toISOString(),
  };
}

/** Lo que la pantalla del cruce muestra de la elección del balance. */
export type EleccionBalanceVista = {
  origen: OrigenBalanceCruce;
  /** Con dos o más que sirven, la lista para escoger (la de modificación más reciente primero); si no, vacía. */
  opciones: OpcionBalanceCruce[];
  /** Quién escogió el balance en uso y cuándo (solo con origen «elegido»). */
  elegidoPor: string | null;
  elegidoEn: string | null;
  /** La elección guardada dejó de servir: el cruce volvió a preseleccionar. */
  aviso: string | null;
};

/** La más reciente de varias fechas (null si no hay ninguna). */
export function fechaMasReciente(...fechas: readonly (Date | string | null | undefined)[]): Date | null {
  let mayor: number | null = null;
  for (const f of fechas) {
    if (f == null) continue;
    const t = new Date(f).getTime();
    if (Number.isFinite(t) && (mayor == null || t > mayor)) mayor = t;
  }
  return mayor == null ? null : new Date(mayor);
}

/** Aviso cuando la elección guardada ya no sirve y el cruce volvió a preseleccionar. */
export function avisoEleccionCaida(resuelto: Pick<BalanceCruceResuelto<unknown>, "eleccionCaida" | "origen">): string | null {
  if (!resuelto.eleccionCaida || resuelto.origen == null) return null;
  return resuelto.origen === "unico"
    ? "El balance que se había escogido para este cruce ya no sirve (se abrió, otra versión lo reemplazó o no termina en la fecha de corte): el cruce usa el único balance cerrado que queda."
    : "El balance que se había escogido para este cruce ya no sirve (se abrió, otra versión lo reemplazó o no termina en la fecha de corte): se preseleccionó el de modificación más reciente. Escoge otro si no es el que corresponde.";
}

export type MotivoSinBalanceCruce =
  | "sin_balance_en_mes"
  | "sin_balance_en_fecha"
  | "sin_balance_cerrado"
  | "sin_balance_cerrado_por_terceros";

/** Por qué un cargue no tiene balance contra el que cruzar (null = sí lo tiene). */
export function motivoSinBalanceCruce<T extends CandidatoBalanceCruce>(
  candidatos: readonly T[],
  periodoModulo: string,
  opciones: OpcionesBalanceCruce & { modulo?: string } = {},
): { motivo: MotivoSinBalanceCruce; mensaje: string } | null {
  if (seleccionarBalanceCruceModulo(candidatos, periodoModulo, opciones)) return null;
  const fecha = fechaCorteDelCruce(periodoModulo, opciones.fechaCorte);
  const al = fecha ? fechaLegible(fecha) : periodoModulo;
  const delMes = candidatos.filter((c) => balanceTerminaEnPeriodo(c.periodoFin, periodoModulo));
  if (delMes.length === 0) {
    return { motivo: "sin_balance_en_mes", mensaje: `No hay un balance con corte al ${al}. Carga el balance del período en /balance y ciérralo para conciliar contra él.` };
  }
  const enFecha = delMes.filter((c) => terminaEn(c.periodoFin, fecha));
  if (enFecha.length === 0) {
    const otras = [...new Set(delMes.map((c) => fechaLegible(fechaCorteISO(c.periodoFin))))].join(", ");
    return {
      motivo: "sin_balance_en_fecha",
      mensaje: `Ningún balance termina el ${al}, la fecha de corte de este cargue: los de ese mes terminan el ${otras}. Corrige el período de ese balance o carga uno al ${al} y ciérralo.`,
    };
  }
  const cerrados = enFecha.filter((c) => c.estaCongelado && (!opciones.vigentes || opciones.vigentes.has(c.id)));
  if (cerrados.length === 0) {
    return { motivo: "sin_balance_cerrado", mensaje: `No hay un balance cerrado con corte al ${al}. Cierra el balance del período en /balance para conciliar contra él.` };
  }
  return {
    motivo: "sin_balance_cerrado_por_terceros",
    mensaje: `El balance cerrado con corte al ${al} no conserva el detalle por tercero, que ${opciones.modulo ?? "este módulo"} necesita. Carga uno «Por terceros» del mismo corte y ciérralo.`,
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
 * tener el prevalidador listo para el módulo y conservar una aprobación vigente. Con
 * `moduloCodigo` null no se exige que el módulo esté en el catálogo del prevalidador: Retención en
 * la fuente no entra a ese catálogo (cambiaría su huella y desactualizaría todas las aprobaciones).
 */
export function validarCompuertaPrevalidador(
  contexto: ContextoCompuertaCruce,
  clientId: number,
  moduloCodigo: string | null,
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
  if (moduloCodigo != null && !contexto.prevalidador.modulos.some((modulo) => modulo.codigo === moduloCodigo)) {
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
