import { describe, expect, it } from "vitest";
import {
  clavesDeDetalle,
  decidirCarga,
  itemsRepetidos,
  llaveItem,
  refRolDe,
  remapFilas,
} from "./fraccionamiento";
import { descriptorModulo } from "./descriptores";
import type { FilaDetalleModulo } from "./promocion";

describe("refRolDe", () => {
  it("encuentra la columna de referencia de Inventarios", () => {
    expect(refRolDe(descriptorModulo("INV")!)).toBe("referencia");
  });

  it("devuelve null para un módulo sin columna de referencia (Activos Fijos)", () => {
    expect(refRolDe(descriptorModulo("AFI")!)).toBeNull();
  });

  it("devuelve null para Cartera/CxP (documento no matchea /ref/i)", () => {
    expect(refRolDe(descriptorModulo("CAR")!)).toBeNull();
    expect(refRolDe(descriptorModulo("CXP")!)).toBeNull();
  });
});

describe("llaveItem / clavesDeDetalle", () => {
  it("combina clasificador + referencia, recortando espacios", () => {
    expect(llaveItem("MERCANCIA", " REF-001 ")).toBe(llaveItem("MERCANCIA", "REF-001"));
    expect(llaveItem("MERCANCIA", "REF-001")).not.toBe(llaveItem("MERCANCIA", "REF-002"));
  });

  it("sin referencia (refRol null) la llave es (clasificador, \"\")", () => {
    const claves = clavesDeDetalle(
      [
        { clasificador: "GLOBAL", datos: {} },
        { clasificador: "GLOBAL", datos: { referencia: "X" } }, // ignorada: refRol es null
      ],
      null,
    );
    expect(claves.size).toBe(1);
    expect(claves.has(llaveItem("GLOBAL", ""))).toBe(true);
  });

  it("con refRol distingue ítems del mismo clasificador por referencia", () => {
    const claves = clavesDeDetalle(
      [
        { clasificador: "MERCANCIA", datos: { referencia: "A-1" } },
        { clasificador: "MERCANCIA", datos: { referencia: "A-2" } },
      ],
      "referencia",
    );
    expect(claves.size).toBe(2);
  });

  it("una fila sin referencia (columna vacía) cae en (clasificador, \"\")", () => {
    const claves = clavesDeDetalle([{ clasificador: "MERCANCIA", datos: {} }], "referencia");
    expect(claves.has(llaveItem("MERCANCIA", ""))).toBe(true);
  });
});

describe("itemsRepetidos", () => {
  it("devuelve la intersección de llaves", () => {
    const nuevas = new Set(["A 1", "A 2", "B 1"]);
    const existentes = new Set(["A 1", "C 1"]);
    expect(itemsRepetidos(nuevas, existentes)).toEqual(["A 1"]);
  });

  it("sin coincidencias devuelve vacío", () => {
    expect(itemsRepetidos(new Set(["A 1"]), new Set(["B 1"]))).toEqual([]);
  });
});

describe("decidirCarga", () => {
  it("sin vigente → version (v1)", () => {
    const r = decidirCarga({ hayVigente: false, vigenteCongelado: false, anexoSolicitado: false, clavesNuevas: new Set(["A 1"]), clavesExistentes: new Set() });
    expect(r).toEqual({ modo: "version", repetidos: [] });
  });

  it("carga normal sobre un vigente → version, aunque NO haya ninguna coincidencia", () => {
    // Este es el caso que antes anexaba solo y duplicaba el módulo: sin anexo declarado,
    // «ítems que parecen nuevos» ya no basta para acumular.
    const r = decidirCarga({ hayVigente: true, vigenteCongelado: false, anexoSolicitado: false, clavesNuevas: new Set(["A 1", "A 2"]), clavesExistentes: new Set(["B 1"]) });
    expect(r.modo).toBe("version");
  });

  it("carga normal sobre un vigente con llaves repetidas → version", () => {
    const r = decidirCarga({ hayVigente: true, vigenteCongelado: false, anexoSolicitado: false, clavesNuevas: new Set(["A 1", "A 2"]), clavesExistentes: new Set(["A 1"]) });
    expect(r.modo).toBe("version");
    expect(r.repetidos).toEqual(["A 1"]);
  });

  it("anexo declarado sobre un vigente sin congelar → agregar", () => {
    const r = decidirCarga({ hayVigente: true, vigenteCongelado: false, anexoSolicitado: true, clavesNuevas: new Set(["A 1", "A 2"]), clavesExistentes: new Set(["B 1"]) });
    expect(r).toEqual({ modo: "agregar", repetidos: [] });
  });

  it("anexo declarado CON llaves repetidas → sigue siendo agregar, pero las reporta para el aviso", () => {
    // Avisar, no bloquear: la llave (clasificador, referencia) es poco confiable y
    // bloquear por ella dejaría sin salida a un anexo legítimo.
    const r = decidirCarga({ hayVigente: true, vigenteCongelado: false, anexoSolicitado: true, clavesNuevas: new Set(["A 1", "A 2"]), clavesExistentes: new Set(["A 1"]) });
    expect(r.modo).toBe("agregar");
    expect(r.repetidos).toEqual(["A 1"]);
  });

  it("anexo declarado sobre un vigente CONGELADO → version (nunca se toca un congelado)", () => {
    const r = decidirCarga({ hayVigente: true, vigenteCongelado: true, anexoSolicitado: true, clavesNuevas: new Set(["A 1"]), clavesExistentes: new Set(["B 1"]) });
    expect(r.modo).toBe("version");
  });

  it("anexo declarado sin vigente → version (v1): no hay a qué anexar", () => {
    const r = decidirCarga({ hayVigente: false, vigenteCongelado: false, anexoSolicitado: true, clavesNuevas: new Set(["A 1"]), clavesExistentes: new Set() });
    expect(r).toEqual({ modo: "version", repetidos: [] });
  });
});

describe("remapFilas", () => {
  const fila = (filaNum: number, clasificador: string): FilaDetalleModulo => ({
    filaNum,
    clasificador,
    valor: 10,
    datos: {},
  });

  it("reindexa a partir de maxFilaExistente + 1, en orden", () => {
    const nuevas = [fila(3, "A"), fila(7, "B"), fila(1, "C")];
    const { filas, remap } = remapFilas(nuevas, 20);
    expect(filas.map((f) => f.filaNum)).toEqual([21, 22, 23]);
    // Conserva los demás campos.
    expect(filas.map((f) => f.clasificador)).toEqual(["A", "B", "C"]);
    // El mapa reancla desde el filaNum ORIGINAL (de staging) al nuevo.
    expect(remap.get(3)).toBe(21);
    expect(remap.get(7)).toBe(22);
    expect(remap.get(1)).toBe(23);
  });

  it("con detalle existente vacío (maxFilaExistente=0) arranca en 1", () => {
    const { filas } = remapFilas([fila(5, "A")], 0);
    expect(filas[0].filaNum).toBe(1);
  });

  it("no colisiona con filas ya existentes ni entre sí", () => {
    const nuevas = [fila(1, "A"), fila(2, "A"), fila(3, "A")];
    const { filas } = remapFilas(nuevas, 9);
    const numeros = filas.map((f) => f.filaNum);
    expect(new Set(numeros).size).toBe(numeros.length);
    expect(Math.min(...numeros)).toBeGreaterThan(9);
  });
});
