import "server-only";
import { iaDisponible } from "@/lib/anthropic";
import { MODULOS_IMPORT } from "../descriptores";
import { sugerirSpec } from "../extraccion/sugerir";
import { ErrorProveedorAsistenciaInventario, proponerSpecInventarioIA, type PreguntaInventarioIA } from "./ia";
import { validarLecturaInventario } from "./validar";
import { resultadoInventarioVacio, type EntradaAsistenciaInventario, type ResultadoAsistenciaInventario, type PreguntaAsistenciaInventario, type EvidenciaCeldaInventario } from "./tipos";

export type { EntradaAsistenciaInventario, ResultadoAsistenciaInventario } from "./tipos";
export { validarLecturaInventario } from "./validar";

function evidenciaReal(entrada: EntradaAsistenciaInventario, referencias: PreguntaInventarioIA["evidencia"]): EvidenciaCeldaInventario[] {
  return referencias.slice(0, 4).flatMap((referencia) => {
    const hoja = entrada.hojas.find((h) => h.nombre === referencia.hoja);
    const fila = hoja?.filas[referencia.fila - 1];
    if (!hoja || !fila || referencia.columna > fila.length || fila[referencia.columna - 1] == null) return [];
    return [{ hoja: hoja.nombre, fila: hoja.filasFisicas?.[referencia.fila - 1] ?? referencia.fila,
      columna: referencia.columna + (hoja.columnaInicial ?? 0), texto: String(fila[referencia.columna - 1]).slice(0, 240) }];
  });
}

/** Cuando el modelo no concreta una duda, la pregunta se apoya en una celda real. */
function dudaLectura(entrada: EntradaAsistenciaInventario, resultado: ResultadoAsistenciaInventario): PreguntaAsistenciaInventario {
  const spec = resultado.spec;
  const hoja = entrada.hojas.find((h) => h.nombre === spec?.hoja) ?? entrada.hojas[0];
  const indice = Math.min(Math.max((spec?.primeraFilaDatos ?? 2) - 1, 0), hoja.filas.length - 1);
  const fila = hoja.filas[indice] ?? [];
  const col = spec && !spec.lecturaEstructurada && (spec.columnas.valorTotal ?? 0) > 0 ? spec.columnas.valorTotal : Math.max(1, fila.findIndex((v) => v != null && String(v).trim()) + 1);
  const evidencia = evidenciaReal(entrada, [{ hoja: hoja.nombre, fila: indice + 1, columna: col }]);
  const muestra = evidencia[0];
  const ubicacion = muestra ? `En «${muestra.hoja}», fila ${muestra.fila}, aparece «${muestra.texto.slice(0, 90)}». ` : "";
  return {
    id: "ia_aclarar_estructura", requiereIA: true, evidencia,
    etiqueta: `${ubicacion}${spec && !spec.lecturaEstructurada ? "¿Ese dato representa el costo total de cada producto? Indica qué columna o etiqueta identifica el importe correcto." : "¿Qué texto marca el inicio de cada producto y cómo se distinguen su referencia, tipo y cantidad? Describe la regla que sigue este ejemplo."}`,
  };
}

function agregarPreguntas(resultado: ResultadoAsistenciaInventario, preguntas: PreguntaAsistenciaInventario[]): ResultadoAsistenciaInventario {
  if (preguntas.some((p) => p.requiereIA)) resultado.preguntas = resultado.preguntas.filter((p) => p.id !== "confirmar_lectura_estructurada");
  for (const pregunta of preguntas) if (!resultado.preguntas.some((p) => p.id === pregunta.id)) resultado.preguntas.push(pregunta);
  if (resultado.preguntas.length) resultado.listoParaBorrador = false;
  return resultado;
}

function preguntasVerificadas(entrada: EntradaAsistenciaInventario, resultado: ResultadoAsistenciaInventario, preguntas: PreguntaInventarioIA[]): PreguntaAsistenciaInventario[] {
  return preguntas.slice(0, 3).map((pregunta) => {
    const evidencia = evidenciaReal(entrada, pregunta.evidencia);
    // No mostrar referencias que el modelo inventó: solicitar aclaración con el original.
    if (!evidencia.length || evidencia.length !== pregunta.evidencia.length) return dudaLectura(entrada, resultado);
    return { ...pregunta, requiereIA: true, evidencia };
  });
}

