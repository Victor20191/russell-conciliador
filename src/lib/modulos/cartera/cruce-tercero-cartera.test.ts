import { describe, expect, it } from "vitest";
import {
  construirCruceTerceroCartera,
  nombreComparable,
  validarEmparejamientoTercero,
  type MovimientoContableTercero,
  type SaldoModuloTercero,
} from "./cruce-tercero-cartera";

const CAR = ["130505", "130510", "280505"];
const CXP = ["220505", "221005", "233595", "133005"];

const contable = (clave: string | null, cuenta6: string, valor: number, nombre: string | null = null): MovimientoContableTercero =>
  ({ clave, cuenta6, valor, nombre });
const modulo = (clave: string | null, saldo: number, extra: Partial<SaldoModuloTercero> = {}): SaldoModuloTercero =>
  ({ clave, saldo, nombre: null, origenCartera: null, cuenta6: null, ...extra });

describe("construirCruceTerceroCartera", () => {
  it("neta las cuentas del tercero con su signo: el anticipo resta en ambos lados", () => {
    const r = construirCruceTerceroCartera({
      contable: [contable("900123456", "130505", 1_000_000, "CLIENTE UNO"), contable("900123456", "280505", -200_000)],
      modulo: [modulo("900123456", 1_000_000, { origenCartera: "nacional" }), modulo("900123456", -200_000, { origenCartera: "nacional" })],
      cuentasModulo: CAR,
    });
    expect(r.filas).toEqual([{
      clave: "900123456",
      nombre: "CLIENTE UNO",
      sinNit: false,
      claveModuloPorDv: null,
      claveModuloPorNucleo: null,
      sugerencia: null,
      explicaDiferencia: null,
      emparejadoDesde: [],
      separadoDe: [],
      contable: { porCuenta: { "130505": 1_000_000, "280505": -200_000 }, total: 800_000 },
      modulo: { nacional: 800_000, exterior: 0, sinOrigen: 0, total: 800_000 },
      diferencia: 0,
      estado: "cuadra",
    }]);
    expect(r.cuentas).toEqual(["130505", "280505"]);
    expect(r.totales).toEqual({ contable: 800_000, modulo: 800_000, diferencia: 0, porCuenta: { "130505": 1_000_000, "280505": -200_000 } });
  });

  it("separa lo nacional y lo exterior del auxiliar en el mismo renglón", () => {
    const r = construirCruceTerceroCartera({
      contable: [contable("800111222", "130505", 500), contable("800111222", "130510", 300)],
      modulo: [modulo("800111222", 500, { origenCartera: "nacional" }), modulo("800111222", 300.004, { origenCartera: "exterior" })],
      cuentasModulo: CAR,
    });
    expect(r.filas[0]).toMatchObject({ estado: "cuadra", modulo: { nacional: 500, exterior: 300, sinOrigen: 0, total: 300 + 500 } });
  });

  it("informa aparte las cuentas del grupo que no son del módulo y las filas sin tercero", () => {
    const r = construirCruceTerceroCartera({
      contable: [
        contable("900123456", "130505", 100),
        contable("900123456", "130515", 40), // trabajadores: fuera de Cartera
        contable("800999888", "130520", 60),
        contable(null, "130505", 25), // cuenta sin detalle por tercero
      ],
      modulo: [modulo("900123456", 100), modulo("900123456", 40, { cuenta6: "130515" }), modulo(null, 7)],
      cuentasModulo: CAR,
    });
    expect(r.filas).toHaveLength(1);
    expect(r.filas[0]).toMatchObject({ clave: "900123456", estado: "cuadra" });
    expect(r.contableFueraDelModulo).toEqual({ total: 100, filas: 2, porCuenta: { "130515": 40, "130520": 60 } });
    expect(r.contableSinTercero).toEqual({ total: 25, filas: 1, porCuenta: { "130505": 25 } });
    expect(r.moduloFueraDelModulo).toEqual({ total: 40, filas: 1, porCuenta: { "130515": 40 } });
    expect(r.moduloSinTercero).toEqual({ total: 7, filas: 1 });
  });

  it("lo que el Consolidado no asignó a una cuenta del módulo no entra y se dice qué cuenta del archivo falta", () => {
    // CxP de Aceros Mapa: 241205 (industria y comercio) no es una cuenta del módulo.
    const r = construirCruceTerceroCartera({
      contable: [contable("900123456", "220505", 100)],
      modulo: [
        modulo("900123456", 100, { cuenta6: "220505", cuentaArchivo: "22050501" }),
        modulo("890399011", 49_249_000, { sinCuentaDelModulo: true, cuentaArchivo: "241205" }),
        modulo("890980093", 231_649_000, { sinCuentaDelModulo: true, cuentaArchivo: "241205" }),
      ],
      cuentasModulo: CXP,
    });
    expect(r.filas.map((f) => [f.clave, f.estado])).toEqual([["900123456", "cuadra"]]);
    expect(r.moduloFueraDelModulo).toEqual({ total: 280_898_000, filas: 2, porCuenta: { "241205": 280_898_000 } });
  });

  it("clasifica y ordena: diferencias por magnitud, luego lo que cuadra y al final lo que no tiene saldo", () => {
    const r = construirCruceTerceroCartera({
      contable: [
        contable("100000001", "220505", 50),
        contable("100000002", "220505", 1_000),
        contable("100000003", "220505", 500),
        contable("100000005", "220505", 0),
      ],
      modulo: [modulo("100000001", 50), modulo("100000002", 900), modulo("100000004", 2_000)],
      cuentasModulo: CXP,
    });
    expect(r.filas.map((f) => [f.clave, f.estado, f.diferencia])).toEqual([
      ["100000004", "solo_modulo", -2_000],
      ["100000003", "solo_contable", 500],
      ["100000002", "descuadre", 100],
      ["100000001", "cuadra", 0],
      ["100000005", "sin_saldo", 0],
    ]);
    expect(r.conteo).toEqual({ cuadra: 1, descuadre: 1, solo_contable: 1, solo_modulo: 1, sin_saldo: 1 });
    expect(r.totales).toMatchObject({ contable: 1_550, modulo: 2_950, diferencia: -1_400 });
  });

  it("en CxP el anticipo 133005 resta de la deuda del proveedor", () => {
    const r = construirCruceTerceroCartera({
      contable: [contable("900555666", "220505", 1_000), contable("900555666", "133005", -300)],
      modulo: [modulo("900555666", 700)],
      cuentasModulo: CXP,
    });
    expect(r.filas[0]).toMatchObject({ estado: "cuadra", contable: { total: 700 } });
  });

  it("cruza por nombre los terceros sin NIT y los marca", () => {
    const r = construirCruceTerceroCartera({
      contable: [contable("~CONSUMIDOR FINAL", "130505", 80, "Consumidor final")],
      modulo: [modulo("~CONSUMIDOR FINAL", 80)],
      cuentasModulo: CAR,
    });
    expect(r.filas[0]).toMatchObject({ sinNit: true, estado: "cuadra", nombre: "Consumidor final" });
    expect(r.sinNit).toBe(1);
  });

  it("empareja por núcleo una captura antigua truncada, y lo marca", () => {
    const r = construirCruceTerceroCartera({
      contable: [contable("112838597", "130505", 300)],
      modulo: [modulo("1128385972", 300)],
      cuentasModulo: CAR,
    });
    expect(r.filas).toEqual([expect.objectContaining({ clave: "112838597", claveModuloPorNucleo: "1128385972", estado: "cuadra" })]);
    expect(r.porNucleo).toBe(1);
  });

  it("no une por núcleo dos documentos completos distintos ni un núcleo con varios candidatos", () => {
    const completos = construirCruceTerceroCartera({
      contable: [contable("1128385972", "130505", 300)],
      modulo: [modulo("1128385973", 300)],
      cuentasModulo: CAR,
    });
    expect(completos.filas.map((f) => [f.clave, f.estado])).toEqual([["1128385972", "solo_contable"], ["1128385973", "solo_modulo"]]);
    expect(completos.porNucleo).toBe(0);

    const ambiguo = construirCruceTerceroCartera({
      contable: [contable("112838597", "130505", 300)],
      modulo: [modulo("1128385972", 300), modulo("1128385973", 10)],
      cuentasModulo: CAR,
    });
    expect(ambiguo.porNucleo).toBe(0);
    expect(ambiguo.filas).toHaveLength(3);
  });

  it("une por DV el NIT del auxiliar con el mismo NIT más su dígito de verificación en el balance, y lo marca", () => {
    // Captura real: el auxiliar trae 41954149 (con nombre) y el balance 419541491 (sin nombre), mismo saldo.
    const r = construirCruceTerceroCartera({
      contable: [contable("419541491", "130505", 13_162_956), contable("717448229", "130505", 7_280_668)],
      modulo: [modulo("41954149", 13_162_956, { nombre: "RACING MOSTER/GAITAN REYES LINA MARCELA" }), modulo("71744822", 7_280_668)],
      cuentasModulo: CAR,
    });
    expect(r.filas.map((f) => [f.clave, f.claveModuloPorDv, f.estado, f.nombre])).toEqual([
      ["419541491", "41954149", "cuadra", "RACING MOSTER/GAITAN REYES LINA MARCELA"],
      ["717448229", "71744822", "cuadra", null],
    ]);
    expect(r.porDv).toBe(2);
    expect(r.porNucleo).toBe(0);
    expect(r.sugerencias).toEqual([]);
  });

  it("une por DV también cuando el dígito de verificación viene en el auxiliar", () => {
    const r = construirCruceTerceroCartera({
      contable: [contable("41954149", "130505", 100)],
      modulo: [modulo("419541491", 100)],
      cuentasModulo: CAR,
    });
    expect(r.filas).toEqual([expect.objectContaining({ clave: "41954149", claveModuloPorDv: "419541491", estado: "cuadra" })]);
  });

  it("no une por DV cuando el dígito de más no es el DV válido ni cuando hay varios candidatos", () => {
    const invalido = construirCruceTerceroCartera({
      contable: [contable("419541495", "130505", 100)], // el DV de 41954149 es 1, no 5
      modulo: [modulo("41954149", 100)],
      cuentasModulo: CAR,
    });
    expect(invalido.porDv).toBe(0);
    expect(invalido.filas.map((f) => f.estado).sort()).toEqual(["solo_contable", "solo_modulo"]);

    const ambiguo = construirCruceTerceroCartera({
      contable: [contable("419541491", "130505", 100), contable("41954149", "130505", 50)],
      modulo: [modulo("41954149", 100)],
      cuentasModulo: CAR,
    });
    // 41954149 cruza exacto con el balance; 419541491 queda suelto y no se une con una clave que ya cruza.
    expect(ambiguo.porDv).toBe(0);
    expect(ambiguo.filas.map((f) => [f.clave, f.estado])).toEqual([["419541491", "solo_contable"], ["41954149", "descuadre"]]);
  });

  it("respeta la separación del auditor: el par separado no se une por DV ni por núcleo y queda anotado", () => {
    const r = construirCruceTerceroCartera({
      contable: [contable("419541491", "130505", 100), contable("112838597", "130505", 300)],
      modulo: [modulo("41954149", 100), modulo("1128385972", 300)],
      cuentasModulo: CAR,
      separaciones: [
        { claveModulo: "41954149", claveBalance: "419541491" },
        { claveModulo: "1128385972", claveBalance: "112838597" },
      ],
    });
    expect(r.porDv).toBe(0);
    expect(r.porNucleo).toBe(0);
    expect(r.filas).toHaveLength(4);
    const porClave = Object.fromEntries(r.filas.map((f) => [f.clave, f]));
    expect(porClave["419541491"]).toMatchObject({ estado: "solo_contable", separadoDe: ["41954149"], sugerencia: null });
    expect(porClave["112838597"]).toMatchObject({ estado: "solo_contable", separadoDe: ["1128385972"], sugerencia: null });
    expect(r.sugerencias).toEqual([]);
  });

  it("sin cuentas del módulo declaradas, todas las del grupo entran al cruce", () => {
    const r = construirCruceTerceroCartera({
      contable: [contable("900123456", "413595", -500)],
      modulo: [modulo("900123456", -500)],
      cuentasModulo: null,
    });
    expect(r.filas[0].estado).toBe("cuadra");
    expect(r.contableFueraDelModulo.filas).toBe(0);
  });
});

