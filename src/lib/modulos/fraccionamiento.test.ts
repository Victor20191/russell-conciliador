import { describe, it, expect } from "vitest";
import { MODULOS_IMPORT } from "./descriptores";
import { refRolDe, llaveItem, clavesDeDetalle, itemsRepetidos, decidirCarga, remapFilas } from "./fraccionamiento";

const INV = MODULOS_IMPORT.INV;
const fila = (clasificador: string | null, referencia: unknown) => ({ clasificador, datos: { referencia } });

describe("fraccionamiento", () => {
  it("refRolDe encuentra la columna referencia", () => {
    expect(refRolDe(INV)).toBe("referencia");
  });

  it("la llave es (clasificador, referencia) normalizada", () => {
    expect(llaveItem("MATERIA", "REF-1")).toBe("MATERIA∷REF-1");
    expect(llaveItem("MATERIA", "REF-1")).not.toBe(llaveItem("PRODUCTO", "REF-1")); // mismo ref, distinto tipo
    expect(llaveItem("GLOBAL", null)).toBe("GLOBAL∷"); // sin referencia
  });

  it("clavesDeDetalle arma el conjunto por (tipo, ref)", () => {
    const set = clavesDeDetalle("referencia", [fila("A", "1"), fila("A", "2"), fila("B", "1")]);
    expect(set).toEqual(new Set(["A∷1", "A∷2", "B∷1"]));
  });

  it("AGREGA cuando no se repite ninguna referencia (fracción distinta)", () => {
    const existentes = clavesDeDetalle("referencia", [fila("A", "1"), fila("A", "2")]);
    const nuevas = clavesDeDetalle("referencia", [fila("A", "3"), fila("B", "1")]);
    expect(itemsRepetidos(existentes, nuevas)).toBe(0);
    expect(decidirCarga(existentes, nuevas)).toBe("agregar");
  });

  it("VERSIONA cuando se repite el mismo par (tipo, referencia)", () => {
    const existentes = clavesDeDetalle("referencia", [fila("A", "1"), fila("A", "2")]);
    const nuevas = clavesDeDetalle("referencia", [fila("A", "2"), fila("A", "3")]); // A∷2 repetida
    expect(itemsRepetidos(existentes, nuevas)).toBe(1);
    expect(decidirCarga(existentes, nuevas)).toBe("versionar");
  });

  it("globalizado (sin referencia): re-subir el mismo tipo VERSIONA", () => {
    const existentes = clavesDeDetalle("referencia", [fila("GLOBAL", null), fila("GLOBAL", null)]);
    const nuevas = clavesDeDetalle("referencia", [fila("GLOBAL", null)]);
    expect(decidirCarga(existentes, nuevas)).toBe("versionar"); // GLOBAL∷ ya existe
  });

  it("globalizado + otro tipo nuevo AGREGA", () => {
    const existentes = clavesDeDetalle("referencia", [fila("GLOBAL", null)]);
    const nuevas = clavesDeDetalle("referencia", [fila("OTRO", "9")]);
    expect(decidirCarga(existentes, nuevas)).toBe("agregar");
  });

  it("remapFilas reindexa la fracción tras el máximo existente", () => {
    const map = remapFilas(200, [4, 5, 6]);
    expect([...map.entries()]).toEqual([[4, 201], [5, 202], [6, 203]]);
  });
});
