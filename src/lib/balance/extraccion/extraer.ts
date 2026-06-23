// Orquestador de la extracción asistida por IA.
//
// Une las piezas: ingesta del archivo → llamada a Claude (detección de
// estructura para tabulares, o extracción directa para PDF/texto) →
// transformación/validación determinista. El resultado alimenta a
// `calcularBalance` en la Server Action.
import "server-only";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { getAnthropic, MODELO_EXTRACCION } from "@/lib/anthropic";
import { ingerir, construirVistaPrevia } from "./ingesta";
import { MappingSpecSchema, ExtraccionDirectaSchema } from "./esquema";
import { transformarTabular, validarDirecta, type ParamsExtraccion, type ResultadoTransform } from "./transformar";

// El prompt es Markdown editable; se lee del disco (fuente única) y se memoiza.
let promptCache: string | null = null;
function promptSistema(): string {
  if (promptCache) return promptCache;
  try {
    promptCache = readFileSync(join(process.cwd(), "src/lib/balance/extraccion/prompt-extraccion.md"), "utf8");
  } catch {
    promptCache =
      "Eres un especialista en ETL de balances de prueba colombianos. Devuelve la estructura/filas en el esquema pedido, sin inventar datos. CUENTA como texto; CRÉDITOS positivos; valida SALDO = SALDO_INICIAL + DÉBITOS − CRÉDITOS.";
  }
  return promptCache;
}

function bloqueParametros(params: ParamsExtraccion): string {
  return [
    "PARÁMETROS EXTERNOS (tienen prioridad):",
    `- NIT_ESPERADO: ${params.nit ?? "(vacío)"}`,
    `- PERIODO_ESPERADO: ${params.periodoInicial ?? "?"} a ${params.periodoFinal ?? "?"}`,
    `- ESTANDAR_CONTABLE: ${params.estandar}`,
  ].join("\n");
}

const MAX_TOKENS_ESTRUCTURA = 8000;
const MAX_TOKENS_DIRECTA = 32000;

/**
 * Extrae el balance de un archivo. Lanza si la IA no devuelve un resultado
 * válido o si el archivo es ilegible (lo captura la Server Action).
 */
export async function extraerBalance(data: ArrayBuffer, fileName: string, params: ParamsExtraccion): Promise<ResultadoTransform> {
  const ingesta = ingerir(data, fileName);
  const client = getAnthropic();
  // Prompt caching: con el modelo por defecto (Sonnet 4.6, mínimo cacheable 2048 tokens)
  // el prompt (~2,8K tokens) SÍ se cachea. Ojo: si se fija ANTHROPIC_MODEL a la familia
  // Opus 4.x (mínimo 4096) el prompt queda corto y dejaría de cachearse (sin coste extra).
  // El grueso de la entrada es el archivo/vista previa: cambia por carga y no es cacheable.
  const system = [{ type: "text" as const, text: promptSistema(), cache_control: { type: "ephemeral" as const } }];

  if (ingesta.modo === "tabular") {
    const vista = construirVistaPrevia(ingesta.hojas);
    const instruccion = [
      bloqueParametros(params),
      "",
      "Modo ESTRUCTURA: describe el mapa del balance (no transcribas filas). Índices de columna 1-based (A=1).",
      "Vista previa del archivo:",
      vista,
    ].join("\n");

    const r = await client.messages.parse({
      model: MODELO_EXTRACCION,
      max_tokens: MAX_TOKENS_ESTRUCTURA,
      thinking: { type: "adaptive" },
      system,
      messages: [{ role: "user", content: [{ type: "text", text: instruccion }] }],
      output_config: { format: zodOutputFormat(MappingSpecSchema) },
    });
    const spec = r.parsed_output;
    if (!spec) throw new Error("La IA no devolvió un mapeo válido del archivo. Reintenta o revisa el formato.");
    return transformarTabular(spec, ingesta.hojas, params);
  }

  // Documento (PDF o texto): extracción directa.
  const doc = ingesta.documento;
  const instruccion = [
    bloqueParametros(params),
    "",
    "Modo EXTRACCIÓN: devuelve las filas de detalle (cuentas imputables) ya normalizadas en el esquema pedido.",
    doc.tipo === "texto" ? `\nCONTENIDO:\n${doc.texto.slice(0, 200_000)}` : "",
  ].join("\n");

  const content =
    doc.tipo === "pdf"
      ? [
          { type: "document" as const, source: { type: "base64" as const, media_type: "application/pdf" as const, data: doc.base64 } },
          { type: "text" as const, text: instruccion },
        ]
      : [{ type: "text" as const, text: instruccion }];

  const r = await client.messages.parse({
    model: MODELO_EXTRACCION,
    max_tokens: MAX_TOKENS_DIRECTA,
    thinking: { type: "adaptive" },
    system,
    messages: [{ role: "user", content }],
    output_config: { format: zodOutputFormat(ExtraccionDirectaSchema) },
  });
  const extr = r.parsed_output;
  if (!extr) throw new Error("La IA no devolvió filas válidas del documento. Reintenta o revisa el archivo.");
  return validarDirecta(extr, params);
}
