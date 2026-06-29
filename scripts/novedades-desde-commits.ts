// ============================================================
// Vuelca los commits del ÚLTIMO DÍA a /novedades como borradores.
//
// Pensado para ejecutarse desde un hook SessionEnd de Claude Code
// (.claude/hooks/novedades-desde-commits.sh), pero también a mano:
//
//     npm run novedades:commits
//
// Qué hace:
//   1. Lee los commits recientes de git (sin merges) — ventana configurable
//      con NOVEDADES_COMMITS_SINCE (por defecto "1 day ago").
//   2. Los agrupa por fecha (una versión "dev-AAAA-MM-DD" por día).
//   3. Redacta cada cambio en lenguaje funcional con IA. El modelo se elige con
//      NOVEDADES_IA_MODELO (ver "Selección de modelo de IA" más abajo): Claude
//      (Anthropic, p. ej. Opus) o Gemini (Google directo o vía OpenRouter).
//      Si no hay credenciales o la IA falla, cae a un volcado determinista
//      basado en el prefijo del commit (feat/fix/...).
//   4. Hace UPSERT de la versión del día y RECREA sus cambios (reset acotado,
//      igual que prisma/seed-novedades.ts). Las versiones quedan en "borrador"
//      para que un administrador las revise/publique desde /novedades.
//
// BEST-EFFORT: nunca lanza hacia afuera. Si algo falla (sin red, sin BD, sin
// commits), registra el motivo y termina con código 0 para no entorpecer el
// cierre de la sesión.
//
// IDEMPOTENTE: guarda el conjunto de hashes ya procesado por fecha en
// .claude/novedades-state.json; si una fecha no tiene commits nuevos desde la
// última corrida, la salta (no llama a la IA ni toca la BD).
// ============================================================

import "dotenv/config";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { CLAVE_MODELO_NOVEDADES, MODELO_NOVEDADES_DEFECTO } from "../src/lib/ia/modelos-novedades";

// ---------- Tipos ----------

type Commit = {
  full: string; // hash completo
  short: string; // hash corto
  fecha: string; // AAAA-MM-DD (fecha del autor)
  subject: string;
  body: string;
};

type TipoCambio = "nueva" | "mejora" | "correccion" | "seguridad";
type EstadoFuncionalidad = "disponible" | "en_desarrollo" | "planeada";

type Cambio = {
  type: TipoCambio;
  title: string;
  description: string;
  moduleKey: string | null;
  route: string | null;
  howTo: string | null;
  example: string | null;
  featureStatus: EstadoFuncionalidad;
};

// ---------- Constantes ----------

const TIPOS_VALIDOS: TipoCambio[] = ["nueva", "mejora", "correccion", "seguridad"];
const ESTADOS_VALIDOS: EstadoFuncionalidad[] = ["disponible", "en_desarrollo", "planeada"];

const SINCE = process.env.NOVEDADES_COMMITS_SINCE?.trim() || "1 day ago";

// --- Selección de modelo de IA ---------------------------------------------
// El modelo se resuelve en runtime (resolverModeloIA) con esta precedencia:
//   1) NOVEDADES_IA_MODELO en el entorno (override puntual, p. ej. para pruebas)
//   2) lo elegido en la app (BD: configuracion_plataforma → "novedades.modelo_ia")
//   3) MODELO_NOVEDADES_DEFECTO ("opus")
// Alias: "opus|anthropic|claude" → Claude (ANTHROPIC_MODEL, def. claude-opus-4-8);
//        "gemini|gemini-flash|flash" → Gemini (GEMINI_MODEL, def. gemini-3.1-flash).
// Credenciales (se eligen solas): Claude → ANTHROPIC_API_KEY; Gemini → GEMINI_API_KEY
// (API de Google) o, si falta, OPENROUTER_API_KEY. Si el proveedor elegido no está
// disponible se intenta el otro; si ninguno, se usa el volcado determinista.
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL?.trim() || "claude-opus-4-8";
const GEMINI_MODEL = process.env.GEMINI_MODEL?.trim() || "gemini-3.1-flash";
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY?.trim();
const GEMINI_API_KEY = process.env.GEMINI_API_KEY?.trim();
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY?.trim();
const IA_TIMEOUT_MS = Number(process.env.NOVEDADES_IA_TIMEOUT_MS) || 120_000;
const IA_MAX_TOKENS = Number(process.env.NOVEDADES_IA_MAX_TOKENS) || 16_000;

