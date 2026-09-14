/**
 * CONCILIACIÓN EN FIRME — lógica PURA (sin BD, sin sesión).
 *
 * Al cerrar la conciliación de un módulo (Cruce contable) contra el balance de un
 * período, las cuentas ORIGINALES del cliente (cuenta_8) que pertenecen al módulo
 * quedan bloqueadas para ese período. Este archivo decide:
 *
 *  - qué cuentas del balance se bloquean (`cuentasBloqueoDelModulo`);
 *  - si el cruce está en condiciones de cerrarse (`evaluarCierreConciliacion`);
 *  - si una versión NUEVA del balance altera lo conciliado (`evaluarCambiosBloqueados`).
 *
 * La persistencia (`conciliacion_modulo_cierre` + `cuenta_bloqueada_conciliacion`) y
 * los gates viven en `verificar-bloqueo.ts` (server-only) y en las Server Actions.
 */
import type { ResumenCruceContable } from "@/lib/modulos/cruce-contable";
import type { ResumenMarcas } from "@/lib/modulos/marcas-cruce";

export const ESTADO_CIERRE_FIRME = "firme";
export const ESTADO_CIERRE_DESBLOQUEADO = "desbloqueado";

export const MIN_JUSTIFICACION_DESBLOQUEO = 10;
export const MAX_JUSTIFICACION_DESBLOQUEO = 2000;

/** Fila del detalle del balance tal como la necesita el bloqueo. */
export type FilaDetalleBloqueo = {
  cuenta8: string;
  cuenta6Russell: string | null;
  saldoInicial: number;
  debitos: number;
  creditos: number;
  saldoFinal: number;
};

/** Snapshot que se congela por cuenta bloqueada. */
export type CuentaBloqueada = FilaDetalleBloqueo;

/** Cuenta Russell de 4 dígitos a la que homologa una fila, o null si no está homologada. */
export function cuenta4Russell(cuenta6Russell: string | null | undefined): string | null {
  const c = (cuenta6Russell ?? "").replace(/\D/g, "").slice(0, 4);
  return c.length === 4 ? c : null;
}

/**
 * Cuentas Russell (4 díg.) que participan en el cruce del módulo: las de la cédula. En una
 * cédula a 6 dígitos (Nómina) la clave de la fila es la cuenta completa: aquí se reduce al
 * subgrupo, que es lo que `cuentasRussell` del cierre siempre ha guardado; las cuentas de 6
 * que acotan el bloqueo viajan aparte en `cuentasRussell6`.
 */
export function cuentasRussellDelCruce(cruce: Pick<ResumenCruceContable, "filas">): string[] {
  return [...new Set(cruce.filas.map((f) => f.cuenta4.replace(/\D/g, "").slice(0, 4)).filter((c) => c.length === 4))].sort();
}

/**
 * Lo que un conjunto de cierres deja en firme: por cuenta Russell de 6 dígitos cuando el cierre
 * las declara (módulos que concilian por tercero), por cuenta de 4 en los demás y en los cierres
 * anteriores a esa distinción.
 */
export type AlcanceCierres = { cuentas4: ReadonlySet<string>; cuentas6: ReadonlySet<string> };

export function alcanceDeCierres(
  cierres: readonly { cuentasRussell: readonly string[]; cuentasRussell6?: readonly string[] | null }[],
): AlcanceCierres {
  const cuentas4 = new Set<string>();
  const cuentas6 = new Set<string>();
  for (const c of cierres) {
    if (c.cuentasRussell6?.length) for (const cuenta of c.cuentasRussell6) cuentas6.add(cuenta);
    else for (const cuenta of c.cuentasRussell) cuentas4.add(cuenta);
  }
  return { cuentas4, cuentas6 };
}

