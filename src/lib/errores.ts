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
  // Pool agotado / timeout al obtener una conexión (típico tras una operación
  // larga —p. ej. leer un archivo grande con IA— que deja las conexiones ociosas).
  P2024: "La base de datos tardó demasiado en responder. Con archivos grandes la lectura puede demorar; espera unos segundos y vuelve a intentar. Si persiste, avisa al administrador.",
};

const MENSAJE_GENERICO =
  "Ocurrió un error al procesar la operación en la base de datos. Intenta de nuevo; si el problema persiste, contacta al administrador.";

// Timeout/caída de conexión de node-postgres. Estos errores NO traen `code` de
// Prisma (p. ej. "Connection terminated due to connection timeout" con causa
// "Connection terminated unexpectedly"), así que sin este reconocedor caerían al
// mensaje genérico de "base de datos" y ocultarían que fue un problema de latencia.
const MENSAJE_CONEXION =
  "La base de datos tardó demasiado en responder. Con archivos grandes la lectura puede demorar más de lo normal; espera unos segundos y vuelve a intentar. Si persiste, avisa al administrador.";

/** ¿Es un timeout/caída de conexión SIN código Prisma (node-postgres/pool)? */
function esErrorConexionSinCodigo(e: unknown): boolean {
  const partes: string[] = [];
  const acumular = (x: unknown, prof: number) => {
    if (prof > 4 || x == null) return;
    if (typeof x === "string") { partes.push(x); return; }
    if (x instanceof Error) { partes.push(x.message); acumular((x as { cause?: unknown }).cause, prof + 1); return; }
    if (typeof x === "object" && "message" in x) partes.push(String((x as { message?: unknown }).message ?? ""));
  };
  acumular(e, 0);
  return /connection terminated|connection timeout|timeout.*connect|connect.*timeout|terminated unexpectedly|ECONNRESET|ETIMEDOUT|EPIPE|Connection ended|server closed the connection/i.test(
    partes.join(" "),
  );
}

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
  if (esErrorConexionSinCodigo(e)) return MENSAJE_CONEXION;
  return MENSAJE_GENERICO;
}

/**
 * Mensaje claro para fallos de la extracción con IA (Anthropic o Gemini). Traduce los
 * errores de la API (429/529/5xx/timeout/credenciales) a algo accionable y
 * preserva los mensajes deliberados del pipeline (extracción/ingesta). Para
 * cualquier otro error (p. ej. un fallo de BD al persistir) cae a
 * `mensajeErrorBD`. Úsalo en los `catch` de acciones que invocan la IA.
 */
export function mensajeErrorIA(contexto: string, e: unknown): string {
  const { status, nombre, msg } = rasgosErrorIA(e);

  // Error de API: tiene `status` numérico o un nombre de clase de proveedor.
  const esErrorProveedor = typeof status === "number" || /APIError|APIConnection|RateLimit|Overloaded|Anthropic|Gemini/i.test(`${nombre} ${msg}`);
  if (esErrorProveedor) {
    registrarError(contexto, e);
    if (status === 429) return "El servicio de IA está saturado en este momento. Espera unos segundos y vuelve a intentar.";
    if (status === 529) return "El servicio de IA está sobrecargado. Reintenta en un momento.";
    if (typeof status === "number" && status >= 500) return "El servicio de IA tuvo un error temporal. Reintenta en un momento.";
    if (status === 401 || status === 403) return "La extracción con IA no está disponible por un problema de credenciales. Avisa al administrador.";
    if (/timeout|ETIMEDOUT|ECONNRESET|connection/i.test(`${nombre} ${msg}`)) return "La lectura con IA tardó demasiado. Prueba con un archivo más pequeño o reintenta.";
    return "No se pudo leer el archivo con IA. Revisa el formato del archivo o reintenta.";
  }

  // Mensaje deliberado del pipeline de extracción/ingesta (texto ya útil en
  // español, p. ej. formato no soportado). Se muestra tal cual al usuario.
  if (/^(La IA |El PDF |Formato de archivo|Por seguridad|BALANCE_AI_PROVIDER)/.test(msg)) {
    registrarError(contexto, e);
    return msg;
  }

  // Cualquier otro error (incluye fallos de BD al persistir): traducción de BD.
  return mensajeErrorBD(contexto, e);
}

/** Status, nombre de clase y mensaje del error, para reconocer fallos del proveedor de IA. */
function rasgosErrorIA(e: unknown): { status?: number; nombre: string; msg: string } {
  const statusBruto = e && typeof e === "object" && "status" in e ? (e as { status?: unknown }).status : undefined;
  const status = typeof statusBruto === "number" ? statusBruto : undefined;
  const nombre = e && typeof e === "object" && "name" in e ? String((e as { name?: unknown }).name ?? "") : "";
  const msg = e instanceof Error ? e.message : typeof e === "string" ? e : "";
  return { status, nombre, msg };
}

/**
 * ¿El fallo es de DISPONIBILIDAD del proveedor de IA (Anthropic/Gemini)?
 * Cubre saturación (429), sobrecarga (529), errores 5xx y timeouts/cortes de
 * red de la API. Son temporales y ocurren en el servicio externo — no hay nada
 * que corregir en el aplicativo ni en el archivo del usuario; la UI lo usa para
 * mostrar el aviso que lo aclara. Excluye credenciales (401/403) y errores de
 * formato, que sí requieren acción de este lado.
 */
export function esErrorDisponibilidadIA(e: unknown): boolean {
  const { status, nombre, msg } = rasgosErrorIA(e);
  const esProveedor = typeof status === "number" || /APIError|APIConnection|RateLimit|Overloaded|Anthropic|Gemini/i.test(`${nombre} ${msg}`);
  if (!esProveedor) return false;
  if (typeof status === "number") return status === 429 || status === 529 || status >= 500;
  return /Overloaded|RateLimit|APIConnection/i.test(nombre) || /timeout|ETIMEDOUT|ECONNRESET|connection/i.test(`${nombre} ${msg}`);
}
