import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { completarJsonEstructuradoGemini } from "./gemini";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("completarJsonEstructuradoGemini", () => {
  it("envía JSON Schema, admite PDF inline y valida la respuesta con Zod", async () => {
    vi.stubEnv("GEMINI_API_KEY", "clave-prueba");
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as {
        contents: Array<{ parts: unknown[] }>;
        generationConfig: { responseMimeType?: string; responseJsonSchema?: Record<string, unknown> };
      };
      expect(body.contents[0].parts).toEqual([
        { inlineData: { mimeType: "application/pdf", data: "BASE64" } },
        { text: "Extrae" },
      ]);
      expect(body.generationConfig.responseMimeType).toBe("application/json");
      expect(body.generationConfig.responseJsonSchema?.$schema).toBeUndefined();
      expect(body.generationConfig.responseJsonSchema?.type).toBe("object");

      return new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: '{"cuentas":3}' }] }, finishReason: "STOP" }],
          usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 20, thoughtsTokenCount: 5, totalTokenCount: 125 },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const r = await completarJsonEstructuradoGemini(
      {
        model: "gemini-3.1-flash-lite",
        parts: [
          { inlineData: { mimeType: "application/pdf", data: "BASE64" } },
          { text: "Extrae" },
        ],
      },
      z.object({ cuentas: z.number() }),
    );

    expect(r.data).toEqual({ cuentas: 3 });
    expect(r.usage).toEqual({ promptTokens: 100, completionTokens: 25, totalTokens: 125 });
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