/** ¿Una cuenta homologada a `cuenta6Russell` cae en lo que el alcance deja en firme? */
export function entraEnAlcance(cuenta6Russell: string | null | undefined, alcance: AlcanceCierres): boolean {
  const digitos = (cuenta6Russell ?? "").replace(/\D/g, "");
  if (digitos.length >= 6 && alcance.cuentas6.has(digitos.slice(0, 6))) return true;
  const c4 = cuenta4Russell(cuenta6Russell);
  return c4 != null && alcance.cuentas4.has(c4);
}

/**
 * Cuentas del balance que se bloquean: las filas homologadas a una cuenta Russell
 * del módulo. Las filas sin homologación no forman parte del cruce y no se bloquean.
 * Con las cuentas de 6 dígitos del módulo (Cartera, CxP) se bloquean solo esas: una
 * 130515 de trabajadores no queda en firme aunque su cuenta de 4 esté en la cédula.
 * Cubre indistintamente `balance_prueba_detalle` y `balance_tercero_detalle`
 * (mismos códigos); las repetidas (tercero) se colapsan por cuenta_8.
 */
export function cuentasBloqueoDelModulo(
  detalle: readonly FilaDetalleBloqueo[],
  cuentasRussellModulo: ReadonlySet<string> | readonly string[],
  cuentasRussell6?: readonly string[] | null,
): CuentaBloqueada[] {
  const alcance: AlcanceCierres = cuentasRussell6?.length
    ? { cuentas4: new Set(), cuentas6: new Set(cuentasRussell6) }
    : { cuentas4: cuentasRussellModulo instanceof Set ? cuentasRussellModulo : new Set(cuentasRussellModulo), cuentas6: new Set() };
  const porCuenta = new Map<string, CuentaBloqueada>();
  for (const fila of detalle) {
    if (!entraEnAlcance(fila.cuenta6Russell, alcance)) continue;
    const cuenta8 = fila.cuenta8.replace(/\D/g, "");
    if (!cuenta8 || porCuenta.has(cuenta8)) continue;
    porCuenta.set(cuenta8, {
      cuenta8,
      cuenta6Russell: fila.cuenta6Russell,
      saldoInicial: redondear(fila.saldoInicial),
      debitos: redondear(fila.debitos),
      creditos: redondear(fila.creditos),
      saldoFinal: redondear(fila.saldoFinal),
    });
  }
  return [...porCuenta.values()].sort((a, b) => a.cuenta8.localeCompare(b.cuenta8));
}

export type EvaluacionCierre = { ok: true } | { ok: false; motivo: string };

/** Estado del cruce por tercero que el cierre exige en los módulos que lo declaran. */
export type CierreCruceTercero = {
  /** `crucePorTercero.exigidoParaCierre` del descriptor. */
  exigido: boolean;
  /** `listo` cuando hay cruce; cualquier otro estado explica por qué no. */
  estado: string;
  mensaje: string | null;
  resumenMarcas: ResumenMarcas | null;
};

/**
 * Precondición del cierre: el cruce cuadra, o TODAS sus diferencias tienen marca de
 * auditoría vigente (una marca cuyo monto cambió después de escribirse no explica la
 * cifra actual: cuenta como pendiente). Donde el módulo exige el cruce por tercero, además
 * tiene que estar disponible y con marca en toda diferencia que alcance el umbral.
 */
