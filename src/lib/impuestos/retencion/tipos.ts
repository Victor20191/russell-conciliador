import type { ActionState } from "@/lib/definitions";

/** Respuesta de «Nueva revisión»: el id de la revisión creada (o la que ya existía). */
export type ResultadoRevision = ActionState & { id?: number };

/** Respuesta de importar UN PDF: qué formulario se leyó y si quedó por confirmar. */
export type ResultadoImportacion = ActionState & {
  formularioId?: number;
  formulario?: string;
  numero?: string;
  periodo?: number;
  /** Controles que bloquean y fallaron en la lectura (el usuario los corrige al confirmar). */
  pendientes?: number;
};

export const ESTADOS_FORMULARIO = ["por_confirmar", "confirmado", "descartado"] as const;
export type EstadoFormulario = (typeof ESTADOS_FORMULARIO)[number];

/** Llave del original en el almacén de objetos. */
export function claveObjetoFormulario(clienteId: number, anio: number, huella: string): string {
  return `impuestos/retencion/${clienteId}/${anio}/${huella}.pdf`;
}

/** Tamaño máximo de un PDF de formulario (los de la DIAN pesan menos de 200 KB). */
export const MAX_BYTES_FORMULARIO = 10 * 1024 * 1024;
