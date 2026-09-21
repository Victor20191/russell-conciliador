// Cómo se leen los avances de Novedades dentro del reporte para gerencia.
//
// Dos reglas, las dos por el mismo motivo: el reporte se le entrega al cliente
// y ahí no cabe ni la cocina interna ni una frase a medias.
//
// 1. NINGÚN proveedor ni modelo por su nombre. Las novedades se escriben con
//    detalle técnico («asistida por Inteligencia Artificial (Claude)», «la IA
//    (Claude) lee el archivo») y eso compromete a la firma con una marca, queda
//    desactualizado en cuanto se cambia de modelo y no le dice nada a gerencia.
//    En el reporte todo eso es «IA».
// 2. Las descripciones se cortan en ORACIÓN COMPLETA. Recortar a un número seco
//    de caracteres dejaba textos terminados en «…la IA trabaja en modo
//    ESTRUCTURA, es…», que se lee como un error de la plataforma.
//
// Módulo PURO.

/**
 * Proveedores y modelos que no deben aparecer. Se nombran con `\b` para no
 * tocar palabras que los contengan, y las familias de Claude solo cuentan
 * acompañadas de la marca (un «opus» suelto en una frase no es un modelo).
 */
/**
 * Identificadores técnicos, con guiones o puntos: `claude-sonnet-4-6`,
 * `gemini-3.1-flash-lite`, `kimi-k3`, `gpt-4o`. Van PRIMERO porque la regla por
 * palabras solo alcanzaría la marca y dejaría el sufijo suelto («IA-sonnet-4-6»).
 */
const MODELOS_ID = /\b(claude|gpt|gemini|kimi|llama|mistral|nemotron|opus|sonnet|haiku)(?:[-.][a-z0-9]+)+\b/gi;

const MODELOS_IA =
  /\b(claude(\s+(opus|sonnet|haiku|fable)(\s*[\d.]+)?)?|anthropic|gemini|chat\s?gpt|gpt-?[\d.]*|openai|kimi(\s*k\s*\d)?|opencode|openrouter|nemotron|llama|mistral)\b/gi;

/**
 * Variables de entorno del proveedor (`ANTHROPIC_MODEL`, `GEMINI_API_KEY`). El
 * guion bajo es parte de la palabra, así que la regla anterior no las alcanza;
 * y de todos modos a gerencia no se le explica la configuración por dentro.
 */
const VARIABLES_IA =
  /\b(?:ANTHROPIC|OPENAI|CLAUDE|GEMINI|OPENCODE|OPENROUTER|KIMI|GPT)_[A-Z0-9_]+\b/g;

/** Un paréntesis que solo contiene el nombre del modelo sobra entero. */
const PARENTESIS_CORTO = /\s*[([]([^()[\]]{1,40})[)\]]/g;

/** Repeticiones que deja la sustitución: «IA (IA)», «Inteligencia Artificial IA». */
const REPETIDOS: Array<[RegExp, string]> = [
  [/\b(?:la\s+)?variables?\s+de\s+entorno\s+la\s+configuración de IA\b/gi, "la configuración de IA"],
  [/\bInteligencia Artificial\s+IA\b/gi, "Inteligencia Artificial"],
  [/\bIA\s+IA\b/g, "IA"],
  [/\bla\s+IA\s+de\s+IA\b/gi, "la IA"],
  [/\s{2,}/g, " "],
  [/\s+([,.;:])/g, "$1"],
];

/** Antes de una preposición, quitar el paréntesis dejaría la frase coja. */
const PREPOSICION_FINAL = /\b(con|por|de|del|a|al|en|usando|mediante|vía|via)$/i;

/** Reemplaza cualquier proveedor o modelo por «IA». Conserva el resto del texto. */
export function anonimizarModelosIA(texto: string): string {
  let out = texto.replace(PARENTESIS_CORTO, (completo, dentro: string, posicion: number) => {
    // «(Claude)» y «(Claude Opus 4.8)» sobran; «(Excel/CSV)» se conserva.
    const limpio = dentro.replace(MODELOS_ID, "").replace(MODELOS_IA, "").replace(/[\s,;/y]+/gi, "");
    if (limpio.length > 0) return completo;
    // «asistida por Inteligencia Artificial (Claude)» → se quita el paréntesis;
    // «extracción con (Claude)» → queda «extracción con IA», no «con».
    const previo = texto.slice(0, posicion).trimEnd();
    return PREPOSICION_FINAL.test(previo) ? " IA" : "";
  });
  out = out
    .replace(VARIABLES_IA, "la configuración de IA")
    .replace(MODELOS_ID, "IA")
    .replace(MODELOS_IA, "IA");
  for (const [patron, reemplazo] of REPETIDOS) out = out.replace(patron, reemplazo);
  return out.trim();
}

const FIN_DE_ORACION = /[.!?](?=\s|$)/g;

/**
 * Resumen del avance: las primeras oraciones completas que caben en `max`.
 *
 * Si ni la primera oración cabe, se corta en la última palabra y se marca con
 * «…» —ahí no hay forma de terminar la idea—, pero en todo lo demás el texto
 * termina en punto.
 */
export function resumirCambio(texto: string | null | undefined, max = 420): string {
  const limpio = (texto ?? "").replace(/\s+/g, " ").trim();
  if (!limpio) return "";
  if (limpio.length <= max) return limpio;

  let corte = 0;
  for (const m of limpio.matchAll(FIN_DE_ORACION)) {
    const fin = (m.index ?? 0) + 1;
    if (fin > max) break;
    corte = fin;
  }
  if (corte > 0) return limpio.slice(0, corte).trim();

  const duro = limpio.slice(0, max);
  const ultimoEspacio = duro.lastIndexOf(" ");
  return `${(ultimoEspacio > max * 0.6 ? duro.slice(0, ultimoEspacio) : duro).trim()}…`;
}

/** Título de un avance: sin modelo y acotado. */
export function tituloAvance(texto: string | null | undefined, max = 180): string {
  const limpio = anonimizarModelosIA((texto ?? "").replace(/\s+/g, " ").trim());
  return limpio.length <= max ? limpio : `${limpio.slice(0, max - 1).trim()}…`;
}

/** Descripción de un avance tal como se le muestra al cliente. */
export function descripcionAvance(texto: string | null | undefined, max = 420): string {
  return resumirCambio(anonimizarModelosIA((texto ?? "").trim()), max);
}
