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
 *  - Acciones tipo formulario invocadas desde UI cliente deben devolver
 *    `{ ok: false, message: mensajeErrorBD(contexto, e) }`, para que el
 *    usuario reciba la notificación sin perder el contexto de la pantalla.
 *
 *  - Acciones que deben redirigir con `redirect()` pueden lanzar
 *    `new Error(mensajeErrorBD(contexto, e))` en el `catch`. El error sube al
 *    error boundary (`error.tsx`) con un mensaje ya traducido y el detalle
 *    queda en logs del servidor.
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

/**
 * Mensaje claro para fallos de la extracción con IA (Anthropic). Traduce los
 * errores de la API (429/529/5xx/timeout/credenciales) a algo accionable y
 * preserva los mensajes deliberados del pipeline (extracción/ingesta). Para
 * cualquier otro error (p. ej. un fallo de BD al persistir) cae a
 * `mensajeErrorBD`. Úsalo en los `catch` de acciones que invocan la IA.
 */
export function mensajeErrorIA(contexto: string, e: unknown): string {
  const status = e && typeof e === "object" && "status" in e ? (e as { status?: unknown }).status : undefined;
  const nombre = e && typeof e === "object" && "name" in e ? String((e as { name?: unknown }).name ?? "") : "";
  const msg = e instanceof Error ? e.message : typeof e === "string" ? e : "";

  // Error de la API de Anthropic: tiene `status` numérico o un nombre de clase del SDK.
  const esErrorAnthropic = typeof status === "number" || /APIError|APIConnection|RateLimit|Overloaded|Anthropic/i.test(nombre);
  if (esErrorAnthropic) {
    registrarError(contexto, e);
    if (status === 429) return "El servicio de IA está saturado en este momento. Espera unos segundos y vuelve a intentar.";
    if (status === 529) return "El servicio de IA está sobrecargado. Reintenta en un momento.";
    if (typeof status === "number" && status >= 500) return "El servicio de IA tuvo un error temporal. Reintenta en un momento.";
    if (status === 401 || status === 403) return "La extracción con IA no está disponible por un problema de credenciales. Avisa al administrador.";
    if (/timeout|ETIMEDOUT|ECONNRESET|connection/i.test(`${nombre} ${msg}`)) return "La lectura con IA tardó demasiado. Prueba con un archivo más pequeño o reintenta.";
    return "No se pudo leer el archivo con IA. Revisa el formato del archivo o reintenta.";
  }

  // Mensaje deliberado del pipeline de extracción/ingesta (texto ya útil en español).
  if (/^(La IA |El PDF |Formato de archivo)/.test(msg)) {
    registrarError(contexto, e);
    return msg;
  }

  // Cualquier otro error (incluye fallos de BD al persistir): traducción de BD.
  return mensajeErrorBD(contexto, e);
}
