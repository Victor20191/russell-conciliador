import { afterEach, describe, expect, test, vi } from "vitest";
import { completarTextoOpenCode, mensajeErrorOpenCode, OpenCodeError, protocoloDeModelo } from "./opencode";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

/**
 * Cada modelo de OpenCode Go habla un protocolo distinto y con su propia
 * cabecera de autenticación; equivocarse devuelve «Missing API key» o una
 * respuesta vacía, no un error claro.
 */
describe("protocoloDeModelo", () => {
  test("GPT y Grok usan la Responses API de OpenAI", () => {
    expect(protocoloDeModelo("gpt-5.6-luna")).toBe("responses");
    expect(protocoloDeModelo("grok-4.5")).toBe("responses");
  });

  test("Qwen y MiniMax usan Messages de Anthropic", () => {
    expect(protocoloDeModelo("qwen3.8-max")).toBe("messages");
    expect(protocoloDeModelo("qwen3.6-plus")).toBe("messages");
    expect(protocoloDeModelo("minimax-m3")).toBe("messages");
  });

  test("el resto cae en chat/completions", () => {
    expect(protocoloDeModelo("glm-5.2")).toBe("chat");
    expect(protocoloDeModelo("kimi-k3")).toBe("chat");
    expect(protocoloDeModelo("deepseek-v4-pro")).toBe("chat");
    expect(protocoloDeModelo("hy3")).toBe("chat");
  });

  test("no distingue mayúsculas ni espacios sobrantes", () => {
    expect(protocoloDeModelo("  GPT-5.6-Luna ")).toBe("responses");
    expect(protocoloDeModelo("QWEN3.8-MAX")).toBe("messages");
  });
});

describe("sesión de OpenCode", () => {
  test("propaga la cancelación al proveedor sin convertirla en timeout", async () => {
    vi.stubEnv("OPENCODE_API_KEY", "clave-de-prueba");
    const controller = new AbortController();
    const fetchMock = vi.fn((_url, opciones: RequestInit) => new Promise<Response>((_resolve, reject) => {
      opciones.signal?.addEventListener("abort", () => reject(opciones.signal?.reason), { once: true });
    }));
    vi.stubGlobal("fetch", fetchMock);
    const resultado = completarTextoOpenCode({ model: "glm-5.2", sessionId: "sesion", prompt: "Prueba", signal: controller.signal });
    controller.abort();
    await expect(resultado).rejects.toMatchObject({ name: "AbortError" });
    expect(fetchMock.mock.calls[0][1].signal?.aborted).toBe(true);
  });

  test("mantiene el error de timeout cuando vence el tiempo del proveedor", async () => {
    vi.stubEnv("OPENCODE_API_KEY", "clave-de-prueba");
    vi.stubGlobal("fetch", vi.fn((_url, opciones: RequestInit) => new Promise<Response>((_resolve, reject) => {
      opciones.signal?.addEventListener("abort", () => reject(opciones.signal?.reason), { once: true });
    })));
    await expect(completarTextoOpenCode({ model: "glm-5.2", sessionId: "sesion", prompt: "Prueba", timeoutMs: 5 }))
      .rejects.toMatchObject({ status: 408 });
  });

  test("no envía solicitudes si ya estaban canceladas", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(completarTextoOpenCode({ model: "glm-5.2", sessionId: "sesion", prompt: "Prueba", signal: AbortSignal.abort() }))
      .rejects.toMatchObject({ name: "AbortError" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test.each([
    ["gpt-5.6-luna", "/responses", { output: [{ content: [{ type: "output_text", text: "Listo" }] }] }],
    ["qwen3.8-max", "/messages", { content: [{ type: "text", text: "Listo" }] }],
    ["glm-5.2", "/chat/completions", { choices: [{ message: { content: "Listo" } }] }],
  ])("envía sesión y autenticación correcta para %s", async (model, ruta, respuesta) => {
    vi.stubEnv("OPENCODE_API_KEY", "clave-de-prueba");
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(respuesta)));
    vi.stubGlobal("fetch", fetchMock);

    await expect(completarTextoOpenCode({ model, sessionId: "sesion-reporte", prompt: "Prueba" }))
      .resolves.toMatchObject({ text: "Listo" });

    const [url, opciones] = fetchMock.mock.calls[0];
    expect(url).toEqual(expect.stringContaining(ruta));
    const headers = new Headers(opciones.headers);
    expect(headers.get("x-opencode-session")).toBe("sesion-reporte");
    expect(headers.get("user-agent")).toBe("russell-lfm/reporte-ejecutivo");
    if (ruta === "/messages") {
      expect(headers.get("x-api-key")).toBe("clave-de-prueba");
      expect(headers.get("anthropic-version")).toBe("2023-06-01");
      expect(headers.has("authorization")).toBe(false);
    } else {
      expect(headers.get("authorization")).toBe("Bearer clave-de-prueba");
      expect(headers.has("x-api-key")).toBe(false);
    }
  });

  test("conserva la sesión suministrada al reintentar una solicitud", async () => {
    vi.stubEnv("OPENCODE_API_KEY", "clave-de-prueba");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: "overloaded" } }), { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { content: "Listo" } }] })));
    vi.stubGlobal("fetch", fetchMock);
    const params = { model: "glm-5.2", sessionId: "misma-sesion", prompt: "Prueba" };

    await expect(completarTextoOpenCode(params)).rejects.toMatchObject({ status: 503 });
    await expect(completarTextoOpenCode(params)).resolves.toMatchObject({ text: "Listo" });
    expect(fetchMock.mock.calls.map(([, opciones]) => new Headers(opciones.headers).get("x-opencode-session")))
      .toEqual(["misma-sesion", "misma-sesion"]);
  });

  test("rechaza una sesión vacía antes de enviar solicitudes", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(completarTextoOpenCode({ model: "glm-5.2", sessionId: " \t ", prompt: "Prueba" }))
      .rejects.toThrow("identificador de sesión");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("explica MissingSessionID aunque el proveedor use estado de autenticación", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const mensaje = mensajeErrorOpenCode("prueba", new OpenCodeError("OpenCode MissingSessionID: Missing session ID", { status: 401 }));
    expect(mensaje).toContain("x-opencode-session");
    expect(mensaje).not.toContain("credenciales");
  });
});
