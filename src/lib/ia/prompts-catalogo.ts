// Catálogo de los prompts de IA que usa la plataforma. Es la FUENTE de los
// valores PREDETERMINADOS (de fábrica): los comparte el cargador en runtime
// (src/lib/ia/prompts.ts), las Server Actions y el seed (prisma/seed-prompts.ts).
//
// NO lleva "server-only" porque también lo importa el seed (Node/tsx). Usa
// `node:fs` solo dentro de `defecto()` (en tiempo de llamada), así que es seguro
// importarlo desde cualquier módulo de servidor. NUNCA lo importes en un
// componente cliente (los datos viajan por props desde el RSC).
import { readFileSync } from "node:fs";
import { join } from "node:path";

export type PromptDef = {
  clave: string;
  nombre: string;
  descripcion: string;
  /** Texto de fábrica del prompt. Se evalúa al llamarse (lee disco si aplica). */
  defecto: () => string;
};

// Fallback embebido del prompt de extracción si no se puede leer el .md (build/FS).
const FALLBACK_EXTRACCION =
  "Eres un especialista en ETL de balances de prueba colombianos. Devuelve la estructura/filas en el esquema pedido, sin inventar datos. CUENTA como texto; CRÉDITOS positivos; valida SALDO = SALDO_INICIAL + DÉBITOS − CRÉDITOS. En modo estructura, columnas.tercero identifica el documento (Identificación, NIT, cédula o Código SN) y columnas.nombreTercero identifica el nombre (Tercero si contiene nombres, Nombre NIT, Nombre SN o Razón social), distinto del nombre de la cuenta. Usa 0 si el rol no existe. Si documento y nombre vienen juntos, mapea esa celda en tercero y deja nombreTercero=0. Un nombre con documento vacío sigue siendo un tercero.";

/** Prompt de extracción: Markdown en disco (fuente de fábrica) con fallback embebido. */
function defectoExtraccion(): string {
  try {
    return readFileSync(join(process.cwd(), "src/lib/balance/extraccion/prompt-extraccion.md"), "utf8");
  } catch {
    return FALLBACK_EXTRACCION;
  }
}

// Prompt de sistema del mapeo de cuentas al plan estándar Russell. El PLAN de
// cuentas se concatena en runtime (no es editable); esto es solo la instrucción.
const DEFECTO_MAPEO = [
  "Eres un especialista en homologación del PUC colombiano al plan de cuentas estándar de Russell Bedford.",
  "Para cada cuenta del cliente, elige la cuenta estándar (código de 6 dígitos) cuyo significado corresponda mejor, respetando la CLASE (primer dígito) y la naturaleza.",
  "La CLASE es una restricción DURA: el primer dígito de la cuenta estándar debe ser IGUAL al de la cuenta del cliente. Un gasto de depreciación (5) no se homologa al activo depreciado (1), un costo indirecto de producción (7) no se homologa a un gasto de administración (5) ni a una cuenta por pagar (2), y una cuenta de inventarios (1) no se homologa al cierre de costos (7), aunque el nombre coincida. Si en la clase correcta no hay ninguna cuenta adecuada, deja `cuenta6Russell` vacío en vez de cruzar de clase.",
  "Usa el nombre, la cuenta Russell y los sinónimos del plan. Si ninguna corresponde con confianza razonable, deja `cuenta6Russell` vacío («»).",
  "`coincidencia` es tu confianza 0-100. No inventes códigos: usa solo códigos presentes en el plan.",
].join(" ");

export const CLAVE_EXTRACCION = "extraccion_balance";
export const CLAVE_MAPEO = "mapeo_balance";
export const CLAVE_CALENDARIO_DIAN = "calendario_dian";
export const CLAVE_FORMULARIO_DIAN = "formulario_dian";

