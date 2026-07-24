import { describe, it, expect } from "vitest";
import {
  etiquetaVersion,
  parseSemVer,
  compararSemVer,
  bumpSemVer,
} from "./version-app";

describe("etiquetaVersion", () => {
  it("antepone v si falta", () => {
    expect(etiquetaVersion("1.4.0")).toBe("v1.4.0");
  });
  it("respeta prefijo v/V", () => {
    expect(etiquetaVersion("v1.4.0")).toBe("v1.4.0");
    expect(etiquetaVersion("V2.0.0")).toBe("V2.0.0");
  });
  it("vacío / null → cadena vacía", () => {
    expect(etiquetaVersion("")).toBe("");
    expect(etiquetaVersion("   ")).toBe("");
    expect(etiquetaVersion(null)).toBe("");
    expect(etiquetaVersion(undefined)).toBe("");
  });
});

describe("parseSemVer", () => {
  it("parsea major.minor.patch con o sin v", () => {
    expect(parseSemVer("1.4.0")).toEqual({ major: 1, minor: 4, patch: 0 });
    expect(parseSemVer("v2.10.3")).toEqual({ major: 2, minor: 10, patch: 3 });
  });
  it("tolera sufijos (beta) y rechaza basura", () => {
    expect(parseSemVer("1.2.3-beta")).toEqual({ major: 1, minor: 2, patch: 3 });
    expect(parseSemVer("dev-2026-06-29")).toBeNull();
    expect(parseSemVer("")).toBeNull();
  });
});

describe("compararSemVer", () => {
  it("ordena por major, minor, patch", () => {
    expect(compararSemVer("1.5.0", "1.4.0")).toBeGreaterThan(0);
    expect(compararSemVer("1.4.0", "1.4.1")).toBeLessThan(0);
    expect(compararSemVer("v1.4.0", "1.4.0")).toBe(0);
  });
});

describe("bumpSemVer", () => {
  it("sube major / minor / patch", () => {
    expect(bumpSemVer("1.4.2", "major")).toBe("2.0.0");
    expect(bumpSemVer("1.4.2", "minor")).toBe("1.5.0");
    expect(bumpSemVer("1.4.2", "patch")).toBe("1.4.3");
  });
  it("lanza si no es SemVer", () => {
    expect(() => bumpSemVer("dev-2026-01-01", "minor")).toThrow(/SemVer/);
  });
});
