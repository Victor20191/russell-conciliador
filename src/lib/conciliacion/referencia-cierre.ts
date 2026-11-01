/**
 * Cómo se nombra el origen de un cierre en firme y a dónde lleva (puro). Los módulos cierran un
 * cargue (`/modulos/<código>/<id>`); Retención en la fuente, con el código RET, cierra una revisión
 * y guarda su id en `modulo_dato_encabezado_id` (`/impuestos/retencion/<id>`).
 */

export const MODULO_CIERRE_RETENCION = "RET";

export function referenciaCierre(c: { moduloCodigo: string; moduloDatoEncabezadoId: number }): { modulo: string; etiqueta: string; ruta: string } {
  const id = c.moduloDatoEncabezadoId;
  if (c.moduloCodigo === MODULO_CIERRE_RETENCION) {
    return { modulo: "Retención en la fuente", etiqueta: `revisión #${id}`, ruta: `/impuestos/retencion/${id}` };
  }
  return { modulo: c.moduloCodigo, etiqueta: `cargue #${id}`, ruta: `/modulos/${String(c.moduloCodigo ?? "").toLowerCase()}/${id}` };
}
