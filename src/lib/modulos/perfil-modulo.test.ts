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
  normalizarSpecModuloArchivo,
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
      columnas: { tipo: 2, referencia: -4, valorTotal: 6.5, tercero: 7, columnaAjena: 9 },
    }));
    expect(spec.hoja).toBe("Inventario");
    expect(spec.columnas).toEqual({ tipo: 2, referencia: 0, descripcion: 0, cantidad: 0, valorUnitario: 0, valorTotal: 0 });
    expect("tercero" in spec.columnas).toBe(false);
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

  it("funciona con cualquier descriptor (Cartera solo exige el NIT del tercero)", () => {
    // Cartera se concilia por NIT: es el único campo sin el cual no hay conciliación. El
    // documento y el saldo son opcionales porque hay reportes por tercero sin documento
    // (ILIMITADA, Ofimática) y reportes cuyo saldo solo vive en los baldes de edad (Zarzal).
    const cartera: SpecModulo = { hoja: "Cartera", filaEncabezado: 1, primeraFilaDatos: 2, columnas: { cuenta: 1, documento: 2, total: 3 } };
    expect(validarSpecModulo(CAR, normalizarSpecModulo(CAR, cartera))).toBe("Falta la columna obligatoria «NIT / cédula del tercero».");
    expect(validarSpecModulo(CAR, normalizarSpecModulo(CAR, { ...cartera, columnas: { ...cartera.columnas, nit: 7 } }))).toBeNull();
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

  it("modo MANUAL: el perfil conserva columna+texto pero nunca la fila efímera del archivo", () => {
    const manual = specInv({ subtotales: "manual", subtotalesColumna: 7, subtotalesFila: 1347, subtotalesTexto: "  TOTAL  " });
    expect(normalizarSpecModulo(INV, manual)).toMatchObject({ subtotales: "manual", subtotalesColumna: 7, subtotalesTexto: "TOTAL" });
    expect(normalizarSpecModulo(INV, manual).subtotalesFila).toBeUndefined();
    expect(normalizarSpecModuloArchivo(INV, manual)).toMatchObject({
      subtotales: "manual",
      subtotalesColumna: 7,
      subtotalesFila: 1347,
      subtotalesTexto: "TOTAL",
    });
    expect(normalizarSpecModulo(INV, { ...manual, subtotalesTexto: "   " }).subtotalesTexto).toBeUndefined();
    // Un modo distinto de «manual» no arrastra la columna al perfil guardado.
    expect(normalizarSpecModulo(INV, specInv({ subtotales: "rotulo", subtotalesColumna: 7 })).subtotalesColumna).toBeUndefined();
  });

  it("celda del total de ESTE archivo con otro modo (cargue con patrón): va al lote, nunca al perfil", () => {
    const conCelda = specInv({ subtotalesColumna: 6, subtotalesFila: 91, subtotalesTexto: "420" });
    expect(normalizarSpecModuloArchivo(INV, conCelda)).toMatchObject({ subtotalesColumna: 6, subtotalesFila: 91, subtotalesTexto: "420" });
    expect(normalizarSpecModuloArchivo(INV, conCelda).subtotales).toBeUndefined();
    const perfil = normalizarSpecModulo(INV, conCelda);
    expect(perfil.subtotalesColumna).toBeUndefined();
    expect(perfil.subtotalesFila).toBeUndefined();
    expect(perfil.subtotalesTexto).toBeUndefined();
    // Columna sin fila (o al revés) no es una celda: no se conserva.
    expect(normalizarSpecModuloArchivo(INV, specInv({ subtotales: "rotulo", subtotalesColumna: 6 })).subtotalesColumna).toBeUndefined();
    expect(normalizarSpecModuloArchivo(INV, specInv({ subtotalesFila: 91 })).subtotalesFila).toBeUndefined();
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

/**
 * Los campos nuevos del spec (familias, modo del tercero, nivel…) son opcionales y solo
 * los usa Cartera. Este bloque fija que NINGÚN otro módulo cambia de comportamiento: un
 * spec guardado de INV/AFI/ING/CXP/NOM normaliza EXACTAMENTE igual que antes, aunque el
 * perfil traiga campos nuevos (p. ej. copiado a mano o migrado de otro módulo).
 */
describe("regresión: los módulos sin familias no cambian", () => {
  const specDe = (modulo: keyof typeof MODULOS_IMPORT): SpecModulo => ({
    hoja: "Hoja1",
    filaEncabezado: 1,
    primeraFilaDatos: 2,
    columnas: Object.fromEntries(MODULOS_IMPORT[modulo].columnas.map((c, i) => [c.nombre, i + 1])),
  });

  it("NOM: descarta lo de cartera, conserva su arrastre y el rango del cargue solo en la variante del archivo", () => {
    const NOM = MODULOS_IMPORT.NOM;
    const base = { ...specDe("NOM"), columnas: { ...specDe("NOM").columnas, periodo: 2, cedula: 5, empleado: 6 } };
    const contaminado = {
      ...base,
      familias: { edades: [{ columna: 9, etiqueta: "1 - 30 DIAS", clase: "vencido" as const }] },
      edadesModo: "ancho" as const,
      arrastrarRoles: ["tercero", "periodo", "empleado"],
      nivel: "documento" as const,
      origenCartera: "exterior" as const,
      invertirSigno: true,
      periodoDesde: "2025-01",
      periodoHasta: "2025-12",
    };
    const reutilizable = normalizarSpecModulo(NOM, contaminado);
    expect(reutilizable.familias).toBeUndefined();
    expect(reutilizable.nivel).toBeUndefined();
    expect(reutilizable.origenCartera).toBeUndefined();
    expect(reutilizable.invertirSigno).toBeUndefined();
    // «tercero» no es arrastrable en Nómina; el período y el empleado sí.
    expect(reutilizable.arrastrarRoles).toEqual(["periodo", "empleado"]);
    // El rango de meses es de ESTE archivo: nunca va al perfil del cliente…
    expect(reutilizable.periodoDesde).toBeUndefined();
    expect(reutilizable.periodoHasta).toBeUndefined();
    // …pero sí acompaña al spec del lote.
    const delArchivo = normalizarSpecModuloArchivo(NOM, contaminado);
    expect(delArchivo).toMatchObject({ periodoDesde: "2025-01", periodoHasta: "2025-12" });
  });

  for (const modulo of ["INV", "AFI", "ING"] as const) {
    it(`${modulo}: los campos nuevos se descartan al normalizar`, () => {
      const limpio = normalizarSpecModulo(MODULOS_IMPORT[modulo], specDe(modulo));
      const contaminado = normalizarSpecModulo(MODULOS_IMPORT[modulo], {
        ...specDe(modulo),
        familias: { edades: [{ columna: 9, etiqueta: "1 - 30 DIAS", clase: "vencido" }] },
        edadesModo: "ancho",
        terceroModo: "cabecera",
        arrastrarRoles: ["tercero"],
        nivel: "documento",
        origenCartera: "exterior",
        invertirSigno: true,
      });
      expect(JSON.stringify(contaminado)).toBe(JSON.stringify(limpio));
    });
  }

  it("Cuentas por Pagar traduce su perfil anterior y conserva los campos del detalle por tercero", () => {
    const CXP = MODULOS_IMPORT.CXP;
    const legado = normalizarSpecModulo(CXP, { hoja: "CXP", filaEncabezado: 1, primeraFilaDatos: 2, columnas: { tipo: 1, documento: 2, tercero: 3, saldo: 6 } });
    expect(legado.columnas).toMatchObject({ cuenta: 1, documento: 2, nit: 3, total: 6 });
    const conservado = normalizarSpecModulo(CXP, {
      hoja: "CXP", filaEncabezado: 1, primeraFilaDatos: 2, columnas: { nit: 1 },
      nivel: "tercero", invertirSigno: true, terceroModo: "cabecera",
    });
    expect(conservado).toMatchObject({ nivel: "tercero", invertirSigno: true, terceroModo: "cabecera" });
  });

  it("Cartera SÍ los conserva", () => {
    const conservado = normalizarSpecModulo(CAR, {
      hoja: "CARTERA",
      filaEncabezado: 1,
      primeraFilaDatos: 2,
      columnas: { nit: 1, nombre: 2 },
      familias: { edades: [{ columna: 4, etiqueta: "31 - 60 DIAS", clase: "vencido" }, { columna: 3, etiqueta: "1 - 30 DIAS", clase: "vencido" }] },
      edadesModo: "ancho",
      terceroModo: "cabecera",
      arrastrarRoles: ["nit", "inventado"],
      nivel: "documento",
      origenCartera: "nacional",
    });
    // Ordenadas por columna, y los roles no arrastrables del descriptor se descartan.
    expect(conservado.familias?.edades.map((c) => c.columna)).toEqual([3, 4]);
    expect(conservado.arrastrarRoles).toEqual(["nit"]);
    expect(conservado).toMatchObject({ edadesModo: "ancho", terceroModo: "cabecera", nivel: "documento", origenCartera: "nacional" });
  });

  it("descarta columnas de familia inválidas o repetidas", () => {
    const spec = normalizarSpecModulo(CAR, {
      hoja: "H",
      filaEncabezado: 1,
      primeraFilaDatos: 2,
      columnas: { nit: 1 },
      familias: {
        edades: [
          { columna: 0, etiqueta: "sin columna" },
          { columna: 3, etiqueta: "  " },
          { columna: 4, etiqueta: "1 - 30 DIAS" },
          { columna: 4, etiqueta: "repetida" },
        ],
        inventada: [{ columna: 9, etiqueta: "x" }],
      },
    });
    expect(spec.familias?.edades).toEqual([{ columna: 4, etiqueta: "1 - 30 DIAS" }]);
    expect(spec.familias?.inventada).toBeUndefined();
  });
});

describe("aliasLegado: un rol renombrado no deja huérfano el perfil guardado", () => {
  it("Cartera lee el spec viejo (tipo/tercero/saldo) con los roles nuevos", () => {
    // Así quedó guardado el único perfil CAR que existe en producción, del descriptor v1.
    const viejo: SpecModulo = {
      hoja: "CARTERA",
      filaEncabezado: 1,
      primeraFilaDatos: 2,
      columnas: { tipo: 3, documento: 9, tercero: 6, saldo: 8 },
    };
    const migrado = normalizarSpecModulo(CAR, viejo);
    expect(migrado.columnas).toMatchObject({ cuenta: 3, nit: 6, total: 8, documento: 9 });
    // Y con el mapeo recuperado, el spec vuelve a ser válido sin intervención del usuario.
    expect(validarSpecModulo(CAR, migrado)).toBeNull();
  });

  it("el nombre nuevo manda si el spec trae los dos", () => {
    const mixto: SpecModulo = {
      hoja: "H",
      filaEncabezado: 1,
      primeraFilaDatos: 2,
      columnas: { tercero: 6, nit: 1 },
    };
    expect(normalizarSpecModulo(CAR, mixto).columnas.nit).toBe(1);
  });

  it("un módulo sin alias no traduce nada", () => {
    const spec = normalizarSpecModulo(INV, specInv({ columnas: { tipo: 2, saldo: 5 } }));
    expect(spec.columnas.tipo).toBe(2);
    expect(spec.columnas).not.toHaveProperty("total");
  });
});

describe("validarSpecModulo · familias", () => {
  const base = (familias: SpecModulo["familias"]): SpecModulo => normalizarSpecModulo(CAR, {
    hoja: "H", filaEncabezado: 1, primeraFilaDatos: 2, columnas: { nit: 1, total: 2 }, familias,
  });

  it("una columna no puede ser a la vez rol y balde de edad", () => {
    expect(validarSpecModulo(CAR, base({ edades: [{ columna: 2, etiqueta: "1 - 30 DIAS" }] })))
      .toMatch(/ya está asignada a «Saldo \/ total»/);
  });

  it("una familia bien formada pasa", () => {
    expect(validarSpecModulo(CAR, base({ edades: [{ columna: 3, etiqueta: "1 - 30 DIAS" }, { columna: 4, etiqueta: "31 - 60 DIAS" }] }))).toBeNull();
  });

  it("sin familia también pasa: hay reportes de cartera sin antigüedad", () => {
    expect(validarSpecModulo(CAR, base(undefined))).toBeNull();
  });
});

describe("normalizarSpecModulo · moneda, TRM de cierre y fecha de corte", () => {
  const specUsd = {
    hoja: "USD",
    filaEncabezado: 1,
    primeraFilaDatos: 2,
    columnas: { nit: 1, total: 2 },
    monedaArchivo: "USD",
    trmCierre: 3757.08,
    fechaCorte: "2025-12-31",
  } as SpecModulo;

  it("el perfil memoriza la moneda del formato, pero la TRM y la fecha de corte son del cargue", () => {
    const reutilizable = normalizarSpecModulo(CAR, specUsd);
    expect(reutilizable.monedaArchivo).toBe("USD");
    expect([reutilizable.trmCierre, reutilizable.fechaCorte]).toEqual([undefined, undefined]);
    expect(normalizarSpecModuloArchivo(CAR, specUsd)).toMatchObject({ monedaArchivo: "USD", trmCierre: 3757.08, fechaCorte: "2025-12-31" });
  });

  it("los módulos sin detalle por tercero no conservan nada de esto", () => {
    const inv = normalizarSpecModuloArchivo(INV, specInv({ monedaArchivo: "USD", trmCierre: 4000, fechaCorte: "2025-12-31" }));
    expect([inv.monedaArchivo, inv.trmCierre, inv.fechaCorte]).toEqual([undefined, undefined, undefined]);
  });
});
