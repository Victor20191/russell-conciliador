import { describe, it, expect } from "vitest";
import {
  parseNumeroFlexible,
  normalizarCodigo,
  controlConcuerda,
  elegirMovimiento,
  construirCuadre,
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
  estandar: "AUTO",
};

function spec(over: Partial<MappingSpec> = {}): MappingSpec {
  return {
    hoja: "Balance",
    filaEncabezado: 1,
    primeraFilaDatos: 2,
    columnas: { codigo: 1, nombre: 2, saldoInicial: 3, debitos: 4, creditos: 5, saldoFinal: 6, saldoFinalDebito: 0, saldoFinalCredito: 0, tercero: 0 },
    signoCredito: "firmado",
    reglaDetalle: { tipo: "prefijo", columna: null, valor: null },
    agregarPorTercero: false,
    nit: { valor: null, fuente: "NINGUNO" },
    periodoInicial: { valor: null, fuente: "NINGUNO" },
    periodoFinal: { valor: null, fuente: "NINGUNO" },
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
  it("extrae el código cuando viene EMBEBIDO en el nombre", () => {
    expect(normalizarCodigo("11050501 - Caja General")).toBe("11050501");
    expect(normalizarCodigo("11100501 - Bancolombia Cuenta Corriente Nro.613-748953-32")).toBe("11100501");
  });
  it("quita el sufijo alfabético (INAC/A/AS)", () => {
    expect(normalizarCodigo("236550INAC")).toBe("236550");
    expect(normalizarCodigo("23680503A")).toBe("23680503");
  });
  it("un rótulo de texto puro no produce código numérico (se excluirá)", () => {
    expect(/^\d+$/.test(normalizarCodigo("TOTAL ACTIVOS"))).toBe(false);
  });
});