const STATE_PATH =
  process.env.NOVEDADES_STATE_PATH?.trim() || join(process.cwd(), ".claude", "novedades-state.json");
const RUTA_INTERNA = /^\/(?!\/)[A-Za-z0-9/_-]*$/;

// ---------- Utilidades puras ----------

function recortar(texto: string, max: number): string {
  const t = texto.trim();
  return t.length > max ? t.slice(0, max - 1).trimEnd() + "…" : t;
}

function nullSiVacio(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
}

function fechaLegible(iso: string): string {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

/** Mapea el prefijo de un Conventional Commit a un tipo de novedad. */
function tipoDesdeSubject(subject: string): TipoCambio {
  const m = /^(\w+)(\([^)]*\))?(!)?:/.exec(subject.trim());
  const prefijo = m?.[1]?.toLowerCase() ?? "";
  if (/^(feat|feature)$/.test(prefijo)) return "nueva";
  if (/^(fix|bugfix|hotfix)$/.test(prefijo)) return "correccion";
  if (/^(sec|security)$/.test(prefijo) || /seguridad|vulnerab/i.test(subject)) return "seguridad";
  return "mejora";
}

/** Quita el prefijo "feat(scope): " del subject para un título más legible. */
function tituloDesdeSubject(subject: string): string {
  const sin = subject.replace(/^(\w+)(\([^)]*\))?(!)?:\s*/, "").trim();
  const limpio = sin || subject.trim();
  return limpio.charAt(0).toUpperCase() + limpio.slice(1);
}

function saneaCambio(parcial: Partial<Cambio>, commit: Commit): Cambio {
  const type = TIPOS_VALIDOS.includes(parcial.type as TipoCambio)
    ? (parcial.type as TipoCambio)
    : tipoDesdeSubject(commit.subject);
  const featureStatus = ESTADOS_VALIDOS.includes(parcial.featureStatus as EstadoFuncionalidad)
    ? (parcial.featureStatus as EstadoFuncionalidad)
    : "disponible";
  const ruta = nullSiVacio(parcial.route);
  return {
    type,
    title: recortar(parcial.title?.trim() || tituloDesdeSubject(commit.subject), 200),
    description: recortar(
      parcial.description?.trim() || commit.body.trim() || commit.subject.trim(),
      8000,
    ),
    moduleKey: parcial.moduleKey ? recortar(parcial.moduleKey, 60) : null,
    route: ruta && RUTA_INTERNA.test(ruta) ? recortar(ruta, 200) : null,
    howTo: parcial.howTo ? recortar(parcial.howTo, 8000) : null,
    example: parcial.example ? recortar(parcial.example, 8000) : null,
    featureStatus,
  };
}

/** Volcado determinista (sin IA) a partir del commit. */
function cambioFallback(commit: Commit): Cambio {
  return saneaCambio(
    {
      type: tipoDesdeSubject(commit.subject),
      title: tituloDesdeSubject(commit.subject),
      description: commit.body.trim() || commit.subject.trim(),
      featureStatus: "disponible",
    },
    commit,
  );
}

// ---------- Git ----------

