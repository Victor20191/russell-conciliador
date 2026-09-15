import { describe, expect, it } from "vitest";
import {
  cifrarCredenciales,
  clavesCredencialesDefinidas,
  descifrarCredenciales,
  fusionarCredenciales,
} from "./credenciales";

describe("credenciales de conexión", () => {
  it("cifra solo los valores no vacíos y hace roundtrip", () => {
    const cifradas = cifrarCredenciales({ token: "abc123", vacio: "" });
    expect(Object.keys(cifradas)).toEqual(["token"]);
    expect(descifrarCredenciales(cifradas).token).toBe("abc123");
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