export function evaluarCierreConciliacion(
  cruce: Pick<ResumenCruceContable, "filas"> | null,
  resumenMarcas: ResumenMarcas | null,
  tercero?: CierreCruceTercero | null,
): EvaluacionCierre {
  if (!cruce || cruce.filas.length === 0) {
    return { ok: false, motivo: "No hay cuentas cruzadas en este período: nada que cerrar." };
  }
  const conDiferencia = cruce.filas.filter((f) => !f.cuadra).length;
  if (conDiferencia > 0) {
    if (!resumenMarcas) {
      return { ok: false, motivo: `Hay ${conDiferencia} diferencia(s) sin marca de auditoría.` };
    }
    if (resumenMarcas.pendientes > 0) {
      return {
        ok: false,
        motivo: `Quedan ${resumenMarcas.pendientes} diferencia(s) sin marca de auditoría. Márcalas antes de cerrar la conciliación.`,
      };
    }
    if (resumenMarcas.desactualizadas > 0) {
      return {
        ok: false,
        motivo: `${resumenMarcas.desactualizadas} marca(s) quedaron desactualizadas: la diferencia cambió después de escribirlas. Revísalas antes de cerrar.`,
      };
    }
  }

  if (!tercero?.exigido) return { ok: true };
  if (tercero.estado !== "listo" || !tercero.resumenMarcas) {
    return {
      ok: false,
      motivo: `El cruce por tercero es obligatorio para cerrar y no está disponible: ${tercero.mensaje ?? "no hay balance por tercero del período."}`,
    };
  }
  if (tercero.resumenMarcas.pendientes > 0) {
    return {
      ok: false,
      motivo: `Quedan ${tercero.resumenMarcas.pendientes} diferencia(s) por tercero sin marca de auditoría. Márcalas o empareja los terceros antes de cerrar la conciliación.`,
    };
  }
  if (tercero.resumenMarcas.desactualizadas > 0) {
    return {
      ok: false,
      motivo: `${tercero.resumenMarcas.desactualizadas} marca(s) del cruce por tercero quedaron desactualizadas: la diferencia cambió después de escribirlas. Revísalas antes de cerrar.`,
    };
  }
  return { ok: true };
}

export type ViolacionBloqueo = {
  cuenta8: string;
  motivo: "valores" | "homologacion" | "ausente" | "nueva_en_modulo";
  detalle: string;
};

/**
 * ¿Una versión nueva del balance altera lo conciliado? Compara cada cuenta bloqueada
 * contra la fila equivalente de la versión nueva (importes y homologación); una cuenta
 * bloqueada que desaparece también altera el cruce. Además, una cuenta NO bloqueada que
 * llega homologada a una cuenta Russell del módulo cerrado entraría al cruce sin haber
 * sido conciliada (regla: no homologar cuentas nuevas a cuentas bloqueadas).
 */
export function evaluarCambiosBloqueados(
  bloqueadas: readonly CuentaBloqueada[],
  nuevas: readonly FilaDetalleBloqueo[],
  /** Cuentas de 4 dígitos cerradas, o el alcance completo de los cierres (4 y 6 dígitos). */
  cuentasRussellCerradas: ReadonlySet<string> | AlcanceCierres,
): ViolacionBloqueo[] {
  const alcance: AlcanceCierres = "cuentas4" in cuentasRussellCerradas
    ? cuentasRussellCerradas
    : { cuentas4: cuentasRussellCerradas, cuentas6: new Set() };
  const violaciones: ViolacionBloqueo[] = [];
  const nuevasPorCuenta = new Map<string, FilaDetalleBloqueo>();
  for (const n of nuevas) {
    const c = n.cuenta8.replace(/\D/g, "");
    if (c && !nuevasPorCuenta.has(c)) nuevasPorCuenta.set(c, n);
  }
  const bloqueadasSet = new Set(bloqueadas.map((b) => b.cuenta8));

  for (const b of bloqueadas) {
    const n = nuevasPorCuenta.get(b.cuenta8);
    if (!n) {
      violaciones.push({ cuenta8: b.cuenta8, motivo: "ausente", detalle: `${b.cuenta8} no viene en la versión nueva` });
      continue;
    }
    const cambios: string[] = [];
    if (redondear(n.saldoInicial) !== b.saldoInicial) cambios.push("saldo inicial");
    if (redondear(n.debitos) !== b.debitos) cambios.push("débitos");
    if (redondear(n.creditos) !== b.creditos) cambios.push("créditos");
    if (redondear(n.saldoFinal) !== b.saldoFinal) cambios.push("saldo final");
    if (cambios.length > 0) {
      violaciones.push({ cuenta8: b.cuenta8, motivo: "valores", detalle: `${b.cuenta8} cambia ${cambios.join(", ")}` });
    }
    if ((n.cuenta6Russell ?? null) !== (b.cuenta6Russell ?? null)) {
      violaciones.push({
        cuenta8: b.cuenta8,
        motivo: "homologacion",
        detalle: `${b.cuenta8} cambia de homologación (${b.cuenta6Russell ?? "sin estándar"} → ${n.cuenta6Russell ?? "sin estándar"})`,
      });
    }
  }

  for (const [cuenta8, n] of nuevasPorCuenta) {
    if (bloqueadasSet.has(cuenta8)) continue;
    if (entraEnAlcance(n.cuenta6Russell, alcance)) {
      violaciones.push({
        cuenta8,
        motivo: "nueva_en_modulo",
        detalle: `${cuenta8} entraría al módulo conciliado (homologada a ${n.cuenta6Russell})`,
      });
    }
  }
  return violaciones;
}

