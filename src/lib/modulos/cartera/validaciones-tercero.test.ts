import { describe, expect, it } from "vitest";
import { CLAVE_EDADES, CLAVE_SALDO_REPORTADO, CLAVE_SUMA_EDADES } from "./detalle-cartera";
import { construirCruceTerceroCartera } from "./cruce-tercero-cartera";
import { naturalezaDeCuenta, validarAuxiliarTercero, type FilaValidacionTercero } from "./validaciones-tercero";

let seq = 0;
const fila = (p: Partial<FilaValidacionTercero> & { datos?: Record<string, unknown> }): FilaValidacionTercero => ({
  filaNum: p.filaNum ?? ++seq,
  valor: p.valor ?? 0,
  imputable: p.imputable ?? true,
  nitCanonico: p.nitCanonico ?? null,
  datos: p.datos ?? {},
});
const validar = (filas: FilaValidacionTercero[]) => validarAuxiliarTercero({ filas, cruce: null, umbralNaturaleza: 50_000 });

describe("validarAuxiliarTercero · edades vs total", () => {
  it("alerta cuando el archivo trae total y edades y no coinciden", () => {
    const r = validar([
      fila({ filaNum: 10, valor: 1_000, nitCanonico: "900123456", datos: { nombre: "PROVEEDOR UNO", documento: "FV-1", [CLAVE_SALDO_REPORTADO]: 1_000, [CLAVE_SUMA_EDADES]: 900 } }),
      fila({ valor: 1_000, datos: { [CLAVE_SALDO_REPORTADO]: 1_000, [CLAVE_SUMA_EDADES]: 999.5 } }), // dentro de la tolerancia
      fila({ valor: 5_000, datos: { [CLAVE_SALDO_REPORTADO]: 5_000, [CLAVE_SUMA_EDADES]: 0 } }), // por vencer, sin balde
      fila({ valor: 1_000, imputable: false, datos: { [CLAVE_SALDO_REPORTADO]: 1_000, [CLAVE_SUMA_EDADES]: 10 } }),
    ]);
    expect(r.edadesVsTotal).toEqual({
      cantidad: 1,
      filas: [{ filaNum: 10, tercero: "PROVEEDOR UNO", documento: "FV-1", total: 1_000, sumaEdades: 900, diferencia: 100 }],
    });
    expect(r.total).toBe(1);
  });
});

describe("validarAuxiliarTercero · documento repetido entre terceros", () => {
  it("agrupa el mismo documento por el mismo valor bajo terceros distintos", () => {
    const r = validar([
      fila({ filaNum: 1, valor: 296_310_000, nitCanonico: "900000001", datos: { documento: "FE-61", nombre: "PROVEEDOR A" } }),
      fila({ filaNum: 2, valor: 296_310_000, nitCanonico: "900000002", datos: { documento: "FE-61", nombre: "PROVEEDOR B" } }),
      // La factura 25 de dos proveedores, por valores distintos, no es una alerta.
      fila({ valor: 100, nitCanonico: "900000001", datos: { documento: "FV-25" } }),
      fila({ valor: 200, nitCanonico: "900000002", datos: { documento: "FV-25" } }),
      // El mismo tercero dos veces tampoco, ni un número demasiado corto.
      fila({ valor: 50, nitCanonico: "900000003", datos: { documento: "NC-9" } }),
      fila({ valor: 50, nitCanonico: "900000003", datos: { documento: "NC-9" } }),
      fila({ valor: 70, nitCanonico: "900000004", datos: { documento: "1" } }),
      fila({ valor: 70, nitCanonico: "900000005", datos: { documento: "1" } }),
      // Un rótulo del ERP sin dígitos no es un número de documento.
      fila({ valor: 50_000_000, nitCanonico: "52353927", datos: { documento: "IMPSALDO" } }),
      fila({ valor: 50_000_000, nitCanonico: "52452586", datos: { documento: "IMPSALDO" } }),
    ]);
    expect(r.documentosRepetidos).toEqual({
      cantidad: 1,
      grupos: [{
        documento: "FE-61",
        valor: 296_310_000,
        terceros: [
          { clave: "900000001", nombre: "PROVEEDOR A", filas: [1] },
          { clave: "900000002", nombre: "PROVEEDOR B", filas: [2] },
        ],
      }],
    });
  });
});

describe("validarAuxiliarTercero · posible colisión de clave", () => {
  it("avisa cuando dos identificaciones distintas caen en la misma clave con otro nombre", () => {
    // Una cédula de 10 cuyo último dígito es el DV válido de un NIT de 9 colapsa en su clave.
    const r = validar([
      fila({ valor: 10, nitCanonico: "890903938", datos: { nit: "8909039388", nombre: "PERSONA NATURAL" } }),
      fila({ valor: 10, nitCanonico: "890903938", datos: { nit: "890903938", nombre: "FACTORING S.A." } }),
      // El mismo NIT con y sin DV, con el mismo nombre, es el mismo tercero.
      fila({ valor: 10, nitCanonico: "800111222", datos: { nit: "800111222-3", nombre: "Distribuidora Uno S.A." } }),
      fila({ valor: 10, nitCanonico: "800111222", datos: { nit: "800111222", nombre: "DISTRIBUIDORA UNO SA" } }),
    ]);
    expect(r.posiblesColisiones).toEqual([{
      clave: "890903938",
      identificaciones: [
        { documento: "8909039388", nombre: "PERSONA NATURAL" },
        { documento: "890903938", nombre: "FACTORING S.A." },
      ],
    }]);
  });

  it("avisa cuando una cédula de 10 dígitos y su núcleo de 9 son terceros con otro nombre", () => {
    const r = validar([
      fila({ valor: 10, nitCanonico: "1128385972", datos: { nit: "1128385972", nombre: "PERSONA UNO" } }),
      fila({ valor: 10, nitCanonico: "112838597", datos: { nit: "112838597", nombre: "EMPRESA DOS SAS" } }),
    ]);
    expect(r.posiblesColisiones).toEqual([{
      clave: "112838597",
      identificaciones: [
        { documento: "1128385972", nombre: "PERSONA UNO" },
        { documento: "112838597", nombre: "EMPRESA DOS SAS" },
      ],
    }]);
  });
});

