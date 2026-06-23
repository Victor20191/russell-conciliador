import { describe, it, expect } from "vitest";
import {
  parsePasos,
  ordenarVersiones,
  esRutaInternaSegura,
  toneDeTipo,
  etiquetaTipo,
  toneDeEstadoFuncionalidad,
  contarPorTipo,
} from "./format";

describe("parsePasos", () => {
  it("divide por líneas, recorta y descarta vacías", () => {
    expect(parsePasos("Abre /balance\n\n  Sube el archivo  \nConfirma")).toEqual([
      "Abre /balance",
      "Sube el archivo",
      "Confirma",
    ]);
  });
  it("elimina marcadores de lista iniciales", () => {
    expect(parsePasos("1. Uno\n2) Dos\n- Tres\n* Cuatro\n• Cinco")).toEqual([
      "Uno",
      "Dos",
      "Tres",
      "Cuatro",
      "Cinco",
    ]);
  });
  it("devuelve [] para null/undefined/vacío", () => {
    expect(parsePasos(null)).toEqual([]);
    expect(parsePasos(undefined)).toEqual([]);
    expect(parsePasos("   \n  ")).toEqual([]);
  });
});

describe("ordenarVersiones", () => {
  it("ordena por orden desc y luego id desc, sin mutar la entrada", () => {
    const input = [
      { id: 1, order: 10 },
      { id: 2, order: 30 },
      { id: 3, order: 30 },
      { id: 4, order: 20 },
    ];
    const out = ordenarVersiones(input);
    expect(out.map((v) => v.id)).toEqual([3, 2, 4, 1]);
    expect(input.map((v) => v.id)).toEqual([1, 2, 3, 4]); // no muta
  });
});

describe("esRutaInternaSegura", () => {
  it("acepta rutas internas absolutas", () => {
    expect(esRutaInternaSegura("/balance")).toBe(true);
    expect(esRutaInternaSegura("/config/mapeo")).toBe(true);
    expect(esRutaInternaSegura("/")).toBe(true);
  });
  it("rechaza externas, protocolo-relativas, relativas y vacías", () => {
    expect(esRutaInternaSegura("https://evil.com")).toBe(false);
    expect(esRutaInternaSegura("//evil.com")).toBe(false);
    expect(esRutaInternaSegura("balance")).toBe(false);
    expect(esRutaInternaSegura(null)).toBe(false);
    expect(esRutaInternaSegura("")).toBe(false);
  });
});

describe("tonos y etiquetas", () => {
  it("mapea valores conocidos y cae a ink/raw en desconocidos", () => {
    expect(toneDeTipo("seguridad")).toBe("err");
    expect(etiquetaTipo("nueva")).toBe("Nueva funcionalidad");
    expect(toneDeTipo("inexistente")).toBe("ink");
    expect(etiquetaTipo("inexistente")).toBe("inexistente");
    expect(toneDeEstadoFuncionalidad("en_desarrollo")).toBe("warn");
  });
});

describe("contarPorTipo", () => {
  it("cuenta por tipo conocido e ignora desconocidos", () => {
    const r = contarPorTipo([
      { type: "nueva" },
      { type: "nueva" },
      { type: "mejora" },
      { type: "x" },
    ]);
    expect(r).toEqual({ nueva: 2, mejora: 1, correccion: 0, seguridad: 0 });
  });
});
