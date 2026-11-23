import { describe, expect, it } from "vitest";
import {
  agregarFilaMovimiento,
  agregadoDesdeCaptura,
  amarrarConBalance,
  balanceAdmiteMovimientos,
  cuentaDelBalance,
  cuentasConBaseDiciembre,
  esCuentaDeImpuestos,
  detectarFilaEncabezado,
  MapeoMovimientosSchema,
  montoCelda,
  NOMBRE_SIN_TERCERO,
  nuevoAgregado,
  sugerirMapeoMovimientos,
  valorCelda,
  type CuentaBalanceAmarre,
  type MapeoMovimientos,
} from "./movimientos-tercero";

// Encabezados del reporte de SAP de MUMA («Cuentas 1.-3 enero Septiembre»).
const ENCABEZADOS_SAP = [
  "Cuenta", "Referencia", "Clase de documento", "Nº documento", "Fecha de documento", "Fe.contabilización",
  "Clave contabiliz.", "Importe en moneda local", "DB", "CR", "Centro de coste", "Acreedor",
  "Clave referencia 1", "Clave referencia 3", "Documento compras", "Texto",
];

const MAPEO_DC: MapeoMovimientos = { filaEncabezado: 1, cuenta: 1, nit: 13, nombre: 14, modo: "debito_credito", debito: 9, credito: 10, importe: 0 };
const MAPEO_IMPORTE: MapeoMovimientos = { ...MAPEO_DC, modo: "importe", debito: 0, credito: 0, importe: 8 };

/** Fila 1-based como `row.values` de exceljs. */
function fila(cuenta: string, importe: number, nit: string, nombre: string): unknown[] {
  const f: unknown[] = [];
  f[1] = cuenta;
  f[8] = importe;
  f[9] = { formula: "IF(H2>0,H2,0)", result: Math.max(importe, 0) };
  f[10] = { formula: "IF(H2<0,-H2,0)", result: Math.max(-importe, 0) };
  f[13] = nit;
  f[14] = nombre;
  return f;
}

const cuentaBalance = (cuenta8: string, movimiento: number, extra: Partial<CuentaBalanceAmarre> = {}): CuentaBalanceAmarre => ({
  cuenta8, nombreCuenta: `Cuenta ${cuenta8}`, cuenta6Russell: cuenta8.slice(0, 6), coincidencia: null,
  saldoInicial: -500, debitos: Math.max(movimiento, 0), creditos: Math.max(-movimiento, 0), saldoFinal: -500 + movimiento, ...extra,
});

describe("sugerirMapeoMovimientos", () => {
  it("reconoce el reporte de SAP de MUMA con DB y CR", () => {
    expect(sugerirMapeoMovimientos(ENCABEZADOS_SAP)).toEqual(MAPEO_DC);
  });

  it("sin DB y CR toma el importe con signo", () => {
    const sinDc = ENCABEZADOS_SAP.filter((e) => e !== "DB" && e !== "CR");
    const m = sugerirMapeoMovimientos(sinDc);
    expect(m.modo).toBe("importe");
    expect(m.importe).toBe(8);
  });

  it("detecta la fila de encabezados aunque haya un título arriba", () => {
    expect(detectarFilaEncabezado([["Reporte de movimientos"], [], ENCABEZADOS_SAP])).toBe(3);
  });
});

describe("MapeoMovimientosSchema", () => {
  it("exige débito y crédito en ese modo y no deja repetir columnas", () => {
    expect(MapeoMovimientosSchema.safeParse({ ...MAPEO_DC, credito: 0 }).success).toBe(false);
    expect(MapeoMovimientosSchema.safeParse({ ...MAPEO_DC, nombre: 13 }).success).toBe(false);
    expect(MapeoMovimientosSchema.safeParse(MAPEO_IMPORTE).success).toBe(true);
  });
});

describe("valores de celda", () => {
  it("lee el resultado de las fórmulas y los montos con formato", () => {
    expect(valorCelda({ formula: "A1", result: 12 })).toBe(12);
    expect(valorCelda({ richText: [{ text: "90" }, { text: "0" }] })).toBe("900");
    expect(montoCelda("1,500,000")).toBe(1500000);
    expect(montoCelda("(2.500,50)")).toBe(-2500.5);
    expect(montoCelda(null)).toBe(0);
    expect(montoCelda("abc")).toBeNull();
  });
});