function leerCommits(): Commit[] {
  const US = "\x1f"; // separador de campo
  const RS = "\x1e"; // separador de registro
  let salida = "";
  try {
    salida = execFileSync(
      "git",
      [
        "log",
        "--no-merges",
        `--since=${SINCE}`,
        `--pretty=format:%H${US}%h${US}%aI${US}%s${US}%b${RS}`,
      ],
      { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 },
    );
  } catch {
    return []; // no es un repo git, o git no disponible
  }
  return salida
    .split(RS)
    .map((reg) => reg.replace(/^\n/, ""))
    .filter((reg) => reg.trim() !== "")
    .map((reg) => {
      const [full, short, aIso, subject, body] = reg.split(US);
      return {
        full: full ?? "",
        short: short ?? "",
        fecha: (aIso ?? "").slice(0, 10),
        subject: subject ?? "",
        body: (body ?? "").trim(),
      };
    })
    .filter((c) => c.full && c.fecha);
}

function agruparPorFecha(commits: Commit[]): Map<string, Commit[]> {
  const mapa = new Map<string, Commit[]>();
  for (const c of commits) {
    const lista = mapa.get(c.fecha) ?? [];
    lista.push(c);
    mapa.set(c.fecha, lista);
  }
  return mapa;
}

// ---------- Estado (dedupe) ----------

type Estado = Record<string, { hashes: string[] }>;

function leerEstado(): Estado {
  try {
    return JSON.parse(readFileSync(STATE_PATH, "utf8")) as Estado;
  } catch {
    return {};
  }
}

function guardarEstado(estado: Estado): void {
  try {
    mkdirSync(dirname(STATE_PATH), { recursive: true });
    writeFileSync(STATE_PATH, JSON.stringify(estado, null, 2));
  } catch (e) {
    console.warn("No se pudo guardar el estado de dedupe:", (e as Error).message);
  }
}

function mismosHashes(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sa = new Set(a);
  return b.every((h) => sa.has(h));
}

// ---------- Redacción con IA (Anthropic / Gemini) ----------

/** Objeto crudo que devuelve la IA por cada commit (antes de sanear). */
type ItemIA = {
  hash?: string;
  tipo?: string;
  titulo?: string;
  descripcion?: string;
  comoOperar?: string;
  ejemplo?: string;
  modulo?: string;
  ruta?: string;
  estadoFuncionalidad?: string;
};

type Proveedor = "anthropic" | "gemini";

const ALIAS_PROVEEDOR: Record<string, Proveedor> = {
  opus: "anthropic",
  anthropic: "anthropic",
  claude: "anthropic",
  sonnet: "anthropic",
  haiku: "anthropic",
  gemini: "gemini",
  "gemini-flash": "gemini",
  flash: "gemini",
};

/** Decide el proveedor a partir del alias/id de NOVEDADES_IA_MODELO. */
function proveedorDe(sel: string): Proveedor {
  if (ALIAS_PROVEEDOR[sel]) return ALIAS_PROVEEDOR[sel];
  if (sel.includes("gemini")) return "gemini";
  return "anthropic";
}

const SYSTEM_PROMPT = `Eres redactor técnico de producto de "Russell Diagnóstico", una plataforma web de revisoría fiscal y diagnóstico contable (Next.js) para socios, gerentes, seniors y staff contable en Colombia.

Tu tarea: convertir mensajes de commit de git en entradas de changelog orientadas al USUARIO FINAL (no al desarrollador). Escribe en español de Colombia, claro y profesional, sin jerga técnica de programación (nada de "refactor", "endpoint", "merge", nombres de archivos ni de funciones).

Para CADA commit devuelve un objeto con:
- hash: el hash que se te dio (cópialo EXACTO).
- tipo: "nueva" (funcionalidad nueva), "mejora" (mejora o cambio), "correccion" (arreglo de error) o "seguridad" (cambio de seguridad).
- titulo: máx 90 caracteres, en lenguaje de negocio.
- descripcion: 2 a 4 frases explicando QUÉ cambió y POR QUÉ le sirve al usuario.
- comoOperar: pasos breves para usar la funcionalidad (o "" si no aplica).
- ejemplo: un ejemplo práctico corto (o "").
- modulo: área afectada en minúsculas si es evidente (p. ej. "balance", "novedades", "clientes", "usuarios"), o "".
- ruta: deep-link interno si es evidente (debe empezar por "/", p. ej. "/balance"), o "".
- estadoFuncionalidad: "disponible" salvo que el commit indique trabajo en progreso ("en_desarrollo") o planeado ("planeada").

Devuelve un objeto JSON con la forma {"cambios": [ ... ]} y EXACTAMENTE un objeto por commit recibido (uno por cada hash que se te dio), ni más ni menos, en el mismo orden. Si un commit reúne varios cambios, resúmelos en UNA sola entrada y destaca el cambio PRINCIPAL en el título (no te quedes con un detalle secundario).`;

