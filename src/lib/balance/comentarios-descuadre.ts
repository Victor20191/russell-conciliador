// Un comentario por cada condición que deja «Descuadrado» un borrador (20/Oct/2026, decisión del
// usuario): la ecuación contable, la partida doble, las clases contra el archivo y las agrupadoras
// contra su desglose. Cada una que falla pide el suyo para cargar el borrador (no lo bloquea) y el
// balance cargado los conserva en la «Justificación del descuadre». La diferencia del archivo
// fuente es la ecuación: su comentario es el de la ecuación.
//
// Puro (sin BD ni view-model): lo usan el borrador, la acción que carga y la constancia.
import { MAX_COMENTARIO_PROMOCION } from "./advertencia-archivo-fuente";
import type { DescuadreAlCargarV2, MotivoConComentario, MotivoDescuadre, TipoMotivoDescuadre } from "./cuadre-borrador";

/** Las cuatro condiciones, en el orden en que se muestran y se piden sus comentarios. */
export const TIPOS_MOTIVO_DESCUADRE: readonly TipoMotivoDescuadre[] = ["ecuacion", "partida_doble", "clases", "agrupadoras"];

/** Nombre corto de cada condición: rótulo del campo y de los mensajes. */
export const ETIQUETA_CONDICION: Readonly<Record<TipoMotivoDescuadre, string>> = {
  ecuacion: "Ecuación contable",
  partida_doble: "Partida doble",
  clases: "Clases contra el archivo",
  agrupadoras: "Agrupadoras contra su desglose",
};

/** Campo del formulario que lleva el comentario de una condición. */
export function campoComentario(tipo: TipoMotivoDescuadre): string {
  return `comentarioDescuadre_${tipo}`;
}

export type ComentariosDescuadre = Partial<Record<TipoMotivoDescuadre, string>>;

/**
 * Condiciones que exigen comentario, en orden: las que fallan en el veredicto y, con la
 * diferencia del archivo fuente, la ecuación (aunque el veredicto no la traiga).
 */
export function tiposComentarioRequeridos(
  motivos: readonly Pick<MotivoDescuadre, "tipo">[],
  archivoFuente: boolean,
): TipoMotivoDescuadre[] {
  const tipos = new Set<TipoMotivoDescuadre>(motivos.map((m) => m.tipo));
  if (archivoFuente) tipos.add("ecuacion");
  return TIPOS_MOTIVO_DESCUADRE.filter((t) => tipos.has(t));
}

/** Lee los comentarios conocidos (solo los cuatro campos, recortados); el resto se ignora. */
export function leerComentariosDescuadre(obtener: (campo: string) => unknown): ComentariosDescuadre {
  const comentarios: ComentariosDescuadre = {};
  for (const tipo of TIPOS_MOTIVO_DESCUADRE) {
    const valor = obtener(campoComentario(tipo));
    if (typeof valor === "string" && valor.trim().length > 0) comentarios[tipo] = valor.trim();
  }
  return comentarios;
}

const lista = (tipos: readonly TipoMotivoDescuadre[]) => tipos.map((t) => `«${ETIQUETA_CONDICION[t]}»`).join(", ");

/**
 * Valida que cada condición requerida tenga su comentario y que ninguno pase del máximo. El
 * servidor la vuelve a aplicar con el veredicto que recalcula: el navegador no decide qué falta.
 */
export function validarComentariosDescuadre(
  comentarios: ComentariosDescuadre,
  requeridos: readonly TipoMotivoDescuadre[],
  archivoFuente = false,
): { ok: true; comentarios: ComentariosDescuadre } | { ok: false; message: string } {
  const largos = TIPOS_MOTIVO_DESCUADRE.filter((t) => (comentarios[t]?.length ?? 0) > MAX_COMENTARIO_PROMOCION);
  if (largos.length > 0) {
    return { ok: false, message: `El comentario de ${lista(largos)} no puede superar ${MAX_COMENTARIO_PROMOCION} caracteres.` };
  }
  const faltan = requeridos.filter((t) => !comentarios[t]);
  if (faltan.length > 0) {
    if (archivoFuente && faltan.length === 1 && faltan[0] === "ecuacion") {
      return { ok: false, message: "Escribe un comentario para cargar este balance con la diferencia del archivo fuente." };
    }
    return {
      ok: false,
      message: faltan.length === 1
        ? `El borrador está descuadrado: falta el comentario de ${lista(faltan)}.`
        : `El borrador está descuadrado: escribe el comentario de cada condición que falla (${lista(faltan)}).`,
    };
  }
  const solo: ComentariosDescuadre = {};
  for (const t of requeridos) solo[t] = comentarios[t];
  return { ok: true, comentarios: solo };
}

/** Cada condición del veredicto con su comentario (los requeridos ya se validaron). */
export function motivosConComentario(
  motivos: readonly MotivoDescuadre[],
  comentarios: ComentariosDescuadre,
): MotivoConComentario[] {
  return motivos.flatMap((m) => {
    const comentario = comentarios[m.tipo];
    return comentario ? [{ ...m, comentario }] : [];
  });
}

/**
 * Texto plano de los comentarios para `comentario_aprobacion`, la auditoría y el historial de
 * versiones: con la diferencia del archivo fuente, solo el de la ecuación (como siempre); si no,
 * una línea «Condición: comentario» por cada una.
 */
export function textoPlanoComentarios(constancia: Pick<DescuadreAlCargarV2, "origen" | "motivos">): string | null {
  if (constancia.origen === "archivo_fuente") {
    const ecuacion = constancia.motivos.find((m) => m.tipo === "ecuacion");
    if (ecuacion) {
      const otros = constancia.motivos.filter((m) => m.tipo !== "ecuacion");
      return otros.length === 0
        ? ecuacion.comentario
        : [ecuacion.comentario, ...otros.map((m) => `${ETIQUETA_CONDICION[m.tipo]}: ${m.comentario}`)].join("\n");
    }
  }
  const lineas = constancia.motivos.map((m) => `${ETIQUETA_CONDICION[m.tipo]}: ${m.comentario}`);
  return lineas.length > 0 ? lineas.join("\n") : null;
}
