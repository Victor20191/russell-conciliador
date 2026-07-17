import { describe, it, expect } from "vitest";
import { normalizarEncabezado, calcularHuella, huellasCandidatas, detectarNit } from "./huella";
import type { GridHoja } from "./ingesta";

describe("normalizarEncabezado", () => {
  it("minúsculas, sin tildes y espacios colapsados", () => {
    expect(normalizarEncabezado(["  CÓDIGO ", "Descripción   Cuenta", "DÉBITOS"])).toBe("codigo|descripcion cuenta|debitos");
  });

  it("omite celdas vacías/null y conserva números y booleanos", () => {
    expect(normalizarEncabezado([null, "Cuenta", "", "  ", 2026, true])).toBe("cuenta|2026|true");
  });

  it("fila sin contenido → cadena vacía", () => {
    expect(normalizarEncabezado([null, "", "   "])).toBe("");
  });
});

describe("calcularHuella", () => {
  const fila = ["Código", "Nombre", "Saldo Inicial", "Débitos", "Créditos", "Saldo Final"];

  it("estable: misma hoja + misma fila ⇒ misma huella (16 hex)", () => {
    const a = calcularHuella("Balance", fila);
    const b = calcularHuella("Balance", [...fila]);
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{16}$/);
  });

  it("insensible a mayúsculas/tildes/espacios", () => {
    expect(calcularHuella("Balance", fila)).toBe(calcularHuella("  BALANCE ", ["código", "NOMBRE", "saldo  inicial", "débitos", "créditos", "saldo final"]));
  });

  it("misma fila en hoja distinta ⇒ huella distinta", () => {
    expect(calcularHuella("Balance", fila)).not.toBe(calcularHuella("Retenciones", fila));
  });

  it("fila vacía ⇒ null", () => {
    expect(calcularHuella("Balance", [null, ""])).toBeNull();
  });
});

describe("huellasCandidatas", () => {
  const hoja = (nombre: string, filas: (string | null)[][]): GridHoja => ({ nombre, filas });

  it("recorre las primeras filas de cada hoja con índice 1-based y deduplica", () => {
    const hojas = [
      hoja("Balance", [["Empresa XYZ"], ["Código", "Nombre"], ["Código", "Nombre"]]),
      hoja("Otra", [["Código", "Nombre"]]),
    ];
    const cand = huellasCandidatas(hojas);
    // Filas 2 y 3 de "Balance" son idénticas → una sola huella (fila 2).
    expect(cand.filter((c) => c.hoja === "Balance")).toHaveLength(2);
    expect(cand.find((c) => c.hoja === "Balance" && c.fila === 2)).toBeTruthy();
    expect(cand.find((c) => c.hoja === "Balance" && c.fila === 3)).toBeUndefined();
    // Misma fila en "Otra" → huella distinta (la hoja hace parte del hash).
    expect(cand.find((c) => c.hoja === "Otra")).toBeTruthy();
  });

  it("respeta el límite de filas", () => {
    const filas = Array.from({ length: 30 }, (_, i) => [`fila ${i + 1}`]);
    const cand = huellasCandidatas([hoja("B", filas)], 15);
    expect(cand).toHaveLength(15);
    expect(cand.at(-1)?.fila).toBe(15);
  });
});

describe("detectarNit", () => {
  const enHoja = (filas: (string | number | null)[][]): GridHoja[] => [{ nombre: "Balance", filas }];

  it("label y número en la misma celda, formato es-CO con DV", () => {
    expect(detectarNit(enHoja([["Empresa XYZ S.A.S."], ["NIT: 890.903.938-8"]]))).toBe("890903938");
  });

  it("variantes del label: N.I.T sin dos puntos", () => {
    expect(detectarNit(enHoja([["N.I.T 800123456"]]))).toBe("800123456");
  });

  it("label en una celda y número en la siguiente", () => {
    expect(detectarNit(enHoja([["NIT", "900.451.227-3"]]))).toBe("900451227");
    expect(detectarNit(enHoja([["N.I.T.", null, 900451227]]))).toBe("900451227");
  });

  it("número suelto sin label ⇒ null (nunca adivina)", () => {
    expect(detectarNit(enHoja([["890903938"], ["Balance de prueba a mayo"]]))).toBeNull();
  });

  it("no confunde palabras que contienen 'nit'", () => {
    expect(detectarNit(enHoja([["Nitrógeno 12345678"], ["Monitor 890903938"]]))).toBeNull();
  });

  it("sin filas o sin NIT ⇒ null", () => {
    expect(detectarNit(enHoja([]))).toBeNull();
    expect(detectarNit(enHoja([["Código", "Nombre"], ["110505", "Caja"]]))).toBeNull();
  });
});
