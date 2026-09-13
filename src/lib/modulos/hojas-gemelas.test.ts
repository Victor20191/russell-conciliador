import { describe, expect, it } from "vitest";
import { avisoHojasGemelas, hojasConMismoEncabezado } from "./hojas-gemelas";

// Encabezados de los libros reales con varias hojas (solo la fila de encabezado).
const SAP = ["Código de cliente", "Nombre del cliente", "Acuerdo global", "Tipo", "Nº documento", "Saldo vencido"];
const LIBRA_1 = ["AGENCIA", "RESPONSABLE CLIENTE", "CUENTA", "FECHA FACTURA", "NIT", "IMPORTE"];
const LIBRA_2 = ["AGENCIA", "CUENTA", "FECHA FACTURA", "CODIGO", "NIT", "IMPORTE"];
const PLASMAR_COP = ["Cliente", "Nombre_Cliente", "Documento", "Saldo", "Edades"];
const PLASMAR_USD = ["Cliente", "Nombre_Cliente", "Documento", "Saldo", "TC", "Edades"];

describe("hojasConMismoEncabezado", () => {
  it("detecta la hoja duplicada de SAP (el caso que cargaba 37,7 millones de más)", () => {
    expect(hojasConMismoEncabezado([
      { nombre: "Cartera.", encabezado: SAP },
      { nombre: "Cartera", encabezado: SAP },
    ])).toEqual([{ hojas: ["Cartera.", "Cartera"] }]);
  });

  it("no confunde dos hojas parecidas pero distintas (LIBRA: la de >360 días)", () => {
    expect(hojasConMismoEncabezado([
      { nombre: "CARTERA", encabezado: LIBRA_1 },
      { nombre: "CARTERA >360 DÍAS", encabezado: LIBRA_2 },
    ])).toEqual([]);
  });

  it("no confunde la hoja en pesos con la de dólares (Plasmar: la USD trae tasa)", () => {
    expect(hojasConMismoEncabezado([
      { nombre: "COP", encabezado: PLASMAR_COP },
      { nombre: "USD", encabezado: PLASMAR_USD },
    ])).toEqual([]);
  });

  it("es insensible a mayúsculas, tildes y espacios, como la huella", () => {
    expect(hojasConMismoEncabezado([
      { nombre: "A", encabezado: ["Código  de Cliente", "SALDO"] },
      { nombre: "B", encabezado: ["codigo de cliente", "saldo"] },
    ])).toHaveLength(1);
  });

  it("una hoja sin encabezado utilizable no es gemela de nadie", () => {
    expect(hojasConMismoEncabezado([
      { nombre: "Vacía 1", encabezado: [null, ""] },
      { nombre: "Vacía 2", encabezado: [] },
    ])).toEqual([]);
  });

  it("agrupa tres hojas iguales y deja fuera la distinta", () => {
    expect(hojasConMismoEncabezado([
      { nombre: "Ene", encabezado: SAP },
      { nombre: "Resumen", encabezado: LIBRA_1 },
      { nombre: "Feb", encabezado: SAP },
      { nombre: "Mar", encabezado: SAP },
    ])).toEqual([{ hojas: ["Ene", "Feb", "Mar"] }]);
  });
});

describe("avisoHojasGemelas", () => {
  const grupos = [{ hojas: ["Cartera.", "Cartera"] }];

  it("nombra la otra hoja para que el usuario sepa contra qué elige", () => {
    const aviso = avisoHojasGemelas(grupos, "Cartera.");
    expect(aviso).toContain("«Cartera»");
    expect(aviso).toContain("otra hoja");
  });

  it("sin gemelas no hay aviso", () => {
    expect(avisoHojasGemelas(grupos, "Resumen")).toBeNull();
    expect(avisoHojasGemelas([], "Cartera")).toBeNull();
    expect(avisoHojasGemelas(grupos, null)).toBeNull();
  });

  it("habla en plural cuando hay varias", () => {
    expect(avisoHojasGemelas([{ hojas: ["Ene", "Feb", "Mar"] }], "Ene")).toContain("otras hojas");
  });
});
