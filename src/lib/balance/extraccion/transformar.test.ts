import { describe, it, expect } from "vitest";
import {
  parseNumeroFlexible,
  normalizarCodigo,
  controlConcuerda,
  elegirMovimiento,
  marcarSubtotalesDuplicados,
  reclasificarRepetidos,
  construirCuadre,
  transformarTabular,
  validarDirecta,
  ajustarPrimeraFilaDatos,
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
    columnas: { codigo: 1, codigoFragmentos: [], nombre: 2, saldoInicial: 3, debitos: 4, creditos: 5, saldoFinal: 6, saldoFinalDebito: 0, saldoFinalCredito: 0, tercero: 0 },
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
  it("concatena el código PUC en notación de GUIONES (todos los tramos numéricos)", () => {
    expect(normalizarCodigo("1105-05-04")).toBe("11050504");
    expect(normalizarCodigo("1130-05-04")).toBe("11300504");
    expect(normalizarCodigo("1305-05-05")).toBe("13050505");
    expect(normalizarCodigo("1105-10-19")).toBe("11051019");
    // NO se confunde con «código - nombre» (tras el guion hay TEXTO): token inicial.
    expect(normalizarCodigo("11050501 - Caja General")).toBe("11050501");
    // NO se confunde con el DETALLE POR TERCERO (`-0-` de 1 díg y/o NIT ≥7 díg): trunca.
    expect(normalizarCodigo("120520-0-00-800011002")).toBe("120520");
    expect(normalizarCodigo("11100501-0-00")).toBe("11100501");
    expect(normalizarCodigo("135515-0-00")).toBe("135515");
  });
  it("quita el sufijo alfabético (INAC/A/AS)", () => {
    expect(normalizarCodigo("236550INAC")).toBe("236550");
    expect(normalizarCodigo("23680503A")).toBe("23680503");
  });
  it("un rótulo de texto puro no produce código numérico (se excluirá)", () => {
    expect(/^\d+$/.test(normalizarCodigo("TOTAL ACTIVOS"))).toBe(false);
  });

  it("extrae el código de subtotales «al final» (TOTAL 110505 → 110505)", () => {
    expect(normalizarCodigo("TOTAL 110505")).toBe("110505");
    expect(normalizarCodigo("SUBTOTAL 1105")).toBe("1105");
    expect(normalizarCodigo("Total: 11 05 05")).toBe("110505");
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

describe("marcarSubtotalesDuplicados", () => {
  it("marca la cuenta de 6 díg cuyas 4 columnas = una de 8 díg del mismo grupo (caso 141006/14101004)", () => {
    const filas = [
      { codigo: "141006", saldoInicial: 9531, debitos: 0, creditos: 0, saldoFinal: 9531 },
      { codigo: "14101004", saldoInicial: 9531, debitos: 0, creditos: 0, saldoFinal: 9531 },
      { codigo: "141001", saldoInicial: 100, debitos: 0, creditos: 0, saldoFinal: 100 }, // sin gemelo
    ];
    expect([...marcarSubtotalesDuplicados(filas)].map((f) => f.codigo)).toEqual(["141006"]);
  });
  it("no marca si las columnas difieren o todo es 0", () => {
    expect(
      marcarSubtotalesDuplicados([
        { codigo: "141006", saldoInicial: 0, debitos: 0, creditos: 0, saldoFinal: 0 }, // todo 0
        { codigo: "14101004", saldoInicial: 0, debitos: 0, creditos: 0, saldoFinal: 0 },
        { codigo: "220505", saldoInicial: 100, debitos: 0, creditos: 0, saldoFinal: 100 },
        { codigo: "22050501", saldoInicial: 200, debitos: 0, creditos: 0, saldoFinal: 200 }, // valor distinto
      ]).size,
    ).toBe(0);
  });
});

describe("reclasificarRepetidos", () => {
  it("la 2ª aparición consecutiva del mismo código pasa de agrupadora a movimiento", () => {
    const filas = [
      { filaNum: 1, codigo: "1105", tipoFila: "agrupadora" as const },
      { filaNum: 2, codigo: "1105", tipoFila: "agrupadora" as const },
      { filaNum: 3, codigo: "110505", tipoFila: "movimiento" as const },
    ];
    const cambiadas = reclasificarRepetidos(filas);
    expect(cambiadas.map((f) => f.filaNum)).toEqual([2]);
    expect(filas[0].tipoFila).toBe("agrupadora"); // la primera se conserva como encabezado
    expect(filas[1].tipoFila).toBe("movimiento"); // la repetición pasa a movimiento
  });
  it("no toca códigos que no se repiten", () => {
    const filas = [
      { filaNum: 1, codigo: "1105", tipoFila: "agrupadora" as const },
      { filaNum: 2, codigo: "1110", tipoFila: "agrupadora" as const },
    ];
    expect(reclasificarRepetidos(filas)).toHaveLength(0);
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

  it("adopta el código EMBEBIDO en el nombre cuando la columna de código va vacía (agrupadoras sin código propio)", () => {
    // Formato donde las AGRUPADORAS traen su código pegado al nombre («1105 - CAJA») y la
    // columna de código solo trae el de las HOJAS. Sin el fallback, las agrupadoras quedan
    // sin código y se pierden como «total».
    const hojaEmb: GridHoja = {
      nombre: "Balance",
      filas: [
        ["Código", "Cuenta", "Saldo anterior", "Débito", "Crédito", "Saldo final"],
        ["", "1105 - CAJA", 2000, 0, 0, 2000], // agrupadora: código SOLO en el nombre
        ["11051001", "ADMINISTRACION MEDELIN", 2000, 0, 0, 2000], // hoja: código en su columna
        ["", "Total general", "", "", "", 2000], // sin patrón «código -» → NO adopta código
      ],
    };
    const rr = transformarTabular(spec(), [hojaEmb], PARAMS);
    const caja = rr.filasCrudas.find((f) => f.nombre === "CAJA");
    expect(caja?.codigo).toBe("1105"); // adoptó el código del nombre
    expect(caja?.nombre).toBe("CAJA"); // el nombre queda sin el prefijo
    const hoja = rr.filasCrudas.find((f) => f.codigo === "11051001");
    expect(hoja?.nombre).toBe("ADMINISTRACION MEDELIN"); // la hoja no se toca
    expect(rr.filasCrudas.find((f) => f.nombre === "Total general")?.codigo).toBe("");
  });

  it("regla de detalle «movimiento»: toda cuenta numérica se toma como movimiento (lista plana, sin agrupadoras)", () => {
    const hojaPlana: GridHoja = {
      nombre: "Balance",
      filas: [
        ["Código", "Cuenta", "Saldo anterior", "Débito", "Crédito", "Saldo final"],
        ["11", "DISPONIBLE", 1500, 0, 0, 1500], // con «prefijo» sería agrupadora (prefijo de 110505)
        ["110505", "Caja", 1000, 500, 0, 1500],
      ],
    };
    const rr = transformarTabular(spec({ reglaDetalle: { tipo: "movimiento", columna: null, valor: null } }), [hojaPlana], PARAMS);
    const tipo = (codigo: string) => rr.filasCrudas.find((f) => f.codigo === codigo)?.tipoFila;
    expect(tipo("11")).toBe("movimiento"); // NO se agrupa aunque sea prefijo de 110505
    expect(tipo("110505")).toBe("movimiento");
  });

  it("concatena el código PUC FRAGMENTADO en varias columnas (SIIGO auxiliares)", () => {
    const hojaFrag: GridHoja = {
      nombre: "Balance",
      filas: [
        ["GRUPO", "CUENTA", "SUBCUENTA", "AUXILIAR", "SUBAUXILIAR", "Descripción", "Saldo anterior", "Débito", "Crédito", "Nuevo saldo"],
        ["1", "", "", "", "", "ACTIVO", 1700, 600, 50, 2250], // clase → agrupadora
        ["11", "05", "05", "", "", "CAJA GENERAL", 1000, 500, 0, 1500], // 110505
        ["11", "05", "10", "01", "", "OFICINA MEDELLIN", 500, 0, 0, 500], // 11051001
        [11, 10, 5, "", "", "BANCOLOMBIA", 200, 100, 50, 250], // fragmentos NUMÉRICOS (cero perdido)
      ],
    };
    const s = spec({ columnas: { ...spec().columnas, codigo: 0, codigoFragmentos: [1, 2, 3, 4, 5], nombre: 6, saldoInicial: 7, debitos: 8, creditos: 9, saldoFinal: 10 } });
    const rr = transformarTabular(s, [hojaFrag], PARAMS);
    const cod = (nom: string) => rr.filasCrudas.find((f) => f.nombre === nom)?.codigo;
    expect(cod("CAJA GENERAL")).toBe("110505");
    expect(cod("OFICINA MEDELLIN")).toBe("11051001");
    expect(cod("BANCOLOMBIA")).toBe("111005"); // 11 + 10 + "05" (cero re-completado)
    expect(rr.importReady.map((c) => c.code).sort()).toEqual(["110505", "11051001", "111005"]);
  });

  it("ignora codigoFragmentos con índices inválidos ([0]) y usa la columna de código", () => {
    // La IA a veces expresa «sin fragmentos» como [0] (generaliza el 0=ausente de los
    // campos escalares al arreglo). Sin el filtro, el código quedaba vacío en TODAS las
    // filas y el archivo terminaba en 0 cuentas importables (caso CORPO LA MUJER).
    const s = spec({ columnas: { ...spec().columnas, codigoFragmentos: [0] } });
    const rr = transformarTabular(s, [hoja], PARAMS);
    expect(rr.importReady.map((c) => c.code).sort()).toEqual(["110505", "220505"]);
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

  it("agrega por tercero sumando los importes aunque el modelo no active agregarPorTercero", () => {
    const hojaT: GridHoja = {
      nombre: "Balance",
      filas: [
        ["Código", "Cuenta", "SI", "DB", "CR", "Saldo", "Tercero"],
        [130505, "Cli A", 100, 500, 0, 600, "T1"],
        [130505, "Cli B", 200, 200, 0, 400, "T2"],
      ],
    };
    const s = spec({ agregarPorTercero: false, columnas: { ...spec().columnas, tercero: 7 } });
    const rr = transformarTabular(s, [hojaT], PARAMS);
    expect(rr.importReady).toHaveLength(1);
    expect(rr.importReady[0]).toMatchObject({ code: "130505", prevBalance: 300, balance: 1000, debitos: 700 });
  });

  it("balance por tercero: si existe fila consolidada del mismo código, omite el detalle para no doble-contar", () => {
    const B = [true, true, false, false, false, false, false];
    const P = [false, false, false, false, false, false, false];
    const hojaT: GridHoja = {
      nombre: "Balance",
      filas: [
        ["Código", "Cuenta", "SI", "DB", "CR", "Saldo", "Tercero"],
        [130505, "Clientes", 100, 500, 0, 600, ""], // consolidado: se usa
        [130505, "Clientes A", 40, 200, 0, 240, "Tercero A"], // detalle duplicado: se omite
        [130505, "Clientes B", 60, 300, 0, 360, "Tercero B"], // detalle duplicado: se omite
        [220505, "Proveedor A", -100, 0, 50, -150, "Proveedor A"], // sin consolidado: se agrega
        [220505, "Proveedor B", -200, 0, 50, -250, "Proveedor B"],
      ],
      negrita: [P, B, P, P, P, P],
    };
    const s = spec({ agregarPorTercero: true, columnas: { ...spec().columnas, tercero: 7 } });
    const rr = transformarTabular(s, [hojaT], PARAMS);

    expect(rr.importReady.map((c) => c.code).sort()).toEqual(["130505", "220505"]);
    expect(rr.importReady.find((c) => c.code === "130505")).toMatchObject({ prevBalance: 100, debitos: 500, creditos: 0, balance: 600 });
    expect(rr.importReady.find((c) => c.code === "220505")).toMatchObject({ prevBalance: -300, debitos: 0, creditos: 100, balance: -400 });
    expect(rr.resumen.filasExcluidas).toBe(2);
    expect(rr.filasCrudas).toHaveLength(3);
    expect(rr.excepciones.some((e) => e.regla === "Detalle por tercero omitido por fila consolidada")).toBe(true);
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

  it("negrita como marcador (convención consistente): una de 6 díg con hijos de 8 pero SIN negrita es movimiento (caso 135510)", () => {
    // La negrita marca la MAYORÍA de los padres (1105,1110,1305,1355) → convención
    // válida, así que se usa Y corrige 135510 (prefijo de 8 díg pero sin negrita → movimiento).
    const B = [true, true, false, false, false, false];
    const P = [false, false, false, false, false, false];
    const hoja: GridHoja = {
      nombre: "Balance",
      filas: [
        ["Código", "Cuenta", "SI", "DB", "CR", "Saldo"],
        [1105, "EFECTIVO", 0, 0, 0, 0], // agrupadora (negrita)
        [110505, "CAJA", 10, 0, 0, 10], // movimiento
        [1110, "BANCOS", 0, 0, 0, 0], // agrupadora (negrita)
        [111005, "BANCO X", 20, 0, 0, 20], // movimiento
        [1305, "CLIENTES", 0, 0, 0, 0], // agrupadora (negrita)
        [130505, "CLIENTES NAL", 15, 0, 0, 15], // movimiento
        [1355, "IMPUESTOS", 0, 0, 0, 0], // agrupadora (negrita)
        [135505, "RETEFUENTE", 5, 0, 0, 5], // movimiento
        [135510, "ANTICIPO ICA", 30, 0, 0, 30], // prefijo de 8 díg pero SIN negrita → movimiento
        [13551011, "AUTORRET ITAGUI", 70, 0, 0, 70], // movimiento
      ],
      negrita: [P, B, P, B, P, B, P, B, P, P, P],
    };
    const rr = transformarTabular(spec(), [hoja], PARAMS);
    expect(rr.importReady.map((c) => c.code).sort()).toEqual(["110505", "111005", "130505", "135505", "135510", "13551011"]);
    expect(rr.resumen.cuentasAgrupadoras).toBe(4); // 1105, 1110, 1305, 1355
  });

  it("negrita como marcador: un padre SIN negrita cuyo saldo YA está cubierto por sus hojas NO se importa doblado", () => {
    // Mismo patrón del caso 135510 pero con el saldo del padre EXPLICADO por su
    // detalle (70 = 70): importar ambos doblaría el saldo. La negrita no anula la
    // evidencia estructural — el padre cubierto queda agrupadora.
    const B = [true, true, false, false, false, false];
    const P = [false, false, false, false, false, false];
    const hoja: GridHoja = {
      nombre: "Balance",
      filas: [
        ["Código", "Cuenta", "SI", "DB", "CR", "Saldo"],
        [1105, "EFECTIVO", 0, 0, 0, 0], // agrupadora (negrita)
        [110505, "CAJA", 10, 0, 0, 10], // movimiento
        [1110, "BANCOS", 0, 0, 0, 0], // agrupadora (negrita)
        [111005, "BANCO X", 20, 0, 0, 20], // movimiento
        [1305, "CLIENTES", 0, 0, 0, 0], // agrupadora (negrita)
        [130505, "CLIENTES NAL", 15, 0, 0, 15], // movimiento
        [1355, "IMPUESTOS", 0, 0, 0, 0], // agrupadora (negrita)
        [135505, "RETEFUENTE", 5, 0, 0, 5], // movimiento
        [135510, "ANTICIPO ICA", 70, 0, 0, 70], // SIN negrita pero saldo = Σ hijos → agrupadora
        [13551011, "AUTORRET ITAGUI", 70, 0, 0, 70], // movimiento (el detalle que lo explica)
      ],
      negrita: [P, B, P, B, P, B, P, B, P, P, P],
    };
    const rr = transformarTabular(spec(), [hoja], PARAMS);
    expect(rr.importReady.map((c) => c.code).sort()).toEqual(["110505", "111005", "130505", "135505", "13551011"]);
    expect(rr.resumen.cuentasAgrupadoras).toBe(5); // 1105, 1110, 1305, 1355 y 135510 (cubierto)
  });

  it("negrita SOLO en 6 díg (el ERP no marca clase/grupo): NO es marcador válido → cae a prefijo", () => {
    // Patrón HOSPITAL: solo la subcuenta 110505 va en negrita; las agrupadoras
    // 1/11/1105 no. La negrita no marca los padres → se ignora y clasifica por prefijo.
    const B = [true, true, false, false, false, false];
    const P = [false, false, false, false, false, false];
    const hoja: GridHoja = {
      nombre: "Balance",
      filas: [
        ["Código", "Cuenta", "SI", "DB", "CR", "Saldo"],
        [1, "ACTIVO", 0, 0, 0, 0], // agrupadora clase (SIN negrita)
        [11, "DISPONIBLE", 0, 0, 0, 0], // agrupadora grupo (SIN negrita)
        [1105, "CAJA", 0, 0, 0, 0], // agrupadora cuenta (SIN negrita)
        [110505, "CAJA GENERAL", 0, 0, 0, 0], // agrupadora subcuenta (EN negrita)
        [11050501, "CAJA A", 100, 0, 0, 100], // hoja
      ],
      negrita: [P, P, P, P, B, P],
    };
    const rr = transformarTabular(spec(), [hoja], PARAMS);
    expect(rr.importReady.map((c) => c.code)).toEqual(["11050501"]); // solo la hoja
    expect(rr.resumen.cuentasAgrupadoras).toBe(4); // 1, 11, 1105, 110505
  });

  it("negrita ESPORÁDICA (no concuerda con la estructura): cae a la heurística por prefijo", () => {
    // Aquí la negrita NO marca agrupadoras (está en hojas y las agrupadoras van sin
    // negrita): concuerda poco con el prefijo → se ignora y clasifica por prefijo.
    const B = [true, true, false, false, false, false];
    const P = [false, false, false, false, false, false];
    const hoja: GridHoja = {
      nombre: "Balance",
      filas: [
        ["Código", "Cuenta", "SI", "DB", "CR", "Saldo"],
        [11, "DISPONIBLE", 0, 0, 0, 0], // agrupadora (SIN negrita)
        [1105, "CAJA", 0, 0, 0, 0], // agrupadora (SIN negrita)
        [110505, "CAJA GENERAL", 10, 0, 0, 10], // hoja, EN negrita (esporádica)
        [110510, "CAJAS MENORES", 20, 0, 0, 20], // hoja, EN negrita (esporádica)
      ],
      negrita: [P, P, P, B, B],
    };
    const rr = transformarTabular(spec(), [hoja], PARAMS);
    // Si usara la negrita marcaría 11/1105 como movimiento (bug). Con el respaldo por
    // prefijo, los imputables son las hojas 110505/110510.
    expect(rr.importReady.map((c) => c.code).sort()).toEqual(["110505", "110510"]);
    expect(rr.resumen.cuentasAgrupadoras).toBe(2); // 11 y 1105
  });

  it("sin negrita: cae a la heurística por prefijo (135510 con hijo de 8 → agrupadora)", () => {
    const hoja: GridHoja = {
      nombre: "Balance",
      filas: [
        ["Código", "Cuenta", "SI", "DB", "CR", "Saldo"],
        [1355, "IMPUESTOS", 0, 0, 0, 100],
        [135510, "ANTICIPO ICA", 30, 0, 0, 30],
        [13551011, "AUTORRET ITAGUI", 70, 0, 0, 70],
      ], // sin `negrita` → heurística estructural
    };
    const rr = transformarTabular(spec(), [hoja], PARAMS);
    expect(rr.importReady.map((c) => c.code).sort()).toEqual(["13551011"]); // 135510 es agrupadora por prefijo
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

describe("ajustarPrimeraFilaDatos (guardia del rango de datos)", () => {
  // Encabezado en F2 y datos reales desde F3, pero el spec declara F8: las filas
  // F3-F7 (5 cuentas numéricas) se perderían.
  const hoja: GridHoja = {
    nombre: "Balance",
    filas: [
      ["EMPRESA XYZ S.A.S. NIT 900123456", "", "", "", "", ""],
      ["Código", "Cuenta", "SI", "DB", "CR", "Saldo"],
      [110505, "CAJA", 100, 0, 0, 100],
      [110510, "BANCOS", 200, 0, 0, 200],
      [130505, "CLIENTES", 300, 0, 0, 300],
      [220505, "PROVEEDORES", -250, 0, 0, -250],
      [240505, "IMPUESTOS", -150, 0, 0, -150],
      [250505, "SALARIOS", -200, 0, 0, -200],
    ],
  };

  it("amplía el rango cuando hay 3+ cuentas antes de la primera fila declarada", () => {
    expect(ajustarPrimeraFilaDatos(hoja, spec({ filaEncabezado: 2, primeraFilaDatos: 8 }))).toBe(3);
  });

  it("no ajusta con evidencia insuficiente (<3 filas numéricas saltadas)", () => {
    // Solo F3 y F4 quedan en el rango saltado.
    expect(ajustarPrimeraFilaDatos(hoja, spec({ filaEncabezado: 2, primeraFilaDatos: 5 }))).toBe(5);
  });

  it("no ajusta cuando el spec ya es correcto", () => {
    expect(ajustarPrimeraFilaDatos(hoja, spec({ filaEncabezado: 2, primeraFilaDatos: 3 }))).toBe(3);
  });

  it("transformarTabular aplica el ajuste y emite la excepción", () => {
    const r = transformarTabular(spec({ filaEncabezado: 2, primeraFilaDatos: 8 }), [hoja], PARAMS);
    expect(r.importReady.map((c) => c.code).sort()).toEqual(["110505", "110510", "130505", "220505", "240505", "250505"]);
    expect(r.excepciones.some((e) => e.campo === "primeraFilaDatos")).toBe(true);
  });

  it("un dato suelto del encabezado (p. ej. NIT numérico) no dispara el ajuste", () => {
    const conNit: GridHoja = {
      nombre: "Balance",
      filas: [
        ["900123456", "", "", "", "", ""], // NIT solo en la col 1
        ["Código", "Cuenta", "SI", "DB", "CR", "Saldo"],
        [110505, "CAJA", 100, 0, 0, 100],
      ],
    };
    expect(ajustarPrimeraFilaDatos(conNit, spec({ filaEncabezado: 0, primeraFilaDatos: 3 }))).toBe(3);
  });
});

describe("transformarTabular: balance por tercero con CUENTAS EN NEGRITA", () => {
  const HDR = ["Código", "Cuenta", "Saldo ant", "Débito", "Crédito", "Saldo final"];
  const BOLD6 = [true, true, true, true, true, true];
  const PLANO6 = [false, false, false, false, false, false];

  it("descarta el detalle por tercero SIN negrita y conserva las cuentas en negrita", () => {
    const filas: GridHoja["filas"] = [HDR];
    const negrita: boolean[][] = [BOLD6];
    const cuenta = (cod: string, nom: string, sf: number) => { filas.push([cod, nom, 0, 0, 0, sf]); negrita.push(BOLD6); };
    const tercero = (cod: string, nom: string, sf: number) => { filas.push([cod, nom, 0, 0, 0, sf]); negrita.push(PLANO6); };
    cuenta("1105", "CAJA", 0); // padre en negrita
    for (let i = 1; i <= 24; i++) {
      const c = `1105${String(i).padStart(2, "0")}`; // 110501..110524 (hojas)
      cuenta(c, `CTA ${i}`, i * 100);
      tercero("0", "GENERAL", i * 100); // tercero genérico → descartar
    }
    tercero("890903938", "BANCOLOMBIA S.A.", 0); // NIT bajo la última cuenta → descartar
    const hoja: GridHoja = { nombre: "Balance", filas, negrita };
    const r = transformarTabular(spec(), [hoja], PARAMS);
    // El detalle por tercero NO sobrevive al staging:
    expect(r.filasCrudas.some((f) => f.codigoCrudo === "0")).toBe(false);
    expect(r.filasCrudas.some((f) => f.codigoCrudo === "890903938")).toBe(false);
    // Las 24 cuentas hoja + el padre 1105 sí:
    expect(r.filasCrudas.filter((f) => /^1105\d\d$/.test(f.codigo)).length).toBe(24);
    expect(r.filasCrudas.some((f) => f.codigo === "1105")).toBe(true);
    expect(r.excepciones.some((e) => /descartado \(sin negrita\)/.test(e.regla))).toBe(true);
  });

  it("NO descarta una hoja real SIN negrita que SÍ extiende a su padre en negrita", () => {
    const filas: GridHoja["filas"] = [HDR,
      ["1105", "CAJA", 0, 0, 0, 300],
      ["110505", "CAJA GENERAL", 100, 0, 0, 100], // hoja no-negrita, extiende 1105
      ["110510", "CAJAS MENORES", 200, 0, 0, 200],
    ];
    const negrita: boolean[][] = [BOLD6, BOLD6, PLANO6, PLANO6];
    const hoja: GridHoja = { nombre: "Balance", filas, negrita };
    const r = transformarTabular(spec(), [hoja], PARAMS);
    expect(r.filasCrudas.some((f) => f.codigo === "110505")).toBe(true);
    expect(r.filasCrudas.some((f) => f.codigo === "110510")).toBe(true);
  });
});
