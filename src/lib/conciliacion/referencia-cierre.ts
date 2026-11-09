import { impuestoPorClave } from "@/lib/impuestos/impuestos-dian";

/**
 * Cómo se nombra el origen de un cierre en firme y a dónde lleva (puro). Los módulos cierran un
 * cargue (`/modulos/<código>/<id>`); los impuestos DIAN, con su código (RET para Retención en la
 * fuente, IVA), cierran una revisión y guardan su id en `modulo_dato_encabezado_id`
 * (`/impuestos/retencion/<id>`, `/impuestos/iva/<id>`).
 */

export const MODULO_CIERRE_RETENCION = "RET";

export function referenciaCierre(c: { moduloCodigo: string; moduloDatoEncabezadoId: number }): { modulo: string; etiqueta: string; ruta: string } {
  const id = c.moduloDatoEncabezadoId;
  const impuesto = impuestoPorClave(c.moduloCodigo);
  if (impuesto) return { modulo: impuesto.nombre, etiqueta: `revisión #${id}`, ruta: `/impuestos/${impuesto.slug}/${id}` };
  return { modulo: c.moduloCodigo, etiqueta: `cargue #${id}`, ruta: `/modulos/${String(c.moduloCodigo ?? "").toLowerCase()}/${id}` };
}
