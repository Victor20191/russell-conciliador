import { describe, expect, it } from "vitest";
import type { RenglonConsolidadoNomina } from "./consolidado-nomina";
import {
  construirControlDeducciones,
  construirVistaSubcuenta,
  emparejarCuentaControl,
  entradasCruceFormalNomina,
  validarReparto,
  valorContableNomina,
  type FilaBalanceNomina,
} from "./cruce-nomina";

const bal = (cuenta8: string, nombreCuenta: string, debitos: number, creditos: number, saldoFinal: number): FilaBalanceNomina => ({ cuenta8, nombreCuenta, debitos, creditos, saldoFinal });

const renglon = (codigo: string, total: number, s: Partial<RenglonConsolidadoNomina["sugerencia"]>, agrupador = ""): RenglonConsolidadoNomina => ({
  clasificador: agrupador ? `${codigo} ∥ ${agrupador}` : codigo,
  codigo,
  agrupador,
  descripcion: null,
  total,
  filas: 1,
  cuentas: [],
  sugerencia: { cuentas: [], via: "sin_cuenta", motivo: "", destino: "gasto", grupo: null, subcuentaPuc: null, cuentaCliente: null, clase: null, ...s },
});

const PREFIJOS = ["5105", "5205", "7205", "7305"];

describe("valorContableNomina", () => {
  it("movimiento = débitos − créditos; saldo acumulado = saldo final", () => {
    const f = bal("510506", "SUELDOS", 47130400, 0, 545050894);
    expect(valorContableNomina(f, "movimiento")).toBe(47130400);
    expect(valorContableNomina(f, "saldo_acumulado")).toBe(545050894);
  });
});

describe("vista por subcuenta PUC sumando clases (Kakaraka)", () => {
  const balance: FilaBalanceNomina[] = [
    bal("510506", "SUELDOS", 47130400, 0, 545050894),
    bal("520506", "SUELDOS", 45011500, 0, 513139882),
    bal("720506", "SUELDOS", 0, 0, 3000225726),
    bal("720515", "HORAS EXTRAS", 0, 0, 119986796),
    bal("51054502", "ESCOLARIDAD", 0, 0, 1772750),
    bal("51054504", "NAVIDEÑO", 9343782, 0, 9343782),
    bal("520545", "AUXILIOS", 0, 0, 22978148),
    bal("720545", "AUXILIOS", 0, 0, 114244842),
    bal("23703001", "COMFAMA", 672007, 672007, -672008),
    bal("510548", "BONIFICACIONES", 0, 0, 100), // gasto de personal fuera de D1: entra a la vista
    bal("530505", "GASTOS BANCARIOS", 0, 0, 999), // otra clase: no entra
  ];
  const renglones: RenglonConsolidadoNomina[] = [
    renglon("1", 4042227980, { via: "multi", subcuentaPuc: "06", cuentas: ["510506", "520506", "720505"] }, "20"),
    renglon("207", -232800, { via: "multi", subcuentaPuc: "06" }),
    renglon("6", 16421322, { via: "multi", subcuentaPuc: "06" }),
    renglon("10", 119986796, { via: "multi", subcuentaPuc: "15" }),
    renglon("29", 138866772, { via: "multi", subcuentaPuc: "45" }),
    renglon("224", -672007, { via: "memoria_exacta", destino: "control", cuentaCliente: "2370300100" }),
    renglon("99", 500, { via: "sin_cuenta" }),
  ];
  const vista = construirVistaSubcuenta({ balance, renglones, prefijos: PREFIJOS, base: "saldo_acumulado" });

  it("SALARIOS: 510506 + 520506 + 720506 contra conceptos 1, 207 y 6 cuadra al peso", () => {
    const f = vista.filas.find((x) => x.subcuenta === "06")!;
    expect(f).toMatchObject({ etiqueta: "Sueldos", contable: 4058416502, modulo: 4058416502, diferencia: 0, cuadra: true, estado: "cuadra" });
    expect(f.cuentas.map((c) => [c.cuenta8, c.clase, c.valor])).toEqual([["510506", "51", 545050894], ["520506", "52", 513139882], ["720506", "72", 3000225726]]);
    expect(f.conceptos.map((c) => c.clasificador)).toEqual(["1 ∥ 20", "6", "207"]);
  });

  it("BONIFICACIONES: 510545 (auxiliares) + 520545 + 720545 vs concepto 29 → diferencia 9.472.750", () => {
    const f = vista.filas.find((x) => x.subcuenta === "45")!;
    expect(f).toMatchObject({ contable: 148339522, modulo: 138866772, diferencia: 9472750, cuadra: false, estado: "descuadre" });
    expect(f.cuentas).toHaveLength(4);
  });

  it("subcuentas solo contables, cuentas de otras clases y conceptos sin subcuenta", () => {
    expect(vista.filas.find((x) => x.subcuenta === "15")).toMatchObject({ contable: 119986796, modulo: 119986796, cuadra: true });
    expect(vista.filas.find((x) => x.subcuenta === "48")).toMatchObject({ contable: 100, modulo: 0, estado: "solo_contable" });
    expect(vista.filas.some((x) => x.subcuenta === "05" && x.cuentas.some((c) => c.cuenta8 === "530505"))).toBe(false);
    expect(vista.sinSubcuenta.map((c) => c.clasificador)).toEqual(["99"]);
    expect(vista.totales.diferencia).toBe(9472750 + 100);
  });
});

