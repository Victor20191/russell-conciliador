// Por qué los botones de guardar del patrón están apagados (5/Oct/2026) — puro.
//
// Los botones se deshabilitan sin decir nada, y en un patrón nuevo de Inventarios la «Prueba del
// mapeo» puede salir en verde mientras la lectura de la muestra sigue sin validar (otro panel, más
// arriba). Esto dice qué falta y a dónde ir. Mismo orden de condiciones que `puedeGuardar`.

export type DestinoMotivoGuardar = "aplicativo" | "lectura" | null;

export type EstadoGuardarPatron = {
  guardando: boolean;
  analizando: boolean;
  /** Se edita una versión existente (ya tiene aplicativo y muestra). */
  esEdicion: boolean;
  erpElegido: boolean;
  hayMuestra: boolean;
  muestraLista: boolean;
  haySpec: boolean;
  esNuevoInventario: boolean;
  /** La lectura de la muestra cambió (ajustes, respuestas, ejemplo) y falta validarla otra vez. */
  asistenciaPendiente: boolean;
  /** La última lectura falló (el proveedor de IA o la acción): se reintenta desde el panel. */
  falloLectura: boolean;
  /** Resultado de la última lectura de la muestra (solo patrón nuevo de Inventarios). */
  lectura: { listoParaBorrador: boolean; preguntas: number; errores: number } | null;
};

const PANEL = "«Reconocer el formato de la muestra»";

/** Qué falta para poder guardar, o `null` si se puede (o si ya está guardando). */
export function motivoNoGuardarPatron(e: EstadoGuardarPatron): { texto: string; destino: DestinoMotivoGuardar } | null {
  if (e.guardando) return null;
  if (e.analizando) return { texto: "Analizando la muestra…", destino: null };
  if (!e.esEdicion && !e.erpElegido) return { texto: "Elige el aplicativo del patrón.", destino: "aplicativo" };
  if (!e.esEdicion && !e.hayMuestra) return { texto: "Sube el archivo de muestra del aplicativo.", destino: "aplicativo" };
  if (e.esNuevoInventario) {
    if (e.asistenciaPendiente) {
      return { texto: `Cambiaste la lectura de la muestra: valídala otra vez con el botón de ${PANEL} («Validar ajustes» o «Validar respuestas»).`, destino: "lectura" };
    }
    if (e.falloLectura) return { texto: `La lectura de la muestra falló: pulsa «Reintentar lectura» en ${PANEL}.`, destino: "lectura" };
    if (!e.lectura || !e.haySpec || !e.muestraLista) return { texto: `Falta reconocer la muestra en ${PANEL}.`, destino: "lectura" };
    if (e.lectura.errores > 0) return { texto: `Resuelve los errores que marca ${PANEL}.`, destino: "lectura" };
    if (e.lectura.preguntas > 0) return { texto: `Responde las preguntas de ${PANEL} y pulsa «Validar respuestas».`, destino: "lectura" };
    if (!e.lectura.listoParaBorrador) return { texto: `Valida la lectura en ${PANEL}.`, destino: "lectura" };
    return null;
  }
  if (!e.haySpec || !e.muestraLista) return { texto: "Falta analizar la muestra del aplicativo.", destino: "aplicativo" };
  return null;
}
