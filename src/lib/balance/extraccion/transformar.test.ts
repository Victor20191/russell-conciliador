import { describe, it, expect } from "vitest";
import {
  parseNumeroFlexible,
  normalizarCodigo,
  controlConcuerda,
  transformarTabular,
  validarDirecta,
  type ParamsExtraccion,
} from "./transformar";
import type { MappingSpec } from "./esquema";
import type { GridHoja } from "./ingesta";

const PARAMS: ParamsExtraccion = {
  nit: "900.451.227-3",
  periodoInicial: "2026-05-01",
  periodoFinal: "2026-05-31",
  centro: null,
  estandar: "AUTO",
};

function spec(over: Partial<MappingSpec> = {}): MappingSpec {
  return {
    hoja: "Balance",
    filaEncabezado: 1,
    primeraFilaDatos: 2,
    columnas: { codigo: 1, nombre: 2, saldoInicial: 3, debitos: 4, creditos: 5, saldoFinal: 6, saldoFinalDebito: null, saldoFinalCredito: null, centro: null, tercero: null },
    signoCredito: "firmado",
    reglaDetalle: { tipo: "longitud", longitudMin: 6, columna: null, valor: null },
    agregarPorTercero: false,
    nit: { valor: null, fuente: "NINGUNO" },
    periodoInicial: { valor: null, fuente: "NINGUNO" },
    periodoFinal: { valor: null, fuente: "NINGUNO" },
    centroOperativo: { valor: null, fuente: "NINGUNO" },
    estandar: "AUTO",
    importable: true,
    motivoNoImportable: null,
    excepciones: [],
    confianza: 0.9,
    notas: null,
    ...over,
  };
}

describe("parseNumeroFlexible", () => {
  it("formato es-CO (miles «.», decimal «,»)", () => {
    expect(parseNumeroFlexible("1.234.567,89")).toBe(1234567.89);
    expect(parseNumeroFlexible("1.234")).toBe(1234); // un punto + 3 dígitos → miles
    expect(parseNumeroFlexible("12,5")).toBe(12.5); // una coma + ≤2 → decimal
  });
  it("formato US (miles «,», decimal «.»)", () => {
    expect(parseNumeroFlexible("1,234,567.89")).toBe(1234567.89);
    expect(parseNumeroFlexible("1,500")).toBe(1500); // una coma + 3 dígitos → miles
    expect(parseNumeroFlexible("1.50")).toBe(1.5);
  });
  it("COP, $, paréntesis y signo", () => {
    expect(parseNumeroFlexible("$ 1.000")).toBe(1000);
    expect(parseNumeroFlexible("1.234.567 COP")).toBe(1234567);
    expect(parseNumeroFlexible("(2.000)")).toBe(-2000);
    expect(parseNumeroFlexible("-1.234,50")).toBe(-1234.5);
  });
  it("vacío→0, no numérico→null", () => {
    expect(parseNumeroFlexible("")).toBe(0);
    expect(parseNumeroFlexible("abc")).toBeNull();
  });
});

describe("normalizarCodigo", () => {
  it("conserva ceros iniciales y quita puntos/espacios", () => {
    expect(normalizarCodigo("0110.05")).toBe("011005");
    expect(normalizarCodigo(" 11 05 05 ")).toBe("110505");
    expect(normalizarCodigo(110505)).toBe("110505");
  });
});

describe("controlConcuerda", () => {
  it("cuadra en convención firmada", () => {
    expect(controlConcuerda(1000, 500, 0, 1500)).toBe(true); // débito
    expect(controlConcuerda(-2000, 0, 1000, -3000)).toBe(true); // crédito firmado
  });
  it("cuadra en convención magnitud (orientación inversa)", () => {
    expect(controlConcuerda(2000, 0, 1000, 3000)).toBe(true); // crédito en magnitud
  });
  it("descuadre real falla ambas orientaciones", () => {
    expect(controlConcuerda(1000, 0, 500, 800)).toBe(false);
  });
});

