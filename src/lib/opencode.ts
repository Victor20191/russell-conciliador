import "server-only";
import { registrarError } from "@/lib/errores";
import type { UsoOpenRouterReporte } from "@/lib/novedades/reportes";

/**
 * Cliente de OpenCode Go — la suscripción de modelos abiertos del workspace.
 * Se usa EXCLUSIVAMENTE en el reporte ejecutivo de uso y adopción
 * (`/config/reportes-ejecutivos`); el resto de la plataforma sigue con
 * Anthropic/Gemini/OpenRouter según su propio flujo.
 *
 * Dos cosas que no son evidentes y cuestan horas si se ignoran:
 *
 * 1. Los modelos Go NO viven en el gateway Zen (`/zen/v1/...`, que cobra contra
 *    el saldo y ni siquiera los reconoce) sino en `/zen/go/v1/...`.
 * 2. Cada modelo habla UN protocolo distinto y con SU cabecera de autenticación:
 *    `responses` (OpenAI) y `chat/completions` usan `Authorization: Bearer`,
 *    mientras que `messages` (Anthropic) exige `x-api-key`. Enviar la cabecera
 *    equivocada devuelve «Missing API key» aunque la clave sea correcta.
 */
const OPENCODE_API_BASE = process.env.OPENCODE_API_BASE?.trim() || "https://opencode.ai/zen/go/v1";
const ANTHROPIC_VERSION = "2023-06-01";

type ProtocoloOpenCode = "responses" | "messages" | "chat";

/**
 * Protocolo por modelo, según la tabla de endpoints de OpenCode Go. El default
 * es `chat` (GLM, Kimi, DeepSeek, MiMo, Hy3…).
 */
export function protocoloDeModelo(model: string): ProtocoloOpenCode {
  const m = model.trim().toLowerCase();
  if (m.startsWith("gpt-") || m.startsWith("grok-")) return "responses";
  if (m.startsWith("qwen") || m.startsWith("minimax-")) return "messages";
  return "chat";
}

export type CompletarOpenCodeParams = {
  model: string;
  system?: string;
  prompt: string;
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  timeoutMs?: number;
};

export class OpenCodeError extends Error {
  status?: number;
  body?: string;

  constructor(message: string, opts?: { status?: number; body?: string }) {
    super(message);
    this.name = "OpenCodeError";
    this.status = opts?.status;
    this.body = opts?.body;
  }
}

function getOpenCodeApiKey(): string {
  const key = process.env.OPENCODE_API_KEY?.trim();
  if (!key) {
    throw new OpenCodeError(
      "Falta OPENCODE_API_KEY. Configúrala en .env para generar el reporte ejecutivo con OpenCode Go.",
      { status: 401 },
    );
  }
  return key;
}

/** ¿Hay una clave de OpenCode disponible en el servidor? */
export function opencodeDisponible(): boolean {
  return Boolean(process.env.OPENCODE_API_KEY?.trim());
}

type Resultado = {
  text: string;
  usage?: UsoOpenRouterReporte;
  /** Motivo de corte normalizado; "limite" = se agotó el tope de salida. */
  corte?: "limite" | "filtro" | null;
};

function uso(promptTokens?: number, completionTokens?: number): UsoOpenRouterReporte | undefined {
  if (promptTokens == null && completionTokens == null) return undefined;
  return {
    promptTokens,
    completionTokens,
    totalTokens: (promptTokens ?? 0) + (completionTokens ?? 0),
  };
}

/* ------------------------------- responses ------------------------------- */

type RespuestaResponses = {
  status?: string;
  incomplete_details?: { reason?: string } | null;
  output?: Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }>;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
  error?: { type?: string; message?: string };
};

function leerResponses(payload: RespuestaResponses | null): Resultado {
  const text =
    payload?.output
      ?.flatMap((bloque) => bloque?.content ?? [])
      .filter((c) => c?.type === "output_text" && typeof c.text === "string")
      .map((c) => c.text as string)
      .join("\n") ?? "";
  const razon = payload?.incomplete_details?.reason;
  return {
    text,
    corte: razon === "max_output_tokens" ? "limite" : razon === "content_filter" ? "filtro" : null,
    usage: uso(payload?.usage?.input_tokens, payload?.usage?.output_tokens),
  };
}

/* -------------------------------- messages ------------------------------- */