describe("control de deducciones", () => {
  const balance: FilaBalanceNomina[] = [
    bal("23703001", "COMFAMA", 672007, 672007, -672008),
    bal("23703002", "COOPANTEX", 40046570, 37896344, -37896344),
    bal("13659501", "PRESTAMOS EMPLEADOS", 695595, 2383185, 18381639),
    bal("13659502", "PRESTAMOS DAÑOS", 1135595, 0, 1135595),
    bal("237025", "EMBARGOS", 133860, 401580, -401580),
    bal("42100502", "INTERESES EMPLEADOS", 0, 55932, -852943),
  ];
  it("emparejarCuentaControl: exacta, hijas y recorte de pares «00» de SIIGO", () => {
    expect(emparejarCuentaControl("23703002", balance).map((f) => f.cuenta8)).toEqual(["23703002"]);
    expect(emparejarCuentaControl("2370300100", balance).map((f) => f.cuenta8)).toEqual(["23703001"]);
    expect(emparejarCuentaControl("1365950000", balance).map((f) => f.cuenta8)).toEqual(["13659501", "13659502"]);
    expect(emparejarCuentaControl("2370250000", balance).map((f) => f.cuenta8)).toEqual(["237025"]);
    expect(emparejarCuentaControl("9999990000", balance)).toEqual([]);
  });
  it("un renglón por cuenta del cliente, contable por saldo acumulado, sin bloquear nada", () => {
    const renglones: RenglonConsolidadoNomina[] = [
      renglon("224", -672007, { destino: "control", cuentaCliente: "2370300100" }),
      renglon("225", -37896344, { destino: "control", cuentaCliente: "2370300200" }),
      renglon("216", -401580, { destino: "control", cuentaCliente: "2370250000" }),
      renglon("221", -852943, { destino: "control", cuentaCliente: "4210050200" }),
      renglon("300", -1000, { destino: "control", cuentaCliente: "9999990000" }),
      renglon("1", 100, { destino: "gasto", via: "memoria_exacta", cuentas: ["510506"] }),
    ];
    const c = construirControlDeducciones({ balance, renglones, base: "saldo_acumulado" });
    const por = new Map(c.filas.map((f) => [f.cuentaCliente, f]));
    expect(por.get("2370300100")).toMatchObject({ nombre: "COMFAMA", contable: -672008, modulo: -672007, diferencia: -1, cuadra: false });
    expect(por.get("2370300200")).toMatchObject({ contable: -37896344, modulo: -37896344, cuadra: true });
    expect(por.get("2370250000")).toMatchObject({ contable: -401580, cuadra: true });
    expect(por.get("4210050200")).toMatchObject({ contable: -852943, cuadra: true });
    expect(por.get("9999990000")).toMatchObject({ contable: null, diferencia: null, cuadra: false, cuentasBalance: [] });
    expect(c.filas).toHaveLength(5);
    expect(c.totales.modulo).toBe(-672007 - 37896344 - 401580 - 852943 - 1000);
  });
  it("con base movimiento el contable es débitos − créditos", () => {
    const c = construirControlDeducciones({ balance, renglones: [renglon("216", -267720, { destino: "control", cuentaCliente: "237025" })], base: "movimiento" });
    expect(c.filas[0]).toMatchObject({ contable: -267720, cuadra: true });
  });
});

