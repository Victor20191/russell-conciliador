import { afterEach, describe, expect, it, vi } from "vitest";
import {
  configuracionIABalanceUI,
  iaBalanceDisponible,
  mensajeIABalanceNoDisponible,
  modoDesarrolloIABalanceActivo,
  modeloIABalance,
  proveedorIABalance,
} from "./proveedor-balance";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("proveedorIABalance", () => {
  it("permite Gemini en desarrollo cuando está seleccionado y configurado", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("BALANCE_AI_DEV_SELECTOR", "true");
    vi.stubEnv("BALANCE_AI_PROVIDER", "gemini");
    vi.stubEnv("GEMINI_API_KEY", "clave-prueba");

    expect(proveedorIABalance()).toBe("gemini");
    expect(modoDesarrolloIABalanceActivo()).toBe(true);
    expect(iaBalanceDisponible()).toBe(true);
  });

  it("permite elegir el proveedor por carga sin cambiar el entorno", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("BALANCE_AI_DEV_SELECTOR", "true");
    vi.stubEnv("BALANCE_AI_PROVIDER", "anthropic");
    vi.stubEnv("GEMINI_API_KEY", "clave-prueba");

    expect(proveedorIABalance("gemini")).toBe("gemini");
    expect(modeloIABalance("gemini")).toContain("gemini");
    expect(iaBalanceDisponible("gemini")).toBe(true);
    expect(configuracionIABalanceUI()?.predeterminado).toBe("anthropic");
  });

  it("fuerza Anthropic en producción aunque el entorno pida Gemini", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("BALANCE_AI_DEV_SELECTOR", "true");
    vi.stubEnv("BALANCE_AI_PROVIDER", "gemini");
    vi.stubEnv("GEMINI_API_KEY", "clave-prueba");
    vi.stubEnv("ANTHROPIC_API_KEY", "");

    expect(proveedorIABalance()).toBe("anthropic");
    expect(proveedorIABalance("gemini")).toBe("anthropic");
    expect(iaBalanceDisponible()).toBe(false);
    expect(mensajeIABalanceNoDisponible()).toContain("ANTHROPIC_API_KEY");
    expect(configuracionIABalanceUI()).toBeNull();
  });

  it("oculta y bloquea Gemini en desarrollo si falta la bandera privada", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("BALANCE_AI_DEV_SELECTOR", "");
    vi.stubEnv("BALANCE_AI_PROVIDER", "gemini");
    vi.stubEnv("GEMINI_API_KEY", "clave-prueba");

    expect(modoDesarrolloIABalanceActivo()).toBe(false);
    expect(configuracionIABalanceUI()).toBeNull();
    expect(proveedorIABalance("gemini")).toBe("anthropic");
  });

  it("rechaza valores desconocidos dentro del modo de desarrollo autorizado", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("BALANCE_AI_DEV_SELECTOR", "true");
    vi.stubEnv("BALANCE_AI_PROVIDER", "otro");
    expect(() => proveedorIABalance()).toThrow(/BALANCE_AI_PROVIDER inválido/);
    expect(() => proveedorIABalance("otro")).toThrow(/BALANCE_AI_PROVIDER inválido/);
  });
});
