import { describe, it, expect } from "vitest";
import { ajustesDeterministas, esAjusteNoSoportado, rechazaMuestreo, versionClaude } from "./parametros-modelo";

describe("versionClaude", () => {
  it("lee familia y versión, con fecha o prefijo de plataforma", () => {
    expect(versionClaude("claude-opus-5-5")).toEqual({ familia: "opus", mayor: 5, menor: 5 });
    expect(versionClaude("claude-haiku-4-5-20251001")).toEqual({ familia: "haiku", mayor: 4, menor: 5 });
    expect(versionClaude("claude-sonnet-4-20250514")).toEqual({ familia: "sonnet", mayor: 4, menor: 0 });
    expect(versionClaude("claude-opus-5")).toEqual({ familia: "opus", mayor: 5, menor: 0 });
    expect(versionClaude("anthropic.claude-sonnet-5-5")).toEqual({ familia: "sonnet", mayor: 5, menor: 5 });
    expect(versionClaude("claude-mythos-preview")).toBeNull();
  });
});

describe("ajustesDeterministas", () => {
  it("Haiku 4.5 y Sonnet 4.6: temperatura 0 sin thinking", () => {
    for (const m of ["claude-haiku-4-5", "claude-sonnet-4-6", "claude-opus-4-6"]) {
      expect(ajustesDeterministas(m)).toEqual({ temperature: 0, thinking: { type: "disabled" } });
    }
  });

  it("Opus 4.7+, Opus 5.5, Fable y Mythos: sin temperatura y thinking adaptativo", () => {
    for (const m of ["claude-opus-4-7", "claude-opus-4-8", "claude-opus-5-5", "claude-fable-5-1", "claude-mythos-preview"]) {
      expect(rechazaMuestreo(m)).toBe(true);
      expect(ajustesDeterministas(m)).toEqual({ thinking: { type: "adaptive" } });
    }
  });

  it("Sonnet 5.5: sin temperatura y `between_tools` (rechaza `disabled`)", () => {
    expect(ajustesDeterministas("claude-sonnet-5-5")).toEqual({ thinking: { type: "between_tools" } });
  });
});

describe("esAjusteNoSoportado", () => {
  const error400 = (message: string) => Object.assign(new Error(message), { status: 400 });

  it("reconoce el 400 por muestreo o por thinking", () => {
    expect(esAjusteNoSoportado(error400("temperature is not supported for this model"))).toBe(true);
    expect(esAjusteNoSoportado(error400('"thinking.type.disabled" is not supported for this model.'))).toBe(true);
  });

  it("no confunde otros errores", () => {
    expect(esAjusteNoSoportado(error400("max_tokens: too large"))).toBe(false);
    expect(esAjusteNoSoportado(Object.assign(new Error("thinking"), { status: 500 }))).toBe(false);
    expect(esAjusteNoSoportado(null)).toBe(false);
  });
});
