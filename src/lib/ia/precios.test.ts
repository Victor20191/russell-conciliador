import { describe, it, expect } from "vitest";
import { calcularCostoUsd, tarifaPara, totalTokens, TARIFA_DEFECTO } from "./precios";

describe("calcularCostoUsd", () => {
  it("suma los 4 componentes con la tarifa de Opus 4.8", () => {
    // 1M de cada componente → 5 + 25 + 6,25 + 0,5 = 36,75 USD
    const usage = {
      input_tokens: 1_000_000,
      output_tokens: 1_000_000,
      cache_creation_input_tokens: 1_000_000,
      cache_read_input_tokens: 1_000_000,
    };
    expect(calcularCostoUsd("claude-opus-4-8", usage)).toBeCloseTo(36.75, 6);
  });

  it("trata la caché ausente (undefined/null) como cero", () => {
    // (10.000×5 + 2.000×25)/1e6 = (50.000 + 50.000)/1e6 = 0,1 USD
    const usage = { input_tokens: 10_000, output_tokens: 2_000 };
    expect(calcularCostoUsd("claude-opus-4-8", usage)).toBeCloseTo(0.1, 6);
    expect(calcularCostoUsd("claude-opus-4-8", { ...usage, cache_read_input_tokens: null })).toBeCloseTo(0.1, 6);
  });

  it("aprovecha la lectura de caché barata (0,1×) en el mapeo", () => {
    // Mapeo típico: poco input nuevo + mucha lectura de caché del plan.
    // (500×5 + 300×25 + 30.000×0,5)/1e6 = (2.500 + 7.500 + 15.000)/1e6 = 0,025 USD
    const usage = { input_tokens: 500, output_tokens: 300, cache_read_input_tokens: 30_000 };
    expect(calcularCostoUsd("claude-opus-4-8", usage)).toBeCloseTo(0.025, 6);
  });

  it("usa la tarifa por defecto para un modelo desconocido", () => {
    const usage = { input_tokens: 1_000_000, output_tokens: 0 };
    expect(tarifaPara("modelo-inexistente")).toEqual(TARIFA_DEFECTO);
    expect(calcularCostoUsd("modelo-inexistente", usage)).toBeCloseTo(TARIFA_DEFECTO.entrada, 6);
  });

  it("aplica la tarifa específica de Sonnet 4.6", () => {
    const usage = { input_tokens: 1_000_000, output_tokens: 1_000_000 };
    // 3 + 15 = 18 USD
    expect(calcularCostoUsd("claude-sonnet-4-6", usage)).toBeCloseTo(18, 6);
  });
});

describe("totalTokens", () => {
  it("suma los cuatro contadores tratando nulos como cero", () => {
    expect(totalTokens({ input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 10 })).toBe(160);
  });
});
