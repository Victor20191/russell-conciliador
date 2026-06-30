// ============================================================
// Vuelca los commits del ÚLTIMO DÍA a /novedades como borradores.
//
// Se ejecuta A MANO cuando quieras volcar las novedades del día:
//
//     npm run novedades:commits
//
// Qué hace:
//   1. Lee los commits recientes de git (sin merges) — ventana configurable
//      con NOVEDADES_COMMITS_SINCE (por defecto "1 day ago").
//   2. CLASIFICA en dos capas para registrar SOLO lo que el usuario percibe
//      (no "cualquier cambio", p. ej. el tamaño de un botón):
//        · Capa 1 (determinista, sin IA): descarta los commits PURAMENTE
//          INTERNOS por su prefijo Conventional Commit (build, ci, test, deps,
//          chore, revert, merge…). Nunca llegan a la IA: no gastan tokens.
//        · Capa 2 (IA, Gemini): de los candidatos que pasan, el modelo decide
//          `relevante` (¿lo percibe el usuario final?) y descarta lo interno o
//          lo cosmético trivial. Solo los `relevante` se registran.
//   3. Redacta cada cambio relevante en lenguaje funcional (Gemini). Si no hay
//      GEMINI_API_KEY o la IA falla, cae a un volcado determinista CONSERVADOR:
//      registra solo feat/fix (nueva/corrección), que es lo más probablemente
//      visible, y omite el resto (sin IA no se puede juzgar la visibilidad).
//   4. Agrupa por fecha (una versión "dev-AAAA-MM-DD" por día) y hace UPSERT de
//      la versión y RECREA sus cambios (reset acotado). Quedan en "borrador"
//      para que un administrador los revise/publique desde /novedades.
//
// BEST-EFFORT: nunca lanza hacia afuera. Si algo falla (sin red, sin BD, sin
// commits), registra el motivo y termina con código 0 para no entorpecer el
// cierre de la sesión.
//
// IDEMPOTENTE: guarda el conjunto de hashes CANDIDATOS ya procesado por fecha en
// .claude/novedades-state.json; si una fecha no tiene candidatos nuevos desde la
// última corrida, la salta (no llama a la IA ni toca la BD).
// ============================================================

import "dotenv/config";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

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

/** Decisión de clasificación por commit: se registra o se descarta. */
type Decision =
  | { relevante: true; cambio: Cambio }
  | { relevante: false; motivo: string };

// ---------- Constantes ----------

const TIPOS_VALIDOS: TipoCambio[] = ["nueva", "mejora", "correccion", "seguridad"];
const ESTADOS_VALIDOS: EstadoFuncionalidad[] = ["disponible", "en_desarrollo", "planeada"];

const SINCE = process.env.NOVEDADES_COMMITS_SINCE?.trim() || "1 day ago";

// --- Gemini (mismo proveedor que los reportes de /novedades) ----------------
// El hook reusa Gemini con GEMINI_API_KEY (o GOOGLE_GENERATIVE_AI_API_KEY) y el
// modelo GEMINI_MODEL (mismo default que src/lib/novedades/reportes.ts). Sin
// clave, el hook sigue funcionando con el volcado determinista (solo feat/fix).
const GEMINI_MODEL = process.env.GEMINI_MODEL?.trim() || "gemini-3-flash-preview";
const GEMINI_API_KEY =
  process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim();
const IA_TIMEOUT_MS = Number(process.env.NOVEDADES_IA_TIMEOUT_MS) || 120_000;
const IA_MAX_TOKENS = Number(process.env.NOVEDADES_IA_MAX_TOKENS) || 24_000;

const STATE_PATH =
  process.env.NOVEDADES_STATE_PATH?.trim() || join(process.cwd(), ".claude", "novedades-state.json");
const RUTA_INTERNA = /^\/(?!\/)[A-Za-z0-9/_-]*$/;

// Capa 1 — prefijos Conventional Commit PURAMENTE INTERNOS: el usuario final no
// los percibe, así que se descartan SIN consultar a la IA (no gastan tokens).
// Todo lo demás (feat, fix, perf, refactor, style, ui, docs, sin prefijo…) pasa
// a la Capa 2, donde la IA juzga si el usuario lo percibe.
const TIPOS_INTERNOS = new Set([
  "build",
  "ci",
  "cd",
  "chore",
  "test",
  "tests",
  "dep",
  "deps",
  "dependencies",
  "revert",
  "merge",
  "release",
  "bump",
  "infra",
  "ops",
  "meta",
]);

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

