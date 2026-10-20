import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { decrypt } from "@/lib/crypto";
import {
  cifrarCredenciales,
  clavesCredencialesDefinidas,
  descifrarCredenciales,
  fusionarCredenciales,
} from "./credenciales";

beforeEach(() => vi.stubEnv("MASTER_ENCRYPTION_KEY", "12345678901234567890123456789012"));
afterEach(() => vi.unstubAllEnvs());

describe("credenciales de conexión", () => {
  it("cifra solo los valores no vacíos y hace roundtrip", () => {
    const cifradas = cifrarCredenciales({ token: "abc123", vacio: "" });
    expect(Object.keys(cifradas)).toEqual(["token"]);
    expect(cifradas.token).not.toContain("abc123");
    expect(cifradas.token).toMatch(/^v1:/);
    expect(descifrarCredenciales(cifradas).token).toBe("abc123");
  });

  it("rechaza guardar secretos sin una clave válida", () => {
    vi.stubEnv("MASTER_ENCRYPTION_KEY", "");
    expect(() => cifrarCredenciales({ token: "abc123" })).toThrow(/MASTER_ENCRYPTION_KEY/);
    vi.stubEnv("MASTER_ENCRYPTION_KEY", "corta");
    expect(() => cifrarCredenciales({ token: "abc123" })).toThrow(/32 bytes/);
  });

  it("lee cifrado anterior y recifra secretos legados, incluso con dos puntos", () => {
    const cifrado = cifrarCredenciales({ token: "secreto" }).token;
    expect(decrypt(cifrado.slice(3))).toBe("secreto");
    const migrado = fusionarCredenciales({ token: "usuario:secreto" }, {});
    expect(migrado.token).toMatch(/^v1:/);
    expect(descifrarCredenciales(migrado).token).toBe("usuario:secreto");
  });

  it("no devuelve un valor corrupto ni cifrado con otra clave", () => {
    const guardadas = cifrarCredenciales({ token: "abc123" });
    vi.stubEnv("MASTER_ENCRYPTION_KEY", "abcdefghijklmnopqrstuvwxyz123456");
    expect(descifrarCredenciales(guardadas)).toEqual({});
    expect(descifrarCredenciales({ token: "v1:roto" })).toEqual({});
  });

  it("conserva el secreto anterior cuando el formulario llega vacío", () => {
    const anteriores = cifrarCredenciales({ token: "viejo" });
    const fusionadas = fusionarCredenciales(anteriores, { token: "", otro: "nuevo" });
    const descifradas = descifrarCredenciales(fusionadas);
    expect(descifradas.token).toBe("viejo");
    expect(descifradas.otro).toBe("nuevo");
  });

  it("reemplaza el secreto cuando llega un valor nuevo", () => {
    const anteriores = cifrarCredenciales({ token: "viejo" });
    const fusionadas = fusionarCredenciales(anteriores, { token: "nuevo" });
    expect(descifrarCredenciales(fusionadas).token).toBe("nuevo");
  });
  it("permite reemplazar una credencial cifrada que ya no se puede leer", () => {
    const reparada = fusionarCredenciales({ token: "v1:roto" }, { token: "nuevo" });
    expect(descifrarCredenciales(reparada).token).toBe("nuevo");
  });

  it("lista las claves definidas sin exponer valores", () => {
    const guardadas = cifrarCredenciales({ a: "1", b: "" });
    expect(clavesCredencialesDefinidas(guardadas)).toEqual(["a"]);
  });

  it("tolera valores nulos, arreglos o corruptos", () => {
    expect(descifrarCredenciales(null)).toEqual({});
    expect(descifrarCredenciales(undefined)).toEqual({});
    expect(descifrarCredenciales(["a"])).toEqual({});
    expect(descifrarCredenciales({ numero: 42 })).toEqual({});
    expect(clavesCredencialesDefinidas(null)).toEqual([]);
  });
});