describe("sugerencias por nombre", () => {
  it("normaliza tildes, puntuación y forma societaria", () => {
    expect(["APORTES EN LÍNEA S.A.", "Aportes en Linea SAS", "Aportes & Cía Ltda.", "  "].map(nombreComparable))
      .toEqual(["APORTES EN LINEA", "APORTES EN LINEA", "APORTES", null]);
  });

  it("sugiere el NIT del balance para el proveedor que el auxiliar trae sin NIT", () => {
    const r = construirCruceTerceroCartera({
      contable: [contable("900123456", "233595", 80_794_100, "APORTES EN LÍNEA S.A.")],
      modulo: [modulo("~APORTES EN LINEA SA", 80_794_100, { nombre: "APORTES EN LINEA SA" })],
      cuentasModulo: CXP,
    });
    expect(r.sugerencias).toEqual([expect.objectContaining({ claveModulo: "~APORTES EN LINEA SA", claveBalance: "900123456", senales: ["saldo", "nombre"], confianza: "alta" })]);
    const porClave = Object.fromEntries(r.filas.map((f) => [f.clave, f.sugerencia]));
    expect(porClave).toEqual({
      "900123456": { clave: "~APORTES EN LINEA SA", nombre: "APORTES EN LINEA SA", senales: ["saldo", "nombre"], confianza: "alta" },
      "~APORTES EN LINEA SA": { clave: "900123456", nombre: "APORTES EN LÍNEA S.A.", senales: ["saldo", "nombre"], confianza: "alta" },
    });
  });

  it("no sugiere cuando el nombre tiene más de un candidato o el tercero ya cruza", () => {
    const r = construirCruceTerceroCartera({
      contable: [
        contable("900000001", "220505", 10, "BANCOLOMBIA S.A."),
        contable("900000002", "220505", 20, "Bancolombia SA"),
        contable("900000003", "220505", 30, "UNO"),
      ],
      modulo: [modulo("~BANCOLOMBIA", 30, { nombre: "BANCOLOMBIA" }), modulo("900000003", 30, { nombre: "UNO" }), modulo("~UNO", 5, { nombre: "UNO" })],
      cuentasModulo: CXP,
    });
    expect(r.sugerencias).toEqual([]);
    expect(r.filas.every((f) => f.sugerencia === null)).toBe(true);
  });
});

