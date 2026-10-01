import { describe, expect, it } from "vitest";
import type { RenglonConsolidadoNomina } from "./consolidado-nomina";
import { construirCruceContable } from "../cruce-contable";
import {
  construirControlDeducciones,
  construirVistaSubcuenta,
  emparejarCuentaControl,
  entradasCruceFormalNomina,
  pesosRepartoDeCentros,
  repartoQuedaViejo,
  repartosAplicadosNomina,
  repartoVigente,
  separarEntradasVisibles,
  subcuentaDelConcepto,
  subcuentasSoloVisibles,
  valorConceptoEnCuenta,
  validarReparto,
  valorContableNomina,
  type FilaBalanceNomina,
} from "./cruce-nomina";

const bal = (cuenta8: string, nombreCuenta: string, debitos: number, creditos: number, saldoFinal: number): FilaBalanceNomina => ({ cuenta8, nombreCuenta, debitos, creditos, saldoFinal });

const renglon = (codigo: string, total: number, s: Partial<RenglonConsolidadoNomina["sugerencia"]>, agrupador = ""): RenglonConsolidadoNomina => ({
  clasificador: agrupador ? `${codigo} ∥ ${agrupador}` : codigo,
  codigo,
  agrupador,
  cuentaArchivo: null,
  descripcion: null,
  total,
  filas: 1,
  cuentas: [],
  sugerencia: { cuentas: [], via: "sin_cuenta", motivo: "", destino: "gasto", grupo: null, subcuentaPuc: null, cuentaCliente: null, clase: null, origenCuentaArchivo: null, memoriaDistinta: null, cuentaArchivoReemplazada: null, ...s },
});

const PREFIJOS = ["5105", "5205", "7205", "7305"];

