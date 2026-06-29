import "server-only";
import { registrarError } from "@/lib/errores";
import type { UsoOpenRouterReporte } from "@/lib/novedades/reportes";

const OPENROUTER_CHAT_URL = "https://openrouter.ai/api/v1/chat/completions";

type OpenRouterMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type OpenRouterContentBlock = {
  type?: string;
  text?: string;
};

type OpenRouterResponse = {
  choices?: Array<{
    message?: {
      content?: string | OpenRouterContentBlock[] | null;
    } | null;
    finish_reason?: string | null;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  error?: {
    message?: string;
    code?: string | number;
  };
};

type SolicitudOpenRouterResult = {
  text: string;
  usage?: UsoOpenRouterReporte;
  finishReason?: string | null;
};

export class OpenRouterError extends Error {
  status?: number;
  body?: string;

  constructor(message: string, opts?: { status?: number; body?: string }) {
    super(message);
    this.name = "OpenRouterError";
    this.status = opts?.status;
    this.body = opts?.body;
  }
}

type CompletarOpenRouterParams = {
  model: string;
  messages: OpenRouterMessage[];
  responseFormat?: unknown;
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  seed?: number;
  timeoutMs?: number;
  cache?: {
    enabled?: boolean;
    ttlSeconds?: number;
  };
};

function statusDesdeCodigo(code: string | number | undefined): number | undefined {
  if (typeof code === "number") return code;
  if (typeof code === "string" && /^\d+$/.test(code)) return Number(code);
  return undefined;
}

function getOpenRouterApiKey(): string {
  const key = process.env.OPENROUTER_API_KEY?.trim();
  if (!key) {
    throw new OpenRouterError(
      "Falta OPENROUTER_API_KEY. Configúrala en .env para generar reportes funcionales con IA.",
      { status: 401 },
    );
  }
  return key;
}

function extraerTexto(content: string | OpenRouterContentBlock[] | null | undefined): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((block) => (typeof block?.text === "string" ? block.text : ""))
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

function parseJsonSeguro(content: string): unknown {
  const limpio = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  try {
    return JSON.parse(limpio);
  } catch {
    const inicio = limpio.indexOf("{");
    const fin = limpio.lastIndexOf("}");
    if (inicio >= 0 && fin > inicio) {
      return JSON.parse(limpio.slice(inicio, fin + 1));
    }
    throw new OpenRouterError("OpenRouter respondió texto, pero no JSON válido.");
  }
}

async function solicitarChatOpenRouter({
  model,
  messages,
  responseFormat,
  maxTokens = 7000,
  temperature = 0.25,
  topP,
  seed,
  timeoutMs = 120_000,
  cache,
}: CompletarOpenRouterParams): Promise<SolicitudOpenRouterResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(OPENROUTER_CHAT_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${getOpenRouterApiKey()}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.OPENROUTER_SITE_URL ?? "http://localhost:3000",
        "X-Title": process.env.OPENROUTER_APP_NAME ?? "Russell Diagnostico",
        ...(cache?.enabled
          ? {
              "X-OpenRouter-Cache": "true",
              "X-OpenRouter-Cache-TTL": String(cache.ttlSeconds ?? 86_400),
            }
          : {}),
      },
      body: JSON.stringify({
        model,
        messages,
        temperature,
        top_p: topP,
        seed,
        max_tokens: maxTokens,
        reasoning: { enabled: false },
        response_format: responseFormat,
      }),
    });

    const bodyText = await res.text();
    let payload: OpenRouterResponse | null = null;
    try {
      payload = bodyText ? (JSON.parse(bodyText) as OpenRouterResponse) : null;
    } catch {
      payload = null;
    }

    if (payload?.error) {
      const status = statusDesdeCodigo(payload.error.code) ?? res.status;
      throw new OpenRouterError(`OpenRouter ${status}: ${payload.error.message ?? "error del proveedor"}`, {
        status,
        body: bodyText,
      });
    }

    if (!res.ok) {
      const detalle = payload?.error?.message ?? bodyText.slice(0, 500);
      throw new OpenRouterError(`OpenRouter HTTP ${res.status}: ${detalle}`, {
        status: res.status,
        body: bodyText,
      });
    }

    const content = extraerTexto(payload?.choices?.[0]?.message?.content);
    if (!content) {
      throw new OpenRouterError("OpenRouter no devolvió contenido en la respuesta.", { body: bodyText });
    }

    const finishReason = payload?.choices?.[0]?.finish_reason;
    if (finishReason === "length") {
      throw new OpenRouterError("OpenRouter cortó la respuesta porque alcanzó el límite de salida.", {
        status: 422,
        body: bodyText,
      });
    }

    return {
      text: content,
      finishReason,
      usage: payload?.usage
        ? {
            promptTokens: payload.usage.prompt_tokens,
            completionTokens: payload.usage.completion_tokens,
            totalTokens: payload.usage.total_tokens,
          }
        : undefined,
    };
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") {
      throw new OpenRouterError("La generación del reporte tardó demasiado.", { status: 408 });
    }
    throw e;
  } finally {
    clearTimeout(timeout);
  }
}