/** Lista los commits en texto para el prompt de usuario. */
function construirPromptUsuario(commits: Commit[]): string {
  const lista = commits
    .map(
      (c) =>
        `--- commit ${c.short} (hash: ${c.full})\nasunto: ${c.subject}\ndetalle: ${
          c.body || "(sin cuerpo)"
        }`,
    )
    .join("\n\n");
  return `Commits a documentar:\n\n${lista}`;
}

/** Esquema de un ítem en JSON Schema estándar (Anthropic tool / referencia). */
const ITEM_JSON_SCHEMA = {
  type: "object",
  properties: {
    hash: { type: "string" },
    tipo: { type: "string", enum: TIPOS_VALIDOS },
    titulo: { type: "string" },
    descripcion: { type: "string" },
    comoOperar: { type: "string" },
    ejemplo: { type: "string" },
    modulo: { type: "string" },
    ruta: { type: "string" },
    estadoFuncionalidad: { type: "string", enum: ESTADOS_VALIDOS },
  },
  required: ["hash", "tipo", "titulo", "descripcion"],
} as const;

/** Mismo esquema en el dialecto de Google (tipos en MAYÚSCULAS). */
const GEMINI_RESPONSE_SCHEMA = {
  type: "ARRAY",
  items: {
    type: "OBJECT",
    properties: {
      hash: { type: "STRING" },
      tipo: { type: "STRING", enum: TIPOS_VALIDOS },
      titulo: { type: "STRING" },
      descripcion: { type: "STRING" },
      comoOperar: { type: "STRING" },
      ejemplo: { type: "STRING" },
      modulo: { type: "STRING" },
      ruta: { type: "STRING" },
      estadoFuncionalidad: { type: "STRING", enum: ESTADOS_VALIDOS },
    },
    required: ["hash", "tipo", "titulo", "descripcion"],
    propertyOrdering: [
      "hash",
      "tipo",
      "titulo",
      "descripcion",
      "comoOperar",
      "ejemplo",
      "modulo",
      "ruta",
      "estadoFuncionalidad",
    ],
  },
};

type RespuestaGemini = {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
};

type RespuestaOpenRouter = {
  choices?: Array<{ message?: { content?: string | null } | null }>;
};

/** Parseo tolerante: admite JSON con fences ```json o texto alrededor. */
function parseJsonTolerante(texto: string): unknown {
  const limpio = texto
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "");
  try {
    return JSON.parse(limpio);
  } catch {
    const i = limpio.indexOf("[");
    const j = limpio.lastIndexOf("]");
    if (i >= 0 && j > i) {
      try {
        return JSON.parse(limpio.slice(i, j + 1));
      } catch {
        /* sigue */
      }
    }
    const a = limpio.indexOf("{");
    const b = limpio.lastIndexOf("}");
    if (a >= 0 && b > a) return JSON.parse(limpio.slice(a, b + 1));
    throw new Error("La IA no devolvió JSON válido.");
  }
}

/** Extrae el arreglo de ítems de un JSON (array directo o {cambios:[...]}). */
function extraerArrayItems(parsed: unknown): ItemIA[] | null {
  if (Array.isArray(parsed)) return parsed as ItemIA[];
  if (parsed && typeof parsed === "object") {
    const arr = (parsed as { cambios?: unknown }).cambios;
    if (Array.isArray(arr)) return arr as ItemIA[];
  }
  return null;
}