/** Texto único del bloqueo para toasts/errores: nombra módulo, período y cierre. */
export function mensajeConciliacionEnFirme(
  cierres: readonly { moduloCodigo: string; periodo: string; cerradoPor: string; moduloDatoEncabezadoId: number }[],
  violaciones?: readonly ViolacionBloqueo[],
): string {
  const lista = cierres
    .map((c) => `${c.moduloCodigo} · ${c.periodo} (cargue #${c.moduloDatoEncabezadoId}, cerró ${c.cerradoPor})`)
    .join("; ");
  const base = `El balance está en firme por la conciliación cerrada de ${lista}.`;
  if (!violaciones || violaciones.length === 0) {
    return `${base} Pide al senior o gerente del cliente que desbloquee la conciliación para continuar.`;
  }
  const muestra = violaciones.slice(0, 3).map((v) => v.detalle).join("; ");
  const resto = violaciones.length > 3 ? ` y ${violaciones.length - 3} más` : "";
  return `${base} Esta operación altera cuentas conciliadas: ${muestra}${resto}. Pide al senior o gerente del cliente que desbloquee la conciliación para continuar.`;
}

/** Cierre en firme reducido a lo que necesita la decisión de congelar (forma estructural de `CierreFirme`). */
export type CierreParaCongelar = {
  id: number;
  moduloCodigo: string;
  periodo: string;
  balancePeriodo: string;
  balanceEncabezadoId: number;
  moduloDatoEncabezadoId: number;
  cerradoPor: string;
  cuentasRussell: string[];
  /** Cuentas de 6 dígitos del cierre; ausente o vacío en los cierres por cuenta de 4. */
  cuentasRussell6?: string[];
};

export type DecisionCongelar =
  | { tipo: "sin_cierres" }
  | { tipo: "mismo_balance" }
  | { tipo: "traslado"; cierres: CierreParaCongelar[]; cuentasEnFirme: number }
  | { tipo: "bloqueado"; cierres: CierreParaCongelar[]; violaciones: ViolacionBloqueo[] };

/**
 * ¿Se puede congelar como oficial un balance en un período con conciliaciones en firme?
 *
 * Cargar una versión nueva ya se juzga por CONTENIDO (`evaluarCambiosBloqueados`): entra
 * si no altera ninguna cuenta en firme ni mete cuentas nuevas al módulo cerrado.
 * Congelarla se juzgaba por IDENTIDAD —cualquier cierre que apuntara a otro balance la
 * rechazaba— y obligaba a un desbloqueo con justificación para una versión que la
 * plataforma acababa de admitir precisamente por no tocar la conciliación. Aquí se
 * aplica el mismo predicado a las dos operaciones:
 *
 *  - sin cierres, o todos apuntando ya a este balance → se congela como siempre;
 *  - algún cierre apunta a OTRO balance y las cuentas en firme son idénticas →
 *    `traslado`: se puede congelar y ese cierre debe pasar a esta versión (la foto por
 *    cuenta no cambia: es idéntica por definición del predicado);
 *  - alguna cuenta en firme cambia → `bloqueado`, con el detalle de qué cambió.
 *
 * `cuentasEnFirme` cuenta las cuentas de los cierres que se trasladan; si las filas
 * traen `cierreId`, las de un cierre que ya apunta a este balance no se cuentan.
 */
