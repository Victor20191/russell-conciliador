import "server-only";
import { registrarError } from "@/lib/errores";
import type { UsoOpenRouterReporte } from "@/lib/novedades/reportes";

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";

type GeminiPart = {
  text?: string;
};

type GeminiResponse = {
  candidates?: Array<{
    content?: {
      parts?: GeminiPart[];
    };
    finishReason?: string;
  }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
  error?: {
    code?: number;
    message?: string;
    status?: string;
  };
};

type SolicitudGeminiResult = {
  text: string;
  usage?: UsoOpenRouterReporte;
  finishReason?: string;
};

type CompletarGeminiParams = {
  model: string;
  system?: string;
  prompt: string;
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  seed?: number;
  timeoutMs?: number;
};

export class GeminiError extends Error {
  status?: number;
  body?: string;

  constructor(message: string, opts?: { status?: number; body?: string }) {
    super(message);
    this.name = "GeminiError";
    this.status = opts?.status;
    this.body = opts?.body;
  }
}

function getGeminiApiKey(): string {
  const key = process.env.GEMINI_API_KEY?.trim() ?? process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim();
  if (!key) {
    throw new GeminiError(
      "Falta GEMINI_API_KEY. Configúrala en .env para generar reportes funcionales con Gemini.",
      { status: 401 },
    );
  }
  return key;
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
    throw new GeminiError("Gemini respondió texto, pero no JSON válido.");
  }
}

function extraerTexto(payload: GeminiResponse | null): string {
  return (
    payload?.candidates?.[0]?.content?.parts
      ?.map((part) => (typeof part.text === "string" ? part.text : ""))
      .filter(Boolean)
      .join("\n") ?? ""
  );
}

function rutaModeloGemini(model: string): string {
  const ruta = model.startsWith("models/") ? model : `models/${model}`;
  return ruta
    .split("/")
    .map((segmento) => encodeURIComponent(segmento))
    .join("/");
}

async function solicitarGemini({
  model,
  system,
  prompt,
  maxTokens = 16_000,
  temperature = 0,
  topP = 1,
  seed,
  timeoutMs = 240_000,
}: CompletarGeminiParams): Promise<SolicitudGeminiResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const url = `${GEMINI_API_BASE}/${rutaModeloGemini(model)}:generateContent`;

  try {
    const res = await fetch(url, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": getGeminiApiKey(),
      },
      body: JSON.stringify({
        ...(system
          ? {
              systemInstruction: {
                parts: [{ text: system }],
              },
            }
          : {}),
        contents: [
          {
            role: "user",
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          temperature,
          topP,
          seed,
          candidateCount: 1,
          maxOutputTokens: maxTokens,
        },
      }),
    });

    const bodyText = await res.text();
    let payload: GeminiResponse | null = null;
    try {
      payload = bodyText ? (JSON.parse(bodyText) as GeminiResponse) : null;
    } catch {
      payload = null;
    }

    if (payload?.error) {
      throw new GeminiError(`Gemini ${payload.error.code}: ${payload.error.message ?? "error del proveedor"}`, {
        status: payload.error.code,
        body: bodyText,
      });
    }

    if (!res.ok) {
      const detalle = payload?.error?.message ?? bodyText.slice(0, 500);
      throw new GeminiError(`Gemini HTTP ${res.status}: ${detalle}`, {
        status: res.status,
        body: bodyText,
      });
    }

    const content = extraerTexto(payload);
    if (!content) {
      throw new GeminiError("Gemini no devolvió contenido en la respuesta.", { body: bodyText });
    }

    const finishReason = payload?.candidates?.[0]?.finishReason;
    if (finishReason === "MAX_TOKENS") {
      throw new GeminiError("Gemini cortó la respuesta porque alcanzó el límite de salida.", {
        status: 422,
        body: bodyText,
      });
    }
    if (finishReason === "SAFETY" || finishReason === "RECITATION") {
      throw new GeminiError(`Gemini bloqueó la respuesta por ${finishReason.toLowerCase()}.`, {
        status: 422,
        body: bodyText,
      });
    }

    return {
      text: content,
      finishReason,
      usage: payload?.usageMetadata
        ? {
            promptTokens: payload.usageMetadata.promptTokenCount,
            completionTokens: payload.usageMetadata.candidatesTokenCount,
            totalTokens: payload.usageMetadata.totalTokenCount,
          }
        : undefined,
    };
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") {
      throw new GeminiError("La generación del reporte tardó demasiado.", { status: 408 });
    }
    throw e;
  } finally {
    clearTimeout(timeout);
  }
}

export async function completarTextoGemini(params: CompletarGeminiParams): Promise<{
  text: string;
  usage?: UsoOpenRouterReporte;
}> {
  return solicitarGemini(params);
}

export async function completarJsonGemini(params: CompletarGeminiParams): Promise<{
  data: unknown;
  usage?: UsoOpenRouterReporte;
}> {
  const completion = await solicitarGemini(params);
  return {
    data: parseJsonSeguro(completion.text),
    usage: completion.usage,
  };
}

export function mensajeErrorGemini(contexto: string, e: unknown): string {
  registrarError(contexto, e);

  const status = e && typeof e === "object" && "status" in e ? (e as { status?: unknown }).status : undefined;
  const msg = e instanceof Error ? e.message : "";

  if (/Falta GEMINI_API_KEY/i.test(msg)) {
    return "Falta configurar GEMINI_API_KEY en el entorno del servidor para generar el reporte.";
  }
  if (status === 401 || status === 403) {
    return "Gemini rechazó las credenciales. Verifica GEMINI_API_KEY.";
  }
  if (status === 408 || /timeout|tardó demasiado|AbortError/i.test(msg)) {
    return "La generación tardó demasiado. Reintenta con menos cambios documentados o vuelve a intentarlo en unos minutos.";
  }
  if (status === 429 || /quota|rate limit|ResourceExhausted/i.test(msg)) {
    return "Gemini está limitando las solicitudes en este momento. Espera unos segundos y reintenta.";
  }
  if (/límite de salida|limite de salida|HTML incompleto|MAX_TOKENS/i.test(msg)) {
    return "La IA devolvió un reporte incompleto. Reintenta; si vuelve a pasar, reduce la cantidad de cambios enviados o usa un reporte menos extenso.";
  }
  if (typeof status === "number" && status >= 500) {
    return "Gemini tuvo un error temporal. Reintenta en un momento.";
  }
  if (typeof status === "number" && status >= 400) {
    return "Gemini no pudo procesar la solicitud del reporte. Revisa el modelo configurado o reintenta.";
  }
  if (/HTML válido/i.test(msg)) {
    return "La IA no devolvió un documento HTML válido. Reintenta la generación.";
  }
  if (/JSON válido|contenido/i.test(msg)) {
    return "La IA respondió en un formato inesperado. Reintenta la generación.";
  }
  return "No se pudo generar el reporte funcional con IA. Revisa la configuración de Gemini o reintenta.";
}