export async function completarJsonOpenRouter(params: CompletarOpenRouterParams): Promise<{
  data: unknown;
  usage?: UsoOpenRouterReporte;
}> {
  const completion = await solicitarChatOpenRouter(params);
  return {
    data: parseJsonSeguro(completion.text),
    usage: completion.usage,
  };
}

export async function completarTextoOpenRouter(params: CompletarOpenRouterParams): Promise<{
  text: string;
  usage?: UsoOpenRouterReporte;
}> {
  return solicitarChatOpenRouter(params);
}

export function mensajeErrorOpenRouter(contexto: string, e: unknown): string {
  registrarError(contexto, e);

  const status = e && typeof e === "object" && "status" in e ? (e as { status?: unknown }).status : undefined;
  const msg = e instanceof Error ? e.message : "";

  if (/Falta OPENROUTER_API_KEY/i.test(msg)) {
    return "Falta configurar OPENROUTER_API_KEY en el entorno del servidor para generar el reporte.";
  }
  if (status === 401 || status === 403) {
    return "OpenRouter rechazó las credenciales. Verifica OPENROUTER_API_KEY.";
  }
  if (status === 408 || /timeout|tardó demasiado|AbortError/i.test(msg)) {
    return "La generación tardó demasiado. Reintenta con menos cambios documentados o vuelve a intentarlo en unos minutos.";
  }
  if (status === 429) {
    return "OpenRouter está limitando las solicitudes en este momento. Espera unos segundos y reintenta.";
  }
  if (/ResourceExhausted|request limit reached|Upstream error from Nvidia|Nvidia/i.test(msg)) {
    return "El proveedor Nvidia de OpenRouter está saturado en este momento. Reintenta en unos minutos; la conexión y la API key están funcionando.";
  }
  if (/límite de salida|limite de salida|HTML incompleto/i.test(msg)) {
    return "La IA devolvió un reporte incompleto. Reintenta; si vuelve a pasar, reduce la cantidad de cambios enviados o usa un reporte menos extenso.";
  }
  if (typeof status === "number" && status >= 500) {
    return "OpenRouter tuvo un error temporal. Reintenta en un momento.";
  }
  if (typeof status === "number" && status >= 400) {
    return "OpenRouter no pudo procesar la solicitud del reporte. Revisa el modelo configurado o reintenta.";
  }
  if (/HTML válido/i.test(msg)) {
    return "La IA no devolvió un documento HTML válido. Reintenta la generación.";
  }
  if (/JSON válido|contenido/i.test(msg)) {
    return "La IA respondió en un formato inesperado. Reintenta la generación.";
  }
  return "No se pudo generar el reporte funcional con IA. Revisa la configuración de OpenRouter o reintenta.";
}