describe("agregarFilaMovimiento", () => {
  it("suma por cuenta y tercero, con DB/CR o con importe, y deja fuera los grupos que no se guardan", () => {
    for (const mapeo of [MAPEO_DC, MAPEO_IMPORTE]) {
      const a = nuevoAgregado();
      agregarFilaMovimiento(a, fila("2365750000", -1000, "800197268", "DIAN"), mapeo, 2);
      agregarFilaMovimiento(a, fila("2365750000", -300, "900715153", "ACCORDE SAS"), mapeo, 3);
      agregarFilaMovimiento(a, fila("2365750000", 100, "900715153", "ACCORDE SAS"), mapeo, 4);
      agregarFilaMovimiento(a, fila("5105060000", 999, "900715153", "ACCORDE SAS"), mapeo, 5);
      const terceros = a.cuentas.get("2365750000")!;
      expect(terceros.size).toBe(2);
      expect(terceros.get("900715153")).toMatchObject({ nit: "900715153", nombre: "ACCORDE SAS", debitos: 100, creditos: 300 });
      expect(a.cuentas.has("5105060000")).toBe(false);
      expect(a.cuentasDescartadas).toBe(1);
      expect(a.filasUsadas).toBe(3);
    }
  });

  it("agrupa los movimientos sin NIT ni nombre en «Sin tercero»", () => {
    const a = nuevoAgregado();
    agregarFilaMovimiento(a, fila("1355151400", 269514, "", ""), MAPEO_DC, 2);
    agregarFilaMovimiento(a, fila("1355151400", -1000, "", ""), MAPEO_DC, 3);
    const t = a.cuentas.get("1355151400")!.get("sin_tercero")!;
    expect(t).toMatchObject({ nit: null, nombre: NOMBRE_SIN_TERCERO, debitos: 269514, creditos: 1000 });
    expect(a.filasSinTercero).toBe(2);
  });

  it("anota las filas con montos ilegibles y no las suma", () => {
    const a = nuevoAgregado();
    const f = fila("2365750000", 0, "900715153", "X");
    f[9] = "n/a";
    agregarFilaMovimiento(a, f, MAPEO_DC, 7);
    expect(a.montosIlegibles).toEqual([7]);
    expect(a.filasUsadas).toBe(0);
  });
});

describe("cuentaDelBalance", () => {
  it("usa la misma cuenta o la más larga del balance que sea su prefijo", () => {
    expect(cuentaDelBalance("2365750000", ["2365750000", "23657500"])).toBe("2365750000");
    expect(cuentaDelBalance("2365750001", ["236575", "23657500"])).toBe("23657500");
    expect(cuentaDelBalance("2408040000", ["2365750000"])).toBeNull();
  });
});

describe("amarrarConBalance", () => {
  const agregado = () => {
    const a = nuevoAgregado();
    agregarFilaMovimiento(a, fila("2365750000", -1000, "800197268", "DIAN"), MAPEO_DC, 2);
    agregarFilaMovimiento(a, fila("2365750000", -300, "900715153", "ACCORDE SAS"), MAPEO_DC, 3);
    agregarFilaMovimiento(a, fila("2365750000", 1000, "800197268", "DIAN"), MAPEO_DC, 4);
    return a;
  };

  it("con el movimiento neto igual guarda un renglón por tercero con saldo inicial 0 y saldo final = débitos − créditos", () => {
    const r = amarrarConBalance(agregado(), [cuentaBalance("2365750000", -300)], 2000);
    expect(r.descuadres).toEqual([]);
    expect(r.cuentasAmarradas).toBe(1);
    expect(r.filas).toEqual(expect.arrayContaining([
      expect.objectContaining({ cuenta8: "2365750000", cuenta4: "2365", cuenta6Russell: "236575", nitTercero: "800197268", saldoInicial: 0, debitos: 1000, creditos: 1000, saldoFinal: 0 }),
      expect.objectContaining({ nitTercero: "900715153", nombreTercero: "ACCORDE SAS", saldoInicial: 0, debitos: 0, creditos: 300, saldoFinal: -300 }),
    ]));
  });

  it("una cuenta que no amarra queda como descuadre y sin renglones", () => {
    const r = amarrarConBalance(agregado(), [cuentaBalance("2365750000", -9000)], 2000);
    expect(r.filas).toEqual([]);
    expect(r.descuadres).toEqual([expect.objectContaining({ cuenta8: "2365750000", movimientoBalance: -9000, movimientoArchivo: -300, diferencia: -8700 })]);
  });

  it("descuadra la cuenta del balance con movimiento que el archivo no trae, e informa la del archivo sin cuenta en el balance", () => {
    const a = agregado();
    agregarFilaMovimiento(a, fila("2408040000", -50, "900715153", "ACCORDE SAS"), MAPEO_DC, 5);
    const r = amarrarConBalance(a, [cuentaBalance("2365750000", -300), cuentaBalance("2367010000", -10000), cuentaBalance("5105060000", 7)], 2000);
    expect(r.descuadres.map((d) => d.cuenta8)).toEqual(["2367010000"]);
    expect(r.sinCuentaEnBalance).toEqual([{ cuenta: "2408040000", movimiento: -50, bloquea: true }]);
  });

  it("fuera de impuestos el descuadre es informativo: no bloquea y sus terceros se guardan", () => {
    const a = agregado();
    agregarFilaMovimiento(a, fila("2335950000", -400, "900715153", "ACCORDE SAS"), MAPEO_DC, 5);
    // 2335950000 mueve −12.819.618 en el balance y −400 en el archivo (una reclasificación que el reporte no trae).
    const r = amarrarConBalance(a, [cuentaBalance("2365750000", -300), cuentaBalance("2335950000", -12_819_618)], 2000);
    expect(r.bloqueantes).toBe(0);
    expect(r.descuadres).toEqual([expect.objectContaining({ cuenta8: "2335950000", bloquea: false })]);
    expect(r.filas.some((f) => f.cuenta8 === "2335950000" && f.nitTercero === "900715153")).toBe(true);
    // La misma diferencia en una cuenta de impuestos sí bloquea.
    expect(amarrarConBalance(a, [cuentaBalance("2365750000", -9000), cuentaBalance("2335950000", -400)], 2000).bloqueantes).toBe(1);
  });

  it("cuentas de impuestos: por homologación Russell o, sin ella, por la cuenta del cliente", () => {
    expect(esCuentaDeImpuestos("1355170100", "135517")).toBe(true);
    expect(esCuentaDeImpuestos("1355180400", "135518")).toBe(false);
    expect(esCuentaDeImpuestos("2495050000", "249505")).toBe(true);
    expect(esCuentaDeImpuestos("2408010000", null)).toBe(true);
    expect(esCuentaDeImpuestos("2205059999", "220505")).toBe(false);
  });

  it("dentro de la tolerancia amarra", () => {
    const r = amarrarConBalance(agregado(), [cuentaBalance("2365750000", -1500)], 2000);
    expect(r.descuadres).toEqual([]);
  });
});

