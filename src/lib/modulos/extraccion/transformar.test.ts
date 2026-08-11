import { describe, it, expect } from "vitest";
import { MODULOS_IMPORT } from "../descriptores";
import { transformarModulo } from "./transformar";
import { sugerirSpec, rolesRequeridosFaltantes } from "./sugerir";
import type { GridHoja, CeldaCruda } from "@/lib/balance/extraccion/ingesta";
import type { SpecModulo } from "./esquema";

const INV = MODULOS_IMPORT.INV;
const hoja = (filas: CeldaCruda[][], negrita?: boolean[][]): GridHoja => ({ nombre: "Inventario", filas, negrita });

// Spec directo (columnas A..F) para probar el transform sin depender del sugeridor.
const SPEC: SpecModulo = {
  hoja: "Inventario",
  filaEncabezado: 1,
  primeraFilaDatos: 2,
  columnas: { tipo: 1, referencia: 2, descripcion: 3, cantidad: 4, valorUnitario: 5, valorTotal: 6 },
};
const ENC: CeldaCruda[] = ["Tipo", "Referencia", "Descripción", "Cantidad", "Vr unit", "Vr total"];

describe("transformarModulo (INV)", () => {
  it("mapea columnas, promueve clasificador+valor y deja lo propio en datos", () => {
    const r = transformarModulo(INV, SPEC, hoja([ENC, ["Materia prima", "REF-1", "Tornillo", 10, 100, 1000]]));
    expect(r.filas).toHaveLength(1);
    expect(r.filas[0]).toMatchObject({ clasificador: "Materia prima", valor: 1000, tipoFila: "movimiento" });
    expect(r.filas[0].datos).toMatchObject({ referencia: "REF-1", descripcion: "Tornillo", cantidad: 10, valorUnitario: 100 });
    expect(r.filasLeidas).toBe(1);
  });

  it("DERIVA valorTotal = cantidad × valorUnitario cuando falta", () => {
    const r = transformarModulo(INV, SPEC, hoja([ENC, ["Producto terminado", "REF-2", "Mesa", 2, 5000, null]]));
    expect(r.filas[0].valor).toBe(10000);
    expect(r.filas[0].datos.valorTotal).toBe(10000);
    expect(r.excepciones).toHaveLength(0);
  });

  it("DERIVA valorUnitario = valorTotal ÷ cantidad cuando falta el unitario", () => {
    const r = transformarModulo(INV, SPEC, hoja([ENC, ["A", "R", "D", 100000, null, 37612287.42]]));
    expect(r.filas[0].datos.valorUnitario).toBeCloseTo(376.12, 2);
    expect(r.filas[0].valor).toBe(37612287.42); // el total no se toca
  });

  it("no divide por cero al derivar el unitario", () => {
    const r = transformarModulo(INV, SPEC, hoja([ENC, ["A", "R", "D", 0, null, 5000]]));
    expect(r.filas[0].datos.valorUnitario).toBeNull();
  });

  it("AVISA si el archivo trae valorTotal y no concuerda con cantidad×unit (no lo pisa)", () => {
    const r = transformarModulo(INV, SPEC, hoja([ENC, ["A", "R", "D", 2, 100, 999]])); // 2×100=200 ≠ 999
    expect(r.filas[0].valor).toBe(999);
    expect(r.excepciones).toHaveLength(1);
    expect(r.excepciones[0].mensaje).toMatch(/valorTotal/);
  });

  it("marca AGRUPADORA las filas en negrita (subtotal) y no las cuenta como leídas", () => {
    const filas = [ENC, ["Materia prima", "SUBTOTAL", "", 0, 0, 5000], ["A", "R", "D", 1, 10, 10]];
    const negrita = [[], [true, true, true, true, true, true], [false, false, false, false, false, false]];
    const r = transformarModulo(INV, SPEC, hoja(filas, negrita));
    expect(r.filas.find((f) => f.datos.referencia === "SUBTOTAL")?.tipoFila).toBe("agrupadora");
    expect(r.filasExcluidas).toBe(1);
    expect(r.filasLeidas).toBe(1);
  });

  it("salta filas vacías", () => {
    const r = transformarModulo(INV, SPEC, hoja([ENC, [null, null, null, null, null, null], ["A", "R", "D", 1, 10, 10]]));
    expect(r.filas).toHaveLength(1);
  });

  it("ARRASTRA el clasificador agrupado (celda combinada tipo SAP) cuando el spec lo pide", () => {
    // El «tipo» aparece una sola vez al inicio del bloque; las filas de abajo lo traen vacío.
    const filas: CeldaCruda[][] = [
      ENC,
      ["1405", "REF-1", "Ítem A", 1, 10, 100],
      [null, "REF-2", "Ítem B", 1, 10, 200],
      [null, "REF-3", "Ítem C", 1, 10, 300],
      ["1430", "REF-4", "Ítem D", 1, 10, 400],
      [null, "REF-5", "Ítem E", 1, 10, 500],
    ];
    const spec: SpecModulo = { ...SPEC, arrastrarClasificador: true };
    const r = transformarModulo(INV, spec, hoja(filas));
    expect(r.filas.map((f) => f.clasificador)).toEqual(["1405", "1405", "1405", "1430", "1430"]);
    // El detalle (datos) también refleja el valor heredado, no null.
    expect(r.filas[1].datos.tipo).toBe("1405");
  });

  it("SIN arrastrar, las filas con clasificador vacío quedan en null", () => {
    const filas: CeldaCruda[][] = [ENC, ["1405", "REF-1", "A", 1, 10, 100], [null, "REF-2", "B", 1, 10, 200]];
    const r = transformarModulo(INV, SPEC, hoja(filas));
    expect(r.filas.map((f) => f.clasificador)).toEqual(["1405", null]);
  });

  it("modo GLOBAL: todo el archivo cae en un único clasificador (sin columna de tipo)", () => {
    const spec: SpecModulo = { ...SPEC, columnas: { ...SPEC.columnas, tipo: 0 }, clasificadorModo: "global" };
    const filas: CeldaCruda[][] = [ENC, ["", "REF-1", "A", 1, 10, 100], ["", "REF-2", "B", 2, 10, 200]];
    const r = transformarModulo(INV, spec, hoja(filas));
    expect(r.filas.map((f) => f.clasificador)).toEqual(["GLOBAL", "GLOBAL"]);
    expect(r.filas.every((f) => f.datos.tipo === "GLOBAL")).toBe(true);
  });

  it("modo SECCIÓN: el tipo va en renglones de encabezado (misma columna que el código)", () => {
    // Columna A = tipo Y referencia; el encabezado de sección tiene la Descripción vacía.
    // "Gran total" se descarta y no fija sección; IEMPAQUE clasifica a sus ítems.
    const spec: SpecModulo = {
      hoja: "Inventario", filaEncabezado: 1, primeraFilaDatos: 2,
      columnas: { tipo: 1, referencia: 1, descripcion: 2, cantidad: 5, valorUnitario: 4, valorTotal: 3 },
      clasificadorModo: "seccion", seccionColumnaVaciaRol: "descripcion",
    };
    const filas: CeldaCruda[][] = [
      ["Item", "Desc", "Costo total", "Costo uni", "Existencia"],
      ["Gran total", null, 18043376373.25, null, 19157300],
      ["IEMPAQUE", null, 76804996, null, 1162500],
      ["0000126", "ADHESIVO CAJA", 1072500, 390, 2750],
      ["0000016", "CAJ INDI VAMENGOC", 3785612.21, 257.05, 14727],
      ["PLASTICOS", null, 5000000, null, 100],
      ["0000200", "BOLSA X 100", 5000000, 500, 10000],
    ];
    const r = transformarModulo(INV, spec, hoja(filas));
    const items = r.filas.filter((f) => f.tipoFila === "movimiento");
    expect(items.map((f) => ({ ref: f.datos.referencia, tipo: f.clasificador, valor: f.valor }))).toEqual([
      { ref: "0000126", tipo: "IEMPAQUE", valor: 1072500 },
      { ref: "0000016", tipo: "IEMPAQUE", valor: 3785612.21 },
      { ref: "0000200", tipo: "PLASTICOS", valor: 5000000 },
    ]);
    // Los encabezados de sección y el Gran total no cuentan como ítems.
    expect(items).toHaveLength(3);
  });
});

