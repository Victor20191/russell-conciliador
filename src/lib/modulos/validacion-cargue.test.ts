import { describe, expect, it } from "vitest";
import { validacionDelCargue, type CargueValidable } from "./validacion-cargue";

const cargue = (p: Partial<CargueValidable> = {}): CargueValidable => ({
  total: 1_200_978_578.51,
  filas: 1_343,
  totalDeclarado: 1_200_978_578.51,
  filaTotalDeclarado: 1_345,
  archivosDelCargue: 1,
  archivosConTotal: 1,
  ...p,
});

describe("validacionDelCargue", () => {
  it("un archivo cuyo total declarado iguala lo cargado: cuadra", () => {
    const v = validacionDelCargue(cargue())!;
    expect(v.control.granTotal).toMatchObject({
      filaNum: 1_345,
      subtotalArchivo: 1_200_978_578.51,
      sumaMovimientos: 1_200_978_578.51,
      diferencia: 0,
      estado: "cuadra",
    });
    expect(v.control.descuadres).toBe(0);
    expect(v.resumen).toEqual({ items: 1_343, sumaMovimientos: 1_200_978_578.51 });
  });

  it("acusa el descuadre con su diferencia firmada", () => {
    const v = validacionDelCargue(cargue({ totalDeclarado: 1_000, total: 1_400 }))!;
    expect(v.control.granTotal).toMatchObject({ diferencia: -400, estado: "descuadre" });
    expect(v.control.descuadres).toBe(1);
  });

  it("absorbe el redondeo a dos decimales dentro de la tolerancia de $1", () => {
    expect(validacionDelCargue(cargue({ totalDeclarado: 1_000.5, total: 1_000 }))!.control.granTotal?.estado).toBe("cuadra");
    expect(validacionDelCargue(cargue({ totalDeclarado: 1_002, total: 1_000 }))!.control.granTotal?.estado).toBe("descuadre");
  });

  it("archivo sin total al pie: no afirma nada", () => {
    const v = validacionDelCargue(cargue({ totalDeclarado: null, filaTotalDeclarado: null, archivosConTotal: 0 }))!;
    expect(v.control.granTotal).toBeNull();
    expect(v.origen).toEqual({ archivos: 1, archivosConTotal: 0 });
  });

  it("COBERTURA PARCIAL: si un anexo no trajo total, no inventa un descuadre", () => {
    // 2 archivos, solo el primero declaró: su total cubre la mitad de lo cargado.
    const v = validacionDelCargue(cargue({
      totalDeclarado: 600, total: 1_000, filaTotalDeclarado: null, archivosDelCargue: 2, archivosConTotal: 1,
    }))!;
    expect(v.control.granTotal).toBeNull();
    expect(v.control.descuadres).toBe(0);
    expect(v.origen).toEqual({ archivos: 2, archivosConTotal: 1 });
  });

  it("varios archivos que TODOS declararon: compara la Σ de sus totales, sin señalar una fila", () => {
    const v = validacionDelCargue(cargue({
      totalDeclarado: 1_000, total: 1_000, filaTotalDeclarado: null, archivosDelCargue: 2, archivosConTotal: 2,
    }))!;
    expect(v.control.granTotal).toMatchObject({ filaNum: 0, estado: "cuadra" });
  });

  it("cargue anterior a esta validación: devuelve null para que la pantalla no muestre el panel", () => {
    expect(validacionDelCargue(cargue({ archivosDelCargue: null, archivosConTotal: null, totalDeclarado: null }))).toBeNull();
  });
});
