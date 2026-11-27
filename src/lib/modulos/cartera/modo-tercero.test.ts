import { describe, expect, it } from "vitest";
import type { SpecModulo } from "../extraccion/esquema";
import { conModoTercero, modoTerceroDe, muestraPareceCabecera } from "./modo-tercero";

const BASE: SpecModulo = {
  hoja: "Hoja1",
  filaEncabezado: 1,
  primeraFilaDatos: 2,
  columnas: { nit: 2, nombre: 3, documento: 1, fecha: 3 },
};

describe("«¿Cómo viene el NIT?» en el editor del mapeo", () => {
  it("en la fila del cliente: los documentos heredan el NIT y el nombre", () => {
    const cabecera = conModoTercero({ ...BASE, arrastrarRoles: ["cuenta"] }, "cabecera");
    expect(cabecera.terceroModo).toBe("cabecera");
    expect(cabecera.arrastrarRoles).toEqual(["cuenta", "nit", "nombre"]);
    expect(modoTerceroDe(cabecera)).toBe("cabecera");
  });

  it("en cada fila: no toca el arrastre que ya tuviera el mapeo", () => {
    const columna = conModoTercero({ ...BASE, terceroModo: "cabecera", arrastrarRoles: ["nit"] }, "columna");
    expect(columna).toMatchObject({ terceroModo: "columna", arrastrarRoles: ["nit"] });
    expect(modoTerceroDe({})).toBe("columna");
  });

  it("solo hereda los roles que el mapeo lee", () => {
    expect(conModoTercero({ ...BASE, columnas: { nit: 2, documento: 1 } }, "cabecera").arrastrarRoles).toEqual(["nit"]);
  });

  it("reconoce en la muestra la fila del cliente con sus documentos debajo", () => {
    const jerarquica = [
      [null, 800111222, "CLIENTE UNO"],
      [101, null, "Sep.22/2026"],
      [102, null, "Sep.23/2026"],
      [null, 900333444, "CLIENTE DOS"],
      [7, null, "Sep.29/2026"],
      [8, null, "Sep.30/2026"],
    ];
    expect(muestraPareceCabecera(jerarquica, BASE.columnas)).toBe(true);
    const plana = [
      [101, 800111222, "Sep.22/2026"],
      [102, 800111222, "Sep.23/2026"],
      [7, 900333444, "Sep.29/2026"],
    ];
    expect(muestraPareceCabecera(plana, BASE.columnas)).toBe(false);
    expect(muestraPareceCabecera(jerarquica, { nit: 2, documento: 0 })).toBe(false);
  });
});
