import { describe, expect, it } from "vitest";
import { descriptorModulo } from "../descriptores";
import { MENSAJE_TIPO_FORMATO } from "./revision-mapeo";
import { debeGuardarPatron, leerPropuestaPatronDeLote, MENSAJE_ENCABEZADO_INSUFICIENTE, motivoNoProponible } from "./propuesta-lote";

const ING = descriptorModulo("ING")!;
const CAR = descriptorModulo("CAR")!;
const specIng = { hoja: "Ventas", filaEncabezado: 1, primeraFilaDatos: 2, columnas: { concepto: 1, valor: 2 } };

describe("propuesta de patrón desde un cargue", () => {
  it("lee la propuesta del spec del lote y descarta lo que no la trae o viene mal", () => {
    const propuesta = { version: 1, erpId: 4, encabezado: ["Concepto", "Valor"], spec: specIng };
    expect(leerPropuestaPatronDeLote({ ...specIng, propuestaPatron: propuesta })).toMatchObject({ erpId: 4, encabezado: ["Concepto", "Valor"] });
    expect(leerPropuestaPatronDeLote(specIng)).toBeNull();
    expect(leerPropuestaPatronDeLote({ propuestaPatron: { ...propuesta, erpId: "4" } })).toBeNull();
    expect(leerPropuestaPatronDeLote(null)).toBeNull();
  });

  it("exige lo mismo que aprobar: mapeo válido, encabezado con rótulos y el tipo de formato en Cartera", () => {
    expect(motivoNoProponible(ING, specIng, ["Concepto", "Valor"])).toBeNull();
    expect(motivoNoProponible(ING, specIng, ["Concepto", ""])).toBe(MENSAJE_ENCABEZADO_INSUFICIENTE);
    expect(motivoNoProponible(ING, { ...specIng, columnas: { valor: 2 } }, ["Concepto", "Valor"])).toContain("Falta la columna obligatoria");
    const specCar = { hoja: "Cartera", filaEncabezado: 1, primeraFilaDatos: 2, columnas: { cuenta: 1, nit: 2, documento: 3, total: 4 } };
    expect(motivoNoProponible(CAR, specCar, ["Cuenta", "NIT", "Documento", "Saldo"])).toBe(MENSAJE_TIPO_FORMATO);
    expect(motivoNoProponible(CAR, { ...specCar, tipoFormato: "documento" }, ["Cuenta", "NIT", "Documento", "Saldo"])).toBeNull();
  });

  it("la casilla manda; sin ella Inventarios aprende como antes y los demás no proponen", () => {
    expect(debeGuardarPatron("CAR", "1")).toBe(true);
    expect(debeGuardarPatron("INV", "0")).toBe(false);
    expect(debeGuardarPatron("INV", null)).toBe(true);
    expect(debeGuardarPatron("NOM", null)).toBe(false);
  });
});
