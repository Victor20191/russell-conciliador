import { describe, expect, it } from "vitest";
import { alcanceCierreImpuesto, RST } from "../impuestos-dian";
import { CUENTAS_SIN_RESTA_DIAN_FABRICA, cuentasDeMapeo } from "../mapeo-dian";
import { cruceRetencion, impuestoDelCruce, type EntradaCruce, type FilaTerceroContable } from "../retencion/cruce";
import { periodosRevision, type Formulario350 } from "../retencion/periodos-revision";
import type { MunicipioIca } from "./ica-municipios";
import { CUENTAS_INGRESOS_F2593, MAPEO_F2593_FABRICA } from "./mapeo-f2593";

const f2593 = (id: number, periodo: number, valores: Record<number, number>): Formulario350 & { periodo: number } => ({
  id, periodo, numero: `259366121721${String(id).padStart(2, "0")}`, codigoCorreccion: null, numeroAnterior: null, fechaPresentacion: null, valores,
});

// Dos bimestres: ingresos (39), ICA (43), anticipo (44), consumo (59), IVA (66 y 67) y retenciones de IVA (70),
// con excedentes que se controlan.
const B1 = f2593(1, 1, { 39: 100_000_000, 43: 3_000_000, 44: 2_000_000, 57: 300_000, 59: 400_000, 65: 0, 66: 19_000_000, 67: 4_000_000, 70: 500_000, 75: 0 });
const B2 = f2593(2, 2, { 39: 80_000_000, 43: 2_000_000, 44: 1_500_000, 51: 300_000, 59: 600_000, 60: 0, 66: 15_200_000, 67: 3_200_000, 69: 0, 70: 300_000 });
const periodos = (formularios = [B1, B2]) =>
  periodosRevision({ impuesto: "RST", periodicidad: "Bimestral", mesCorte: 4, porConfirmar: [], causales: [], formularios490: [], formularios350: formularios });

const DIAN = "800197268";
const tercero = (cuentaCliente: string, cuentaRussell: string, nit: string, saldoFinal: number, saldoInicial = 0): FilaTerceroContable => ({
  cuentaCliente, nombreCuenta: `Cuenta ${cuentaCliente}`, cuentaRussell, nit, nombreTercero: `Tercero ${nit}`, saldoInicial, saldoFinal,
});
const cuenta = (cuentaCliente: string, cuentaRussell: string, saldoFinal: number) => ({ cuentaCliente, nombreCuenta: `Cuenta ${cuentaCliente}`, cuentaRussell, saldoInicial: 0, saldoFinal });

const NATURALEZAS = new Map<string, "D" | "C">([
  ["135595", "D"], ["249505", "C"], ["240855", "C"], ["240856", "C"], ["240857", "D"], ["240858", "D"], ["240805", "C"], ["240830", "C"], ["135517", "D"], ["511505", "D"],
  ...CUENTAS_INGRESOS_F2593.map((c) => [c, c === "417505" ? "D" : "C"] as [string, "D" | "C"]),
]);

function entrada(cambios: Partial<EntradaCruce> = {}): EntradaCruce {
  return {
    impuesto: "RST",
    naturalezas: NATURALEZAS,
    periodos: periodos(),
    mapeo: MAPEO_F2593_FABRICA,
    // Como lo siembra la migración: la 135595 no resta la DIAN.
    sinRestaDian: new Set(CUENTAS_SIN_RESTA_DIAN_FABRICA),
    tercerosDian: [{ nit: DIAN }],
    nombresRussell: new Map([["135595", "Otros anticipos de impuestos y saldos a favor"], ["249505", "Impuesto nacional al consumo"]]),
    filasContables: [
      // Anticipo: débito con la DIAN como tercero (lo pagado); no se tacha.
      tercero("13559501", "135595", DIAN, 3_500_000),
      // Consumo: crédito causado y el pago a la DIAN débito en la misma cuenta, que se tacha.
      tercero("24950501", "249505", "900111222", -1_000_000),
      tercero("24950501", "249505", DIAN, 400_000),
      // IVA generado y descontable en las cuentas del Régimen Simple; la DIAN tachada.
      tercero("24080501", "240855", "900111222", -34_200_000),
      tercero("24080501", "240855", DIAN, 12_000_000),
      tercero("24081001", "240857", "900333444", 7_200_000),
      // Una 2408 genérica y una detallada (no del Régimen Simple): quedan fuera del cruce y se informan.
      tercero("24080599", "240805", "900111222", -2_000),
      tercero("24083001", "240830", "900111222", -5_000),
      // Retenciones de IVA que le practicaron (débito, por cliente) y su aplicación con la DIAN, que se tacha.
      tercero("13551701", "135517", "900333444", 800_000),
      tercero("13551701", "135517", DIAN, -500_000),
    ],
    filasContablesCuenta: [
      cuenta("41350501", "410505", -150_000_000),
      cuenta("42100501", "421020", -31_000_000),
      // Devoluciones: débito; restan de los ingresos.
      cuenta("41750501", "417505", 1_000_000),
      // Gasto de ICA del año.
      cuenta("51150501", "511505", 5_000_000),
    ],
    inicioEnero: true,
    restarSaldoInicial: true,
    umbral: 501,
    marcas: [],
    ...cambios,
  };
}

