import { describe, expect, it } from "vitest";
import { MODULOS_IMPORT } from "./descriptores";
import type { SpecModulo } from "./extraccion/esquema";
import {
  descripcionModoClasificador,
  descripcionSubtotalesModulo,
  letraColumnaModulo,
  mismoSpecModuloNormalizado,
  modoClasificadorDe,
  normalizarSpecModulo,
  resumenColumnasModulo,
  validarSpecModulo,
} from "./perfil-modulo";

const INV = MODULOS_IMPORT.INV;
const CAR = MODULOS_IMPORT.CAR;

const specInv = (extra: Partial<SpecModulo> = {}): SpecModulo => ({
  hoja: "Inventario",
  filaEncabezado: 3,
  primeraFilaDatos: 4,
  columnas: { tipo: 2, referencia: 1, descripcion: 3, cantidad: 4, valorUnitario: 5, valorTotal: 6 },
  ...extra,
});

describe("letraColumnaModulo", () => {
  it("convierte índices 1-based a letras Excel y marca 0 como «—»", () => {
    expect(letraColumnaModulo(1)).toBe("A");
    expect(letraColumnaModulo(26)).toBe("Z");
    expect(letraColumnaModulo(27)).toBe("AA");
    expect(letraColumnaModulo(0)).toBe("—");
    expect(letraColumnaModulo(-3)).toBe("—");
  });
});

describe("modoClasificadorDe", () => {
  it("resuelve el legado arrastrarClasificador y por defecto es columna", () => {
    expect(modoClasificadorDe({})).toBe("columna");
    expect(modoClasificadorDe({ arrastrarClasificador: true })).toBe("arrastrar");
    expect(modoClasificadorDe({ clasificadorModo: "seccion", arrastrarClasificador: true })).toBe("seccion");
  });
});

describe("normalizarSpecModulo", () => {
  it("conserva solo los roles del descriptor, completa faltantes con 0 y limpia índices inválidos", () => {
    const spec = normalizarSpecModulo(INV, specInv({
      hoja: "  Inventario ",
      columnas: { tipo: 2, referencia: -4, valorTotal: 6.5, columnaAjena: 9 },
    }));
    expect(spec.hoja).toBe("Inventario");
    expect(spec.columnas).toEqual({ tipo: 2, referencia: 0, descripcion: 0, cantidad: 0, valorUnitario: 0, valorTotal: 0 });
    expect("columnaAjena" in spec.columnas).toBe(false);
    expect(spec.clasificadorModo).toBe("columna");
    expect(spec.arrastrarClasificador).toBeUndefined();
  });

  it("explicita el modo arrastrar del legado y solo conserva la señal de sección en modo sección", () => {
    const arrastre = normalizarSpecModulo(INV, specInv({ arrastrarClasificador: true, seccionColumnaVaciaRol: "descripcion" }));
    expect(arrastre.clasificadorModo).toBe("arrastrar");
    expect(arrastre.seccionColumnaVaciaRol).toBeUndefined();

    const seccion = normalizarSpecModulo(INV, specInv({ clasificadorModo: "seccion", seccionColumnaVaciaRol: " descripcion " }));
    expect(seccion.seccionColumnaVaciaRol).toBe("descripcion");
  });
});

describe("validarSpecModulo", () => {
  it("acepta un spec completo", () => {
    expect(validarSpecModulo(INV, normalizarSpecModulo(INV, specInv()))).toBeNull();
  });

  it("exige hoja, orden de filas y las columnas obligatorias", () => {
    expect(validarSpecModulo(INV, normalizarSpecModulo(INV, specInv({ hoja: "  " })))).toMatch(/hoja/i);
    expect(validarSpecModulo(INV, normalizarSpecModulo(INV, specInv({ filaEncabezado: 4, primeraFilaDatos: 4 })))).toMatch(/después de la fila de encabezado/);
    expect(validarSpecModulo(INV, normalizarSpecModulo(INV, specInv({ columnas: { tipo: 2, referencia: 1 } })))).toBe("Falta la columna obligatoria «Valor total».");
  });

  it("exime al clasificador en modo global pero no a las demás obligatorias", () => {
    const global = normalizarSpecModulo(INV, specInv({ clasificadorModo: "global", columnas: { valorTotal: 6 } }));
    expect(validarSpecModulo(INV, global)).toBeNull();
    const globalSinValor = normalizarSpecModulo(INV, specInv({ clasificadorModo: "global", columnas: { referencia: 1 } }));
    expect(validarSpecModulo(INV, globalSinValor)).toBe("Falta la columna obligatoria «Valor total».");
  });

  it("en modo sección exige una columna señal mapeada y distinta a la del clasificador", () => {
    const sinSenal = normalizarSpecModulo(INV, specInv({ clasificadorModo: "seccion" }));
    expect(validarSpecModulo(INV, sinSenal)).toMatch(/renglones de sección/);
    const senalEsClasificador = normalizarSpecModulo(INV, specInv({ clasificadorModo: "seccion", seccionColumnaVaciaRol: "tipo" }));
    expect(validarSpecModulo(INV, senalEsClasificador)).toMatch(/no puede ser la del clasificador/);
    const senalSinMapear = normalizarSpecModulo(INV, specInv({ clasificadorModo: "seccion", seccionColumnaVaciaRol: "descripcion", columnas: { tipo: 2, valorTotal: 6 } }));
    expect(validarSpecModulo(INV, senalSinMapear)).toBe("La columna «Descripción» que identifica los renglones de sección está sin mapear.");
    const mismaColumna = normalizarSpecModulo(INV, specInv({ clasificadorModo: "seccion", seccionColumnaVaciaRol: "descripcion", columnas: { tipo: 2, descripcion: 2, valorTotal: 6 } }));
    expect(validarSpecModulo(INV, mismaColumna)).toMatch(/no puede ser la misma del clasificador/);
    const valido = normalizarSpecModulo(INV, specInv({ clasificadorModo: "seccion", seccionColumnaVaciaRol: "descripcion" }));
    expect(validarSpecModulo(INV, valido)).toBeNull();
  });

  it("funciona con cualquier descriptor (Cartera exige tipo, documento y saldo)", () => {
    const cartera: SpecModulo = { hoja: "Cartera", filaEncabezado: 1, primeraFilaDatos: 2, columnas: { tipo: 1, documento: 2, tercero: 3 } };
    expect(validarSpecModulo(CAR, normalizarSpecModulo(CAR, cartera))).toBe("Falta la columna obligatoria «Saldo».");
    expect(validarSpecModulo(CAR, normalizarSpecModulo(CAR, { ...cartera, columnas: { ...cartera.columnas, saldo: 7 } }))).toBeNull();
  });
});

