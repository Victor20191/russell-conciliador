import { test, expect, describe } from "vitest";
import {
  FUNCIONES_ASIGNACION,
  FUNCION_POR_ROL,
  ROL_POR_FUNCION,
  ROL_SUPERIOR,
  esAristaValida,
  derivarAsignacionesSocio,
} from "./jerarquia";

describe("Adyacencia de la jerarquía organizacional", () => {
  test("las aristas válidas conectan roles ADYACENTES", () => {
    expect(esAristaValida("Socio", "Gerente")).toBe(true);
    expect(esAristaValida("Gerente", "Senior")).toBe(true);
    expect(esAristaValida("Senior", "Staff")).toBe(true);
  });

  test("las aristas que saltan niveles o van al revés son inválidas", () => {
    expect(esAristaValida("Socio", "Senior")).toBe(false); // salta al Gerente
    expect(esAristaValida("Socio", "Staff")).toBe(false);
    expect(esAristaValida("Gerente", "Staff")).toBe(false);
    expect(esAristaValida("Staff", "Senior")).toBe(false); // invertida
    expect(esAristaValida("Senior", "Gerente")).toBe(false); // invertida
  });

  test("los roles sin superior no admiten aristas como subordinado", () => {
    for (const rol of ["Socio", "Administrador", "Superadministrador", "Consulta"]) {
      expect(ROL_SUPERIOR[rol]).toBeUndefined();
      expect(esAristaValida("Socio", rol)).toBe(rol === "Gerente");
    }
  });
});

describe("Funciones de responsable por cliente", () => {
  test("FUNCION_POR_ROL y ROL_POR_FUNCION son inversas y cubren las 3 funciones", () => {
    expect(Object.keys(FUNCION_POR_ROL).sort()).toEqual(["Gerente", "Senior", "Staff"]);
    for (const funcion of FUNCIONES_ASIGNACION) {
      expect(FUNCION_POR_ROL[ROL_POR_FUNCION[funcion]]).toBe(funcion);
    }
  });
});

describe("derivarAsignacionesSocio", () => {
  test("genera lectura (nunca escritura) a nombre del socio", () => {
    const sinteticas = derivarAsignacionesSocio(99, [{ clientId: 1 }, { clientId: 2 }]);
    expect(sinteticas).toHaveLength(2);
    for (const a of sinteticas) {
      expect(a.userId).toBe(99);
      expect(a.readScope).toBe(true);
      expect(a.writeScope).toBe(false);
      expect(a.active).toBe(true);
    }
  });

  test("deduplica por cliente (varios gerentes sobre el mismo cliente)", () => {
    const sinteticas = derivarAsignacionesSocio(99, [
      { clientId: 1 },
      { clientId: 1 },
      { clientId: 2 },
    ]);
    expect(sinteticas.map((a) => a.clientId).sort()).toEqual([1, 2]);
  });

  test("sin asignaciones de gerentes no deriva nada", () => {
    expect(derivarAsignacionesSocio(99, [])).toEqual([]);
  });
});