type RespuestaMessages = {
  content?: Array<{ type?: string; text?: string }>;
  stop_reason?: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
  error?: { type?: string; message?: string };
};

function leerMessages(payload: RespuestaMessages | null): Resultado {
  // Solo los bloques `text`: los modelos de razonamiento añaden bloques
  // `thinking` que no forman parte de la respuesta.
  const text =
    payload?.content
      ?.filter((b) => b?.type === "text" && typeof b.text === "string")
      .map((b) => b.text as string)
      .join("\n") ?? "";
  const u = payload?.usage;
  const entrada = u
    ? (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0)
    : undefined;
  return {
    text,
    corte:
      payload?.stop_reason === "max_tokens"
        ? "limite"
        : payload?.stop_reason === "refusal"
          ? "filtro"
          : null,
    usage: uso(entrada, u?.output_tokens),
  };
}

/* ----------------------------- chat/completions --------------------------- */

type RespuestaChat = {
  choices?: Array<{
    message?: { content?: string | Array<{ type?: string; text?: string }> };
    finish_reason?: string;
  }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  error?: { type?: string; message?: string };
};

function leerChat(payload: RespuestaChat | null): Resultado {
  const contenido = payload?.choices?.[0]?.message?.content;
  const text =
    typeof contenido === "string"
      ? contenido
      : Array.isArray(contenido)
        ? contenido
            .map((p) => (typeof p?.text === "string" ? p.text : ""))
            .filter(Boolean)
            .join("\n")
        : "";
  const razon = payload?.choices?.[0]?.finish_reason;
  return {
    text,
    corte: razon === "length" ? "limite" : razon === "content_filter" ? "filtro" : null,
    usage: uso(payload?.usage?.prompt_tokens, payload?.usage?.completion_tokens),
  };
}

/* --------------------------------- envío --------------------------------- */

function peticion(
  protocolo: ProtocoloOpenCode,
  p: Required<Pick<CompletarOpenCodeParams, "model" | "prompt" | "maxTokens" | "temperature" | "topP">> &
    Pick<CompletarOpenCodeParams, "system">,
): { ruta: string; headers: Record<string, string>; body: unknown } {
  const clave = getOpenCodeApiKey();

  if (protocolo === "responses") {
    return {
      ruta: "/responses",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${clave}` },
      body: {
        model: p.model,
        max_output_tokens: p.maxTokens,
        ...(p.system ? { instructions: p.system } : {}),
        input: [{ role: "user", content: p.prompt }],
      },
    };
  }

  if (protocolo === "messages") {
    return {
      ruta: "/messages",
      headers: {
        "Content-Type": "application/json",
        "anthropic-version": ANTHROPIC_VERSION,
        "x-api-key": clave,
      },
      body: {
        model: p.model,
        max_tokens: p.maxTokens,
        temperature: p.temperature,
        top_p: p.topP,
        ...(p.system ? { system: p.system } : {}),
        messages: [{ role: "user", content: p.prompt }],
      },
    };
  }

  return {
    ruta: "/chat/completions",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${clave}` },
    body: {
      model: p.model,
      stream: false,
      max_tokens: p.maxTokens,
      temperature: p.temperature,
      top_p: p.topP,
      messages: [
        ...(p.system ? [{ role: "system", content: p.system }] : []),
        { role: "user", content: p.prompt },
      ],
    },
  };
}

