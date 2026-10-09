import { describe, expect, it } from "vitest";
import { cuentaDelClasificador, cuentasClientePorClasificador, motivoPropuestaClasificador, proponerCuentaDeClasificador } from "./cuenta-clasificador";
import type { EntornoResolucion } from "./resolver-cuenta4";

describe("cuentaDelClasificador", () => {
  it("quita los caracteres sobrantes que declara el patrón", () => {
    expect(cuentaDelClasificador("AF152805", 2)).toBe("152805");
    expect(cuentaDelClasificador("AF-1528", 3)).toBe("1528");
  });

  it("sin prefijo lee la cuenta tal cual, por larga que venga", () => {
    expect(cuentaDelClasificador("1524010500098")).toBe("1524010500098");
    expect(cuentaDelClasificador("1528", 0)).toBe("1528");
  });

  it("une lo que los separadores parten", () => {
    expect(cuentaDelClasificador("01-1528-05", 3)).toBe("152805");
    expect(cuentaDelClasificador("15.28.05")).toBe("152805");
  });

  it("corta donde empieza el texto: lo de después no es cuenta", () => {
    expect(cuentaDelClasificador("1528 EQUIPO DE COMPUTACIÓN")).toBe("1528");
  });

  it("devuelve null cuando no hay al menos cuatro dígitos", () => {
    expect(cuentaDelClasificador("MAQUINARIA")).toBeNull();
    expect(cuentaDelClasificador("AF15", 2)).toBeNull();
    expect(cuentaDelClasificador("")).toBeNull();
    expect(cuentaDelClasificador(null)).toBeNull();
  });

  it("un prefijo que se comería todo el valor no se aplica a medias", () => {
    expect(cuentaDelClasificador("AF15", 8)).toBeNull();
  });
});

// Cuentas del módulo (subgrupos de Activos fijos) y la homologación del balance del cliente.
const entorno: EntornoResolucion = {
  subgruposModulo: new Set(["1504", "1516", "1520", "1524", "1528"]),
  homologacionCliente: new Map([
    // El cliente lleva sus edificios en 1517 y el balance los homologó a 1516.
    ["151705", { cuenta4: "1516", nombre: "Construcciones y edificaciones" }],
    ["152805", { cuenta4: "1528", nombre: "Equipo de computación" }],
    // Homologada fuera del módulo: no es de Activos fijos.
    ["159905", { cuenta4: "5160", nombre: "Depreciación del gasto" }],
  ]),
};

describe("proponerCuentaDeClasificador", () => {
  it("usa la homologación del balance aunque el PUC del cliente no coincida con el Russell", () => {
    const p = proponerCuentaDeClasificador("AF151705", entorno, { prefijo: 2 });
    expect(p).toEqual({ ok: true, cuenta: "1516", cuentaCliente: "151705", nombreCliente: "Construcciones y edificaciones", via: "homologacion" });
  });

  it("una auxiliar larga hereda la regla de su grupo de seis", () => {
    const p = proponerCuentaDeClasificador("1528050000123", entorno);
    expect(p).toMatchObject({ ok: true, cuenta: "1528", cuentaCliente: "1528050000123", via: "homologacion" });
  });

  it("sin homologación, el subgrupo de 4 que es cuenta del módulo vale como estructura", () => {
    const p = proponerCuentaDeClasificador("AF152401050", entorno, { prefijo: 2 });
    expect(p).toEqual({ ok: true, cuenta: "1524", cuentaCliente: "152401050", nombreCliente: null, via: "estructura" });
  });

  it("el código que ya ES una cuenta del módulo se propone tal cual", () => {
    expect(proponerCuentaDeClasificador("1504", entorno)).toMatchObject({ ok: true, cuenta: "1504", via: "estructura" });
  });

  it("homologada fuera del módulo: se informa y NO se cae a la estructura", () => {
    const p = proponerCuentaDeClasificador("159905", entorno);
    expect(p).toEqual({ ok: false, motivo: "fuera-del-modulo", cuentaCliente: "159905", cuentaReal: "5160", nombreCliente: "Depreciación del gasto" });
    expect(motivoPropuestaClasificador(p as never, "Activos Fijos")).toContain("no pertenece a Activos Fijos");
  });

  it("un subgrupo que no es del módulo y no está homologado queda sin proponer", () => {
    const p = proponerCuentaDeClasificador("170505", entorno);
    expect(p).toEqual({ ok: false, motivo: "sin-homologar", cuentaCliente: "170505" });
  });

  it("un grupo sin cuenta en el código no propone nada", () => {
    expect(proponerCuentaDeClasificador("MAQUINARIA PESADA", entorno)).toEqual({ ok: false, motivo: "sin-cuenta" });
  });

  it("el prefijo equivocado no inventa una cuenta: corta donde toca o no propone", () => {
    // Con el prefijo de otro formato, «AF152805» deja «52805»: no es cuenta del módulo ni está homologada.
    expect(proponerCuentaDeClasificador("AF152805", entorno, { prefijo: 3 })).toEqual({ ok: false, motivo: "sin-homologar", cuentaCliente: "52805" });
  });
});

describe("cuentasClientePorClasificador", () => {
  const fila = (clasificador: string, cuenta?: string) => ({ clasificador, datos: cuenta ? { _cuentaCliente: cuenta } : {} });

  it("toma la cuenta que traen las filas de cada grupo", () => {
    const m = cuentasClientePorClasificador([fila("AF1528", "152805"), fila("AF1524", "152401"), fila("AF1528", "152805")]);
    expect([...m]).toEqual([["AF1528", "152805"], ["AF1524", "152401"]]);
  });

  it("con varias cuentas en el mismo grupo manda la más frecuente", () => {
    const m = cuentasClientePorClasificador([fila("AF1528", "152805"), fila("AF1528", "152810"), fila("AF1528", "152810")]);
    expect(m.get("AF1528")).toBe("152810");
  });

  it("a igualdad se queda con la primera que apareció", () => {
    const m = cuentasClientePorClasificador([fila("AF1528", "152805"), fila("AF1528", "152810")]);
    expect(m.get("AF1528")).toBe("152805");
  });

  it("ignora las filas sin cuenta y los grupos que no traen ninguna", () => {
    const m = cuentasClientePorClasificador([fila("AF1528"), fila("TERRENOS"), fila("AF1528", "152805")]);
    expect([...m]).toEqual([["AF1528", "152805"]]);
  });
});
