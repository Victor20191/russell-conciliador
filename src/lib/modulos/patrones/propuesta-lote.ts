// Formato propuesto como patrón desde un cargue (5/Oct/2026) — puro, sin BD.
//
// Cuando el aplicativo no tiene patrón para el archivo, quien carga configura la lectura en el
// mismo modal (Cartera, CxP, Ingresos, Activos fijos, Nómina) o la arma la asistencia
// (Inventarios). Al confirmar el borrador puede guardar ese formato como versión `validada_cliente`
// del aplicativo: sirve solo a su cliente hasta que un administrador la apruebe para todos.
// `leerDatosModulo` deja en el spec del lote lo que se guardaría (`propuestaPatron`); solo el
// servidor lo escribe y el navegador nunca lo envía.
import * as z from "zod";
import type { DescriptorModulo } from "../descriptores";
import { SpecModuloSchema, type SpecModulo } from "../extraccion/esquema";
import { validarSpecModulo } from "../perfil-modulo";
import { MENSAJE_TIPO_FORMATO } from "./revision-mapeo";
import { normalizarRotulo } from "./rotulos";

export const PropuestaPatronLoteSchema = z.object({
  version: z.literal(1),
  erpId: z.number().int().positive(),
  encabezado: z.array(z.string()),
  spec: SpecModuloSchema,
});
export type PropuestaPatronLote = z.infer<typeof PropuestaPatronLoteSchema>;

/** La propuesta guardada en el spec del lote, o `null` si el cargue no la tiene (o no es válida). */
export function leerPropuestaPatronDeLote(specJson: unknown): PropuestaPatronLote | null {
  if (!specJson || typeof specJson !== "object") return null;
  const parsed = PropuestaPatronLoteSchema.safeParse((specJson as Record<string, unknown>).propuestaPatron);
  return parsed.success ? parsed.data : null;
}

export const MENSAJE_ENCABEZADO_INSUFICIENTE =
  "El formato no tiene encabezados suficientes para guardarlo como patrón: sus rótulos son los que reconocen el archivo.";

/**
 * Por qué un formato no se puede guardar como patrón, o `null`. Las mismas reglas que exige
 * aprobar una versión: mapeo válido, encabezado con rótulos y, en Cartera y CxP, el tipo de
 * formato DECLARADO (sin él la aprobación lo rechazaría después).
 */
export function motivoNoProponible(descriptor: DescriptorModulo, spec: SpecModulo, encabezado: readonly string[]): string | null {
  if (descriptor.crucePorTercero.detalleTercero && !spec.tipoFormato) return MENSAJE_TIPO_FORMATO;
  const error = validarSpecModulo(descriptor, spec);
  if (error) return error;
  // Un reporte estructurado de Inventarios puede contener varios campos dentro de UNA celda.
  const minimo = spec.lecturaEstructurada ? 1 : 2;
  if (encabezado.filter((rotulo) => normalizarRotulo(rotulo) !== "").length < minimo) return MENSAJE_ENCABEZADO_INSUFICIENTE;
  return null;
}

/**
 * Si el usuario pidió guardar el formato como patrón al confirmar. Sin el campo (una pestaña
 * abierta antes de esta versión) Inventarios conserva lo de antes —aprendía siempre— y los demás
 * módulos no proponen nada.
 */
export function debeGuardarPatron(moduloCodigo: string, valor: unknown): boolean {
  if (valor === "1" || valor === true) return true;
  if (valor === "0" || valor === false) return false;
  return moduloCodigo === "INV";
}
