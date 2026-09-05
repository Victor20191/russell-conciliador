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

/** Cuentas Russell (4 díg.) que participan en el cruce del módulo: las de la cédula. */
export function cuentasRussellDelCruce(cruce: Pick<ResumenCruceContable, "filas">): string[] {
  return [...new Set(cruce.filas.map((f) => f.cuenta4))].sort();
}

/**
 * Cuentas del balance que se bloquean: las filas homologadas a una cuenta Russell
 * del módulo. Las filas sin homologación no forman parte del cruce y no se bloquean.
 * Cubre indistintamente `balance_prueba_detalle` y `balance_tercero_detalle`
 * (mismos códigos); las repetidas (tercero) se colapsan por cuenta_8.
 */
export function cuentasBloqueoDelModulo(
  detalle: readonly FilaDetalleBloqueo[],
  cuentasRussellModulo: ReadonlySet<string> | readonly string[],
): CuentaBloqueada[] {
  const modulo = cuentasRussellModulo instanceof Set ? cuentasRussellModulo : new Set(cuentasRussellModulo);
  const porCuenta = new Map<string, CuentaBloqueada>();
  for (const fila of detalle) {
    const c4 = cuenta4Russell(fila.cuenta6Russell);
    if (!c4 || !modulo.has(c4)) continue;
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

/**
 * Precondición del cierre: el cruce cuadra, o TODAS sus diferencias tienen marca de
 * auditoría vigente (una marca cuyo monto cambió después de escribirse no explica la
 * cifra actual: cuenta como pendiente).
 */
export function evaluarCierreConciliacion(
  cruce: Pick<ResumenCruceContable, "filas"> | null,
  resumenMarcas: ResumenMarcas | null,
): EvaluacionCierre {
  if (!cruce || cruce.filas.length === 0) {
    return { ok: false, motivo: "No hay cuentas cruzadas en este período: nada que cerrar." };
  }
  const conDiferencia = cruce.filas.filter((f) => !f.cuadra).length;
  if (conDiferencia === 0) return { ok: true };
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
  cuentasRussellCerradas: ReadonlySet<string>,
): ViolacionBloqueo[] {
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
    const c4 = cuenta4Russell(n.cuenta6Russell);
    if (c4 && cuentasRussellCerradas.has(c4)) {
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