describe("transformarTabular", () => {
  const hoja: GridHoja = {
    nombre: "Balance",
    filas: [
      ["Código", "Cuenta", "Saldo anterior", "Débito", "Crédito", "Saldo final"],
      [11, "DISPONIBLE", 0, 0, 0, 1500], // padre (len 2) → excluido
      [110505, "Caja", 1000, 500, 0, 1500], // ✓
      [220505, "Proveedores", -2000, 0, 1000, -3000], // ✓ crédito firmado
      ["TOTAL", "Total activo", "", "", "", 4500], // código no numérico → excluido
      [130505, "Clientes", 1000, 0, 500, 800], // descuadre (800 ≠ 500)
    ],
  };
  const r = transformarTabular(spec(), [hoja], PARAMS);

  it("importa solo filas de detalle que cuadran", () => {
    expect(r.importReady.map((c) => c.code).sort()).toEqual(["110505", "220505"]);
    const caja = r.importReady.find((c) => c.code === "110505")!;
    expect(caja).toMatchObject({ prevBalance: 1000, balance: 1500, debitos: 500, creditos: 0 });
  });
  it("excluye padres y totales, y reporta descuadres", () => {
    expect(r.resumen.filasExcluidas).toBe(2); // 11 (padre) + TOTAL
    expect(r.resumen.filasDescuadre).toBe(1);
    expect(r.excepciones.some((e) => /Descuadre/.test(e.regla))).toBe(true);
  });
  it("la cabecera usa los parámetros del modal (PARAMETRO)", () => {
    expect(r.cabecera.nit).toEqual({ valor: "900.451.227-3", fuente: "PARAMETRO" });
    expect(r.cabecera.periodoFinal.valor).toBe("2026-05-31");
  });

  it("normaliza créditos negativos (SAP) a magnitud positiva", () => {
    const hojaSap: GridHoja = {
      nombre: "Balance",
      filas: [
        ["Código", "Cuenta", "Saldo anterior", "Débito", "Crédito", "Saldo final"],
        [240805, "IVA", -100, 0, -900, -1000], // crédito firmado negativo; 1000 = 100? -1000=-100+0-900 ✓
      ],
    };
    const rr = transformarTabular(spec(), [hojaSap], PARAMS);
    expect(rr.importReady[0]).toMatchObject({ code: "240805", creditos: 900 });
  });

  it("agrega por tercero sumando los importes", () => {
    const hojaT: GridHoja = {
      nombre: "Balance",
      filas: [
        ["Código", "Cuenta", "SI", "DB", "CR", "Saldo", "Tercero"],
        [130505, "Cli A", 100, 500, 0, 600, "T1"],
        [130505, "Cli B", 200, 200, 0, 400, "T2"],
      ],
    };
    const s = spec({ agregarPorTercero: true, columnas: { ...spec().columnas, tercero: 7 } });
    const rr = transformarTabular(s, [hojaT], PARAMS);
    expect(rr.importReady).toHaveLength(1);
    expect(rr.importReady[0]).toMatchObject({ code: "130505", prevBalance: 300, balance: 1000, debitos: 700 });
  });

  it("sin columnas de movimiento, acepta por saldo sin validar control", () => {
    const hojaSaldo: GridHoja = {
      nombre: "Balance",
      filas: [
        ["Código", "Cuenta", "Saldo"],
        [110505, "Caja", 1500],
        [220505, "Proveedores", -3000],
      ],
    };
    const s = spec({ columnas: { ...spec().columnas, saldoInicial: null, debitos: null, creditos: null, saldoFinal: 3 } });
    const rr = transformarTabular(s, [hojaSaldo], PARAMS);
    expect(rr.importReady).toHaveLength(2);
    expect(rr.resumen.filasDescuadre).toBe(0);
  });

  it("archivo marcado no importable → 0 filas + excepción", () => {
    const rr = transformarTabular(spec({ importable: false, motivoNoImportable: "Solo movimientos." }), [hoja], PARAMS);
    expect(rr.importReady).toHaveLength(0);
    expect(rr.excepciones.some((e) => /no importable/i.test(e.regla))).toBe(true);
  });
});

describe("validarDirecta (PDF)", () => {
  it("valida las filas extraídas por el modelo", () => {
    const r = validarDirecta(
      {
        nit: { valor: "800070771-1", fuente: "FUENTE" },
        periodoInicial: { valor: "2026-03-01", fuente: "FUENTE" },
        periodoFinal: { valor: "2026-03-31", fuente: "FUENTE" },
        centroOperativo: { valor: null, fuente: "NINGUNO" },
        estandar: "NIIF",
        agregarPorTercero: false,
        importable: true,
        motivoNoImportable: null,
        excepciones: [],
        notas: null,
        filas: [
          { cuenta: "110505", nombre: "Caja", saldoInicial: 1000, debitos: 500, creditos: 0, saldo: 1500, centro: null },
          { cuenta: "13", nombre: "Deudores", saldoInicial: 0, debitos: 0, creditos: 0, saldo: 999, centro: null }, // padre len 2 → excluido
        ],
      },
      { ...PARAMS, nit: null, periodoInicial: null, periodoFinal: null, estandar: "NIIF" },
    );
    expect(r.importReady.map((c) => c.code)).toEqual(["110505"]);
    expect(r.cabecera.nit).toEqual({ valor: "800070771-1", fuente: "FUENTE" });
    expect(r.cabecera.estandar).toBe("NIIF");
  });
});