describe("resumenColumnasModulo", () => {
  it("lista los roles mapeados con su letra en el orden del descriptor y omite los que están en 0", () => {
    const resumen = resumenColumnasModulo(INV, specInv({ columnas: { tipo: 2, referencia: 1, valorTotal: 27 } }));
    expect(resumen).toBe("tipo de inventario B · referencia A · valor total AA");
  });

  it("marca el clasificador global sin columna", () => {
    const resumen = resumenColumnasModulo(INV, specInv({ clasificadorModo: "global", columnas: { valorTotal: 6 } }));
    expect(resumen).toBe("tipo de inventario global · valor total F");
  });
});

describe("mismoSpecModuloNormalizado y descripcionModoClasificador", () => {
  it("compara specs por su forma normalizada", () => {
    expect(mismoSpecModuloNormalizado(INV, specInv({ arrastrarClasificador: true }), specInv({ clasificadorModo: "arrastrar" }))).toBe(true);
    expect(mismoSpecModuloNormalizado(INV, specInv(), specInv({ columnas: { ...specInv().columnas, tipo: 3 } }))).toBe(false);
  });

  it("describe cada modo con la etiqueta del clasificador", () => {
    expect(descripcionModoClasificador("columna", "Tipo de inventario")).toMatch(/propia columna/);
    expect(descripcionModoClasificador("arrastrar", "Tipo de inventario")).toMatch(/tipo de inventario aparece una vez por bloque/);
    expect(descripcionModoClasificador("seccion", "Tipo de cartera")).toMatch(/renglones de sección/);
    expect(descripcionModoClasificador("global", "Tipo de inventario")).toMatch(/único tipo de inventario global/);
  });
});

describe("normalizarSpecModulo · subtotales", () => {
  it("conserva el modo de subtotales solo cuando difiere de «auto»", () => {
    const base: SpecModulo = { hoja: "H", filaEncabezado: 1, primeraFilaDatos: 2, columnas: {} };
    expect(normalizarSpecModulo(INV, base).subtotales).toBeUndefined();
    expect(normalizarSpecModulo(INV, { ...base, subtotales: "auto" }).subtotales).toBeUndefined();
    expect(normalizarSpecModulo(INV, { ...base, subtotales: "nunca" }).subtotales).toBe("nunca");
    expect(mismoSpecModuloNormalizado(INV, base, { ...base, subtotales: "auto" })).toBe(true);
    expect(mismoSpecModuloNormalizado(INV, base, { ...base, subtotales: "rotulo" })).toBe(false);
  });

  it("modo MANUAL: conserva la columna marcadora y su texto; el texto vacío se retira", () => {
    const manual = specInv({ subtotales: "manual", subtotalesColumna: 7, subtotalesTexto: "  TOTAL  " });
    expect(normalizarSpecModulo(INV, manual)).toMatchObject({ subtotales: "manual", subtotalesColumna: 7, subtotalesTexto: "TOTAL" });
    expect(normalizarSpecModulo(INV, { ...manual, subtotalesTexto: "   " }).subtotalesTexto).toBeUndefined();
    // Un modo distinto de «manual» no arrastra la columna al perfil guardado.
    expect(normalizarSpecModulo(INV, specInv({ subtotales: "rotulo", subtotalesColumna: 7 })).subtotalesColumna).toBeUndefined();
  });

  it("modo MANUAL: exige la columna marcadora", () => {
    expect(validarSpecModulo(INV, normalizarSpecModulo(INV, specInv({ subtotales: "manual" }))))
      .toBe("Indica la columna del archivo que marca las filas de subtotal.");
    expect(validarSpecModulo(INV, normalizarSpecModulo(INV, specInv({ subtotales: "manual", subtotalesColumna: 7 })))).toBeNull();
  });

  it("descripcionSubtotalesModulo explica qué columna marca y con qué texto", () => {
    expect(descripcionSubtotalesModulo({ subtotales: "manual", subtotalesColumna: 7, subtotalesTexto: "TOTAL" }))
      .toBe("Manual: los marca la columna G cuando contiene «TOTAL»");
    expect(descripcionSubtotalesModulo({ subtotales: "manual", subtotalesColumna: 7 }))
      .toBe("Manual: los marca la columna G cuando trae algún valor");
    expect(descripcionSubtotalesModulo({})).toContain("Automática");
  });
});