/** Claude (Anthropic) con tool_use forzado → JSON garantizado. */
async function redactarConAnthropic(commits: Commit[]): Promise<ItemIA[] | null> {
  if (!ANTHROPIC_API_KEY) {
    console.warn("Sin ANTHROPIC_API_KEY: no se puede usar Claude.");
    return null;
  }
  try {
    const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY, timeout: IA_TIMEOUT_MS, maxRetries: 2 });
    const resp = await client.messages.create({
      model: ANTHROPIC_MODEL,
      max_tokens: IA_MAX_TOKENS,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: construirPromptUsuario(commits) }],
      tools: [
        {
          name: "registrar_novedades",
          description: "Registra las entradas de changelog redactadas, una por commit.",
          input_schema: {
            type: "object",
            properties: { cambios: { type: "array", items: ITEM_JSON_SCHEMA } },
            required: ["cambios"],
          },
        },
      ],
      tool_choice: { type: "tool", name: "registrar_novedades" },
    });
    const bloque = resp.content.find((b) => b.type === "tool_use");
    if (!bloque || bloque.type !== "tool_use") {
      console.warn("Claude no devolvió la herramienta esperada.");
      return null;
    }
    const arr = extraerArrayItems(bloque.input);
    if (arr) console.log(`Claude (${ANTHROPIC_MODEL}) redactó ${arr.length} cambio(s).`);
    return arr;
  } catch (e) {
    console.warn("Claude falló:", (e as Error).message);
    return null;
  }
}

