import { describe, expect, test } from "vitest";
import { protocoloDeModelo } from "./opencode";

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