export function decidirCongelarConCierres(p: {
  balanceId: number;
  cierres: readonly CierreParaCongelar[];
  bloqueadas: readonly (CuentaBloqueada & { cierreId?: number })[];
  filasNuevas: readonly FilaDetalleBloqueo[];
}): DecisionCongelar {
  if (p.cierres.length === 0) return { tipo: "sin_cierres" };
  const ajenos = p.cierres.filter((c) => c.balanceEncabezadoId !== p.balanceId);
  if (ajenos.length === 0) return { tipo: "mismo_balance" };
  const cerradas = alcanceDeCierres(ajenos);
  const violaciones = evaluarCambiosBloqueados(p.bloqueadas, p.filasNuevas, cerradas);
  if (violaciones.length > 0) return { tipo: "bloqueado", cierres: ajenos, violaciones };
  const ajenosIds = new Set(ajenos.map((c) => c.id));
  const cuentasEnFirme = p.bloqueadas.filter((b) => b.cierreId == null || ajenosIds.has(b.cierreId)).length;
  return { tipo: "traslado", cierres: ajenos, cuentasEnFirme };
}

/** Texto único —modal y auditoría— del traslado del cierre a la versión que se congela. */
export function mensajeTrasladoCierre(
  cierres: readonly Pick<CierreParaCongelar, "moduloCodigo" | "periodo" | "moduloDatoEncabezadoId" | "cerradoPor">[],
  cuentasEnFirme: number,
): string {
  const lista = cierres
    .map((c) => `${c.moduloCodigo} · ${c.periodo} (cargue #${c.moduloDatoEncabezadoId}, cerró ${c.cerradoPor})`)
    .join("; ");
  const plural = cuentasEnFirme === 1 ? "cuenta en firme idéntica" : "cuentas en firme idénticas";
  return `Esta versión conserva ${cuentasEnFirme} ${plural} en importes y homologación. Al congelarla como oficial, el cierre de ${lista} pasará a esta versión.`;
}

/** Validación de la justificación del desbloqueo (obligatoria). */
export function validarJustificacionDesbloqueo(texto: string): { ok: true; justificacion: string } | { ok: false; message: string } {
  const justificacion = (texto ?? "").replace(/\s+/g, " ").trim();
  if (justificacion.length < MIN_JUSTIFICACION_DESBLOQUEO) {
    return { ok: false, message: `La justificación es obligatoria (mínimo ${MIN_JUSTIFICACION_DESBLOQUEO} caracteres).` };
  }
  if (justificacion.length > MAX_JUSTIFICACION_DESBLOQUEO) {
    return { ok: false, message: `La justificación no puede superar ${MAX_JUSTIFICACION_DESBLOQUEO} caracteres.` };
  }
  return { ok: true, justificacion };
}

/** ¿El usuario puede cerrar/desbloquear? Senior o gerente ASIGNADO al cliente; el alcance global lo resuelve el RBAC. */
export function esResponsableSeniorOGerente(
  asignaciones: readonly { role: string; userId: number; active: boolean; validUntil: Date | null; validFrom: Date }[],
  userId: number,
  ahora: Date = new Date(),
): boolean {
  return asignaciones.some(
    (a) =>
      a.userId === userId &&
      a.active &&
      (a.role === "senior" || a.role === "gerente") &&
      a.validFrom <= ahora &&
      (a.validUntil == null || a.validUntil >= ahora),
  );
}

function redondear(v: number): number {
  return Math.round(v * 100) / 100 + 0 || 0;
}
