import { describe, expect, test } from "vitest";
import {
  cedulaMixta,
  cedulaModulo,
  claveCedula,
  claveCruceContable,
  cuenta4DelModulo,
  cuentaAsignableCedula,
  cuentaDelModulo,
  cuentas6ACargarCedula,
  cuentasCedula6,
  entradasValorRelacionado,
  filtrarCuentasEstandarPorModulo,
  filtrarSubgruposPorModulo,
  fueraDeListaCedula,
  longitudesCedula,
  opcionesCedula,
  ordenClaveCedula,
  prefijosCuentaModulo,
  subgruposCedula,
} from "./cuentas-modulo";
import { MODULOS_IMPORT } from "./descriptores";

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

describe("cédula contable con ampliaciones del descriptor", () => {
  const afi = cedulaModulo(MODULOS_IMPORT.AFI, ["15"]);
  const ing = cedulaModulo(MODULOS_IMPORT.ING, ["41"]);
  const nom = cedulaModulo(MODULOS_IMPORT.NOM, ["5105", "5205", "7205", "7305"]);
  const inv = cedulaModulo(MODULOS_IMPORT.INV, ["14"]);

  test("Activos fijos: la 15 a 4 dígitos y la 1592 a 6", () => {
    expect(cedulaMixta(afi)).toBe(true);
    expect(claveCedula(afi, "152005")).toBe("1520");
    expect(claveCedula(afi, "", "1516")).toBe("1516");
    expect(claveCedula(afi, "159205")).toBe("159205");
    expect(claveCedula(afi, "159299")).toBe("159299");
    // Homologada solo al subgrupo abierto: no hay renglón.
    expect(claveCedula(afi, "1592")).toBeNull();
    expect(claveCedula(afi, "", "1592")).toBeNull();
  });

  test("Ingresos: la 41 a 6 dígitos por lista y la 422005; el resto de la 4220 no es del módulo", () => {
    expect(cedulaMixta(ing)).toBe(false);
    expect(claveCedula(ing, "410505")).toBe("410505");
    expect(claveCedula(ing, "417505", "4175")).toBe("417505");
    // Homologada solo al subgrupo: a 6 no tiene renglón.
    expect(claveCedula(ing, "", "4105")).toBeNull();
    expect(claveCedula(ing, "422005")).toBe("422005");
    expect(fueraDeListaCedula(ing, "410505")).toBe(false);
    expect(fueraDeListaCedula(ing, "422005")).toBe(false);
    expect(fueraDeListaCedula(ing, "413505")).toBe(true);
    expect(cuentaAsignableCedula(ing, "410530")).toBe(true);
    expect(cuentaAsignableCedula(ing, "422005")).toBe(true);
    expect(cuentaAsignableCedula(ing, "4105")).toBe(false);
    expect(cuentaAsignableCedula(ing, "413505")).toBe(false);
    expect(cuentaAsignableCedula(ing, "422010")).toBe(false);
    expect(subgruposCedula(ing, [{ codigo: "4105", nombre: "Comercio" }, { codigo: "4220", nombre: "Arrendamientos" }])).toEqual(new Set(["4105", "4220"]));
    expect([...longitudesCedula(ing)]).toEqual([6]);
    expect(cuentasCedula6(MODULOS_IMPORT.ING)).toEqual(["410505", "410510", "410515", "410520", "410525", "410530", "417505", "422005"]);
  });

  test("Nómina: los pasivos 25xx son claves de la cédula y no quedan fuera de la lista", () => {
    expect(claveCedula(nom, "251010")).toBe("251010");
    expect(claveCedula(nom, "510506")).toBe("510506");
    expect(fueraDeListaCedula(nom, "251010")).toBe(false);
    expect(fueraDeListaCedula(nom, "510548")).toBe(true);
    expect(cuentaAsignableCedula(nom, "252505")).toBe(true);
    expect(cuentaAsignableCedula(nom, "251005")).toBe(false);
    expect(cuentasCedula6(MODULOS_IMPORT.NOM)).toHaveLength(29);
    expect([...longitudesCedula(nom)]).toEqual([6]);
  });

  test("un módulo sin ampliaciones se comporta como antes", () => {
    expect(cedulaMixta(inv)).toBe(false);
    expect(claveCedula(inv, "143505")).toBe("1435");
    expect(claveCedula(inv, "", "1435")).toBe("1435");
    expect(cuentas6ACargarCedula(inv)).toEqual([]);
    expect([...longitudesCedula(inv)]).toEqual([4]);
  });

  test("qué cuentas de 6 se cargan para nombrar los renglones", () => {
    expect(cuentas6ACargarCedula(afi)).toBeNull();
    expect(cuentas6ACargarCedula(ing)).toEqual(["410505", "410510", "410515", "410520", "410525", "410530", "417505", "422005"]);
    expect(cuentas6ACargarCedula(nom)).toHaveLength(29);
  });

  test("las opciones del Consolidado excluyen la 1592 y suman las adicionales", () => {
    const sub = [
      { codigo: "1516", nombre: "Construcciones" },
      { codigo: "1592", nombre: "Depreciación acumulada" },
      { codigo: "4135", nombre: "Comercio" },
    ];
    const plan = [
      { codigo: "159205", nombre: "Dep. construcciones" },
      { codigo: "410505", nombre: "Tarifa general" },
      { codigo: "413505", nombre: "Otra de la 41" },
      { codigo: "422005", nombre: "Arrendamientos" },
    ];
    expect(opcionesCedula(afi, sub, plan).map((c) => c.codigo)).toEqual(["1516"]);
    expect(opcionesCedula(ing, sub, plan).map((c) => c.codigo)).toEqual(["410505", "422005"]);
  });

  test("la depreciación cruza contra la 1592xx del activo asignado", () => {
    const detalles = [
      { clasificador: "MAQUINARIA", datos: { depreciacion: 300 } },
      { clasificador: "MAQUINARIA", datos: { depreciacion: 200 } },
      { clasificador: "EDIFICIOS", datos: { depreciacion: -1_000 } },
      { clasificador: "TERRENOS", datos: { depreciacion: 50 } },
      { clasificador: "MIXTO", datos: { depreciacion: 70 } },
      { clasificador: "SIN DEP", datos: { depreciacion: 0 } },
      { clasificador: "SIN DEP", datos: {} },
    ];
    const cuentas = new Map([
      ["MAQUINARIA", ["1520"]],
      ["EDIFICIOS", ["1516"]],
      ["TERRENOS", ["1504"]],
      ["MIXTO", ["1520", "1528"]],
      ["SIN DEP", ["1524"]],
    ]);
    expect(entradasValorRelacionado(afi, detalles, cuentas, "depreciación")).toEqual([
      { clasificador: "EDIFICIOS · depreciación", total: 1_000, cuentas4: ["159205"], relacionado: true },
      { clasificador: "MAQUINARIA · depreciación", total: 500, cuentas4: ["159210"], relacionado: true },
      { clasificador: "MIXTO · depreciación", total: 70, cuentas4: ["159210", "159220"], relacionado: true },
      // Terrenos no se deprecian: queda sin cuenta y sale en el aviso.
      { clasificador: "TERRENOS · depreciación", total: 50, cuentas4: [], relacionado: true },
    ]);
    expect(entradasValorRelacionado(ing, detalles, cuentas, "x")).toEqual([]);
  });

  test("la depreciación se ordena justo debajo de su activo", () => {
    const claves = ["1520", "159205", "1516", "159210", "159299", "1504"];
    const ordenadas = [...claves].sort((a, b) => (ordenClaveCedula(afi, a) < ordenClaveCedula(afi, b) ? -1 : 1));
    expect(ordenadas).toEqual(["1504", "1516", "159205", "1520", "159210", "159299"]);
  });
});