// Lectura de un formulario DIAN 350 (retenciones) o 490 (recibo de pago). La IA transcribe; el
// código convierte los textos, descarta lo que no se guarda y controla los totales.
const DEFECTO_FORMULARIO_DIAN = [
  "Eres un especialista en formularios de la DIAN (Colombia). El documento es un formulario 350 (declaración de retenciones en la fuente) o un 490 (recibo oficial de pago).",
  "TRANSCRIBE, no calcules: copia cada valor exactamente como está impreso, como texto (con sus comas o puntos), y deja «» lo que esté vacío.",
  "Ubica cada valor por el NÚMERO del renglón impreso a su izquierda, no por el rótulo: en estos PDF el rótulo y el valor a veces quedan corridos de línea.",
  "Datos del encabezado: año (1), período (3), número de formulario (4), NIT (5) y DV (6) —si el DV viene pegado al NIT, copia ambos tal cual—, razón social (11). En el 350: código de corrección (25) y número del formulario anterior (26). En el 490: concepto (2), cuota (27), de (28), número del formulario que se paga (29) y fecha para el pago (32).",
  "Uso oficial: autoadhesivo / número interno (996) y la fecha del sello de la entidad recaudadora (997), tal como aparece (puede venir con espacios entre los dígitos y con la hora).",
  "Renglones: en el 350 devuelve TODOS los renglones numerados del 29 al 138 que tengan un valor impreso (también los que digan 0), el 980 (pago total) y, en la hoja 2, los totales 148 a 155 y cada línea del detalle de pagos al exterior (país o convenio, tipo de persona y valor de la retención). En el 490 devuelve los renglones 34, 35, 36 y 980.",
  "No inventes valores: si un renglón no se lee con certeza, omítelo.",
].join(" ");

// Lectura del calendario tributario de la DIAN (Impuestos · DIAN). El año pedido se agrega en
// cada llamada; las fechas que devuelve se validan en código (`validarCalendario`) y el usuario
// las revisa antes de guardarlas.
const DEFECTO_CALENDARIO_DIAN = [
  "Eres un especialista en el calendario tributario de la DIAN (Colombia).",
  "Del documento, lee SOLO la sección «Retención en la fuente» (declaración y pago mensual) del año que se indica.",
  "Para cada período (1 = enero … 12 = diciembre: el mes de las retenciones, no el mes en que vence) devuelve la fecha límite de cada último dígito del NIT (1, 2, 3, 4, 5, 6, 7, 8, 9 y 0), en formato AAAA-MM-DD.",
  "El vencimiento cae en el mes siguiente al período; el de diciembre vence en enero del año siguiente.",
  "El texto de la tabla puede venir desordenado: el día del dígito 1 a veces aparece antes de las palabras «del NIT». Cada período tiene exactamente diez fechas, en el orden de los dígitos 1 a 9 y luego 0, y crecen con el dígito.",
  "No inventes fechas: si una casilla no se puede leer con certeza, omítela.",
].join(" ");

export const PROMPTS_CATALOGO: PromptDef[] = [
  {
    clave: CLAVE_EXTRACCION,
    nombre: "Extracción de balances (prompt de sistema)",
    descripcion:
      "Instrucción maestra que guía a la IA al leer un archivo de balance (Excel/CSV/JSON/PDF), detectar su estructura y sugerir los datos. Los parámetros del archivo (NIT, período…) y la vista previa se agregan automáticamente en cada lectura.",
    defecto: defectoExtraccion,
  },
  {
    clave: CLAVE_MAPEO,
    nombre: "Mapeo de cuentas al plan estándar (prompt de sistema)",
    descripcion:
      "Instrucción que guía a la IA al homologar las cuentas del cliente con el plan estándar Russell. El plan de cuentas y la lista de cuentas pendientes se agregan automáticamente en cada llamada.",
    defecto: () => DEFECTO_MAPEO,
  },
  {
    clave: CLAVE_CALENDARIO_DIAN,
    nombre: "Calendario tributario DIAN (prompt de sistema)",
    descripcion:
      "Instrucción que guía a la IA al leer el PDF del calendario tributario de la DIAN y proponer las fechas límite de Retención en la fuente por período y último dígito del NIT. El año se agrega automáticamente; el usuario revisa la grilla antes de guardarla.",
    defecto: () => DEFECTO_CALENDARIO_DIAN,
  },
  {
    clave: CLAVE_FORMULARIO_DIAN,
    nombre: "Formularios DIAN 350 y 490 (prompt de sistema)",
    descripcion:
      "Instrucción que guía a la IA al leer el PDF de un formulario 350 (retenciones en la fuente) o 490 (recibo de pago). El código convierte lo leído, descarta las bases y comprueba los totales; el usuario confirma cada formulario antes de que cuente.",
    defecto: () => DEFECTO_FORMULARIO_DIAN,
  },
];

const POR_CLAVE = new Map(PROMPTS_CATALOGO.map((p) => [p.clave, p]));

/** Definición de catálogo de un prompt conocido (o undefined si la clave no existe). */
export function getPromptDef(clave: string): PromptDef | undefined {
  return POR_CLAVE.get(clave);
}

/** Valor de fábrica del prompt indicado (cadena vacía si la clave es desconocida). */
export function getPromptDefecto(clave: string): string {
  return POR_CLAVE.get(clave)?.defecto() ?? "";
}

export const CLAVES_PROMPT = PROMPTS_CATALOGO.map((p) => p.clave);