/** Gemini por la API directa de Google (Generative Language API). */
async function redactarConGeminiGoogle(commits: Commit[]): Promise<ItemIA[] | null> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    GEMINI_MODEL,
  )}:generateContent`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), IA_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json", "x-goog-api-key": GEMINI_API_KEY! },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: "user", parts: [{ text: construirPromptUsuario(commits) }] }],
        generationConfig: {
          temperature: 0.3,
          responseMimeType: "application/json",
          responseSchema: GEMINI_RESPONSE_SCHEMA,
        },
      }),
    });
    if (!res.ok) {
      console.warn(`Gemini (Google) HTTP ${res.status}: ${(await res.text()).slice(0, 400)}`);
      return null;
    }
    const payload = (await res.json()) as RespuestaGemini;
    const texto = payload.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
    if (!texto.trim()) {
      console.warn("Gemini (Google) no devolvió contenido.");
      return null;
    }
    const arr = extraerArrayItems(parseJsonTolerante(texto));
    if (arr) console.log(`Gemini (${GEMINI_MODEL}, API de Google) redactó ${arr.length} cambio(s).`);
    return arr;
  } catch (e) {
    console.warn("Gemini (Google) falló:", (e as Error).message);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/** Gemini servido por OpenRouter (reusa OPENROUTER_API_KEY). */
async function redactarConGeminiOpenRouter(commits: Commit[]): Promise<ItemIA[] | null> {
  const modelo = GEMINI_MODEL.startsWith("google/") ? GEMINI_MODEL : `google/${GEMINI_MODEL}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), IA_TIMEOUT_MS);
  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "HTTP-Referer": process.env.OPENROUTER_SITE_URL ?? "http://localhost:3000",
        "X-Title": process.env.OPENROUTER_APP_NAME ?? "Russell Diagnostico",
      },
      body: JSON.stringify({
        model: modelo,
        temperature: 0.3,
        max_tokens: IA_MAX_TOKENS,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: construirPromptUsuario(commits) },
        ],
      }),
    });
    if (!res.ok) {
      console.warn(`Gemini (OpenRouter) HTTP ${res.status}: ${(await res.text()).slice(0, 400)}`);
      return null;
    }
    const payload = (await res.json()) as RespuestaOpenRouter;
    const texto = payload.choices?.[0]?.message?.content ?? "";
    const arr = extraerArrayItems(parseJsonTolerante(typeof texto === "string" ? texto : ""));
    if (arr) console.log(`Gemini (${modelo}, vía OpenRouter) redactó ${arr.length} cambio(s).`);
    return arr;
  } catch (e) {
    console.warn("Gemini (OpenRouter) falló:", (e as Error).message);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/** Elige la vía de Gemini según las credenciales disponibles. */
async function redactarConGemini(commits: Commit[]): Promise<ItemIA[] | null> {
  if (GEMINI_API_KEY) return redactarConGeminiGoogle(commits);
  if (OPENROUTER_API_KEY) {
    console.log("Sin GEMINI_API_KEY: se usa Gemini vía OpenRouter.");
    return redactarConGeminiOpenRouter(commits);
  }
  console.warn("Sin GEMINI_API_KEY ni OPENROUTER_API_KEY: no se puede usar Gemini.");
  return null;
}

/**
 * Redacta los cambios con el proveedor elegido (NOVEDADES_IA_MODELO) y, si no
 * está disponible, cae al otro proveedor. Devuelve un mapa hash→Cambio (vacío
 * si ninguna IA respondió: el llamador usa el volcado determinista).
 */
async function redactarConIA(commits: Commit[], modelo: string): Promise<Map<string, Cambio>> {
  const principal = proveedorDe(modelo);
  const orden: Proveedor[] = principal === "anthropic" ? ["anthropic", "gemini"] : ["gemini", "anthropic"];

  let items: ItemIA[] | null = null;
  for (const prov of orden) {
    items = prov === "anthropic" ? await redactarConAnthropic(commits) : await redactarConGemini(commits);
    if (items && items.length) {
      if (prov !== principal) console.warn(`IA: se usó "${prov}" como respaldo de "${principal}".`);
      break;
    }
  }

  if (!items || !items.length) {
    console.warn("Ninguna IA disponible; se usa volcado determinista (sin IA).");
    return new Map();
  }

  const porHash = new Map(commits.map((c) => [c.full, c] as const));
  const resultado = new Map<string, Cambio>();
  for (const item of items) {
    const commit = porHash.get(typeof item.hash === "string" ? item.hash : "");
    if (!commit) continue;
    resultado.set(
      commit.full,
      saneaCambio(
        {
          type: item.tipo as TipoCambio,
          title: item.titulo,
          description: item.descripcion,
          howTo: nullSiVacio(item.comoOperar) ?? undefined,
          example: nullSiVacio(item.ejemplo) ?? undefined,
          moduleKey: nullSiVacio(item.modulo) ?? undefined,
          route: nullSiVacio(item.ruta) ?? undefined,
          featureStatus: item.estadoFuncionalidad as EstadoFuncionalidad,
        },
        commit,
      ),
    );
  }
  if (resultado.size < commits.length) {
    console.warn(
      `IA cubrió ${resultado.size}/${commits.length} commit(s); el resto usará volcado determinista.`,
    );
  }
  return resultado;
}

// ---------- Persistencia ----------

const DRY_RUN = ["1", "true", "yes"].includes(
  (process.env.NOVEDADES_DRY_RUN ?? "").trim().toLowerCase(),
);

let prismaSingleton: PrismaClient | null = null;
function getPrisma(): PrismaClient {
  if (!prismaSingleton) {
    const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
    prismaSingleton = new PrismaClient({ adapter });
  }
  return prismaSingleton;
}

/**
 * Resuelve el modelo a usar: override por entorno > preferencia guardada en la
 * app (BD) > valor por defecto. Best-effort: si la BD falla, cae al default.
 */
async function resolverModeloIA(): Promise<string> {
  const env = process.env.NOVEDADES_IA_MODELO?.trim();
  if (env) return env.toLowerCase();
  try {
    const fila = await getPrisma().configuracionPlataforma.findUnique({
      where: { clave: CLAVE_MODELO_NOVEDADES },
      select: { valor: true },
    });
    if (fila?.valor) return fila.valor.trim().toLowerCase();
  } catch (e) {
    console.warn("No se pudo leer el modelo configurado en la BD:", (e as Error).message);
  }
  return MODELO_NOVEDADES_DEFECTO;
}

async function main() {
  const commits = leerCommits();
  if (commits.length === 0) {
    console.log(`No hay commits desde "${SINCE}". Nada que registrar.`);
    return;
  }

  const porFecha = agruparPorFecha(commits);
  const estado = leerEstado();

  // Filtra las fechas que ya están al día (mismos hashes que la última corrida).
  const fechasPendientes = [...porFecha.entries()].filter(([fecha, lista]) => {
    const number = `dev-${fecha}`;
    const previo = estado[number]?.hashes ?? [];
    const actuales = lista.map((c) => c.full);
    if (mismosHashes(previo, actuales)) {
      console.log(`v${number}: sin commits nuevos, se omite.`);
      return false;
    }
    return true;
  });

  if (fechasPendientes.length === 0) {
    console.log("Todo al día. Nada que actualizar.");
    return;
  }

  // Una sola llamada a la IA con todos los commits pendientes.
  const pendientes = fechasPendientes.flatMap(([, lista]) => lista);
  const modelo = await resolverModeloIA();
  console.log(`Modelo de IA: "${modelo}" → proveedor "${proveedorDe(modelo)}".`);
  const redacciones = await redactarConIA(pendientes, modelo);

  for (const [fecha, lista] of fechasPendientes) {
    const number = `dev-${fecha}`;
    const cambios = lista.map(
      (c) => ({ commit: c, cambio: redacciones.get(c.full) ?? cambioFallback(c) }),
    );

    if (DRY_RUN) {
      console.log(`\n[DRY-RUN] v${number} · ${cambios.length} cambio(s):`);
      for (const { commit, cambio } of cambios) {
        console.log(
          `  · [${cambio.type}] ${cambio.title}  (commit ${commit.short}` +
            `${cambio.route ? `, ruta ${cambio.route}` : ""})`,
        );
      }
      estado[number] = { hashes: lista.map((c) => c.full) };
      continue;
    }

    const prisma = getPrisma();
    const version = await prisma.platformVersion.upsert({
      where: { number },
      create: {
        number,
        title: `Cambios del ${fechaLegible(fecha)}`,
        summary: `Generado automáticamente desde ${lista.length} commit(s) del ${fechaLegible(
          fecha,
        )}. Revisa y publica desde /novedades.`,
        status: "borrador",
        order: 0,
      },
      update: {
        title: `Cambios del ${fechaLegible(fecha)}`,
        summary: `Generado automáticamente desde ${lista.length} commit(s) del ${fechaLegible(
          fecha,
        )}. Revisa y publica desde /novedades.`,
      },
    });

    // Reset acotado: borra y recrea los cambios de ESTA versión del día.
    await prisma.versionChange.deleteMany({ where: { versionId: version.id } });
    await prisma.versionChange.createMany({
      data: cambios.map(({ cambio }, i) => ({
        versionId: version.id,
        type: cambio.type,
        title: cambio.title,
        description: cambio.description,
        moduleKey: cambio.moduleKey,
        route: cambio.route,
        howTo: cambio.howTo,
        example: cambio.example,
        featureStatus: cambio.featureStatus,
        order: i,
      })),
    });

    estado[number] = { hashes: lista.map((c) => c.full) };
    console.log(`✔ v${number}: ${cambios.length} cambio(s) registrados.`);
  }

  guardarEstado(estado);
}

main()
  .catch((e) => {
    // BEST-EFFORT: no romper el cierre de sesión. Reportar y salir con 0.
    console.error("novedades-desde-commits falló (se ignora):", e);
  })
  .finally(async () => {
    await prismaSingleton?.$disconnect();
  });
