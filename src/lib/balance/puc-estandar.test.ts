import { describe, expect, it } from "vitest";
import { construirPucRussell, filtrarPucRussell } from "./puc-estandar";

const cuentas = [
  { codigo: "1105", nombre: "Caja", grupo: "11", nombreGrupo: "Disponible", naturaleza: "D" },
  { codigo: "1110", nombre: "Bancos", grupo: "11", nombreGrupo: "Disponible", naturaleza: "D" },
];
const subcuentas = [
  { code: "110505", name: "Caja general", nature: "D" },
  { code: "110510", name: "Cajas menores", nature: "C" },
  { code: "220505", name: "Proveedores nacionales", nature: "C" },
];

describe("PUC Russell completo", () => {
  it("incluye cada nivel en orden y conserva cuentas de cuatro dígitos sin subcuentas", () => {
    const arbol = construirPucRussell(subcuentas, cuentas);
    expect(arbol.map((f) => f.codigo)).toEqual(["1", "11", "1105", "110505", "110510", "1110", "2", "22", "2205", "220505"]);
    expect(arbol.find((f) => f.codigo === "11")?.nombre).toBe("Disponible");
    expect(arbol.find((f) => f.codigo === "1105")).toMatchObject({ naturaleza: "D", nivel: 4 });
    expect(arbol.find((f) => f.codigo === "110510")).toMatchObject({ naturaleza: "C", nivel: 6 });
  });
  it("no inventa la naturaleza ni el nombre de una ficha de cuenta faltante", () => {
    const arbol = construirPucRussell(subcuentas, cuentas);
    expect(arbol.find((f) => f.codigo === "2205")).toMatchObject({ nombre: "Cuenta 2205", naturaleza: null, catalogada: false });
  });
  it("buscar una subcuenta conserva sus padres sin incluir sus hermanas", () => {
    expect(filtrarPucRussell(construirPucRussell(subcuentas, cuentas), "menores").map((f) => f.codigo)).toEqual(["1", "11", "1105", "110510"]);
  });
  it("buscar el nombre de un grupo incluye su árbol completo", () => {
    expect(filtrarPucRussell(construirPucRussell(subcuentas, cuentas), "Disponible").map((f) => f.codigo)).toEqual(["1", "11", "1105", "110505", "110510", "1110"]);
  });
});