describe("entradasCruceFormalNomina", () => {
  const renglones: RenglonConsolidadoNomina[] = [
    renglon("1", 1000, { via: "multi", cuentas: ["510506", "520506"] }),
    renglon("2", 200, { via: "memoria_exacta", cuentas: ["510595"] }),
    renglon("3", 300, { via: "sugerido_nombre", cuentas: ["510536"] }),
    renglon("4", 400, { via: "archivo", cuentas: ["720505"] }),
    renglon("5", -50, { destino: "control", cuentaCliente: "2370" }),
    renglon("6", 60, { destino: "fuera" }),
  ];
  it("deterministas cruzan, sugeridas no, multi por reparto o quedan ambiguas", () => {
    const sin = entradasCruceFormalNomina(renglones, []);
    expect(sin.entradas).toEqual([
      { clasificador: "1", total: 1000, cuentas4: ["510506", "520506"] },
      { clasificador: "2", total: 200, cuentas4: ["510595"] },
      { clasificador: "3", total: 300, cuentas4: [] },
      { clasificador: "4", total: 400, cuentas4: ["720505"] },
    ]);
    expect(sin.pendientesReparto.map((r) => r.clasificador)).toEqual(["1"]);
    const con = entradasCruceFormalNomina(renglones, [{ clasificador: "1", valores: { "510506": 300, "520506": 700, "720505": 0 } }]);
    expect(con.entradas.slice(0, 2)).toEqual([
      { clasificador: "1 → 510506", total: 300, cuentas4: ["510506"] },
      { clasificador: "1 → 520506", total: 700, cuentas4: ["520506"] },
    ]);
    expect(con.repartidos).toBe(1);
    expect(con.pendientesReparto).toEqual([]);
  });
  it("validarReparto exige que la suma cierre", () => {
    expect(validarReparto(1000, { a: 300, b: 700 })).toBeNull();
    expect(validarReparto(1000, { a: 300, b: 600 })).toMatch(/no cierra/);
    expect(validarReparto(1000, {})).toMatch(/al menos una/);
    expect(validarReparto(1000, { a: Number.NaN })).toMatch(/números/);
  });
});

describe("vista por subcuenta con pasivos en la cédula", () => {
  it("un concepto que cruza contra 251010 no entra a la vista del gasto; sí a la cédula formal", () => {
    const renglones = [
      renglon("1", 100, { cuentas: ["510506"], via: "memoria_exacta", subcuentaPuc: "06" }),
      renglon("40", 30, { cuentas: ["251010"], via: "archivo", subcuentaPuc: "10", cuentaCliente: "25101001" }),
    ];
    const vista = construirVistaSubcuenta({ balance: [bal("510506", "SUELDOS", 100, 0, 100)], renglones, prefijos: PREFIJOS, base: "movimiento" });
    expect(vista.filas.map((f) => [f.subcuenta, f.modulo])).toEqual([["06", 100]]);
    expect(vista.sinSubcuenta).toEqual([]);
    expect(entradasCruceFormalNomina(renglones, []).entradas).toEqual([
      { clasificador: "1", total: 100, cuentas4: ["510506"] },
      { clasificador: "40", total: 30, cuentas4: ["251010"] },
    ]);
  });
});