describe("regla 2: amarre contra el cierre de diciembre", () => {
  // El balance mensual de septiembre de MUMA: su saldo anterior es el de agosto y sus débitos y
  // créditos son solo del mes. El año sale de saldo final de septiembre − saldo final de diciembre.
  const septiembre: CuentaBalanceAmarre[] = [
    { cuenta8: "2365750000", nombreCuenta: "Autorretenciones", cuenta6Russell: "236575", coincidencia: null, saldoInicial: -9_000, debitos: 100, creditos: 400, saldoFinal: -800 },
  ];
  const diciembre = [
    { cuenta8: "2365750000", nombreCuenta: "Autorretenciones", cuenta6Russell: "236575", saldoFinal: -500 },
    { cuenta8: "2367010000", nombreCuenta: "IVA retenido", cuenta6Russell: "236701", saldoFinal: -70 },
  ];

  it("la apertura de cada cuenta es su saldo final de diciembre y las que solo están en diciembre entran con saldo final 0", () => {
    const cuentas = cuentasConBaseDiciembre(septiembre, diciembre);
    expect(cuentas).toEqual([
      expect.objectContaining({ cuenta8: "2365750000", saldoInicial: -500, saldoFinal: -800, debitos: 0, creditos: 0 }),
      expect.objectContaining({ cuenta8: "2367010000", saldoInicial: -70, saldoFinal: 0 }),
    ]);
  });

  it("amarra el movimiento de enero al corte del archivo aunque el balance sea mensual", () => {
    const a = nuevoAgregado();
    agregarFilaMovimiento(a, fila("2365750000", -1000, "800197268", "DIAN"), MAPEO_DC, 2);
    agregarFilaMovimiento(a, fila("2365750000", 700, "800197268", "DIAN"), MAPEO_DC, 3);
    agregarFilaMovimiento(a, fila("2367010000", 70, "900715153", "ACCORDE SAS"), MAPEO_DC, 4);
    // Contra el saldo anterior del mensual (−9.000 → −800) no amarra: ese es el movimiento de septiembre.
    expect(amarrarConBalance(a, septiembre, 1).descuadres.map((d) => d.cuenta8)).toEqual(["2365750000"]);
    // Contra diciembre: 2365 mueve −800 − (−500) = −300 y la 2367 se saldó (0 − (−70) = 70).
    const r = amarrarConBalance(a, cuentasConBaseDiciembre(septiembre, diciembre), 1);
    expect(r.descuadres).toEqual([]);
    expect(r.cuentasAmarradas).toBe(2);
  });
});

describe("agregadoDesdeCaptura", () => {
  it("con los terceros guardados vuelve a dar las mismas diferencias que al leer el archivo", () => {
    const a = nuevoAgregado();
    agregarFilaMovimiento(a, fila("2365750000", -300, "900715153", "ACCORDE SAS"), MAPEO_DC, 2);
    agregarFilaMovimiento(a, fila("2335950000", -400, "900715153", "ACCORDE SAS"), MAPEO_DC, 3);
    const balance = [cuentaBalance("2365750000", -300), cuentaBalance("2335950000", -12_819_618)];
    const alLeer = amarrarConBalance(a, balance, 2000);
    const guardado = agregadoDesdeCaptura(alLeer.filas);
    expect(amarrarConBalance(guardado, balance, 2000).descuadres).toEqual(alLeer.descuadres);
  });
});

describe("balanceAdmiteMovimientos", () => {
  it("solo un balance que empieza el 1 de enero del año del corte", () => {
    expect(balanceAdmiteMovimientos(new Date("2026-01-01"), new Date("2026-09-30"))).toBe(true);
    expect(balanceAdmiteMovimientos(new Date("2026-07-01"), new Date("2026-09-30"))).toBe(false);
    expect(balanceAdmiteMovimientos(new Date("2025-01-01"), new Date("2026-09-30"))).toBe(false);
  });
});
