import { describe, expect, it } from "vitest";
import type { GridHoja } from "@/lib/balance/extraccion/ingesta";
import { descriptorModulo } from "../descriptores";
import type { SpecModulo } from "../extraccion/esquema";
import {
  FILAS_MAXIMAS_PRUEBA,
  MENSAJE_ENCABEZADO_POBRE,
  MENSAJE_SIN_FILAS,
  MENSAJE_TIPO_FORMATO,
  revisarMapeoMuestra,
} from "./revision-mapeo";

const INV = descriptorModulo("INV")!;
const ING = descriptorModulo("ING")!;
const CXP = descriptorModulo("CXP")!;

const HOJA: GridHoja = {
  nombre: "Inventario",
  filas: [
    ["Tipo", "Referencia", "Cantidad", "Valor total"],
    ["MP", "A-1", 3, 300],
    ["PT", "B-2", 1, 150],
  ],
};
const SPEC: SpecModulo = {
  hoja: "Inventario",
  filaEncabezado: 1,
  primeraFilaDatos: 2,
  columnas: { tipo: 1, referencia: 2, cantidad: 3, valorTotal: 4 },
};

const revisar = (spec: Partial<SpecModulo> = {}, hojas: GridHoja[] = [HOJA], descriptor = INV) =>
  revisarMapeoMuestra(descriptor, hojas, { ...SPEC, ...spec }, { exigirTipoFormato: true });

describe("revisarMapeoMuestra", () => {
  it("con un mapeo bueno no pone impedimentos y devuelve la lectura de la muestra", () => {
    const r = revisar();

    expect(r.impedimentos).toEqual([]);
    expect(r.hoja?.nombre).toBe("Inventario");
    expect(r.encabezado).toEqual(["Tipo", "Referencia", "Cantidad", "Valor total"]);
    expect(r.lectura?.filas.filter((f) => f.tipoFila === "movimiento")).toHaveLength(2);
    expect(r.spec.columnas).toMatchObject({ tipo: 1, valorTotal: 4 });
  });

  it("no transforma cuando el spec no valida: una lectura así no diría nada", () => {
    const sinValor = revisar({ columnas: { tipo: 1 } });
    expect(sinValor.impedimentos).toEqual(["Falta la columna obligatoria «Valor total»."]);
    expect(sinValor.lectura).toBeNull();
    expect(sinValor.hoja).toBeNull();

    const otraHoja = revisar({ hoja: "Resumen" });
    expect(otraHoja.impedimentos).toEqual(["La muestra no tiene la hoja «Resumen»."]);
    expect(otraHoja.lectura).toBeNull();
  });

  it("el tipo de formato de Cartera y CxP solo se exige cuando se pide", () => {
    const hoja: GridHoja = {
      nombre: "CxP",
      filas: [
        ["NIT", "Proveedor", "Documento", "Saldo"],
        ["900123456", "ACME", "FV-1", 500],
      ],
    };
    const spec: SpecModulo = {
      hoja: "CxP",
      filaEncabezado: 1,
      primeraFilaDatos: 2,
      columnas: { nit: 1, nombre: 2, documento: 3, total: 4 },
    };

    expect(revisarMapeoMuestra(CXP, [hoja], spec, { exigirTipoFormato: true }).impedimentos)
      .toEqual([MENSAJE_TIPO_FORMATO]);
    expect(revisarMapeoMuestra(CXP, [hoja], spec, { exigirTipoFormato: false }).impedimentos).toEqual([]);
    expect(revisarMapeoMuestra(CXP, [hoja], { ...spec, tipoFormato: "documento" }, { exigirTipoFormato: true }).impedimentos)
      .toEqual([]);
  });

  it("el encabezado sin rótulos suficientes impide guardar, pero la lectura se devuelve igual", () => {
    const hoja: GridHoja = {
      nombre: "Inventario",
      filas: [
        ["Tipo", "", "", ""],
        ["MP", "A-1", 3, 300],
      ],
    };
    const r = revisar({}, [hoja]);

    expect(r.impedimentos).toEqual([MENSAJE_ENCABEZADO_POBRE]);
    expect(r.lectura?.filas).toHaveLength(1);
  });

  it("avisa que el mapeo no produce ninguna fila sin perder la hoja ni el encabezado", () => {
    const r = revisar({ primeraFilaDatos: 9 });

    expect(r.impedimentos).toEqual([MENSAJE_SIN_FILAS]);
    expect(r.lectura?.filas.some((f) => f.tipoFila === "movimiento")).toBe(false);
    expect(r.encabezado).toEqual(["Tipo", "Referencia", "Cantidad", "Valor total"]);
  });

  it("con tope de filas lee solo el principio del archivo y lo dice", () => {
    const filas: (string | number)[][] = [["Tipo", "Referencia", "Cantidad", "Valor total"]];
    for (let i = 0; i < 50; i++) filas.push(["MP", `A-${i}`, 1, 100]);
    const hoja: GridHoja = { nombre: "Inventario", filas };

    const completa = revisarMapeoMuestra(INV, [hoja], SPEC, { exigirTipoFormato: true });
    expect(completa.lectura?.filas).toHaveLength(50);
    expect(completa.recorte).toBeNull();

    const topeada = revisarMapeoMuestra(INV, [hoja], SPEC, { exigirTipoFormato: true, maxFilasDatos: 10 });
    expect(topeada.lectura?.filas).toHaveLength(10);
    expect(topeada.recorte).toEqual({ filasLeidas: 10, filasArchivo: 51 });
    // El encabezado que se guardaría no cambia: el corte empieza después de la primera fila de datos.
    expect(topeada.encabezado).toEqual(completa.encabezado);
    expect(topeada.impedimentos).toEqual([]);

    // Un tope mayor que el archivo no recorta nada.
    expect(revisarMapeoMuestra(INV, [hoja], SPEC, { exigirTipoFormato: true, maxFilasDatos: FILAS_MAXIMAS_PRUEBA }).recorte).toBeNull();
  });

  it("Ingresos acepta una columna de total como valor, pero solo con la confirmación del IVA", () => {
    const hoja: GridHoja = {
      nombre: "Ventas",
      filas: [
        ["Concepto", "Total sin Descuento"],
        ["Servicios", 100000],
      ],
    };
    const spec: SpecModulo = { hoja: "Ventas", filaEncabezado: 1, primeraFilaDatos: 2, columnas: { concepto: 1, valor: 2 } };

    const sinConfirmar = revisarMapeoMuestra(ING, [hoja], spec, { exigirTipoFormato: true });
    expect(sinConfirmar.impedimentos).toEqual(["Confirma que «Total sin Descuento» excluye el IVA: es una columna de total."]);
    expect(sinConfirmar.lectura?.filas).toHaveLength(1);

    const confirmado = revisarMapeoMuestra(ING, [hoja], { ...spec, valorSinImpuestosConfirmado: "total sin descuento" }, { exigirTipoFormato: true });
    expect(confirmado.impedimentos).toEqual([]);
    expect(confirmado.spec.valorSinImpuestosConfirmado).toBe("total sin descuento");
  });
});
