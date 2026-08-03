// ============================================================
// Catálogo de ENTIDADES COMENTABLES.
//
// `tipo` (entidad_tipo) es el "código de tabla" polimórfico que ancla
// una conversación a un registro: reutiliza los códigos de módulo del
// RBAC, de modo que el permiso de comentar es "<tipo>:comentar" y la
// lectura "<tipo>:ver". Agregar una entidad nueva = una línea aquí.
//
// Sin dependencias de servidor: lo importan tanto las server actions
// como el componente cliente <Conversacion/>.
// ============================================================

export type EntidadComentable = {
  tipo: string; // entidad_tipo = código de módulo RBAC
  label: string; // etiqueta singular para el encabezado de la conversación
};

export const ENTIDADES_COMENTABLES: Record<string, EntidadComentable> = {
  balance: { tipo: "balance", label: "Balance" },
  conciliaciones: { tipo: "conciliaciones", label: "Conciliación" },
  dian: { tipo: "dian", label: "Impuestos · DIAN" },
  clientes: { tipo: "clientes", label: "Cliente" },
  modulos_datos: { tipo: "modulos_datos", label: "Módulo de conciliación" },
};

export function esEntidadComentable(tipo: string): tipo is string {
  return Object.prototype.hasOwnProperty.call(ENTIDADES_COMENTABLES, tipo);
}

export function etiquetaEntidad(tipo: string): string {
  return ENTIDADES_COMENTABLES[tipo]?.label ?? tipo;
}