const r = cruceRetencion(entrada());
const filas = r.grupos.flatMap((g) => g.filas);
const fila = (renglon: number) => filas.find((f) => f.conceptos.some((c) => c.renglones.includes(renglon)))!;

describe("cruce contable del 2593", () => {
  it("va en seis secciones, con los ingresos al final y sin total general", () => {
    expect(r.grupos.map((g) => g.etiqueta)).toEqual([
      "Anticipo SIMPLE (44)", "ICA consolidado (43, suma de las 99)", "Impuesto nacional al consumo (59)",
      "Impuesto sobre las ventas (66 − 67)", "Retenciones de IVA que le practicaron (70)", "Ingresos brutos (39)",
    ]);
    expect(impuestoDelCruce(r).clave).toBe("RST");
    expect(RST.cruce.conTotalGeneral).toBe(false);
    // Solo las siete casillas: los excedentes, saldos a favor, totales a pagar y bases no se cruzan.
    expect(filas.flatMap((f) => f.conceptos.flatMap((c) => c.renglones)).sort((a, b) => a - b)).toEqual([39, 43, 44, 59, 66, 67, 70]);
  });

  it("las retenciones de IVA (70) van contra la 135517 por tercero, con la DIAN tachada, como el 85 del 300", () => {
    const f = fila(70);
    expect(f.cuentaRussell).toBe("135517");
    expect([f.declarado, f.contable, f.diferencia, f.dianRestado]).toEqual([800_000, 800_000, 0, -500_000]);
  });

  it("el ICA consolidado (43, la suma de las 99) va contra la 511505 por el saldo de la cuenta", () => {
    const f = fila(43);
    expect(f.cuentaRussell).toBe("511505");
    expect(f.cuentasCliente.every((c) => c.porCuenta)).toBe(true);
    expect([f.declarado, f.contable, f.diferencia]).toEqual([5_000_000, 5_000_000, 0]);
  });

  it("el anticipo (44) va contra la 135595 sin tachar la DIAN", () => {
    const f = fila(44);
    expect(f.cuentaRussell).toBe("135595");
    expect([f.declarado, f.contable, f.diferencia, f.dianRestado]).toEqual([3_500_000, 3_500_000, 0, 0]);
    expect(f.cuentasCliente[0].terceros[0]).toMatchObject({ esDian: true, restado: false });
  });

  it("el impuesto al consumo (59) va contra la 249505 con la DIAN tachada", () => {
    const f = fila(59);
    expect(f.cuentaRussell).toBe("249505");
    expect([f.declarado, f.contable, f.diferencia, f.dianRestado]).toEqual([1_000_000, 1_000_000, 0, -400_000]);
  });

  it("el IVA va contra las cuentas del Régimen Simple: el 66 contra 240855 + 240856, el 67 contra 240857 + 240858, y el 67 resta en el subtotal", () => {
    const generado = fila(66);
    const descontable = fila(67);
    expect(generado.cuentaRussell).toBe("240855+240856");
    expect(descontable.cuentaRussell).toBe("240857+240858");
    expect([generado.declarado, generado.contable, generado.diferencia]).toEqual([34_200_000, 34_200_000, 0]);
    expect([descontable.declarado, descontable.contable, descontable.diferencia]).toEqual([7_200_000, 7_200_000, 0]);
    expect(r.grupos.find((g) => g.grupo === "iva")!.subtotal).toEqual({ declarado: 27_000_000, contable: 27_000_000, diferencia: 0 });
  });

  it("las demás 2408 del cliente se informan fuera del cruce y no suman", () => {
    expect(r.fueraDelMapeo).toEqual([
      { cuentaRussell: "240805", cuentas: ["24080599"], saldo: 2_000 },
      { cuentaRussell: "240830", cuentas: ["24083001"], saldo: 5_000 },
    ]);
  });

  it("los ingresos brutos (39) van por el saldo de la cuenta y la 417505 (débito) resta dentro de la fila", () => {
    const f = fila(39);
    expect(f.cuentasRussell).toEqual([...CUENTAS_INGRESOS_F2593]);
    expect(f.cuentasCliente.every((c) => c.porCuenta)).toBe(true);
    expect([f.declarado, f.contable, f.diferencia]).toEqual([180_000_000, 180_000_000, 0]);
    expect(f.cuentasCliente.find((c) => c.cuenta === "41750501")!.saldo).toBe(-1_000_000);
  });

  it("una diferencia desde el umbral exige marca", () => {
    const conDiferencia = cruceRetencion(entrada({ filasContables: entrada().filasContables.map((t) => (t.cuentaRussell === "135595" ? { ...t, saldoFinal: 3_000_000 } : t)) }));
    const f = conDiferencia.grupos.flatMap((g) => g.filas).find((x) => x.cuentaRussell === "135595")!;
    expect([f.diferencia, f.requiereMarca]).toEqual([500_000, true]);
    expect(conDiferencia.pendientesMarca).toBe(1);
  });

  it("al cerrar quedan en firme la 135595, la 249505, la 2408 y la 135517 enteras, y las cuentas de ingresos del 39 y la 511505 una por una", () => {
    const cuentas = MAPEO_F2593_FABRICA.flatMap((m) => cuentasDeMapeo(m));
    expect(alcanceCierreImpuesto(RST, cuentas)).toEqual(["135517", "135595", "2408", "249505", "511505", ...CUENTAS_INGRESOS_F2593].sort());
  });
});