describe("construirCuadre · partida doble", () => {
  const totales = { detectado: true, debitos: 100, creditos: 100 };
  it("cuadra cuando Σ débitos = Σ créditos (≤ 1 COP)", () => {
    const c = construirCuadre(totales, 100, 100);
    expect(c.partidaDobleCuadra).toBe(true);
    expect(c.diferenciaPartidaDoble).toBe(0);
  });
  it("NO cuadra ante cualquier diferencia, sin tolerancia de %", () => {
    // 164M sobre 175 mil M es < 0,1 %, pero igual debe marcarse descuadrado.
    const c = construirCuadre({ detectado: true, debitos: 175_593_035_623, creditos: 175_757_323_542 }, 175_593_035_623, 175_757_323_542);
    expect(c.partidaDobleCuadra).toBe(false);
    expect(c.diferenciaPartidaDoble).toBe(175_593_035_623 - 175_757_323_542);
  });
  it("1 COP de diferencia se tolera (redondeo)", () => {
    expect(construirCuadre(totales, 100, 101).partidaDobleCuadra).toBe(true);
    expect(construirCuadre(totales, 100, 102).partidaDobleCuadra).toBe(false);
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

describe("elegirMovimiento", () => {
  it("conserva el signo cuando la identidad firmada explica el saldo", () => {
    expect(elegirMovimiento(14_900_064.22, -8_829_085.77, 449_106, 5_621_872.45)).toEqual({ db: -8_829_085.77, cr: 449_106 });
    expect(elegirMovimiento(0, 1000, 0, 1000)).toEqual({ db: 1000, cr: 0 }); // débito normal, sin cambio
  });
  it("cae a magnitud cuando el signo NO explica el saldo (SAP / nota débito)", () => {
    expect(elegirMovimiento(-100, 0, -900, -1000)).toEqual({ db: 0, cr: 900 }); // crédito firmado-negativo
    expect(elegirMovimiento(0, -50, 0, 50)).toEqual({ db: 50, cr: 0 }); // nota débito con saldo en magnitud
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
  it("staging: conserva TODAS las filas leídas, clasificadas (no pierde ninguna)", () => {
    // 5 filas de datos (la cabecera no cuenta): nada se descarta, solo se etiqueta.
    expect(r.filasCrudas).toHaveLength(5);
    const tipo = (codigo: string) => r.filasCrudas.find((f) => f.codigo === codigo)?.tipoFila;
    expect(tipo("11")).toBe("agrupadora"); // padre
    expect(tipo("110505")).toBe("movimiento");
    expect(tipo("220505")).toBe("movimiento");
    expect(tipo("130505")).toBe("descuadre"); // movimiento que no cuadró → re-etiquetado
    // La fila TOTAL (código no numérico) queda como "total" con codigo vacío.
    expect(r.filasCrudas.find((f) => f.tipoFila === "total")?.codigo).toBe("");
  });
  it("la cabecera usa los parámetros del modal (PARAMETRO)", () => {
    expect(r.cabecera.nit).toEqual({ valor: "900.451.227-3", fuente: "PARAMETRO" });
    expect(r.cabecera.periodoFinal.valor).toBe("2026-05-31");
  });

  it("fija NIF cuando llega como tipo de balance por defecto", () => {
    const rr = transformarTabular(spec({ estandar: "PCGA" }), [hoja], { ...PARAMS, estandar: "NIF" });
    expect(rr.cabecera.estandar).toBe("NIF");
    expect(rr.resumen.estandar).toBe("NIF");
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

  it("conserva el débito NETO negativo (reversa) cuando explica el saldo", () => {
    // Caso real COMESTIBLES DAN (cuenta 143560): débito neto −8.829.085,77 que
    // ANTES se volteaba a magnitud → la fila descuadraba y se excluía entera.
    const hojaRev: GridHoja = {
      nombre: "Balance",
      filas: [
        ["Código", "Cuenta", "Saldo anterior", "Débito", "Crédito", "Saldo final"],
        [143560, "SALSAS", 14_900_064.22, -8_829_085.77, 449_106, 5_621_872.45], // 14.900.064,22 − 8.829.085,77 − 449.106 = 5.621.872,45 ✓
      ],
    };
    const rr = transformarTabular(spec(), [hojaRev], PARAMS);
    expect(rr.importReady).toHaveLength(1); // ya NO se descarta
    expect(rr.importReady[0]).toMatchObject({ code: "143560", debitos: -8_829_085.77, creditos: 449_106, balance: 5_621_872.45 });
    expect(rr.resumen.filasDescuadre).toBe(0);
  });

  it("la suma de cuadre resta la reversa (partida doble cuadra con el origen)", () => {
    const hojaPd: GridHoja = {
      nombre: "Balance",
      filas: [
        ["Código", "Cuenta", "Saldo anterior", "Débito", "Crédito", "Saldo final"],
        [110505, "Caja", 0, 1000, 0, 1000], // débito normal
        [143560, "Salsas", 100, -1000, 0, -900], // reversa: débito neto −1000
        [240805, "IVA", 0, 0, 0, 0],
        ["TOTAL", "Sumas iguales", "", 0, 0, 0], // gran total del archivo (Σdéb = Σcré)
      ],
    };
    const rr = transformarTabular(spec(), [hojaPd], PARAMS);
    // Σ firmada: 1000 + (−1000) = 0, no 2000 como daría |x|.
    expect(rr.cuadre.sumaDebitos).toBe(0);
    expect(rr.cuadre.diferenciaPartidaDoble).toBe(0);
    expect(rr.cuadre.partidaDobleCuadra).toBe(true);
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
    const s = spec({ columnas: { ...spec().columnas, saldoInicial: 0, debitos: 0, creditos: 0, saldoFinal: 3 } });
    const rr = transformarTabular(s, [hojaSaldo], PARAMS);
    expect(rr.importReady).toHaveLength(2);
    expect(rr.resumen.filasDescuadre).toBe(0);
  });

  it("sin columna de saldo final, computa el saldo con movimientos en magnitud (SIGN-2)", () => {
    const hojaSinSaldoFinal: GridHoja = {
      nombre: "Balance",
      filas: [
        ["Código", "Cuenta", "SI", "DB", "CR"],
        [110505, "Caja", 0, -50, 0], // débito en negativo (nota débito) y SIN columna de saldo final
      ],
    };
    const s = spec({ columnas: { ...spec().columnas, saldoInicial: 3, debitos: 4, creditos: 5, saldoFinal: 0, saldoFinalDebito: 0, saldoFinalCredito: 0 } });
    const rr = transformarTabular(s, [hojaSinSaldoFinal], PARAMS);
    expect(rr.importReady[0]).toMatchObject({ code: "110505", balance: 50, debitos: 50 });
  });

  it("por prefijo: con auxiliares de 8 dígitos excluye la subcuenta padre de 6", () => {
    const hojaN8: GridHoja = {
      nombre: "Balance",
      filas: [
        ["Código", "Cuenta", "SI", "DB", "CR", "Saldo"],
        [110505, "Caja general (padre)", 1000, 0, 0, 1000], // tiene auxiliares debajo → agrupadora
        [11050501, "Caja sede A", 600, 0, 0, 600], // auxiliar 8 ✓
        [11050502, "Caja sede B", 400, 0, 0, 400], // auxiliar 8 ✓
      ],
    };
    const rr = transformarTabular(spec(), [hojaN8], PARAMS);
    expect(rr.importReady.map((c) => c.code).sort()).toEqual(["11050501", "11050502"]);
    expect(rr.resumen.cuentasMovimiento).toBe(2);
    expect(rr.resumen.cuentasAgrupadoras).toBe(1); // 110505
  });

  it("por prefijo: una subcuenta de 6 sin hijos es movimiento; el grupo de 2 se excluye", () => {
    const hojaN6: GridHoja = {
      nombre: "Balance",
      filas: [
        ["Código", "Cuenta", "SI", "DB", "CR", "Saldo"],
        [11, "DISPONIBLE (padre)", 0, 0, 0, 1000], // grupo de 2 díg. → excluido (piso PUC)
        [110505, "Caja", 1000, 0, 0, 1000], // subcuenta 6 sin hijos ✓
        [220505, "Proveedores", -2000, 0, 1000, -3000], // subcuenta 6 sin hijos ✓
      ],
    };
    const rr = transformarTabular(spec(), [hojaN6], PARAMS);
    expect(rr.importReady.map((c) => c.code).sort()).toEqual(["110505", "220505"]);
  });

  it("profundidad MIXTA: hoja de 6 dígitos junto a auxiliares de 8 (caso que la longitud fija perdía) + cuadre TOTALES", () => {
    const hojaMixta: GridHoja = {
      nombre: "Balance",
      filas: [
        ["Código", "Cuenta", "SI", "DB", "CR", "Saldo"],
        [1105, "Caja", 0, 0, 0, 0], // cuenta de 4 → agrupadora
        [110505, "Caja general", 0, 100, 0, 100], // 6 díg. SIN hijos → MOVIMIENTO (longitudMin=8 la perdía)
        [110510, "Cajas menores", 0, 0, 0, 0], // 6 díg. CON hijos → agrupadora
        [11051001, "Caja menor A", 0, 40, 0, 40], // auxiliar 8 ✓
        [11051002, "Caja menor B", 0, 60, 0, 60], // auxiliar 8 ✓
        [220505, "Proveedores", 0, 0, 200, -200], // 6 díg. crédito → MOVIMIENTO
        ["", "TOTALES", "", 200, 200, ""], // gran total balanceado del archivo
      ],
    };
    const rr = transformarTabular(spec(), [hojaMixta], PARAMS);
    expect(rr.importReady.map((c) => c.code).sort()).toEqual(["110505", "11051001", "11051002", "220505"]);
    expect(rr.resumen.cuentasMovimiento).toBe(4);
    expect(rr.resumen.cuentasAgrupadoras).toBe(2); // 1105, 110510
    expect(rr.cuadre.detectado).toBe(true);
    expect(rr.cuadre.totalDebitos).toBe(200);
    expect(rr.cuadre.totalCreditos).toBe(200);
    expect(rr.cuadre.sumaDebitos).toBe(200); // 100 + 40 + 60
    expect(rr.cuadre.cuadra).toBe(true);
  });

  it("cuadre TOTALES: bloquea (cuadra=false) cuando la suma de hojas no coincide con el gran total", () => {
    const hojaDescuadrada: GridHoja = {
      nombre: "Balance",
      filas: [
        ["Código", "Cuenta", "SI", "DB", "CR", "Saldo"],
        [110505, "Caja general", 0, 100, 0, 100],
        [11051001, "Caja menor A", 0, 40, 0, 40],
        [11051002, "Caja menor B", 0, 60, 0, 60],
        [220505, "Proveedores", 0, 0, 200, -200],
        ["", "GRAN TOTAL", "", 300, 300, ""], // dice 300/300 pero las hojas suman 200/200
      ],
    };
    const rr = transformarTabular(spec(), [hojaDescuadrada], PARAMS);
    expect(rr.cuadre.detectado).toBe(true);
    expect(rr.cuadre.sumaDebitos).toBe(200);
    expect(rr.cuadre.totalDebitos).toBe(300);
    expect(rr.cuadre.cuadra).toBe(false);
  });

  it("detectarTotales ignora subtotales por sección (plural) y elige el gran total BALANCEADO", () => {
    const hoja: GridHoja = {
      nombre: "Balance",
      filas: [
        ["Código", "Cuenta", "SI", "DB", "CR", "Saldo"],
        [110505, "Caja", 0, 100, 0, 100],
        [220505, "Proveedores", 0, 0, 100, -100],
        ["", "TOTAL ACTIVOS", "", 100, 0, ""], // subtotal de sección (plural) → ignorado
        ["", "TOTAL PASIVOS", "", 0, 100, ""], // subtotal de sección (plural) → ignorado
        ["", "TOTALES", "", 100, 100, ""], // gran total balanceado → ESTE
      ],
    };
    const rr = transformarTabular(spec(), [hoja], PARAMS);
    expect(rr.cuadre.detectado).toBe(true);
    expect(rr.cuadre.totalDebitos).toBe(100);
    expect(rr.cuadre.totalCreditos).toBe(100);
    expect(rr.cuadre.cuadra).toBe(true);
  });

  it("sin gran total balanceado (solo un subtotal de una columna) → cuadre NO aplica, no bloquea", () => {
    const hoja: GridHoja = {
      nombre: "Balance",
      filas: [
        ["Código", "Cuenta", "SI", "DB", "CR", "Saldo"],
        [110505, "Caja", 0, 100, 0, 100],
        ["", "TOTAL ACTIVOS", "", 100, 0, ""], // sección, una sola columna → no es gran total
      ],
    };
    const rr = transformarTabular(spec(), [hoja], PARAMS);
    expect(rr.importReady.map((c) => c.code)).toEqual(["110505"]);
    expect(rr.cuadre.detectado).toBe(false); // no se bloquea por un subtotal de sección
  });

  it("marca de imputable: NUNCA importa una agrupadora con hijos (la marca refina al prefijo)", () => {
    const hoja: GridHoja = {
      nombre: "Balance",
      filas: [
        ["Código", "Cuenta", "SI", "DB", "CR", "Saldo", "Imputa"],
        [110510, "Cajas menores (madre)", 0, 0, 0, 0, "x"], // marcada PERO tiene hijos → NO se importa
        [11051001, "Caja A", 0, 40, 0, 40, "x"], // marcada, hoja ✓
        [11051002, "Caja B", 0, 60, 0, 60, "x"], // marcada, hoja ✓
      ],
    };
    const rr = transformarTabular(spec({ reglaDetalle: { tipo: "columna", columna: 7, valor: "x" } }), [hoja], PARAMS);
    expect(rr.importReady.map((c) => c.code).sort()).toEqual(["11051001", "11051002"]); // sin 110510 → sin doble conteo
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
        estandar: "NIIF",
        agregarPorTercero: false,
        importable: true,
        motivoNoImportable: null,
        excepciones: [],
        notas: null,
        filas: [
          { cuenta: "110505", nombre: "Caja", saldoInicial: 1000, debitos: 500, creditos: 0, saldo: 1500 },
          { cuenta: "13", nombre: "Deudores", saldoInicial: 0, debitos: 0, creditos: 0, saldo: 999 }, // padre len 2 → excluido
        ],
      },
      { ...PARAMS, nit: null, periodoInicial: null, periodoFinal: null, estandar: "NIIF" },
    );
    expect(r.importReady.map((c) => c.code)).toEqual(["110505"]);
    expect(r.cabecera.nit).toEqual({ valor: "800070771-1", fuente: "FUENTE" });
    expect(r.cabecera.estandar).toBe("NIIF");
  });
});