describe("sugerirSpec (INV)", () => {
  it("detecta el encabezado (aunque haya un título arriba) y mapea por etiqueta", () => {
    const h = hoja([
      ["Reporte de inventario a marzo 2026"],
      ["Tipo", "Referencia", "Descripción", "Cantidad", "Valor unitario", "Valor total"],
      ["A", "R", "D", 1, 10, 10],
    ]);
    const spec = sugerirSpec(INV, h);
    expect(spec.filaEncabezado).toBe(2);
    expect(spec.primeraFilaDatos).toBe(3);
    expect(spec.columnas).toMatchObject({ tipo: 1, referencia: 2, descripcion: 3, cantidad: 4, valorUnitario: 5, valorTotal: 6 });
    expect(rolesRequeridosFaltantes(INV, spec)).toEqual([]);
  });

  it("reconoce sinónimos y distingue «valor unitario» de «valor total»", () => {
    const h = hoja([["Clase", "SKU", "Nombre", "Cant", "Vr unitario", "Vr total"], ["A", "R", "D", 1, 10, 10]]);
    const spec = sugerirSpec(INV, h);
    expect(spec.columnas).toMatchObject({ tipo: 1, referencia: 2, descripcion: 3, cantidad: 4, valorUnitario: 5, valorTotal: 6 });
  });

  it("con «Valor» ambiguo lo asigna a valorTotal (exacto gana al fragmento)", () => {
    const h = hoja([["Tipo", "Referencia", "Valor"], ["A", "R", 10]]);
    const spec = sugerirSpec(INV, h);
    expect(spec.columnas.valorTotal).toBe(3);
    expect(spec.columnas.valorUnitario).toBe(0);
  });
});
