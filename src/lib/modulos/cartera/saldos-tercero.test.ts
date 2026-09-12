import { describe, expect, it } from "vitest";
import {
  compararSaldosTercero,
  materializarSaldosTercero,
  type FilaCarteraDetalle,
} from "./saldos-tercero";

const fila = (p: Partial<FilaCarteraDetalle> & { filaNum: number }): FilaCarteraDetalle => ({
  valor: 0,
  imputable: true,
  nivel: "documento",
  ...p,
});

const opciones = { loteId: "lote-1", nivelImputable: "documento" as const };

describe("materializarSaldosTercero · reporte por documento", () => {
  const filas = [
    fila({ filaNum: 1, nit: "900123456", nombre: "CLIENTE UNO", valor: 1_000_000, diasVencidos: 30 }),
    fila({ filaNum: 2, nit: "900123456", nombre: "CLIENTE UNO", valor: 500_000, diasVencidos: 120 }),
    fila({ filaNum: 3, nit: "800987654", nombre: "CLIENTE DOS", valor: 250_000, diasVencidos: 5 }),
  ];

  it("agrega los documentos de cada tercero", () => {
    const saldos = materializarSaldosTercero(filas, opciones).saldos;
    expect(saldos).toHaveLength(2);
    expect(saldos.map((s) => [s.claveTercero, s.saldo, s.documentos])).toEqual([
      ["800987654", 250_000, 1],
      ["900123456", 1_500_000, 2],
    ]);
    expect(saldos.every((s) => s.origen === "agregado" && s.nivel === "documento")).toBe(true);
  });

  it("se queda con la mora más alta del tercero", () => {
    const uno = materializarSaldosTercero(filas, opciones).saldos.find((s) => s.claveTercero === "900123456");
    expect(uno?.diasMax).toBe(120);
  });

  it("conserva el nombre aunque solo venga en una de las filas", () => {
    const { saldos } = materializarSaldosTercero(
      [
        fila({ filaNum: 1, nit: "900123456", nombre: "CLIENTE UNO", valor: 100 }),
        fila({ filaNum: 2, nit: "900123456", nombre: null, valor: 200 }),
      ],
      opciones,
    );
    expect(saldos[0].nombre).toBe("CLIENTE UNO");
  });

  it("separa por cuenta y por origen nacional/exterior", () => {
    const { saldos } = materializarSaldosTercero(
      [
        fila({ filaNum: 1, nit: "900123456", valor: 100, cuentaCliente: "130505", origenCartera: "nacional" }),
        fila({ filaNum: 2, nit: "900123456", valor: 200, cuentaCliente: "130510", origenCartera: "exterior" }),
      ],
      opciones,
    );
    expect(saldos.map((s) => [s.cuentaCliente, s.origenCartera, s.saldo])).toEqual([
      ["130505", "nacional", 100],
      ["130510", "exterior", 200],
    ]);
  });
});

describe("materializarSaldosTercero · reporte por tercero con edades", () => {
  it("una fila por tercero, con los baldes tal como los rotula el ERP", () => {
    const { saldos } = materializarSaldosTercero(
      [
        fila({
          filaNum: 1, nivel: "tercero", nit: "800197463", nombre: "POLLOS",
          valor: 4_000_000, sumaEdades: 4_000_000,
          edades: { "1 - 30 DIAS": 1_000_000, "POR VENCER": 3_000_000 },
        }),
      ],
      { loteId: "lote-1", nivelImputable: "tercero" },
    );
    expect(saldos[0]).toMatchObject({
      origen: "imputable", nivel: "tercero", claveTercero: "800197463", saldo: 4_000_000,
      edades: { "1 - 30 DIAS": 1_000_000, "POR VENCER": 3_000_000 },
      documentos: 0,
    });
  });

  it("suma los baldes cuando el tercero aparece en varias filas", () => {
    const { saldos } = materializarSaldosTercero(
      [
        fila({ filaNum: 1, nit: "900123456", valor: 100, edades: { "1 - 30": 100, "POR VENCER": 0 } }),
        fila({ filaNum: 2, nit: "900123456", valor: 200, edades: { "1 - 30": 0, "POR VENCER": 200 } }),
      ],
      opciones,
    );
    expect(saldos[0].edades).toEqual({ "1 - 30": 100, "POR VENCER": 200 });
  });
});

