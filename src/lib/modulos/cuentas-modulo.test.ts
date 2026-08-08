import { describe, expect, test } from "vitest";
import {
  cuenta4DelModulo,
  filtrarSubgruposPorModulo,
  prefijosCuentaModulo,
} from "./cuentas-modulo";

const catalogo = [
  { moduloCodigo: "INV", cuentaRussell: "14", activa: true },
  { moduloCodigo: "CAR", cuentaRussell: "13", activa: true },
  { moduloCodigo: "CAR", cuentaRussell: "2805", activa: true },
  { moduloCodigo: "CXP", cuentaRussell: "22", activa: true },
  { moduloCodigo: "CXP", cuentaRussell: "1330", activa: false },
];

const subgrupos = [
  { codigo: "1105", nombre: "Caja" },
  { codigo: "1305", nombre: "Clientes" },
  { codigo: "1330", nombre: "Anticipos y avances" },
  { codigo: "1405", nombre: "Materias primas" },
  { codigo: "1435", nombre: "Mercancías no fabricadas" },
  { codigo: "1504", nombre: "Terrenos" },
  { codigo: "2205", nombre: "Proveedores nacionales" },
  { codigo: "2805", nombre: "Anticipos y avances recibidos" },
  { codigo: "3120", nombre: "Superávit" },
];

describe("prefijosCuentaModulo", () => {
  test("toma los prefijos activos del catálogo del módulo", () => {
    expect(prefijosCuentaModulo("INV", catalogo)).toEqual(["14"]);
    expect(prefijosCuentaModulo("car", catalogo)).toEqual(["13", "2805"]);
  });

  test("ignora filas inactivas", () => {
    expect(prefijosCuentaModulo("CXP", catalogo)).toEqual(["22"]);
  });

  test("cae al catálogo de fábrica si el módulo no tiene filas vivas", () => {
    expect(prefijosCuentaModulo("ING", [])).toEqual(["41"]);
    expect(prefijosCuentaModulo("NOM", catalogo)).toEqual(["5105", "5205", "7205"]);
  });
});

describe("cuenta4DelModulo", () => {
  test("acepta cuentas bajo el prefijo de grupo del módulo", () => {
    expect(cuenta4DelModulo("1435", ["14"])).toBe(true);
    expect(cuenta4DelModulo("1405", ["14"])).toBe(true);
    expect(cuenta4DelModulo("1504", ["14"])).toBe(false);
    expect(cuenta4DelModulo("3120", ["14"])).toBe(false);
  });

  test("acepta la cuenta exacta cuando el prefijo es de 4 dígitos", () => {
    expect(cuenta4DelModulo("2805", ["13", "2805"])).toBe(true);
    expect(cuenta4DelModulo("2806", ["13", "2805"])).toBe(false);
    expect(cuenta4DelModulo("1305", ["13", "2805"])).toBe(true);
  });
});

describe("filtrarSubgruposPorModulo", () => {
  test("en inventarios solo deja las cuentas 14xx", () => {
    const prefijos = prefijosCuentaModulo("INV", catalogo);
    expect(filtrarSubgruposPorModulo(subgrupos, prefijos)).toEqual([
      { codigo: "1405", nombre: "Materias primas" },
      { codigo: "1435", nombre: "Mercancías no fabricadas" },
    ]);
  });

  test("en cartera deja 13xx y 2805", () => {
    const prefijos = prefijosCuentaModulo("CAR", catalogo);
    expect(filtrarSubgruposPorModulo(subgrupos, prefijos).map((s) => s.codigo)).toEqual([
      "1305",
      "1330",
      "2805",
    ]);
  });
});
