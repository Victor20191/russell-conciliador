import type { ValidacionContable } from "./calcular";
import type { Hallazgo, PartidaDobleInfo } from "./diagnostico";

export const MAX_COMENTARIO_PROMOCION = 1000;

export type ValidacionComentarioPromocion =
  | { ok: true; comentario: string | null }
  | { ok: false; message: string };

/**
 * Distingue un descuadre generado por la estructura del borrador de una
 * inconsistencia que ya viene en el archivo fuente.
 *
 * Si la partida doble cuadra, cada total calculado coincide con el total que
 * trae el archivo y no hay alertas por cuenta, la ecuación no puede corregirse
 * desde Russell: el archivo de origen ya contiene esa diferencia.
 */
export function esDescuadreDelArchivoFuente(
  validacion: ValidacionContable,
  partidaDoble: PartidaDobleInfo,
  hallazgos: Hallazgo[],
): boolean {
  const totalesCruzan = [
    validacion.activoCuadra,
    validacion.pasivoCuadra,
    validacion.patrimonioCuadra,
    validacion.ingresosCuadra,
    validacion.gastosCuadra,
    validacion.costosCuadra,
    validacion.resultadoCuadra,
  ].every((cuadra) => cuadra === true);

  const hayAlertaPorCuenta = hallazgos.some(
    (hallazgo) =>
      hallazgo.tipo === "clase" ||
      hallazgo.tipo === "nodo" ||
      hallazgo.tipo === "lados_invertidos",
  );

  return (
    partidaDoble.cuadra &&
    !validacion.ecuacionCuadra &&
    totalesCruzan &&
    !hayAlertaPorCuenta
  );
}

/**
 * Normaliza y valida el comentario que acompaña la promoción del borrador.
 * El servidor vuelve a aplicar esta regla: el `required` del navegador mejora
 * la experiencia, pero no es la frontera de validación.
 */
export function validarComentarioPromocion(
  valor: unknown,
  requerido: boolean,
): ValidacionComentarioPromocion {
  const comentario = typeof valor === "string" ? valor.trim() : "";

  if (comentario.length > MAX_COMENTARIO_PROMOCION) {
    return {
      ok: false,
      message: `El comentario no puede superar ${MAX_COMENTARIO_PROMOCION} caracteres.`,
    };
  }
  if (requerido && comentario.length === 0) {
    return {
      ok: false,
      message: "Escribe un comentario para cargar este balance con la diferencia del archivo fuente.",
    };
  }

  return { ok: true, comentario: comentario || null };
}