describe("emparejamientos manuales", () => {
  it("lee las claves del auxiliar como la del balance (N:1) y deja constancia en el renglón", () => {
    const r = construirCruceTerceroCartera({
      contable: [contable("900123456", "233595", 1_000, "APORTES EN LINEA S.A.")],
      modulo: [
        modulo("~APORTES EN LINEA", 600, { nombre: "APORTES EN LINEA" }),
        modulo("~APORTES LINEA BOGOTA", 400, { nombre: "APORTES LINEA BOGOTA" }),
      ],
      cuentasModulo: CXP,
      emparejamientos: [
        { claveModulo: "~APORTES EN LINEA", claveBalance: "900123456" },
        { claveModulo: "~APORTES LINEA BOGOTA", claveBalance: "900123456" },
      ],
    });
    expect(r.filas).toHaveLength(1);
    expect(r.filas[0]).toMatchObject({
      clave: "900123456",
      estado: "cuadra",
      emparejadoDesde: ["~APORTES EN LINEA", "~APORTES LINEA BOGOTA"],
      modulo: { total: 1_000 },
    });
  });

  it("valida el emparejamiento contra el cruce vigente", () => {
    const r = construirCruceTerceroCartera({
      contable: [contable("900000001", "233595", 10, "UNO"), contable("900000002", "233595", 5, "DOS")],
      modulo: [modulo("~UNO", 10, { nombre: "UNO" }), modulo("900000002", 5)],
      cuentasModulo: CXP,
    });
    expect(validarEmparejamientoTercero(r, "~UNO", "900000001")).toEqual({ ok: true });
    expect(validarEmparejamientoTercero(r, "900000002", "900000001").ok).toBe(false); // ya cruza
    expect(validarEmparejamientoTercero(r, "~UNO", "900000009").ok).toBe(false); // no está en la contabilidad
    expect(validarEmparejamientoTercero(r, "~UNO", "~UNO").ok).toBe(false);
  });
});

describe("diferencia explicada por un tercero suelto", () => {
  it("señala el tercero solo en contabilidad cuyo saldo es la diferencia del descuadre", () => {
    const r = construirCruceTerceroCartera({
      contable: [contable("890903938", "220505", 189_767_845.67, "BANCOLOMBIA SA"), contable("860059294", "220505", 14_329_514)],
      modulo: [modulo("890903938", 204_097_359.67)],
      cuentasModulo: null,
    });
    const porClave = Object.fromEntries(r.filas.map((f) => [f.clave, f]));
    expect(porClave["890903938"].explicaDiferencia).toMatchObject({ clave: "860059294", rol: "suelto", ladoSuelto: "contable" });
    expect(porClave["860059294"].explicaDiferencia).toMatchObject({ clave: "890903938", rol: "descuadre" });
  });

  it("no señala nada si hay dos sueltos con el mismo importe", () => {
    const r = construirCruceTerceroCartera({
      contable: [contable("890903938", "220505", 90), contable("1", "220505", 10), contable("2", "220505", 10)],
      modulo: [modulo("890903938", 100)],
      cuentasModulo: null,
    });
    expect(r.filas.every((f) => f.explicaDiferencia === null)).toBe(true);
  });
});
