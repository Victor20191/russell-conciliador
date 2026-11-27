// Las respuestas de la carga que SUPONE la prueba del mapeo en el editor de patrones. Puro y sin
// dependencias de servidor: lo usa el panel de la prueba en el navegador.
//
// El editor no tiene carga: no hay a quién preguntarle si el archivo trae total, qué trae, cómo
// se agrupa… Pero el borrador sale del mapeo MÁS esas respuestas (`mapeoDeCarga`), así que la
// prueba las pide también, ya respondidas con lo más habitual, y las manda con los MISMOS campos
// que el modal de carga. El servidor las lee con el mismo lector (`respuestasCargaDeFormulario`).
import type { SpecModulo } from "./extraccion/esquema";
import type { PreguntasCarga } from "./mapeo-de-carga";

export type RespuestasPrueba = {
  /** «¿El archivo trae el valor total?» */
  total: "si" | "no";
  /** La celda del total como en Excel («M160»), con «Sí». */
  celdaTotal: string;
  /** TRM de cierre de una hoja en divisa, tal como se escribe («4.150,25»). */
  trm: string;
  separarCentro: "si" | "no";
  /** Vacío = la primera opción que el mapeo permite. */
  agruparPor: string;
  contenido: string;
  signoVentas: string;
  signoNotasCredito: string;
  contenidoActivos: string;
  /** Mes de corte AAAA-MM; vacío = sin mes (entran todas las filas). */
  mes: string;
};

/** Lo que se supone mientras el administrador no cambie nada: el caso más común de la carga. */
export const RESPUESTAS_PRUEBA_INICIALES: RespuestasPrueba = {
  total: "no",
  celdaTotal: "",
  trm: "",
  separarCentro: "si",
  agruparPor: "",
  contenido: "mixto",
  signoVentas: "positivo",
  signoNotasCredito: "negativo",
  contenidoActivos: "ambos",
  mes: "",
};

export type PreguntasVisibles = {
  total: boolean;
  trm: boolean;
  centro: boolean;
  agruparPor: { id: string; etiqueta: string }[];
  contenido: boolean;
  contenidoActivos: boolean;
  mes: boolean;
};

/** Las preguntas que el modal haría con ESTE mapeo (el centro y la agrupación dependen de él). */
export function preguntasVisibles(preguntas: PreguntasCarga, spec: Pick<SpecModulo, "columnas" | "monedaArchivo">): PreguntasVisibles {
  return {
    total: preguntas.total,
    trm: preguntas.trm && !!spec.monedaArchivo && spec.monedaArchivo !== "COP",
    centro: preguntas.centroCosto && (spec.columnas.agrupador ?? 0) >= 1,
    agruparPor: (preguntas.agruparPor ?? []).filter((o) => (spec.columnas[o.rol] ?? 0) >= 1).map(({ id, etiqueta }) => ({ id, etiqueta })),
    contenido: preguntas.contenido,
    contenidoActivos: preguntas.contenidoActivos,
    mes: preguntas.mesDeCorte,
  };
}

/** «4.150,25» o «4150.25» → «4150.25». */
function numeroEscrito(texto: string): string {
  const limpio = texto.trim().replace(/\s/g, "");
  return limpio.includes(",") ? limpio.replace(/\./g, "").replace(",", ".") : limpio;
}

/**
 * Los campos del formulario que manda la prueba: los MISMOS nombres que manda el modal de carga
 * («totalArchivo», «separarAgrupador», «contenidoArchivo»…), solo de las preguntas que aplican.
 */
export function camposRespuestasPrueba(
  preguntas: PreguntasCarga,
  spec: Pick<SpecModulo, "columnas" | "monedaArchivo">,
  r: RespuestasPrueba,
): Record<string, string> {
  const visibles = preguntasVisibles(preguntas, spec);
  const campos: Record<string, string> = {};
  if (visibles.total) {
    campos.totalArchivo = r.total;
    if (r.total === "si") campos.celdaTotal = r.celdaTotal.trim();
  }
  if (visibles.trm && r.trm.trim()) campos.trmCierre = numeroEscrito(r.trm);
  if (visibles.centro) campos.separarAgrupador = r.separarCentro;
  if (visibles.agruparPor.length > 0) {
    const elegida = visibles.agruparPor.find((o) => o.id === r.agruparPor) ?? visibles.agruparPor[0];
    campos.agruparPor = elegida.id;
  }
  if (visibles.contenido) {
    campos.contenidoArchivo = r.contenido;
    if (r.contenido !== "notas_credito") campos.signoVentas = r.signoVentas;
    if (r.contenido !== "facturas") campos.signoNotasCredito = r.signoNotasCredito;
  }
  if (visibles.contenidoActivos) campos.contenidoActivos = r.contenidoActivos;
  if (visibles.mes && /^\d{4}-\d{2}$/.test(r.mes)) campos.periodoFin = `${r.mes}-01`;
  return campos;
}