/** Extrae el prefijo de un Conventional Commit ("feat(x): …" → "feat"). */
function prefijoDe(subject: string): string {
  const m = /^(\w+)(\([^)]*\))?(!)?:/.exec(subject.trim());
  return m?.[1]?.toLowerCase() ?? "";
}

/** Mapea el prefijo de un Conventional Commit a un tipo de novedad. */
function tipoDesdeSubject(subject: string): TipoCambio {
  const prefijo = prefijoDe(subject);
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

/** Capa 1: ¿es un commit puramente interno que el usuario no percibe? */
function esCommitInterno(commit: Commit): boolean {
  return TIPOS_INTERNOS.has(prefijoDe(commit.subject));
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

// ---------- Clasificación + redacción con IA (Gemini) ----------

/** Objeto crudo que devuelve la IA por cada commit (antes de sanear). */
type ItemIA = {
  hash?: string;
  relevante?: boolean;
  motivoDescarte?: string;
  tipo?: string;
  titulo?: string;
  descripcion?: string;
  comoOperar?: string;
  ejemplo?: string;
  modulo?: string;
  ruta?: string;
  estadoFuncionalidad?: string;
};

const SYSTEM_PROMPT = `Eres redactor técnico de producto de "Russell Diagnóstico", una plataforma web de revisoría fiscal y diagnóstico contable (Next.js) para socios, gerentes, seniors y staff contable en Colombia.

Recibes mensajes de commit de git. Tu trabajo tiene DOS partes por cada commit:

PARTE 1 — CLASIFICAR (campo "relevante"):
Decide si el cambio es PERCEPTIBLE para el USUARIO FINAL de la plataforma.
- relevante=true cuando el usuario puede NOTARLO al usar la plataforma: funcionalidades nuevas, mejoras de interfaz o de flujo, correcciones de errores visibles, cambios de comportamiento, nuevos campos/reportes/validaciones/filtros, cambios de textos o mensajes con significado, mejoras de experiencia (UX) perceptibles.
- relevante=false SOLO cuando el usuario NO puede percibirlo: trabajo puramente interno (refactorización, arquitectura, optimizaciones internas sin efecto visible, cambios de build, dependencias, configuración técnica, pruebas, CI/CD, formato de código) o un retoque cosmético trivial SIN ningún valor de uso (por ejemplo, ajustar apenas el tamaño o el color de un botón sin cambiar lo que hace).
- Ante la duda razonable de si el usuario lo percibe, marca relevante=true.
Si relevante=false, escribe en "motivoDescarte" una frase breve del porqué y deja vacíos los demás campos.

PARTE 2 — REDACTAR (solo si relevante=true):
Convierte el commit en una entrada de changelog orientada al usuario final, en español de Colombia, clara y profesional, SIN jerga técnica de programación (nada de "refactor", "endpoint", "merge", nombres de archivos ni de funciones). Devuelve:
- tipo: "nueva" (funcionalidad nueva), "mejora" (mejora o cambio), "correccion" (arreglo de error) o "seguridad" (cambio de seguridad).
- titulo: máx 90 caracteres, en lenguaje de negocio.
- descripcion: 2 a 4 frases explicando QUÉ cambió y POR QUÉ le sirve al usuario.
- comoOperar: pasos breves para usar la funcionalidad (o "" si no aplica).
- ejemplo: un ejemplo práctico corto (o "").
- modulo: área afectada en minúsculas si es evidente (p. ej. "balance", "novedades", "clientes", "usuarios"), o "".
- ruta: deep-link interno si es evidente (debe empezar por "/", p. ej. "/balance"), o "".
- estadoFuncionalidad: "disponible" salvo que el commit indique trabajo en progreso ("en_desarrollo") o planeado ("planeada").

Devuelve EXACTAMENTE un objeto por commit recibido (uno por cada hash que se te dio), ni más ni menos, en el mismo orden, copiando el "hash" EXACTO. Si un commit reúne varios cambios, resúmelos en UNA sola entrada y destaca el cambio PRINCIPAL en el título.`;

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
  return `Commits a clasificar y documentar:\n\n${lista}`;
}

/** Esquema de respuesta en el dialecto de Google (tipos en MAYÚSCULAS). */
const GEMINI_RESPONSE_SCHEMA = {
  type: "ARRAY",
  items: {
    type: "OBJECT",
    properties: {
      hash: { type: "STRING" },
      relevante: { type: "BOOLEAN" },
      motivoDescarte: { type: "STRING" },
      tipo: { type: "STRING", enum: TIPOS_VALIDOS },
      titulo: { type: "STRING" },
      descripcion: { type: "STRING" },
      comoOperar: { type: "STRING" },
      ejemplo: { type: "STRING" },
      modulo: { type: "STRING" },
      ruta: { type: "STRING" },
      estadoFuncionalidad: { type: "STRING", enum: ESTADOS_VALIDOS },
    },
    required: ["hash", "relevante"],
    propertyOrdering: [
      "hash",
      "relevante",
      "motivoDescarte",
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
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }>;
  error?: { code?: number; message?: string };
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

/** Llama a Gemini (Generative Language API) con salida JSON estructurada. */
async function redactarConGemini(commits: Commit[]): Promise<ItemIA[] | null> {
  if (!GEMINI_API_KEY) {
    console.warn("Sin GEMINI_API_KEY: no se puede clasificar/redactar con IA.");
    return null;
  }
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    GEMINI_MODEL,
  )}:generateContent`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), IA_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json", "x-goog-api-key": GEMINI_API_KEY },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: "user", parts: [{ text: construirPromptUsuario(commits) }] }],
        generationConfig: {
          temperature: 0.3,
          topP: 1,
          candidateCount: 1,
          maxOutputTokens: IA_MAX_TOKENS,
          responseMimeType: "application/json",
          responseSchema: GEMINI_RESPONSE_SCHEMA,
        },
      }),
    });
    const bodyText = await res.text();
    let payload: RespuestaGemini | null = null;
    try {
      payload = bodyText ? (JSON.parse(bodyText) as RespuestaGemini) : null;
    } catch {
      payload = null;
    }
    if (payload?.error) {
      console.warn(`Gemini ${payload.error.code}: ${payload.error.message ?? "error del proveedor"}`);
      return null;
    }
    if (!res.ok) {
      console.warn(`Gemini HTTP ${res.status}: ${bodyText.slice(0, 400)}`);
      return null;
    }
    const finishReason = payload?.candidates?.[0]?.finishReason;
    if (finishReason === "MAX_TOKENS") {
      console.warn("Gemini cortó la respuesta (MAX_TOKENS); se usa volcado determinista.");
      return null;
    }
    const texto =
      payload?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
    if (!texto.trim()) {
      console.warn("Gemini no devolvió contenido.");
      return null;
    }
    const arr = extraerArrayItems(parseJsonTolerante(texto));
    if (arr) console.log(`Gemini (${GEMINI_MODEL}) clasificó ${arr.length} commit(s).`);
    return arr;
  } catch (e) {
    console.warn("Gemini falló:", (e as Error).message);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Volcado determinista CONSERVADOR (sin IA): registra solo feat/fix —lo más
 * probablemente visible para el usuario— y omite el resto, porque sin IA no se
 * puede juzgar la visibilidad de refactors, perf, style, etc.
 */
function decisionFallback(commit: Commit): Decision {
  const prefijo = prefijoDe(commit.subject);
  if (/^(feat|feature)$/.test(prefijo)) {
    return { relevante: true, cambio: saneaCambio({ type: "nueva" }, commit) };
  }
  if (/^(fix|bugfix|hotfix)$/.test(prefijo)) {
    return { relevante: true, cambio: saneaCambio({ type: "correccion" }, commit) };
  }
  return {
    relevante: false,
    motivo: "sin IA no se evalúa la visibilidad; se omite por defecto (no es feat/fix)",
  };
}

/**
 * Clasifica y redacta los candidatos. Devuelve un mapa hash→Decision. Usa Gemini
 * y, para los commits que la IA no cubra o si la IA no responde, cae a
 * decisionFallback. Nunca lanza.
 */
async function clasificarYRedactar(commits: Commit[]): Promise<Map<string, Decision>> {
  const resultado = new Map<string, Decision>();
  const items = await redactarConGemini(commits);
  const porHash = new Map(commits.map((c) => [c.full, c] as const));

  if (items) {
    for (const item of items) {
      const commit = porHash.get(typeof item.hash === "string" ? item.hash : "");
      if (!commit) continue;
      if (item.relevante === false) {
        resultado.set(commit.full, {
          relevante: false,
          motivo: nullSiVacio(item.motivoDescarte) ?? "la IA lo marcó como cambio interno",
        });
        continue;
      }
      resultado.set(commit.full, {
        relevante: true,
        cambio: saneaCambio(
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
      });
    }
  }

  // Los commits que la IA no cubrió (o si no hubo IA) usan el volcado determinista.
  let faltantes = 0;
  for (const commit of commits) {
    if (!resultado.has(commit.full)) {
      resultado.set(commit.full, decisionFallback(commit));
      faltantes += 1;
    }
  }
  if (items && faltantes > 0) {
    console.warn(`IA cubrió ${commits.length - faltantes}/${commits.length}; el resto usó volcado determinista.`);
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

async function main() {
  const todos = leerCommits();
  if (todos.length === 0) {
    console.log(`No hay commits desde "${SINCE}". Nada que registrar.`);
    return;
  }

  // Capa 1: descarta lo puramente interno antes de tocar la IA.
  const candidatos = todos.filter((c) => !esCommitInterno(c));
  const internos = todos.length - candidatos.length;
  if (internos > 0) {
    console.log(`Capa 1: ${internos} commit(s) interno(s) descartado(s) sin IA (build/ci/test/deps/chore…).`);
  }
  if (candidatos.length === 0) {
    console.log("No hay commits candidatos (todos eran internos). Nada que registrar.");
    return;
  }

  const porFecha = agruparPorFecha(candidatos);
  const estado = leerEstado();

  // Filtra las fechas que ya están al día (mismos candidatos que la última corrida).
  const fechasPendientes = [...porFecha.entries()].filter(([fecha, lista]) => {
    const number = `dev-${fecha}`;
    const previo = estado[number]?.hashes ?? [];
    const actuales = lista.map((c) => c.full);
    if (mismosHashes(previo, actuales)) {
      console.log(`v${number}: sin candidatos nuevos, se omite.`);
      return false;
    }
    return true;
  });

  if (fechasPendientes.length === 0) {
    console.log("Todo al día. Nada que actualizar.");
    return;
  }

  // Una sola llamada a la IA con todos los candidatos pendientes.
  const pendientes = fechasPendientes.flatMap(([, lista]) => lista);
  const decisiones = await clasificarYRedactar(pendientes);

  for (const [fecha, lista] of fechasPendientes) {
    const number = `dev-${fecha}`;
    const relevantes: Array<{ commit: Commit; cambio: Cambio }> = [];
    for (const commit of lista) {
      const decision = decisiones.get(commit.full) ?? decisionFallback(commit);
      if (decision.relevante) {
        relevantes.push({ commit, cambio: decision.cambio });
      } else {
        console.log(`  · descartado ${commit.short}: ${decision.motivo}`);
      }
    }

    // Marca la fecha como procesada aunque no haya cambios relevantes (evita
    // reprocesarla mientras sus candidatos no cambien).
    estado[number] = { hashes: lista.map((c) => c.full) };

    if (relevantes.length === 0) {
      console.log(`v${number}: sin cambios visibles para el usuario, se omite.`);
      continue;
    }

    if (DRY_RUN) {
      console.log(`\n[DRY-RUN] v${number} · ${relevantes.length} cambio(s) relevante(s):`);
      for (const { commit, cambio } of relevantes) {
        console.log(
          `  · [${cambio.type}] ${cambio.title}  (commit ${commit.short}` +
            `${cambio.route ? `, ruta ${cambio.route}` : ""})`,
        );
      }
      continue;
    }

    const prisma = getPrisma();
    const version = await prisma.platformVersion.upsert({
      where: { number },
      create: {
        number,
        title: `Cambios del ${fechaLegible(fecha)}`,
        summary: `Generado automáticamente desde ${relevantes.length} cambio(s) visible(s) del ${fechaLegible(
          fecha,
        )}. Revisa y publica desde /novedades.`,
        status: "borrador",
        order: 0,
      },
      update: {
        title: `Cambios del ${fechaLegible(fecha)}`,
        summary: `Generado automáticamente desde ${relevantes.length} cambio(s) visible(s) del ${fechaLegible(
          fecha,
        )}. Revisa y publica desde /novedades.`,
      },
    });

    // Reset acotado: borra y recrea los cambios de ESTA versión del día.
    await prisma.versionChange.deleteMany({ where: { versionId: version.id } });
    await prisma.versionChange.createMany({
      data: relevantes.map(({ cambio }, i) => ({
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

    console.log(`✔ v${number}: ${relevantes.length} cambio(s) registrados.`);
  }

  // En DRY-RUN no se persiste el estado: la simulación queda sin efectos.
  if (!DRY_RUN) guardarEstado(estado);
}

main()
  .catch((e) => {
    // BEST-EFFORT: no romper el cierre de sesión. Reportar y salir con 0.
    console.error("novedades-desde-commits falló (se ignora):", e);
  })
  .finally(async () => {
    await prismaSingleton?.$disconnect();
  });