describe("valorContableNomina", () => {
  it("es el SALDO FINAL del balance al corte, no el movimiento del mes", () => {
    const f = bal("510506", "SUELDOS", 47130400, 0, 545050894);
    expect(valorContableNomina(f)).toBe(545050894);
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
  const vista = construirVistaSubcuenta({ balance, renglones, prefijos: PREFIJOS });

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
  it("un renglón por cuenta del cliente, contable por saldo final, sin bloquear nada", () => {
    const renglones: RenglonConsolidadoNomina[] = [
      renglon("224", -672007, { destino: "control", cuentaCliente: "2370300100" }),
      renglon("225", -37896344, { destino: "control", cuentaCliente: "2370300200" }),
      renglon("216", -401580, { destino: "control", cuentaCliente: "2370250000" }),
      renglon("221", -852943, { destino: "control", cuentaCliente: "4210050200" }),
      renglon("300", -1000, { destino: "control", cuentaCliente: "9999990000" }),
      renglon("1", 100, { destino: "gasto", via: "memoria_exacta", cuentas: ["510506"] }),
    ];
    const c = construirControlDeducciones({ balance, renglones });
    const por = new Map(c.filas.map((f) => [f.cuentaCliente, f]));
    expect(por.get("2370300100")).toMatchObject({ nombre: "COMFAMA", contable: -672008, modulo: -672007, diferencia: -1, cuadra: false });
    expect(por.get("2370300200")).toMatchObject({ contable: -37896344, modulo: -37896344, cuadra: true });
    expect(por.get("2370250000")).toMatchObject({ contable: -401580, cuadra: true });
    expect(por.get("4210050200")).toMatchObject({ contable: -852943, cuadra: true });
    expect(por.get("9999990000")).toMatchObject({ contable: null, diferencia: null, cuadra: false, cuentasBalance: [] });
    expect(c.filas).toHaveLength(5);
    expect(c.totales.modulo).toBe(-672007 - 37896344 - 401580 - 852943 - 1000);
  });
  it("no usa el movimiento del mes: el embargo compara su saldo final", () => {
    // Débitos − créditos de 237025 serían −267.720; su saldo final es −401.580.
    const c = construirControlDeducciones({ balance, renglones: [renglon("216", -267720, { destino: "control", cuentaCliente: "237025" })] });
    expect(c.filas[0]).toMatchObject({ contable: -401580, diferencia: -133860, cuadra: false });
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
  it("un reparto viejo no le gana a la cuenta que el auditor asignó después (Kakaraka, concepto 8)", () => {
    // El concepto estuvo «asignado a varias» y se repartió; luego se le asignó la 519505 sola.
    const conCuenta = [renglon("8 ∥ 1", 116031665, { via: "memoria_exacta", cuentas: ["519505"] })];
    const reparto = [{ clasificador: "8 ∥ 1", valores: { "510506": 2152559, "520506": 2026533, "720505": 11848733, "730505": 100003840 } }];
    const r = entradasCruceFormalNomina(conCuenta, reparto);
    expect(r.entradas).toEqual([{ clasificador: "8 ∥ 1", total: 116031665, cuentas4: ["519505"] }]);
    expect(r.repartidos).toBe(0);
    // Sigue «multi» pero con otras candidatas: el reparto tampoco rige y queda pendiente.
    const otras = [renglon("8 ∥ 1", 1000, { via: "multi", cuentas: ["510518", "520518"] })];
    const r2 = entradasCruceFormalNomina(otras, [{ clasificador: "8 ∥ 1", valores: { "510506": 400, "520506": 600 } }]);
    expect(r2.entradas).toEqual([{ clasificador: "8 ∥ 1", total: 1000, cuentas4: ["510518", "520518"] }]);
    expect(r2.pendientesReparto.map((p) => p.clasificador)).toEqual(["8 ∥ 1"]);
  });
  it("una deducción contra una cuenta crédito entra en positivo, como la presenta la contabilidad (Kakaraka)", () => {
    const r = entradasCruceFormalNomina([
      renglon("216 ∥ 20", -401580, { via: "memoria_exacta", cuentas: ["237025"] }),
      renglon("225 ∥ 1", -38568351, { via: "memoria_exacta", cuentas: ["237030"] }),
      renglon("221 ∥ 10", -852943, { via: "memoria_exacta", cuentas: ["421005"] }),
      renglon("30 ∥ 1", 5000, { via: "memoria_exacta", cuentas: ["251010"] }), // pasivo laboral: devengo, no cambia
      renglon("1 ∥ 1", 1000, { via: "memoria_exacta", cuentas: ["510506"] }), // gasto: no cambia
      renglon("90 ∥ 1", -200, { via: "memoria_exacta", cuentas: ["510506"] }), // un descuento del gasto sigue restando
      renglon("220 ∥ 10", -8295486, { via: "memoria_exacta", cuentas: ["136595"] }), // activo (débito): no cambia
    ], []);
    expect(r.entradas.map((e) => [e.cuentas4[0], e.total])).toEqual([
      ["237025", 401580],
      ["237030", 38568351],
      ["421005", 852943],
      ["251010", 5000],
      ["510506", 1000],
      ["510506", -200],
      ["136595", -8295486],
    ]);
    // El reparto de una deducción entre cuentas crédito también entra en positivo.
    const rep = entradasCruceFormalNomina(
      [renglon("211 ∥ 1", -300, { via: "multi", cuentas: ["236505", "237025"] })],
      [{ clasificador: "211 ∥ 1", valores: { "236505": -100, "237025": -200 } }],
    );
    expect(rep.entradas.map((e) => [e.cuentas4[0], e.total])).toEqual([["236505", 100], ["237025", 200]]);
    expect(valorConceptoEnCuenta("237025", 401580)).toBe(401580);
  });
  it("repartosAplicadosNomina lista cómo quedó cada reparto que rige y cuenta los que ya no aplican", () => {
    const renglones = [
      renglon("1", 1000, { via: "multi", cuentas: ["510506", "520506", "720505"] }, "20"),
      renglon("1", 50, { via: "multi", cuentas: ["510506", "520506"] }, "10"),
      renglon("8", 300, { via: "memoria_exacta", cuentas: ["519505"] }, "1"),
    ];
    const repartos: { clasificador: string; valores: Record<string, number> }[] = [
      { clasificador: "1 ∥ 10", valores: { "510506": 20, "520506": 30 } },
      { clasificador: "1 ∥ 20", valores: { "510506": 100, "720505": 900 } },
      { clasificador: "8 ∥ 1", valores: { "510506": 300 } }, // el concepto ya tiene una sola cuenta
      { clasificador: "99 ∥ 5", valores: { "510506": 1 } }, // no está en este cargue
    ];
    const { aplicados, ignorados } = repartosAplicadosNomina(renglones, repartos, { "510506": 5000, "720505": 7000 });
    expect(ignorados).toBe(2);
    expect(aplicados.map((a) => a.clasificador)).toEqual(["1 ∥ 20", "1 ∥ 10"]); // por total, de mayor a menor
    expect(aplicados[0]).toMatchObject({
      codigo: "1",
      agrupador: "20",
      total: 1000,
      cuentas: ["510506", "520506", "720505"],
      valores: { "510506": 100, "520506": 0, "720505": 900 },
      contablePorCuenta: { "510506": 5000, "520506": 0, "720505": 7000 },
    });
  });
  it("repartoVigente y repartoQuedaViejo", () => {
    expect(repartoVigente({ via: "multi", cuentas: ["510506", "520506"] }, { "510506": 1, "520506": 2 })).toBe(true);
    expect(repartoVigente({ via: "multi", cuentas: ["510506", "520506"] }, { "510506": 3, "720505": 0 })).toBe(true);
    expect(repartoVigente({ via: "memoria_exacta", cuentas: ["519505"] }, { "510506": 3 })).toBe(false);
    expect(repartoVigente({ via: "multi", cuentas: ["510506"] }, undefined)).toBe(false);
    // Al guardar el renglón: una sola cuenta u otras cuentas dejan el reparto viejo; el mismo juego no.
    expect(repartoQuedaViejo(["519505"], ["510506", "520506"])).toBe(true);
    expect(repartoQuedaViejo(["510506", "720505"], ["510506", "520506"])).toBe(true);
    expect(repartoQuedaViejo(["520506", "510506"], ["510506", "520506"])).toBe(false);
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
    const vista = construirVistaSubcuenta({ balance: [bal("510506", "SUELDOS", 100, 0, 100)], renglones, prefijos: PREFIJOS });
    expect(vista.filas.map((f) => [f.subcuenta, f.modulo])).toEqual([["06", 100]]);
    expect(vista.sinSubcuenta).toEqual([]);
    expect(entradasCruceFormalNomina(renglones, []).entradas).toEqual([
      { clasificador: "1", total: 100, cuentas4: ["510506"] },
      { clasificador: "40", total: 30, cuentas4: ["251010"] },
    ]);
  });
});

describe("cargue SIN centro: la propuesta de los centros y su reparto", () => {
  it("lo propuesto desde los centros no cruza hasta que se guarde", () => {
    const r = entradasCruceFormalNomina([
      renglon("10", 5000, { via: "memoria_centros", cuentas: ["720515"] }),
      renglon("1", 9000, { via: "memoria_centros", cuentas: ["510506", "720505"] }),
    ], []);
    expect(r.entradas).toEqual([
      { clasificador: "10", total: 5000, cuentas4: [] },
      { clasificador: "1", total: 9000, cuentas4: [] },
    ]);
    expect(r.pendientesReparto).toEqual([]);
  });

  it("pesosRepartoDeCentros suma por cuenta lo repartido en los centros del concepto", () => {
    const repartos: { clasificador: string; valores: Record<string, number> }[] = [
      { clasificador: "1 ∥ 1", valores: { "510506": 600, "520506": 0, "720505": 400 } },
      { clasificador: "1 ∥ 10", valores: { "510506": 100, "720505": 900 } },
      { clasificador: "01 ∥ 5", valores: { "510506": 50, "730505": 999 } }, // 730505 no es candidata
      { clasificador: "2 ∥ 1", valores: { "510506": 7777 } }, // otro concepto
      { clasificador: "1", valores: { "510506": 1 } }, // reparto sin centro: no cuenta
    ];
    const cuentas = ["510506", "520506", "720505"];
    expect(pesosRepartoDeCentros({ codigo: "1", agrupador: "" }, cuentas, repartos)).toEqual({ "510506": 750, "520506": 0, "720505": 1300 });
    expect(pesosRepartoDeCentros({ codigo: "1", agrupador: "10" }, cuentas, repartos)).toBeNull();
    expect(pesosRepartoDeCentros({ codigo: "29", agrupador: "" }, cuentas, repartos)).toBeNull();
    expect(pesosRepartoDeCentros({ codigo: "1", agrupador: "" }, ["730506"], repartos)).toBeNull();
  });

  it("con cuenta del archivo, los pesos de los centros solo toman los repartos de esa cuenta", () => {
    const repartos = [
      { clasificador: "1 ∥ 1 # 51050601", valores: { "510506": 600, "720505": 400 } },
      { clasificador: "1 ∥ 1 # 72050601", valores: { "510506": 5, "720505": 95 } },
      { clasificador: "1 ∥ 10", valores: { "510506": 10, "720505": 90 } }, // sin cuenta: vale para todas
    ];
    const cuentas = ["510506", "720505"];
    expect(pesosRepartoDeCentros({ codigo: "1", agrupador: "", cuentaArchivo: "51050601" }, cuentas, repartos)).toEqual({ "510506": 610, "720505": 490 });
    expect(pesosRepartoDeCentros({ codigo: "1", agrupador: "" }, cuentas, repartos)).toEqual({ "510506": 615, "720505": 585 });
  });
});

describe("renglones partidos por cuenta del archivo", () => {
  it("cada renglón entra a la cédula con su cuenta y su valor real", () => {
    const partidos = [
      { ...renglon("1", 900, { via: "archivo", cuentas: ["510506"] }, "GYA"), clasificador: "1 ∥ GYA # 51050601", cuentaArchivo: "51050601" },
      { ...renglon("1", 300, { via: "archivo", cuentas: ["720505"] }, "GYA"), clasificador: "1 ∥ GYA # 72050601", cuentaArchivo: "72050601" },
    ];
    expect(entradasCruceFormalNomina(partidos, []).entradas).toEqual([
      { clasificador: "1 ∥ GYA # 51050601", total: 900, cuentas4: ["510506"] },
      { clasificador: "1 ∥ GYA # 72050601", total: 300, cuentas4: ["720505"] },
    ]);
  });
});

describe("concepto con varias cuentas: renglón agrupado sin reparto (1/Oct/2026)", () => {
  const renglones: RenglonConsolidadoNomina[] = [
    renglon("1", 1000, { via: "multi", cuentas: ["510506", "520506", "720505"] }),
    renglon("2", 50, { via: "memoria_exacta", cuentas: ["720505"] }),
    renglon("3", 30, { via: "memoria_exacta", cuentas: ["510536"] }),
  ];
  const contablePorCuenta = { "510506": 300, "520506": 200, "720505": 550, "510536": 30 };
  const cruzar = (repartos: Parameters<typeof entradasCruceFormalNomina>[1]) =>
    construirCruceContable({
      contablePorCuenta,
      consolidado: entradasCruceFormalNomina(renglones, repartos).entradas,
      nombrePorCuenta: () => null,
      agruparMultiAsignados: true,
    });

  it("sin reparto cruza contra la SUMA de sus cuentas y absorbe los conceptos de una cuenta de ellas", () => {
    const r = cruzar([]);
    expect(r.multiAsignado).toEqual([]);
    expect(r.filas.map((f) => [f.cuenta4, f.contable, f.inventario, f.cuadra])).toEqual([
      ["510506+520506+720505", 1050, 1050, true],
      ["510536", 30, 30, true],
    ]);
    expect(r.filas[0].clasificadores).toEqual(["1"]);
  });

  it("con reparto el concepto se separa y cada cuenta vuelve a su propio renglón", () => {
    const r = cruzar([{ clasificador: "1", valores: { "510506": 300, "520506": 200, "720505": 500 } }]);
    expect(r.filas.map((f) => [f.cuenta4, f.inventario, f.cuadra])).toEqual([
      ["510506", 300, true],
      ["510536", 30, true],
      ["520506", 200, true],
      ["720505", 550, true],
    ]);
  });
});

describe("vista por subcuenta: sin cuenta del cliente, la subcuenta sale de la cuenta Russell asignada (MOTO ZONE, 1/Oct/2026)", () => {
  it("subcuentaDelConcepto: manda la del cliente; si no, la de las cuentas asignadas cuando coinciden", () => {
    const s = (p: Partial<RenglonConsolidadoNomina["sugerencia"]>) => renglon("x", 1, p).sugerencia;
    expect(subcuentaDelConcepto(s({ via: "memoria_exacta", cuentas: ["510595"], subcuentaPuc: "27" }))).toBe("27");
    expect(subcuentaDelConcepto(s({ via: "memoria_exacta", cuentas: ["510536"] }))).toBe("36");
    expect(subcuentaDelConcepto(s({ via: "multi", cuentas: ["510506", "520506", "720505"] }))).toBe("06");
    expect(subcuentaDelConcepto(s({ via: "multi", cuentas: ["510506", "510595"] }))).toBeNull(); // no coinciden
    expect(subcuentaDelConcepto(s({ via: "multi", cuentas: ["510506", "730505"] }))).toBeNull(); // 7305 no la dice
    expect(subcuentaDelConcepto(s({ via: "sugerido_nombre", cuentas: ["510506"] }))).toBeNull(); // sin confirmar
    expect(subcuentaDelConcepto(s({ via: "sin_cuenta" }))).toBeNull();
  });

  it("los conceptos asignados suman en su subcuenta y los que no la tienen quedan aparte", () => {
    const vista = construirVistaSubcuenta({
      balance: [
        bal("51050605", "SUELDOS", 0, 0, 113263780),
        bal("52050605", "SUELDOS", 0, 0, 532891532),
        bal("72050605", "SUELDOS", 0, 0, 24476000),
        bal("51053605", "PRIMA DE SERVICIOS", 0, 0, 11502638),
      ],
      renglones: [
        renglon("1050", 697905638, { via: "multi", cuentas: ["510506", "520506", "720505"] }),
        renglon("1500", 94855262, { via: "memoria_exacta", cuentas: ["510536"] }),
        renglon("1061", 485720, { via: "sugerido_nombre", cuentas: ["510506"] }),
      ],
      prefijos: PREFIJOS,
    });
    expect(vista.filas.map((f) => [f.subcuenta, f.contable, f.modulo])).toEqual([
      ["06", 670631312, 697905638],
      ["36", 11502638, 94855262],
    ]);
    expect(vista.sinSubcuenta.map((c) => c.codigo)).toEqual(["1061"]);
  });
});

describe("cuentas solo visibles (1/Oct/2026)", () => {
  const visibles = new Set(["510530", "520530", "510536", "251010"]);

  it("separarEntradasVisibles: lo asignado solo a visibles va aparte; un concepto que mezcla promueve la visible", () => {
    const r = separarEntradasVisibles([
      { clasificador: "sueldo", total: 100, cuentas4: ["510506"] },
      { clasificador: "cesantías", total: 30, cuentas4: ["510530"] },
      { clasificador: "prima por clase", total: 20, cuentas4: ["510536", "720515"] }, // mezcla: 510536 se concilia
      { clasificador: "prima ventas", total: 5, cuentas4: ["510536"] }, // comparte la promovida: se concilia
      { clasificador: "sin cuenta", total: 7, cuentas4: [] },
    ], visibles);
    expect(r.visibles.map((e) => e.clasificador)).toEqual(["cesantías"]);
    expect(r.concilian.map((e) => e.clasificador)).toEqual(["sueldo", "prima por clase", "prima ventas", "sin cuenta"]);
    expect([...r.promovidas]).toEqual(["510536"]);
  });

  it("separarEntradasVisibles: un concepto entre dos visibles queda visible", () => {
    const r = separarEntradasVisibles([{ clasificador: "cesantías", total: 30, cuentas4: ["510530", "520530"] }], visibles);
    expect(r.visibles).toHaveLength(1);
    expect(r.promovidas.size).toBe(0);
  });

  it("subcuentasSoloVisibles: las subcuentas que solo tienen cuentas visibles en 51/52/72/73", () => {
    const sub = subcuentasSoloVisibles(["510506", "520506", "510595"], ["510530", "520530", "510536", "251010", "510595"]);
    expect([...sub].sort()).toEqual(["30", "36"]); // 95 también concilia; 251010 no es de gasto
  });

  it("la vista por subcuenta deja las visibles al final y fuera de los totales", () => {
    const vista = construirVistaSubcuenta({
      balance: [bal("51050605", "SUELDOS", 0, 0, 1000), bal("51053005", "CESANTÍAS", 0, 0, 80), bal("51051905", "OTRA", 0, 0, 5)],
      renglones: [
        renglon("1", 1000, { via: "memoria_exacta", cuentas: ["510506"] }),
        renglon("40", 70, { via: "memoria_exacta", cuentas: ["510530"] }),
      ],
      prefijos: PREFIJOS,
      subcuentasVisibles: new Set(["30"]),
    });
    // La 19 no está en ninguna lista: queda arriba, con las que concilian.
    expect(vista.filas.map((f) => f.subcuenta)).toEqual(["06", "19"]);
    expect(vista.totales).toEqual({ contable: 1005, modulo: 1000, diferencia: 5 });
    expect(vista.filasVisibles.map((f) => [f.subcuenta, f.contable, f.modulo])).toEqual([["30", 80, 70]]);
    expect(vista.totalesVisibles).toEqual({ contable: 80, modulo: 70, diferencia: 10 });
  });
});
