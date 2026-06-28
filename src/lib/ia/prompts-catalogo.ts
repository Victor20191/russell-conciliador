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
// Es el mismo que tenía `extraer.ts` antes de mover la carga a BD.
const FALLBACK_EXTRACCION =
  "Eres un especialista en ETL de balances de prueba colombianos. Devuelve la estructura/filas en el esquema pedido, sin inventar datos. CUENTA como texto; CRÉDITOS positivos; valida SALDO = SALDO_INICIAL + DÉBITOS − CRÉDITOS.";

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
  "Usa el nombre, la cuenta Russell y los sinónimos del plan. Si ninguna corresponde con confianza razonable, deja `cuenta6Russell` vacío («»).",
  "`coincidencia` es tu confianza 0-100. No inventes códigos: usa solo códigos presentes en el plan.",
].join(" ");

export const CLAVE_EXTRACCION = "extraccion_balance";
export const CLAVE_MAPEO = "mapeo_balance";

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
