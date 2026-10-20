import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findMany: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  default: { conexionIntegracion: { findMany: mocks.findMany } },
}));

import { cifrarCredenciales } from "./credenciales";
import { conexionIADisponible, resolverClaveIA, type ProveedorConexionIA } from "./ia";

function conexion(urlBase = "https://api.anthropic.com", apiKey = "clave-guardada") {
  return {
    configuracion: { usar_en_plataforma: true, url_base: urlBase, modelo: "ignorar-modelo" },
    credenciales: cifrarCredenciales({ api_key: apiKey, token: "otro-secreto" }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("DATABASE_URL", "postgresql://usuario:clave@localhost:5432/pruebas_mock");
  vi.stubEnv("MASTER_ENCRYPTION_KEY", "12345678901234567890123456789012");
  vi.stubEnv("ANTHROPIC_API_KEY", "respaldo-anthropic");
  vi.stubEnv("GEMINI_API_KEY", "respaldo-gemini");
  vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "");
  vi.stubEnv("OPENROUTER_API_KEY", "respaldo-openrouter");
  mocks.findMany.mockResolvedValue([]);
});

afterEach(() => vi.unstubAllEnvs());

describe("credenciales IA de la plataforma", () => {
  it.each([
    ["anthropic", "https://api.anthropic.com"],
    ["gemini", "https://generativelanguage.googleapis.com"],
    ["openrouter", "https://openrouter.ai"],
  ] as const)("prefiere la conexión seleccionada para %s y restringe su consulta", async (proveedor, base) => {
    mocks.findMany.mockResolvedValue([conexion(base)]);

    expect(await resolverClaveIA(proveedor)).toBe("clave-guardada");
    expect(mocks.findMany).toHaveBeenCalledWith({
      where: {
        categoria: "API",
        proveedor,
        entorno: "PRODUCCION",
        activa: true,
        configuracion: { path: ["usar_en_plataforma"], equals: true },
      },
      select: { configuracion: true, credenciales: true },
      take: 2,
    });
  });

  it.each(["anthropic", "gemini", "openrouter"] as ProveedorConexionIA[])(
    "conserva el respaldo de entorno para %s cuando no hay selección",
    async (proveedor) => {
      expect(await resolverClaveIA(proveedor)).toBe(`respaldo-${proveedor}`);
    },
  );

  it("respeta la variable alternativa de Gemini y recorta espacios", async () => {
    vi.stubEnv("GEMINI_API_KEY", " ");
    vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", " alternativa ");
    expect(await resolverClaveIA("gemini")).toBe("alternativa");
  });

  it("permite el cliente sin base configurada y no intenta consultar una BD inexistente", async () => {
    vi.stubEnv("DATABASE_URL", "");
    expect(await resolverClaveIA("anthropic")).toBe("respaldo-anthropic");
    expect(mocks.findMany).not.toHaveBeenCalled();
  });

  it("devuelve null sin selección ni variable y no anuncia disponibilidad", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    expect(await resolverClaveIA("anthropic")).toBeNull();
    expect(await conexionIADisponible("anthropic")).toBe(false);
  });

  it("rechaza selecciones ambiguas en lugar de usar la primera o el entorno", async () => {
    mocks.findMany.mockResolvedValue([conexion(), conexion()]);
    await expect(resolverClaveIA("anthropic")).rejects.toThrow(/varias conexiones/);
    expect(await conexionIADisponible("anthropic")).toBe(false);
  });

  it.each([
    "https://otro.example",
    "https://api.anthropic.com.ejemplo.com",
    "http://api.anthropic.com",
    "https://secreto:clave@api.anthropic.com",
    "https://api.anthropic.com/v1?api_key=secreto",
    "https://api.anthropic.com/v1#fragmento",
    "https://api.anthropic.com/otra-api",
  ])("rechaza una URL incompatible sin incluirla en el error: %s", async (base) => {
    mocks.findMany.mockResolvedValue([conexion(base)]);
    await expect(resolverClaveIA("anthropic")).rejects.toThrow("debe usar la URL oficial");
    await expect(resolverClaveIA("anthropic")).rejects.not.toThrow(base);
  });

  it.each(["https://api.anthropic.com/", "https://api.anthropic.com/v1/"])(
    "admite la base oficial normalizada: %s",
    async (base) => {
      mocks.findMany.mockResolvedValue([conexion(base)]);
      expect(await resolverClaveIA("anthropic")).toBe("clave-guardada");
    },
  );

  it("no sustituye una credencial dañada por la del entorno", async () => {
    mocks.findMany.mockResolvedValue([{
      configuracion: { usar_en_plataforma: true },
      credenciales: { api_key: "v1:cifrado:ilegible:corrupto" },
    }]);
    await expect(resolverClaveIA("anthropic")).rejects.toThrow(/API Key válida/);
    expect(await conexionIADisponible("anthropic")).toBe(false);
  });

  it("no sustituye una credencial ausente por otro campo o por el entorno", async () => {
    mocks.findMany.mockResolvedValue([{
      configuracion: { usar_en_plataforma: true },
      credenciales: cifrarCredenciales({ token: "no-es-la-api-key" }),
    }]);
    await expect(resolverClaveIA("anthropic")).rejects.toThrow(/API Key válida/);
  });

  it("oculta detalles de errores de BD y falla cerrado", async () => {
    mocks.findMany.mockRejectedValue(new Error("postgresql://usuario:secreto@host"));
    await expect(resolverClaveIA("anthropic")).rejects.toThrow("No se pudo consultar");
    await expect(resolverClaveIA("anthropic")).rejects.not.toThrow("secreto");
    expect(await conexionIADisponible("anthropic")).toBe(false);
  });

  it("aplica rotación y desactivación sin cachear secretos", async () => {
    mocks.findMany
      .mockResolvedValueOnce([conexion(undefined, "primera")])
      .mockResolvedValueOnce([conexion(undefined, "segunda")])
      .mockResolvedValueOnce([]);
    expect(await resolverClaveIA("anthropic")).toBe("primera");
    expect(await resolverClaveIA("anthropic")).toBe("segunda");
    expect(await resolverClaveIA("anthropic")).toBe("respaldo-anthropic");
  });
});
