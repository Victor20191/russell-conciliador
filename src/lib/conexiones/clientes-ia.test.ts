import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findMany: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  default: { conexionIntegracion: { findMany: mocks.findMany } },
}));

import { getAnthropic, iaDisponible, MODELO_EXTRACCION } from "@/lib/anthropic";
import { completarTextoGemini, geminiDisponible } from "@/lib/gemini";
import { completarTextoOpenRouter } from "@/lib/openrouter";
import { iaBalanceDisponible, proveedorIABalance } from "@/lib/ia/proveedor-balance";
import { cifrarCredenciales } from "./credenciales";

function conexion(proveedor: string, apiKey: string) {
  const bases: Record<string, string> = {
    anthropic: "https://api.anthropic.com",
    gemini: "https://generativelanguage.googleapis.com",
    openrouter: "https://openrouter.ai",
  };
  return {
    configuracion: { usar_en_plataforma: true, url_base: bases[proveedor], modelo: "no-usar-este-modelo" },
    credenciales: cifrarCredenciales({ api_key: apiKey }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("DATABASE_URL", "postgresql://usuario:clave@localhost:5432/pruebas_mock");
  vi.stubEnv("MASTER_ENCRYPTION_KEY", "12345678901234567890123456789012");
  vi.stubEnv("ANTHROPIC_API_KEY", "");
  vi.stubEnv("GEMINI_API_KEY", "");
  vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "");
  vi.stubEnv("OPENROUTER_API_KEY", "");
  mocks.findMany.mockImplementation(async ({ where }: { where: { proveedor: string } }) => [
    conexion(where.proveedor, `guardada-${where.proveedor}`),
  ]);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("clientes existentes con credenciales guardadas", () => {
  it("Anthropic usa la clave seleccionada, destino oficial y sin singleton", async () => {
    vi.stubEnv("ANTHROPIC_BASE_URL", "https://otro.example");
    expect(await iaDisponible()).toBe(true);
    const primero = await getAnthropic();
    expect(primero.apiKey).toBe("guardada-anthropic");
    expect(primero.baseURL).toBe("https://api.anthropic.com");
    expect(MODELO_EXTRACCION).not.toBe("no-usar-este-modelo");
    mocks.findMany.mockResolvedValue([conexion("anthropic", "clave-rotada")]);
    const segundo = await getAnthropic();
    expect(segundo.apiKey).toBe("clave-rotada");
    expect(segundo).not.toBe(primero);
  });

  it("Gemini usa la clave guardada sin cambiar el modelo solicitado", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: "respuesta" }] }, finishReason: "STOP" }],
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await geminiDisponible()).toBe(true);
    await completarTextoGemini({ model: "gemini-3.1-flash-lite", prompt: "prueba" });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent",
      expect.objectContaining({
        redirect: "error",
        headers: expect.objectContaining({ "x-goog-api-key": "guardada-gemini" }),
      }),
    );
  });

  it("OpenRouter usa la clave guardada y conserva modelo y cabeceras de aplicación", async () => {
    vi.stubEnv("OPENROUTER_APP_NAME", "Russell de prueba");
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: "respuesta" }, finish_reason: "stop" }],
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await completarTextoOpenRouter({
      model: "nvidia/nemotron-3-super-120b-a12b:free",
      messages: [{ role: "user", content: "prueba" }],
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://openrouter.ai/api/v1/chat/completions",
      expect.objectContaining({
        redirect: "error",
        headers: expect.objectContaining({
          Authorization: "Bearer guardada-openrouter",
          "X-Title": "Russell de prueba",
        }),
        body: expect.stringContaining('"model":"nvidia/nemotron-3-super-120b-a12b:free"'),
      }),
    );
  });

  it("una conexión guardada de Gemini no habilita su selección fuera de la compuerta", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("BALANCE_AI_DEV_SELECTOR", "true");
    vi.stubEnv("BALANCE_AI_PROVIDER", "gemini");
    expect(proveedorIABalance("gemini")).toBe("anthropic");
    expect(await iaBalanceDisponible(proveedorIABalance("gemini"))).toBe(true);
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ proveedor: "anthropic" }),
    }));
    expect(proveedorIABalance("gemini", { autorizado: true })).toBe("gemini");
  });

  it("no hace una solicitud de red si hay una selección ambigua", async () => {
    mocks.findMany.mockResolvedValue([conexion("gemini", "primera"), conexion("gemini", "segunda")]);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(completarTextoGemini({ model: "gemini-3.1-flash-lite", prompt: "prueba" }))
      .rejects.toThrow(/varias conexiones/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
