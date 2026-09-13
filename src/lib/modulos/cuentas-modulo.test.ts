import { describe, expect, test } from "vitest";
import {
  claveCruceContable,
  cuenta4DelModulo,
  cuentaDelModulo,
  filtrarCuentasEstandarPorModulo,
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
    expect(prefijosCuentaModulo("NOM", catalogo)).toEqual(["5105", "5205", "7205", "7305"]);
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

describe("cédula a 6 dígitos (nivelCruce: 6)", () => {
  const prefijosNom = ["5105", "5205", "7205", "7305"];
  const cuentasNom = ["510506", "510530", "720505", "730505"];

  test("claveCruceContable da el subgrupo a 4 y la cuenta completa a 6", () => {
    expect(claveCruceContable("510506", 4)).toBe("5105");
    expect(claveCruceContable("510506", 6)).toBe("510506");
    expect(claveCruceContable("51.05.06", 6)).toBe("510506");
    // Una fila homologada solo al subgrupo no puede entrar a una cédula de 6.
    expect(claveCruceContable("5105", 6)).toBeNull();
    expect(claveCruceContable("5105", 4)).toBe("5105");
    expect(claveCruceContable(null, 6)).toBeNull();
  });

  test("cuentaDelModulo exige el largo del nivel y respeta la lista de 6 del descriptor", () => {
    expect(cuentaDelModulo("5105", 4, prefijosNom)).toBe(true);
    expect(cuentaDelModulo("510506", 4, prefijosNom)).toBe(false);
    expect(cuentaDelModulo("510506", 6, prefijosNom, cuentasNom)).toBe(true);
    // 510548 está bajo la 5105, pero Nómina no la concilia (RF-NOM-05).
    expect(cuentaDelModulo("510548", 6, prefijosNom, cuentasNom)).toBe(false);
    // Sin lista explícita basta el prefijo.
    expect(cuentaDelModulo("510548", 6, prefijosNom)).toBe(true);
    expect(cuentaDelModulo("250506", 6, prefijosNom)).toBe(false);
  });

  test("filtrarCuentasEstandarPorModulo deja solo las de 6 del módulo, en el orden del plan", () => {
    const plan = [
      { codigo: "5105", nombre: "Gastos de personal" },
      { codigo: "510506", nombre: "Sueldos" },
      { codigo: "510548", nombre: "Bonificaciones" },
      { codigo: "720505", nombre: "Salarios" },
      { codigo: "251005", nombre: "Salarios por pagar" },
    ];
    expect(filtrarCuentasEstandarPorModulo(plan, prefijosNom, cuentasNom).map((c) => c.codigo)).toEqual(["510506", "720505"]);
    expect(filtrarCuentasEstandarPorModulo(plan, prefijosNom).map((c) => c.codigo)).toEqual(["510506", "510548", "720505"]);
  });
});