describe("validarAuxiliarTercero · saldo contrario a la naturaleza", () => {
  it("en CxP: proveedor con saldo débito en 2205 y anticipo con saldo crédito en 1330, sobre el umbral", () => {
    const cruce = construirCruceTerceroCartera({
      contable: [
        { clave: "900000001", cuenta6: "220505", valor: -60_000, nombre: "DEUDA AL REVÉS" },
        { clave: "900000002", cuenta6: "133005", valor: -70_000, nombre: "ANTICIPO NORMAL" },
        { clave: "900000003", cuenta6: "133005", valor: 80_000, nombre: "ANTICIPO AL REVÉS" },
        { clave: "900000004", cuenta6: "220505", valor: -10_000, nombre: "BAJO EL UMBRAL" },
      ],
      modulo: [],
      cuentasModulo: ["220505", "133005"],
    });
    const r = validarAuxiliarTercero({ filas: [], cruce, naturaleza: "C", umbralNaturaleza: 50_000 });
    expect(r.saldosContrarios).toEqual({
      cantidad: 2,
      filas: [
        { clave: "900000003", nombre: "ANTICIPO AL REVÉS", cuenta: "133005", valor: 80_000 },
        { clave: "900000001", nombre: "DEUDA AL REVÉS", cuenta: "220505", valor: -60_000 },
      ],
    });
  });

  it("sin naturaleza declarada no evalúa saldos contrarios", () => {
    const cruce = construirCruceTerceroCartera({
      contable: [{ clave: "900000001", cuenta6: "413595", valor: 900_000, nombre: null }],
      modulo: [],
      cuentasModulo: null,
    });
    expect(validarAuxiliarTercero({ filas: [], cruce, umbralNaturaleza: 50_000 }).saldosContrarios.cantidad).toBe(0);
  });

  it("naturaleza por clase PUC", () => {
    expect(["130505", "220505", "280505", "413595", "513505", "000000"].map(naturalezaDeCuenta)).toEqual(["D", "C", "C", "C", "D", null]);
  });
});

describe("validarAuxiliarTercero · fecha de corte y días", () => {
  const conCorte = (filas: FilaValidacionTercero[]) =>
    validarAuxiliarTercero({ filas, cruce: null, umbralNaturaleza: 50_000, fechaCorte: "2025-12-31" });
  const documento = (filaNum: number, datos: Record<string, unknown>) => fila({ filaNum, valor: 100, nitCanonico: "900000001", datos });

  it("deduce que los días se calcularon a otra fecha y lista los documentos que no cuadran con el corte", () => {
    const r = conCorte([
      documento(1, { vencimiento: "2025-12-19", diasVencidos: 25 }),
      documento(2, { vencimiento: "2025-12-30", diasVencidos: 14 }),
      documento(3, { vencimiento: "2026-01-11", diasVencidos: 2 }),
      documento(4, { vencimiento: "2025-12-01", diasVencidos: 30 }), // cuadra al 31/12
    ]);
    expect(r.corte).toEqual({ fecha: "2025-12-31", deducido: { fecha: "2026-01-13", coincidencias: 3, filasConDias: 4 } });
    expect(r.diasVsCorte.filas.map((f) => [f.filaNum, f.diasArchivo, f.diasAlCorte])).toEqual([[1, 25, 12], [2, 14, 1], [3, 2, -11]]);
    expect(r.total).toBe(4);
  });

  it("lo que aún no vence con 0 días cuadra; un vencimiento imposible se aparta", () => {
    const r = conCorte([
      documento(1, { vencimiento: "2026-01-29", diasVencidos: 0 }),
      documento(2, { vencimiento: "2202-06-09" }),
      documento(3, { vencimiento: "31/12/2025", diasVencidos: 0 }),
    ]);
    expect(r.diasVsCorte.cantidad).toBe(0);
    expect(r.vencimientosAtipicos.filas.map((f) => f.filaNum)).toEqual([2]);
    expect(r.corte.deducido).toBeNull();
  });

  it("el balde de edad tiene que corresponder a los días al corte", () => {
    const edades = (e: Record<string, number>) => ({ [CLAVE_EDADES]: e });
    const r = conCorte([
      documento(1, { vencimiento: "2025-12-01", ...edades({ "1 a 30": 100, "31 a 60": 0 }) }), // 30 días: bien
      documento(2, { vencimiento: "2026-01-15", ...edades({ "1 a 30": 100 }) }), // aún no vence
      documento(3, { vencimiento: "2025-09-01", ...edades({ "Sin vencer": 100 }) }), // 121 días como corriente
      documento(4, { vencimiento: "2026-01-15", ...edades({ "0 - 30": 100 }) }), // «0 - 30» admite lo por vencer
    ]);
    expect(r.edadVsCorte.filas.map((f) => [f.filaNum, f.rango, f.diasAlCorte])).toEqual([[2, "1 a 30", -15], [3, "Sin vencer", 121]]);
  });

  it("sin fecha de corte no evalúa los días", () => {
    const r = validarAuxiliarTercero({ filas: [documento(1, { vencimiento: "2025-12-19", diasVencidos: 99 })], cruce: null, umbralNaturaleza: 50_000 });
    expect([r.corte, r.diasVsCorte.cantidad]).toEqual([{ fecha: null, deducido: null }, 0]);
  });
});
