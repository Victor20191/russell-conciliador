import { describe, it, expect } from "vitest";
import {
  aperturaDeListado,
  aperturasDeclaradasPorGrupo,
  claveRenglonApertura,
  type EncabezadoAgrupable,
} from "./agrupacion-aperturas";

/** Atajo: aperturas declaradas de un período descrito como lista de aperturas crudas. */
const declaradasDe = (...aperturas: (string | null)[]) =>
  aperturasDeclaradasPorGrupo(aperturas.map((a) => ({ clave: "p", aperturaBalance: a }))).get("p")!;

describe("aperturasDeclaradasPorGrupo", () => {
  it("agrupa por clave y descarta lo que no es una apertura válida", () => {
    const encabezados: EncabezadoAgrupable[] = [
      { clave: "9|Enero 2025", aperturaBalance: "cuenta" },
      { clave: "9|Enero 2025", aperturaBalance: "tercero" },
      { clave: "9|Enero 2025", aperturaBalance: null },
      { clave: "9|Enero 2025", aperturaBalance: "vaya-uno-a-saber" },
      { clave: "7|Enero 2025", aperturaBalance: "cuenta" },
    ];
    const porGrupo = aperturasDeclaradasPorGrupo(encabezados);
    expect([...porGrupo.get("9|Enero 2025")!].sort()).toEqual(["cuenta", "tercero"]);
    expect([...porGrupo.get("7|Enero 2025")!]).toEqual(["cuenta"]);
  });

  it("crea el grupo aunque ninguna versión declare apertura", () => {
    expect(aperturasDeclaradasPorGrupo([{ clave: "p", aperturaBalance: null }]).get("p")).toEqual(new Set());
  });

  it("NO fusiona el mismo período de dos clientes distintos", () => {
    // El nombre del período se repite entre clientes; la clave lleva el cliente.
    const porGrupo = aperturasDeclaradasPorGrupo([
      { clave: "9|Enero 2025", aperturaBalance: "cuenta" },
      { clave: "7|Enero 2025", aperturaBalance: "tercero" },
    ]);
    expect(porGrupo.size).toBe(2);
  });
});

describe("aperturaDeListado", () => {
  it("respeta la apertura declarada del propio encabezado", () => {
    expect(aperturaDeListado("tercero", declaradasDe("cuenta", "tercero"))).toBe("tercero");
    expect(aperturaDeListado("cuenta", declaradasDe("cuenta", "tercero"))).toBe("cuenta");
  });

  it("pliega el cargue legado sobre la única apertura declarada del período", () => {
    // Las 6 versiones viejas de IVANAGRO son la misma línea que su v7 «por cuenta».
    expect(aperturaDeListado(null, declaradasDe(null, "cuenta"))).toBe("cuenta");
    expect(aperturaDeListado(null, declaradasDe(null, "tercero"))).toBe("tercero");
  });

  it("no adivina cuando el período ya tiene las dos aperturas", () => {
    expect(aperturaDeListado(null, declaradasDe("cuenta", "tercero"))).toBeNull();
  });

  it("deja sin apertura al período enteramente legado", () => {
    expect(aperturaDeListado(null, declaradasDe(null, null))).toBeNull();
    expect(aperturaDeListado(null, undefined)).toBeNull();
  });

  it("trata un valor irreconocible como no declarado", () => {
    expect(aperturaDeListado("POR TERCEROS!!", declaradasDe("cuenta"))).toBe("cuenta");
  });
});

describe("claveRenglonApertura", () => {
  it("da una clave distinta a cada apertura del mismo período", () => {
    const cuenta = claveRenglonApertura("9|Enero 2025", "cuenta");
    const tercero = claveRenglonApertura("9|Enero 2025", "tercero");
    const legado = claveRenglonApertura("9|Enero 2025", null);
    expect(new Set([cuenta, tercero, legado]).size).toBe(3);
  });

  it("es estable para la misma combinación", () => {
    expect(claveRenglonApertura("9|Enero 2025", "cuenta")).toBe(claveRenglonApertura("9|Enero 2025", "cuenta"));
  });
});
