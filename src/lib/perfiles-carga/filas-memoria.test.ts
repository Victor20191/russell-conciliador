import { describe, expect, it } from "vitest";
import {
  FUENTE_BALANCE,
  construirFilasMemoria,
  crearAcumuladorMemoria,
  etiquetaFuente,
  ordenFuentes,
  registrarCorrecciones,
  registrarPerfiles,
  registrarPreferencias,
} from "./filas-memoria";

const CLIENTES = [
  { id: 1, code: "C-1", name: "Alfa SAS", nit: "900.111.222-1", erpName: "SIESA" },
  { id: 2, code: "C-2", name: "Beta Ltda", nit: "800.333.444-2", erpName: null },
  { id: 3, code: "C-3", name: "Gamma SA", nit: "700.555.666-3", erpName: "SAP" },
];

const d = (iso: string) => new Date(iso);

describe("construirFilasMemoria", () => {
  it("emite una fila por (cliente, fuente) con memoria y omite lo vacío o de clientes inexistentes", () => {
    const acc = crearAcumuladorMemoria();
    registrarPerfiles(acc, 1, FUENTE_BALANCE, 2, d("2026-08-01T10:00:00Z"), d("2026-08-02T10:00:00Z"));
    registrarPerfiles(acc, 1, "INV", 1, d("2026-08-03T10:00:00Z"), d("2026-08-03T10:00:00Z"));
    registrarPerfiles(acc, 2, "CAR", 0, null, null); // sin nada guardado → no sale
    registrarPerfiles(acc, 99, "INV", 3, null, d("2026-08-09T10:00:00Z")); // cliente borrado → no sale

    const filas = construirFilasMemoria(CLIENTES, acc);
    expect(filas.map((f) => `${f.id}:${f.fuente}`)).toEqual(["1:INV", "1:balance"]);
    const inv = filas[0];
    expect(inv.fuenteLabel).toBe("Inventarios");
    expect(inv.perfiles).toBe(1);
    expect(inv.correcciones).toBeNull(); // los módulos no memorizan correcciones
    expect(inv.tienePreferencias).toBe(false);
    expect(inv.ultimoUso).toBe("2026-08-03T10:00:00.000Z");
    const balance = filas[1];
    expect(balance.fuenteLabel).toBe("Balance");
    expect(balance.correcciones).toBe(0);
    expect(balance.erpName).toBe("SIESA");
  });

  it("cuenta como memoria las correcciones y las preferencias aunque no haya formatos", () => {
    const acc = crearAcumuladorMemoria();
    registrarCorrecciones(acc, 2, FUENTE_BALANCE, 4, d("2026-07-01T00:00:00Z"));
    registrarPreferencias(acc, 3, "NOM", d("2026-07-02T00:00:00Z"));
    const filas = construirFilasMemoria(CLIENTES, acc);
    expect(filas.map((f) => `${f.id}:${f.fuente}`)).toEqual(["3:NOM", "2:balance"]);
    expect(filas[0].tienePreferencias).toBe(true);
    expect(filas[0].perfiles).toBe(0);
    expect(filas[1].correcciones).toBe(4);
  });

  it("ordena por actividad reciente, luego razón social y luego orden canónico de fuentes", () => {
    const acc = crearAcumuladorMemoria();
    const mismaFecha = d("2026-08-10T12:00:00Z");
    registrarPerfiles(acc, 3, "AFI", 1, null, mismaFecha);
    registrarPerfiles(acc, 3, FUENTE_BALANCE, 1, null, mismaFecha);
    registrarPerfiles(acc, 3, "INV", 1, null, mismaFecha);
    registrarPerfiles(acc, 1, "CXP", 1, null, mismaFecha);
    registrarPreferencias(acc, 2, FUENTE_BALANCE, d("2026-08-11T12:00:00Z")); // la más reciente
    const filas = construirFilasMemoria(CLIENTES, acc);
    expect(filas.map((f) => `${f.name}:${f.fuente}`)).toEqual([
      "Beta Ltda:balance",
      "Alfa SAS:CXP",
      "Gamma SA:balance",
      "Gamma SA:INV",
      "Gamma SA:AFI",
    ]);
  });

  it("acumula varias llamadas sobre la misma fuente y se queda con las fechas más recientes", () => {
    const acc = crearAcumuladorMemoria();
    registrarPerfiles(acc, 1, "ING", 1, d("2026-01-01T00:00:00Z"), d("2026-01-01T00:00:00Z"));
    registrarPerfiles(acc, 1, "ING", 2, d("2026-02-01T00:00:00Z"), null);
    const [fila] = construirFilasMemoria(CLIENTES, acc);
    expect(fila.perfiles).toBe(3);
    expect(fila.ultimoUso).toBe("2026-02-01T00:00:00.000Z");
  });
});

describe("etiquetaFuente y ordenFuentes", () => {
  it("nombra balance y módulos, y deja balance de primero", () => {
    expect(etiquetaFuente(FUENTE_BALANCE)).toBe("Balance");
    expect(etiquetaFuente("CAR")).toBe("Cartera");
    expect(etiquetaFuente("XYZ")).toBe("XYZ");
    const orden = ordenFuentes();
    expect(orden[0]).toBe(FUENTE_BALANCE);
    expect(orden).toContain("INV");
    expect(orden).toContain("NOM");
  });
});
