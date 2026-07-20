import { afterEach, describe, expect, it, vi } from "vitest";
import {
  configuracionIABalanceUI,
  correoAutorizadoIAPruebas,
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

  it("permite Gemini en producción cuando la frontera autorizó la sesión", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("BALANCE_AI_DEV_SELECTOR", "");
    vi.stubEnv("GEMINI_API_KEY", "clave-prueba");

    expect(proveedorIABalance("gemini", { autorizado: true })).toBe("gemini");
    expect(modeloIABalance(proveedorIABalance("gemini", { autorizado: true }))).toContain("gemini");
    // Sin selección explícita el predeterminado sigue siendo el flujo de producción.
    expect(proveedorIABalance(undefined, { autorizado: true })).toBe("anthropic");
    expect(configuracionIABalanceUI({ autorizado: true })?.predeterminado).toBe("anthropic");
    // Sin la autorización de la frontera, todo queda forzado como antes.
    expect(proveedorIABalance("gemini")).toBe("anthropic");
    expect(configuracionIABalanceUI()).toBeNull();
  });
});

describe("correoAutorizadoIAPruebas", () => {
  it("acepta solo correos del dominio corporativo (insensible a mayúsculas)", () => {
    expect(correoAutorizadoIAPruebas("admin@xentria.co")).toBe(true);
    expect(correoAutorizadoIAPruebas("  Luisa@XENTRIA.CO ")).toBe(true);
    expect(correoAutorizadoIAPruebas("staff@cliente.com")).toBe(false);
    expect(correoAutorizadoIAPruebas("falso@noxentria.co")).toBe(false);
    expect(correoAutorizadoIAPruebas("xentria.co@gmail.com")).toBe(false);
    expect(correoAutorizadoIAPruebas("")).toBe(false);
    expect(correoAutorizadoIAPruebas(null)).toBe(false);
    expect(correoAutorizadoIAPruebas(undefined)).toBe(false);
  });
});