async function solicitarOpenCode({
  model,
  system,
  prompt,
  maxTokens = 16_000,
  temperature = 0,
  topP = 1,
  timeoutMs = 240_000,
}: CompletarOpenCodeParams): Promise<Resultado> {
  if (!prompt.trim()) throw new OpenCodeError("La solicitud a OpenCode no contiene texto.", { status: 400 });

  const protocolo = protocoloDeModelo(model);
  const { ruta, headers, body } = peticion(protocolo, {
    model,
    prompt,
    system,
    maxTokens,
    temperature,
    topP,
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${OPENCODE_API_BASE}${ruta}`, {
      method: "POST",
      signal: controller.signal,
      headers,
      body: JSON.stringify(body),
    });

    const bodyText = await res.text();
    let payload: { error?: { type?: string; message?: string } } | null = null;
    try {
      payload = bodyText ? JSON.parse(bodyText) : null;
    } catch {
      payload = null;
    }

    if (payload?.error) {
      const tipo = payload.error.type ?? "error";
      throw new OpenCodeError(`OpenCode ${tipo}: ${payload.error.message ?? "error del proveedor"}`, {
        status: res.ok ? 400 : res.status,
        body: bodyText,
      });
    }

    if (!res.ok) {
      throw new OpenCodeError(`OpenCode HTTP ${res.status}: ${bodyText.slice(0, 500)}`, {
        status: res.status,
        body: bodyText,
      });
    }

    const resultado =
      protocolo === "responses"
        ? leerResponses(payload as RespuestaResponses | null)
        : protocolo === "messages"
          ? leerMessages(payload as RespuestaMessages | null)
          : leerChat(payload as RespuestaChat | null);

    if (resultado.corte === "limite") {
      throw new OpenCodeError("OpenCode cortó la respuesta porque alcanzó el límite de salida.", {
        status: 422,
        body: bodyText,
      });
    }
    if (resultado.corte === "filtro") {
      throw new OpenCodeError("OpenCode bloqueó la respuesta por filtros de contenido.", {
        status: 422,
        body: bodyText,
      });
    }
    if (!resultado.text) {
      throw new OpenCodeError("OpenCode no devolvió contenido en la respuesta.", { body: bodyText });
    }

    return resultado;
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") {
      throw new OpenCodeError("La generación del reporte tardó demasiado.", { status: 408 });
    }
    throw e;
  } finally {
    clearTimeout(timeout);
  }
}

export async function completarTextoOpenCode(params: CompletarOpenCodeParams): Promise<{
  text: string;
  usage?: UsoOpenRouterReporte;
}> {
  const { text, usage } = await solicitarOpenCode(params);
  return { text, usage };
}

export function mensajeErrorOpenCode(contexto: string, e: unknown): string {
  registrarError(contexto, e);

  const status = e && typeof e === "object" && "status" in e ? (e as { status?: unknown }).status : undefined;
  const msg = e instanceof Error ? e.message : "";

  if (/Falta OPENCODE_API_KEY/i.test(msg)) {
    return "Falta configurar OPENCODE_API_KEY en el entorno del servidor para generar el reporte.";
  }
  if (/UsageLimit|usage limit|límite de uso/i.test(msg)) {
    return "Se alcanzó el límite de uso de la suscripción OpenCode Go. Espera al reinicio de la ventana o habilita el uso de saldo en el workspace.";
  }
  if (/CreditsError|Insufficient balance/i.test(msg)) {
    return "La cuenta de OpenCode no tiene saldo disponible y la suscripción Go no cubrió la petición. Revisa el workspace y reintenta.";
  }
  if (/ModelError|is not supported|model_not_found/i.test(msg)) {
    return "OpenCode no reconoce el modelo configurado. Revisa OPENCODE_MODEL en el entorno del servidor.";
  }
  if (/AuthError|Missing API key/i.test(msg) || status === 401 || status === 403) {
    return "OpenCode rechazó las credenciales. Verifica OPENCODE_API_KEY.";
  }
  if (status === 408 || /timeout|tardó demasiado|AbortError/i.test(msg)) {
    return "La generación tardó demasiado. Reintenta con menos cambios documentados o vuelve a intentarlo en unos minutos.";
  }
  if (status === 429 || /quota|rate limit|overloaded/i.test(msg)) {
    return "OpenCode está limitando las solicitudes en este momento. Espera unos segundos y reintenta.";
  }
  if (/límite de salida|limite de salida|HTML incompleto/i.test(msg)) {
    return "La IA devolvió un reporte incompleto. Reintenta; si vuelve a pasar, reduce la cantidad de cambios enviados o usa un reporte menos extenso.";
  }
  if (typeof status === "number" && status >= 500) {
    return "OpenCode tuvo un error temporal. Reintenta en un momento.";
  }
  if (typeof status === "number" && status >= 400) {
    return "OpenCode no pudo procesar la solicitud del reporte. Revisa el modelo configurado o reintenta.";
  }
  if (/HTML válido/i.test(msg)) {
    return "La IA no devolvió un documento HTML válido. Reintenta la generación.";
  }
  if (/contenido/i.test(msg)) {
    return "La IA respondió en un formato inesperado. Reintenta la generación.";
  }
  return "No se pudo generar el reporte funcional con IA. Revisa la configuración de OpenCode Go o reintenta.";
}