describe("controles entre recibos del 2593", () => {
  it("el excedente que trae un bimestre debe ser el que dejó el anterior; si no, aviso", () => {
    expect(periodos()[1].avisos).toEqual([]);
    const distinto = periodos([B1, f2593(2, 2, { ...B2.valores, 51: 250_000 })]);
    expect(distinto[1].avisos).toEqual(["El 51 (excedente del anticipo SIMPLE del bimestre anterior) es $ 250.000 y el 57 del recibo del bimestre anterior fue $ 300.000."]);
  });

  it("el primer bimestre y el que sigue a uno sin recibo no se comparan", () => {
    const solo = periodos([f2593(2, 2, { ...B2.valores, 51: 250_000 })]);
    expect(solo.every((p) => p.avisos.length === 0)).toBe(true);
  });

  it("los saldos a favor del año anterior (52 y 68) se avisan cuando traen valor", () => {
    const conSaldo = periodos([f2593(1, 1, { ...B1.valores, 52: 120_000, 68: 80_000 }), B2]);
    expect(conSaldo[0].avisos).toEqual([
      "El 52 trae $ 120.000 de saldo a favor del SIMPLE de la declaración del año anterior: no se cruza con la contabilidad; revísalo contra esa declaración.",
      "El 68 trae $ 80.000 de saldo a favor de la declaración de IVA del año anterior: no se cruza con la contabilidad; revísalo contra esa declaración.",
    ]);
  });

  it("las retenciones de antes del SIMPLE (50) se avisan cuando traen valor, para revisarlas contra su soporte", () => {
    const conRetencion = periodos([f2593(1, 1, { ...B1.valores, 50: 90_000 }), B2]);
    expect(conRetencion[0].avisos).toEqual([
      "El 50 trae $ 90.000 de retenciones de renta practicadas antes de pertenecer al SIMPLE: no se cruza con la contabilidad; revísalo contra su soporte.",
    ]);
  });

  it("en la hoja 2 se avisan la 100 y la 105 de cada municipio, y que la suma de las 84 no dé la 39", () => {
    const municipio = (nombre: string, valores: Record<number, number>): MunicipioIca => ({
      pagina: 2, departamento: "ANTIOQUIA", codigoDepartamento: "05", municipio: nombre, codigoMunicipio: "001", valores, actividades: [], origenTarifa: null,
    });
    const cuadra = periodos([{ ...B1, ica: [municipio("MEDELLIN", { 84: 60_000_000 }), municipio("ENVIGADO", { 84: 40_000_000 })] }, B2]);
    expect(cuadra[0].avisos).toEqual([]);
    const conAvisos = periodos([{ ...B1, ica: [municipio("MEDELLIN", { 84: 60_000_000, 100: 25_000 }), municipio("ENVIGADO", { 84: 30_000_000, 105: 12_000 })] }, B2]);
    expect(conAvisos[0].avisos).toEqual([
      "El 100 de MEDELLIN (ANTIOQUIA) trae $ 25.000 de retenciones de ICA practicadas antes de pertenecer al SIMPLE: no se cruza con la contabilidad; revísalo contra su soporte.",
      "El 105 de ENVIGADO (ANTIOQUIA) trae $ 12.000 de saldo a favor a solicitar en el municipio: no se cruza con la contabilidad; revisa su solicitud.",
      "La suma de los 84 de la hoja 2 (ingresos brutos por municipio) da $ 90.000.000 y el 39 dice $ 100.000.000.",
    ]);
    // Un recibo sin hoja 2 (importado antes de que se leyera) no avisa la suma de las 84.
    expect(periodos([{ ...B1, ica: [] }, B2])[0].avisos).toEqual([]);
  });

  it("Retención e IVA no tienen estos controles", () => {
    const iva = periodosRevision({
      impuesto: "IVA", periodicidad: "Bimestral", mesCorte: 4, porConfirmar: [], causales: [], formularios490: [],
      formularios350: [{ ...B1, numero: "30066201717001" }, { ...B2, numero: "30066201717002" }],
    });
    expect(iva.flatMap((p) => p.avisos)).toEqual([]);
  });
});
