import { describe, expect, it } from "vitest";
import type { RenglonConsolidadoNomina } from "./consolidado-nomina";
import { construirCruceContable } from "../cruce-contable";
import {
  construirControlDeducciones,
  construirVistaSubcuenta,
  emparejarCuentaControl,
  entradasCruceFormalNomina,
  separarEntradasVisibles,
  subcuentaDelConcepto,
  subcuentasSoloVisibles,
  valorConceptoEnCuenta,
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
  it("deterministas cruzan, sugeridas no, y un multi va con todas sus cuentas (renglón agrupado)", () => {
    expect(entradasCruceFormalNomina(renglones)).toEqual([
      { clasificador: "1", total: 1000, cuentas4: ["510506", "520506"] },
      { clasificador: "2", total: 200, cuentas4: ["510595"] },
      { clasificador: "3", total: 300, cuentas4: [] },
      { clasificador: "4", total: 400, cuentas4: ["720505"] },
    ]);
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
    ]);
    expect(r.map((e) => [e.cuentas4[0], e.total])).toEqual([
      ["237025", 401580],
      ["237030", 38568351],
      ["421005", 852943],
      ["251010", 5000],
      ["510506", 1000],
      ["510506", -200],
      ["136595", -8295486],
    ]);
    expect(valorConceptoEnCuenta("237025", 401580)).toBe(401580);
  });
  it("una deducción con varias cuentas crédito entra en positivo al renglón agrupado; con naturalezas mezcladas, tal cual", () => {
    const r = entradasCruceFormalNomina([
      renglon("211 ∥ 1", -300, { via: "multi", cuentas: ["236505", "237025"] }),
      renglon("212 ∥ 1", -80, { via: "multi", cuentas: ["237025", "510506"] }), // crédito + gasto: sin convención única
      renglon("1 ∥ 1", 900, { via: "multi", cuentas: ["510506", "520506"] }), // gasto: no cambia
    ]);
    expect(r.map((e) => [e.clasificador, e.total])).toEqual([["211 ∥ 1", 300], ["212 ∥ 1", -80], ["1 ∥ 1", 900]]);
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
    expect(entradasCruceFormalNomina(renglones)).toEqual([
      { clasificador: "1", total: 100, cuentas4: ["510506"] },
      { clasificador: "40", total: 30, cuentas4: ["251010"] },
    ]);
  });
});

describe("cargue SIN centro: la propuesta de los centros", () => {
  it("lo propuesto desde los centros no cruza hasta que se guarde", () => {
    const r = entradasCruceFormalNomina([
      renglon("10", 5000, { via: "memoria_centros", cuentas: ["720515"] }),
      renglon("1", 9000, { via: "memoria_centros", cuentas: ["510506", "720505"] }),
    ]);
    expect(r).toEqual([
      { clasificador: "10", total: 5000, cuentas4: [] },
      { clasificador: "1", total: 9000, cuentas4: [] },
    ]);
  });
});

describe("renglones partidos por cuenta del archivo", () => {
  it("cada renglón entra a la cédula con su cuenta y su valor real", () => {
    const partidos = [
      { ...renglon("1", 900, { via: "archivo", cuentas: ["510506"] }, "GYA"), clasificador: "1 ∥ GYA # 51050601", cuentaArchivo: "51050601" },
      { ...renglon("1", 300, { via: "archivo", cuentas: ["720505"] }, "GYA"), clasificador: "1 ∥ GYA # 72050601", cuentaArchivo: "72050601" },
    ];
    expect(entradasCruceFormalNomina(partidos)).toEqual([
      { clasificador: "1 ∥ GYA # 51050601", total: 900, cuentas4: ["510506"] },
      { clasificador: "1 ∥ GYA # 72050601", total: 300, cuentas4: ["720505"] },
    ]);
  });
});

describe("concepto con varias cuentas: renglón agrupado (1/Oct/2026; sin reparto desde el 14/Oct/2026)", () => {
  it("cruza contra la SUMA de sus cuentas y absorbe los conceptos de una cuenta de ellas", () => {
    const renglones: RenglonConsolidadoNomina[] = [
      renglon("1", 1000, { via: "multi", cuentas: ["510506", "520506", "720505"] }),
      renglon("2", 50, { via: "memoria_exacta", cuentas: ["720505"] }),
      renglon("3", 30, { via: "memoria_exacta", cuentas: ["510536"] }),
    ];
    const r = construirCruceContable({
      contablePorCuenta: { "510506": 300, "520506": 200, "720505": 550, "510536": 30 },
      consolidado: entradasCruceFormalNomina(renglones),
      nombrePorCuenta: () => null,
      agruparMultiAsignados: true,
    });
    expect(r.multiAsignado).toEqual([]);
    expect(r.filas.map((f) => [f.cuenta4, f.contable, f.inventario, f.cuadra])).toEqual([
      ["510506+520506+720505", 1050, 1050, true],
      ["510536", 30, 30, true],
    ]);
    expect(r.filas[0].clasificadores).toEqual(["1"]);
  });
});

describe("vista por subcuenta: la subcuenta sale SOLO de la cuenta del cliente (2/Oct/2026)", () => {
  it("subcuentaDelConcepto: la del cliente o ninguna; la cuenta Russell no la decide", () => {
    const s = (p: Partial<RenglonConsolidadoNomina["sugerencia"]>) => renglon("x", 1, p).sugerencia;
    expect(subcuentaDelConcepto(s({ via: "memoria_exacta", cuentas: ["510595"], subcuentaPuc: "27" }))).toBe("27");
    expect(subcuentaDelConcepto(s({ via: "archivo", cuentas: ["510506"], subcuentaPuc: "06" }))).toBe("06");
    // Sin cuenta del cliente no hay subcuenta, aunque la Russell asignada la diga: los dos lados de
    // la tabla son cuentas del cliente.
    expect(subcuentaDelConcepto(s({ via: "memoria_exacta", cuentas: ["510536"] }))).toBeNull();
    expect(subcuentaDelConcepto(s({ via: "multi", cuentas: ["510506", "520506", "720505"] }))).toBeNull();
    expect(subcuentaDelConcepto(s({ via: "sugerido_nombre", cuentas: ["510506"] }))).toBeNull();
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
        renglon("1050", 697905638, { via: "multi", cuentas: ["510506", "520506", "720505"], subcuentaPuc: "06" }),
        renglon("1500", 94855262, { via: "memoria_exacta", cuentas: ["510536"], subcuentaPuc: "36" }),
        // Resuelto por la cuenta Russell pero sin cuenta del cliente: queda aparte.
        renglon("1061", 485720, { via: "memoria_exacta", cuentas: ["510506"] }),
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
        renglon("1", 1000, { via: "memoria_exacta", cuentas: ["510506"], subcuentaPuc: "06" }),
        renglon("40", 70, { via: "memoria_exacta", cuentas: ["510530"], subcuentaPuc: "30" }),
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