export async function resolverLecturaInventario(entrada: EntradaAsistenciaInventario): Promise<ResultadoAsistenciaInventario> {
  const hojaElegida = entrada.respuestas?.hoja;
  const hojas = entrada.hojas.filter((hoja) => hojaElegida ? hoja.nombre === hojaElegida : !hoja.oculta);
  if (hojas.length === 0) {
    const vacio = resultadoInventarioVacio();
    vacio.errores.push(hojaElegida ? "La hoja elegida ya no existe en el archivo." : "El archivo no contiene hojas visibles con datos.");
    return vacio;
  }
  const entradaAcotada = { ...entrada, hojas };
  const pendientes = (entrada.preguntasPendientes ?? []).filter((p) => p.requiereIA === true);
  const respondidasAhora = pendientes.filter((p) => {
    const valor = entrada.respuestasNuevas?.[p.id]?.trim();
    return !!valor && (!p.opciones?.length || p.opciones.some((o) => o.valor === valor));
  });
  const requiereRegla = respondidasAhora.length > 0;
  const sinResponder = pendientes.filter((p) => !respondidasAhora.some((r) => r.id === p.id));
  const base = entrada.specBase && hojas.some((h) => h.nombre === entrada.specBase?.hoja)
    ? validarLecturaInventario({ hojas, spec: entrada.specBase, respuestas: entrada.respuestas, origen: entrada.origenBase ?? "patron" })
    : null;
  // Un descuadre de cifras no invalida la estructura ni autoriza gastarse IA para cuadrarlo.
  if (base?.estructuraValida && !entrada.forzarIA && !requiereRegla) return agregarPreguntas(base, pendientes);
  if (pendientes.length && !entrada.forzarIA && !requiereRegla) return agregarPreguntas(base ?? resultadoInventarioVacio(entrada.origenBase), pendientes);

  const candidatos = hojas.map((hoja) => validarLecturaInventario({ hojas: [hoja], spec: sugerirSpec(MODULOS_IMPORT.INV, hoja), respuestas: entrada.respuestas, origen: "heuristica" }));
  const plausibles = candidatos.filter((c) => c.estructuraValida);
  if (!hojaElegida && !base && plausibles.length > 1) {
    const eleccion = resultadoInventarioVacio();
    eleccion.preguntas.push({ id: "hoja", etiqueta: "Hay inventario en varias hojas. ¿Cuál quieres cargar?", opciones: plausibles.map((c) => ({ valor: c.spec!.hoja, etiqueta: c.spec!.hoja })) });
    return eleccion;
  }
  const respaldo = base ?? plausibles[0] ?? candidatos[0];
  if (!iaDisponible()) {
    respaldo.advertencias.push("La asistencia IA no está configurada. Se muestra la lectura determinista disponible para revisar el mapa.");
    if (entrada.forzarIA || requiereRegla || pendientes.length) {
      respaldo.errorProveedorIA = true;
      respaldo.listoParaBorrador = false;
      respaldo.errores.push("Configura la asistencia IA antes de solicitar una relectura con indicaciones.");
    }
    return agregarPreguntas(respaldo, pendientes);
  }
  let propuesta: Awaited<ReturnType<typeof proponerSpecInventarioIA>>;
  try {
    propuesta = await proponerSpecInventarioIA(
      entradaAcotada,
      (spec) => validarLecturaInventario({ hojas, spec, respuestas: entrada.respuestas, origen: "ia" }).estructuraValida,
      [...(respaldo?.errores ?? []), ...(respaldo?.advertencias ?? [])],
    );
  } catch (error) {
    respaldo.errorProveedorIA = true;
    respaldo.listoParaBorrador = false;
    respaldo.usos = error instanceof ErrorProveedorAsistenciaInventario ? error.usos : [];
    respaldo.errores.push("El proveedor de IA no pudo completar la lectura. El archivo sigue disponible para reintentar o revisar el mapa.");
    return agregarPreguntas(respaldo, pendientes);
  }
  if (!propuesta.spec) {
    const fallida = resultadoInventarioVacio("ia");
    fallida.usos = propuesta.usos;
    fallida.errores.push(propuesta.motivo || "No se pudo reconocer un mapa de inventario válido. Revisa las columnas del archivo.");
    const preguntas = preguntasVerificadas(entradaAcotada, fallida, propuesta.preguntas ?? []);
    if (!preguntas.length) preguntas.push(dudaLectura(entradaAcotada, fallida));
    if (requiereRegla && !entrada.instrucciones?.trim()) preguntas.push(...sinResponder);
    return agregarPreguntas(fallida, preguntas);
  }
  const resultado = validarLecturaInventario({ hojas, spec: propuesta.spec, respuestas: entrada.respuestas, origen: "ia" });
  resultado.usos = propuesta.usos;
  const preguntas = preguntasVerificadas(entradaAcotada, resultado, propuesta.preguntas ?? []);
  if (propuesta.confianza < 0.75) {
    resultado.advertencias.push("La interpretación todavía requiere aclarar el significado de las celdas antes de preparar el borrador.");
    if (!preguntas.length) preguntas.push(dudaLectura(entradaAcotada, resultado));
  }
  // Una respuesta parcial nunca elimina dudas anteriores que siguen sin contestar.
  if (requiereRegla && !entrada.instrucciones?.trim()) preguntas.push(...sinResponder);
  return agregarPreguntas(resultado, preguntas);
}