describe("materializarSaldosTercero · lo que NO imputa", () => {
  it("la cabecera de un tercero queda como DECLARADO y no suma", () => {
    const { saldos } = materializarSaldosTercero(
      [
        fila({ filaNum: 1, nivel: "tercero", imputable: false, nit: "900123456", nombre: "UNO", saldoDeclarado: 1_500_000 }),
        fila({ filaNum: 2, nit: "900123456", valor: 1_000_000 }),
        fila({ filaNum: 3, nit: "900123456", valor: 500_000 }),
      ],
      opciones,
    );
    const declarado = saldos.find((s) => s.origen === "declarado");
    const agregado = saldos.find((s) => s.origen === "agregado");
    expect(declarado?.saldo).toBe(1_500_000);
    expect(agregado?.saldo).toBe(1_500_000);
  });

  it("un archivo del OTRO nivel entra como control, nunca suma", () => {
    // El período imputa por documento; llega además el resumen por edades.
    const { saldos } = materializarSaldosTercero(
      [
        fila({ filaNum: 1, nit: "900123456", valor: 900_000 }),
        fila({ filaNum: 2, nivel: "tercero", imputable: false, nit: "900123456", valor: 900_000 }),
      ],
      opciones,
    );
    expect(saldos.map((s) => [s.origen, s.saldo])).toEqual([["agregado", 900_000], ["declarado", 900_000]]);
  });

  it("una fila sin identificador ni nombre no se atribuye a nadie, y se REPORTA", () => {
    // Que no se pueda atribuir no significa que se pueda perder: el cargue tiene que
    // enterarse. Es el mismo defecto que la fila «clase 0» del balance, en otro sitio.
    const r = materializarSaldosTercero([fila({ filaNum: 1, valor: 1_000 })], opciones);
    expect(r.saldos).toEqual([]);
    expect(r.sinAtribuir).toEqual({ filas: 1, monto: 1_000 });
  });

  it("lo que sí se atribuye no cuenta como pérdida", () => {
    const r = materializarSaldosTercero([fila({ filaNum: 1, nit: "900123456", valor: 1_000 })], opciones);
    expect(r.sinAtribuir).toEqual({ filas: 0, monto: 0 });
  });

  it("una fila de CONTROL sin tercero no es una pérdida: no altera ningún total", () => {
    const r = materializarSaldosTercero(
      [fila({ filaNum: 1, nivel: "tercero", imputable: false, valor: 5_000 })],
      opciones,
    );
    expect(r.sinAtribuir.monto).toBe(0);
  });

  it("un tercero sin NIT se agrupa por su nombre, para poder emparejarlo a mano", () => {
    const { saldos } = materializarSaldosTercero(
      [fila({ filaNum: 1, nit: null, nombre: "CONSUMIDOR FINAL", valor: 50_000 })],
      opciones,
    );
    expect(saldos[0].claveTercero).toBe("~CONSUMIDOR FINAL");
  });
});

describe("compararSaldosTercero · el control que certifica la lectura", () => {
  const saldos = (pares: [string, "declarado" | "agregado", number][]) =>
    pares.map(([clave, origen, saldo]) => ({
      loteId: "l", nivel: "documento" as const, origen, cuentaCliente: "", origenCartera: "",
      claveTercero: clave, nitOriginal: clave, dv: null, sucursal: null, nombre: null,
      saldo, saldoReportado: null, sumaEdades: null, edades: null, documentos: 0, diasMax: null,
    }));

  it("cuadra cuando lo declarado iguala lo calculado", () => {
    const r = compararSaldosTercero(saldos([["900123456", "declarado", 1_000], ["900123456", "agregado", 1_000]]));
    expect(r.filas[0].estado).toBe("cuadra");
    expect(r.conDiferencia).toBe(0);
    expect(r.totales).toEqual({ declarado: 1_000, calculado: 1_000, diferencia: 0 });
  });

  it("tolera un peso de redondeo", () => {
    const r = compararSaldosTercero(saldos([["900123456", "declarado", 1_001], ["900123456", "agregado", 1_000]]));
    expect(r.filas[0].estado).toBe("cuadra");
  });

  it("señala el descuadre con su monto", () => {
    const r = compararSaldosTercero(saldos([["900123456", "declarado", 1_500], ["900123456", "agregado", 1_000]]));
    expect(r.filas[0]).toMatchObject({ estado: "descuadre", diferencia: 500 });
    expect(r.conDiferencia).toBe(1);
  });

  it("distingue al que solo está en un lado", () => {
    const r = compararSaldosTercero(saldos([["900123456", "declarado", 1_000], ["800987654", "agregado", 500]]));
    const porClave = new Map(r.filas.map((f) => [f.claveTercero, f.estado]));
    expect(porClave.get("900123456")).toBe("solo_declarado");
    expect(porClave.get("800987654")).toBe("solo_calculado");
    expect(r.conDiferencia).toBe(2);
  });

  it("sin nada declarado no inventa descuadres… pero sí lista lo calculado", () => {
    const r = compararSaldosTercero(saldos([["900123456", "agregado", 1_000]]));
    expect(r.filas[0].estado).toBe("solo_calculado");
    expect(r.totales.declarado).toBe(0);
  });
});
