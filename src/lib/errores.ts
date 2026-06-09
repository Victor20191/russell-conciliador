import "server-only";

/**
 * Manejo centralizado de errores de las operaciones CRUD.
 *
 * Dos formas de usarlo según el tipo de acción:
 *
 *  - Acciones que devuelven `{ ok, message }` (ActionState y similares):
 *    en el `catch`, `return { ok: false, message: mensajeErrorBD(contexto, e) }`.
 *    El usuario ve un mensaje claro de QUÉ ocurrió.
 *
 *  - Acciones tipo formulario que devuelven `void`: en el `catch`,
 *    `registrarError(contexto, e)` y luego `throw e`. El error sube al
 *    error boundary (`error.tsx`) que muestra una pantalla controlada, y el
 *    detalle queda en los logs del servidor (correlacionable por `digest`).
 */

// Códigos de error conocidos de Prisma → mensaje claro en español.
// Ref.: https://www.prisma.io/docs/orm/reference/error-reference
const MENSAJES_PRISMA: Record<string, string> = {
  // Consulta / restricciones de integridad
  P2002: "Ya existe un registro con esos datos: hay un valor duplicado que debe ser único.",
  P2003: "La operación afecta a datos relacionados. Verifica los registros vinculados antes de continuar.",
  P2011: "Falta un dato obligatorio para completar la operación.",
  P2000: "Uno de los valores es demasiado largo para el campo.",
  P2014: "La operación rompería una relación requerida entre registros.",
  P2025: "El registro ya no existe o fue modificado por otra persona. Recarga la página e intenta de nuevo.",
  // Conexión / disponibilidad de la base de datos
  P1000: "No se pudo autenticar contra la base de datos.",
  P1001: "No hay conexión con la base de datos. Intenta de nuevo en unos segundos.",
  P1002: "La base de datos no respondió a tiempo. Intenta de nuevo.",
  P1008: "La operación tardó demasiado (tiempo de espera agotado). Intenta de nuevo.",
  P1017: "La base de datos cerró la conexión. Intenta de nuevo.",
};

const MENSAJE_GENERICO =
  "Ocurrió un error al procesar la operación en la base de datos. Intenta de nuevo; si el problema persiste, contacta al administrador.";

/** Extrae el código de error de Prisma (p. ej. "P2002") si lo hay. */
function codigoPrisma(e: unknown): string | undefined {
  if (e && typeof e === "object" && "code" in e) {
    const code = (e as { code?: unknown }).code;
    if (typeof code === "string") return code;
  }
  return undefined;
}

/** Deja rastro del error en los logs del servidor con un prefijo de contexto. */
export function registrarError(contexto: string, e: unknown): void {
  const code = codigoPrisma(e);
  const etiqueta = code ? ` [Prisma ${code}]` : "";
  console.error(`[Russell] Error en ${contexto}${etiqueta}:`, e);
}

/**
 * Registra el error y devuelve un mensaje en español apto para el usuario.
 * Traduce los códigos de error conocidos de Prisma a explicaciones claras y,
 * si el error no se reconoce, devuelve un mensaje genérico seguro.
 */
export function mensajeErrorBD(contexto: string, e: unknown): string {
  registrarError(contexto, e);
  const code = codigoPrisma(e);
  if (code && MENSAJES_PRISMA[code]) return MENSAJES_PRISMA[code];
  return MENSAJE_GENERICO;
}
