/**
 * Justificación de las DIFERENCIAS del cruce contable de un módulo.
 *
 * Lógica PURA (sin BD): decide qué filas del cruce admiten justificación, les pega la
 * que ya exista y resume cuánto queda por justificar. La persistencia vive en
 * `justificacion_cruce_modulo` y las Server Actions de `modulos-datos.ts`.
 *
 * La justificación se guarda por (cliente, módulo, período, cuenta) —no por cargue—, así
 * que sobrevive a las versiones nuevas del período. Como el monto SÍ puede cambiar entre
 * versiones, se congela el que se justificó: si la diferencia actual ya no coincide, la
 * fila queda marcada como `desactualizada` para que alguien la revise en vez de darla por
 * explicada.
 */
import type { FilaCruceContable } from "./cruce-contable";

/** Tolerancia por defecto del cruce (la misma de `construirCruceContable`). */
export const TOLERANCIA_CRUCE = 0.01;

export type JustificacionCruce = {
  cuenta4: string;
  nota: string;
  /** Diferencia que había cuando se justificó (snapshot). */
  diferencia: number;
  justificadoPor: string | null;
  /** Fecha ya formateada para la UI. */
  justificadoEn: string;
  /** Comentario del hilo de la cuenta donde quedó la nota, si se registró. */
  comentarioId: number | null;
};

export type FilaCruceJustificada = FilaCruceContable & {
  /** Solo las filas que NO cuadran admiten justificación. */
  admiteJustificacion: boolean;
  justificacion: JustificacionCruce | null;
  /** Hay justificación, pero la diferencia cambió desde que se escribió. */
  desactualizada: boolean;
};

export type ResumenJustificaciones = {
  /** Filas con diferencia (las que admiten justificación). */
  conDiferencia: number;
  justificadas: number;
  /** Con diferencia y sin justificar. */
  pendientes: number;
  /** Justificadas cuyo monto cambió desde la nota. */
  desactualizadas: number;
  /** Suma de las diferencias todavía sin justificar. */
  montoPendiente: number;
};

const redondear = (v: number): number => Math.round(v * 100) / 100 + 0 || 0;

/** ¿La fila del cruce admite justificación? Solo las que no cuadran. */
export function admiteJustificacion(fila: Pick<FilaCruceContable, "cuadra">): boolean {
  return !fila.cuadra;
}

/**
 * Pega a cada fila del cruce su justificación (si existe) y resume lo pendiente.
 *
 * Una justificación de una cuenta que YA cuadra no se pierde ni estorba: la fila deja de
 * admitir justificación y no se cuenta como pendiente, pero la nota sigue viajando en la
 * fila para que la pantalla pueda mostrarla como antecedente.
 */
export function anotarCruceConJustificaciones(
  filas: readonly FilaCruceContable[],
  justificaciones: readonly JustificacionCruce[],
  opciones?: { tolerancia?: number },
): { filas: FilaCruceJustificada[]; resumen: ResumenJustificaciones } {
  const tolerancia = opciones?.tolerancia ?? TOLERANCIA_CRUCE;
  const porCuenta = new Map(justificaciones.map((j) => [j.cuenta4, j]));

  const anotadas: FilaCruceJustificada[] = filas.map((fila) => {
    const justificacion = porCuenta.get(fila.cuenta4) ?? null;
    const admite = admiteJustificacion(fila);
    return {
      ...fila,
      admiteJustificacion: admite,
      justificacion,
      desactualizada:
        justificacion != null
        && admite
        && Math.abs(fila.diferencia - justificacion.diferencia) > tolerancia,
    };
  });

  const resumen = anotadas.reduce<ResumenJustificaciones>(
    (acc, fila) => {
      if (!fila.admiteJustificacion) return acc;
      acc.conDiferencia += 1;
      if (fila.justificacion) {
        acc.justificadas += 1;
        if (fila.desactualizada) acc.desactualizadas += 1;
      } else {
        acc.pendientes += 1;
        acc.montoPendiente = redondear(acc.montoPendiente + fila.diferencia);
      }
      return acc;
    },
    { conDiferencia: 0, justificadas: 0, pendientes: 0, desactualizadas: 0, montoPendiente: 0 },
  );

  return { filas: anotadas, resumen };
}

/** Ancla del hilo de comentarios de una cuenta del cruce (`cruce:1435`). */
export function anclaCruce(cuenta4: string): string {
  return `cruce:${cuenta4}`;
}

/** Cuenta Russell de 4 dígitos normalizada, o null si el texto no lo es. */
export function normalizarCuenta4(valor: string): string | null {
  const soloDigitos = (valor ?? "").replace(/\D/g, "");
  return soloDigitos.length === 4 ? soloDigitos : null;
}

export const MAX_NOTA_JUSTIFICACION = 2000;

/** Valida la nota escrita por el usuario; devuelve el texto limpio o el error a mostrar. */
export function validarNotaJustificacion(nota: string): { ok: true; nota: string } | { ok: false; message: string } {
  const limpia = (nota ?? "").trim();
  if (!limpia) return { ok: false, message: "Escribe la justificación de la diferencia." };
  if (limpia.length > MAX_NOTA_JUSTIFICACION) {
    return { ok: false, message: `La justificación no puede superar ${MAX_NOTA_JUSTIFICACION} caracteres.` };
  }
  return { ok: true, nota: limpia };
}
