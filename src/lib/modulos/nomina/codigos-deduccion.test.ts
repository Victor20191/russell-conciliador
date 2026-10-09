import { describe, expect, it } from "vitest";
import { esCodigoDeduccion, parsearRangosCodigos, sanearRangosCodigos, textoRangosCodigos } from "./codigos-deduccion";
import { valorFilaNomina } from "./valor-nomina";

describe("parsearRangosCodigos", () => {
  it("lee rangos y códigos sueltos separados con coma", () => {
    expect(parsearRangosCodigos("500-799")).toEqual({ ok: true, rangos: [{ desde: 500, hasta: 799 }] });
    expect(parsearRangosCodigos(" 900 , 500 - 799; 950 al 960 ")).toEqual({
      ok: true,
      rangos: [{ desde: 500, hasta: 799 }, { desde: 900, hasta: 900 }, { desde: 950, hasta: 960 }],
    });
  });

  it("ordena un rango al revés y deja vacío sin rangos", () => {
    expect(parsearRangosCodigos("799-500")).toEqual({ ok: true, rangos: [{ desde: 500, hasta: 799 }] });
    expect(parsearRangosCodigos("  ")).toEqual({ ok: true, rangos: undefined });
  });

  it("explica lo que no entiende", () => {
    const r = parsearRangosCodigos("500-799, deducciones");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("«deducciones» no es un código ni un rango");
  });
});

describe("sanearRangosCodigos y textoRangosCodigos", () => {
  it("descarta lo inválido y lo repetido", () => {
    expect(sanearRangosCodigos([{ desde: 500, hasta: 799 }, { desde: 500, hasta: 799 }, { desde: 9, hasta: 1 }, { desde: "a", hasta: 2 }])).toEqual([{ desde: 500, hasta: 799 }]);
    expect(sanearRangosCodigos([])).toBeUndefined();
    expect(sanearRangosCodigos("500-799")).toBeUndefined();
  });

  it("vuelve a escribir los rangos", () => {
    expect(textoRangosCodigos([{ desde: 500, hasta: 799 }, { desde: 900, hasta: 900 }])).toBe("500-799, 900");
    expect(textoRangosCodigos(undefined)).toBe("");
  });
});

describe("esCodigoDeduccion", () => {
  const NOMINAI = [{ desde: 500, hasta: 799 }];
  it("compara el código numérico contra los rangos", () => {
    expect(esCodigoDeduccion("541", NOMINAI)).toBe(true);
    expect(esCodigoDeduccion("0602", NOMINAI)).toBe(true);
    expect(esCodigoDeduccion("106", NOMINAI)).toBe(false); // «DEV. DEDUCC FESERT»: devuelve, es devengo
    expect(esCodigoDeduccion("C541", NOMINAI)).toBe(false);
    // Con el nombre pegado, como lo imprime NOMINAI.
    expect(esCodigoDeduccion("541 - DEDUC. FESERT", NOMINAI)).toBe(true);
    expect(esCodigoDeduccion("001 - BASICO", NOMINAI)).toBe(false);
    expect(esCodigoDeduccion("541", undefined)).toBe(false);
  });
});

describe("valorFilaNomina con códigos de deducción", () => {
  const soloValor = new Set(["valor", "codigo"]);
  const NOMINAI = [{ desde: 500, hasta: 799 }];

  it("resta las filas cuyo código es de deducción y deja el resto como devengo", () => {
    expect(valorFilaNomina({ codigo: "541", valor: 298000 }, soloValor, "magnitud", NOMINAI)).toEqual({ valor: -298000, naturaleza: "deduccion" });
    expect(valorFilaNomina({ codigo: "1", valor: 1093479 }, soloValor, "magnitud", NOMINAI)).toEqual({ valor: 1093479, naturaleza: "devengo" });
  });

  it("no vuelve positiva una deducción que el archivo ya traía firmada", () => {
    expect(valorFilaNomina({ codigo: "602", valor: -185000 }, soloValor, "magnitud", NOMINAI)).toEqual({ valor: -185000, naturaleza: "deduccion" });
  });

  it("con columna de tipo manda el tipo", () => {
    const conTipo = new Set(["valor", "codigo", "tipo"]);
    expect(valorFilaNomina({ codigo: "541", valor: 1000, tipo: "Ingreso" }, conTipo, "magnitud", NOMINAI)).toEqual({ valor: 1000, naturaleza: "devengo" });
  });

  it("sin rangos todo sigue como antes", () => {
    expect(valorFilaNomina({ codigo: "541", valor: 298000 }, soloValor)).toEqual({ valor: 298000, naturaleza: "devengo" });
  });
});
