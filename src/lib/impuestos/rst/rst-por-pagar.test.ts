import { describe, expect, it } from "vitest";
import { libroRetencion } from "@/lib/export/retencion";
import { IVA, RETENCION, RST } from "../impuestos-dian";
import { pagosRevision } from "../retencion/pagos";
import { vistasRevision } from "../retencion/vistas";
import { CUENTAS_SIN_RESTA_DIAN_FABRICA } from "../mapeo-dian";
import { evaluarCierreRetencion } from "../retencion/cierre";
import { cruceRetencion, type EntradaCruce } from "../retencion/cruce";
import { periodosRevision, type Formulario350, type Formulario490 } from "../retencion/periodos-revision";
import { avisoPorPagar, controlPorPagar, type FilaCuentaPorPagar } from "../retencion/por-pagar";
import { MAPEO_F2593_FABRICA } from "./mapeo-f2593";

/**
 * Control del impuesto al consumo por pagar (RST): la casilla 64 de los recibos 2593 que al corte no se
 * habían pagado contra el saldo neto de la 249505 (causado) y la 249510 (pagos). No exige marca.
 */

const numero2593 = (id: number) => `259366121721${String(id).padStart(2, "0")}`;
const f2593 = (id: number, periodo: number, valores: Record<number, number>, anterior?: number): Formulario350 & { periodo: number } => ({
  id, periodo, numero: numero2593(id), codigoCorreccion: anterior ? 1 : null, numeroAnterior: anterior ? numero2593(anterior) : null, fechaPresentacion: null, valores,
});
const f490 = (id: number, periodo: number, paga: string | null, fechaPago: string | null): Formulario490 & { periodo: number } => ({
  id, periodo, numero: `491000000000${String(id).padStart(2, "0")}`, concepto: "27", numeroPagado: paga, fechaPago, valores: { 36: 1 },
});

// NIT terminado en 8: el bimestre 1 se paga el 20 de mayo, el 2 el 22 de junio, el 3 el 15 de julio y el 4 el 18 de septiembre.
const RECIBOS = [
  f2593(1, 1, { 59: 100_000, 64: 100_000 }),
  f2593(2, 2, { 59: 200_000, 64: 200_000 }),
  f2593(3, 3, { 59: 300_000, 64: 300_000 }),
  f2593(4, 4, { 59: 400_000, 64: 400_000 }),
];
const PAGOS = [
  f490(11, 1, numero2593(1), "2026-05-20"),
  f490(12, 2, numero2593(2), "2026-06-22"),
  f490(13, 3, numero2593(3), "2026-07-15"),
  f490(14, 4, numero2593(4), "2026-09-18"),
];
const periodos = (formularios350 = RECIBOS, formularios490 = PAGOS, causales: { periodo: number; causal: string }[] = []) =>
  periodosRevision({ impuesto: "RST", periodicidad: "Bimestral", mesCorte: 8, porConfirmar: [], causales, formularios490, formularios350 });

const cuenta = (cuentaCliente: string, cuentaRussell: string, saldoFinal: number): FilaCuentaPorPagar => ({ cuentaCliente, nombreCuenta: `Cuenta ${cuentaCliente}`, cuentaRussell, saldoFinal });

const control = (cambios: Partial<Parameters<typeof controlPorPagar>[0]> = {}) =>
  controlPorPagar({
    titulo: "Impuesto al consumo por pagar",
    renglon: 64,
    cuentas: ["249505", "249510"],
    fechaCorte: "2026-08-31",
    periodos: periodos(),
    // Causado en el año (crédito) y lo pagado en mayo, junio y julio (débito).
    filas: [cuenta("24950501", "249505", -1_000_000), cuenta("24951001", "249510", 600_000)],
    umbral: 501,
    ...cambios,
  });

describe("impuesto al consumo por pagar (64 contra 249505 − 249510)", () => {
  it("al corte de agosto queda por pagar el bimestre 4, que se paga en septiembre", () => {
    const c = control();
    expect(c.recibos.map((r) => [r.periodo, r.estado, r.porPagar])).toEqual([
      [1, "pagado", 0],
      [2, "pagado", 0],
      [3, "pagado", 0],
      [4, "pagado_despues", 400_000],
    ]);
    expect(c.recibos[3].pago).toEqual({ numero: "49100000000014", fecha: "2026-09-18" });
    expect(c.porPagarRecibos).toBe(400_000);
    expect(c.porPagarContable).toBe(400_000);
    expect(c.diferencia).toBe(0);
    expect(c.nivel).toBe("cero");
    expect(avisoPorPagar(c)).toBeNull();
  });

  it("no depende de en cuál de las dos cuentas se registró el pago: con la DIAN en la 249505 el neto es el mismo", () => {
    const c = control({ filas: [cuenta("24950501", "249505", -400_000)] });
    expect(c.porPagarContable).toBe(400_000);
    expect(c.nivel).toBe("cero");
  });

  it("las cuentas del cliente van con su saldo por pagar en positivo: la 249510 (pagos) resta", () => {
    const c = control({ nombresRussell: new Map([["249510", "Pago impuesto nacional al consumo"]]) });
    expect(c.cuentas).toEqual([
      { cuenta: "24950501", nombre: "Cuenta 24950501", cuentaRussell: "249505", nombreRussell: null, saldo: 1_000_000 },
      { cuenta: "24951001", nombre: "Cuenta 24951001", cuentaRussell: "249510", nombreRussell: "Pago impuesto nacional al consumo", saldo: -600_000 },
    ]);
    // Otra cuenta del balance no entra al control.
    expect(control({ filas: [cuenta("24950501", "249505", -1_000_000), cuenta("24951001", "249510", 600_000), cuenta("24080501", "240805", -9_000)] }).cuentas).toHaveLength(2);
  });

  it("un recibo sin 490, o con el 490 sin fecha de pago, queda por pagar", () => {
    const c = control({ periodos: periodos(RECIBOS, [PAGOS[0], PAGOS[1], f490(13, 3, numero2593(3), null)]) });
    expect(c.recibos.map((r) => [r.periodo, r.estado])).toEqual([[1, "pagado"], [2, "pagado"], [3, "sin_fecha"], [4, "sin_pago"]]);
    expect(c.porPagarRecibos).toBe(700_000);
  });

  it("un 490 que no cita un recibo cargado se toma como pago de la vigente del bimestre", () => {
    const c = control({ periodos: periodos(RECIBOS, [PAGOS[0], PAGOS[1], f490(13, 3, null, "2026-07-15"), PAGOS[3]]) });
    expect(c.recibos.find((r) => r.periodo === 3)?.estado).toBe("pagado");
  });

  it("un ajuste suma solo lo adicional: el inicial pagado no queda por pagar y el ajuste sin pagar sí", () => {
    const ajuste = f2593(5, 4, { 59: 450_000, 64: 50_000 }, 4);
    const c = control({ periodos: periodos([...RECIBOS, ajuste], [...PAGOS.slice(0, 3), f490(14, 4, numero2593(4), "2026-07-20")]) });
    expect(c.recibos.filter((r) => r.periodo === 4).map((r) => [r.numero, r.estado, r.porPagar])).toEqual([
      [numero2593(4), "pagado", 0],
      [numero2593(5), "sin_pago", 50_000],
    ]);
  });

  it("un recibo anterior de la cadena sin 490 no se debe: el ajuste lo reemplazó entero", () => {
    const ajuste = f2593(5, 4, { 59: 450_000, 64: 450_000 }, 4);
    const c = control({ periodos: periodos([...RECIBOS, ajuste], PAGOS.slice(0, 3)) });
    expect(c.recibos.filter((r) => r.periodo === 4).map((r) => r.numero)).toEqual([numero2593(5)]);
    expect(c.porPagarRecibos).toBe(450_000);
  });

  it("los recibos sin impuesto al consumo no se listan; un bimestre sin recibo ni causal se informa", () => {
    const c = control({ periodos: periodos([RECIBOS[0], f2593(2, 2, { 59: 0, 64: 0 }), RECIBOS[2]], PAGOS.slice(0, 3), [{ periodo: 4, causal: "No hubo operaciones" }]) });
    expect(c.recibos.map((r) => r.periodo)).toEqual([1, 3]);
    expect(c.periodosSinRecibo).toEqual([]);
    expect(control({ periodos: periodos(RECIBOS.slice(0, 3), PAGOS.slice(0, 3)) }).periodosSinRecibo).toEqual([4]);
  });

  it("si no cuadra desde el umbral sale un aviso que no impide cerrar", () => {
    const c = control({ filas: [cuenta("24950501", "249505", -1_000_000)] });
    expect(c.diferencia).toBe(-600_000);
    expect(c.nivel).toBe("alerta");
    expect(avisoPorPagar(c)).toBe(
      "Cruce contable · Impuesto al consumo por pagar: al corte quedan por pagar $ 400.000 según la casilla 64 de los recibos y $ 1.000.000 según la contabilidad; diferencia de -$ 600.000. Es un control: no impide cerrar.",
    );
    // Por debajo del umbral es informativa y no avisa.
    expect(avisoPorPagar(control({ filas: [cuenta("24950501", "249505", -400_300)] }))).toBeNull();
  });
});

describe("el control dentro del cruce del 2593", () => {
  const entrada = (cambios: Partial<EntradaCruce> = {}): EntradaCruce => ({
    impuesto: "RST",
    naturalezas: new Map([["249505", "C"], ["249510", "D"]]),
    periodos: periodos(),
    mapeo: MAPEO_F2593_FABRICA,
    sinRestaDian: new Set(CUENTAS_SIN_RESTA_DIAN_FABRICA),
    tercerosDian: [{ nit: "800197268" }],
    nombresRussell: new Map(),
    filasContables: [],
    inicioEnero: true,
    restarSaldoInicial: true,
    umbral: 501,
    marcas: [],
    fechaCorte: "2026-08-31",
    filasPorPagar: [cuenta("24950501", "249505", -1_000_000)],
    ...cambios,
  });

  it("viaja en el resultado del cruce (y con él a la copia del cierre), sin filas ni marcas", () => {
    const r = cruceRetencion(entrada());
    expect(r.porPagar?.porPagarRecibos).toBe(400_000);
    expect(r.porPagar?.porPagarContable).toBe(1_000_000);
    // No es una fila del cruce: el 64 no se concilia ni pide marca.
    expect(r.grupos.flatMap((g) => g.filas).some((f) => f.conceptos.some((c) => c.renglones.includes(64)))).toBe(false);
    expect(r.pendientesMarca).toBe(r.grupos.flatMap((g) => g.filas).filter((f) => f.requiereMarca && !f.marca?.vigente).length);
  });

  it("en Novedades queda como aviso, no como pendiente", () => {
    const resultado = cruceRetencion(entrada());
    const evaluacion = evaluarCierreRetencion({
      codigo: "2593", periodos: periodos(), cruce: { estado: "listo", mensaje: null, balance: { id: 1, periodo: "", descripcion: "", periodoInicio: "2026-01-01", periodoFin: "2026-08-31" }, umbral: 501, inicioEnero: true, resultado },
      pagos: { filas: [], total: { retenciones: 0, sanciones: 0, totalDeclarado: 0, impuestoPagado: 0, sancionPagada: 0, intereses: 0, totalPagado: 0, diferencia: 0 }, pendientesMarca: 0 },
      oportunidad: [], etiquetaPeriodo: (p) => `Bimestre ${p}`,
    });
    expect(evaluacion.avisos.some((a) => a.startsWith("Cruce contable · Impuesto al consumo por pagar"))).toBe(true);
    expect(evaluacion.pendientes.some((p) => p.texto.includes("Impuesto al consumo por pagar"))).toBe(false);
  });

  it("el Excel lo lleva en la hoja del cruce, con los recibos, las cuentas y la diferencia", () => {
    const p = periodos();
    const resultado = cruceRetencion(entrada());
    const wb = libroRetencion(
      { impuesto: RST.nombre, cliente: "Cliente de prueba", nit: "900000008", anio: 2026, corte: "agosto", periodicidad: "Bimestral" },
      vistasRevision(p, "RST", "Bimestral"),
      [],
      {
        cruce: { estado: "listo", mensaje: null, balance: { id: 1, periodo: "", descripcion: "Balance", periodoInicio: "2026-01-01", periodoFin: "2026-08-31" }, umbral: 501, inicioEnero: true, resultado },
        oportunidad: [],
        pagos: pagosRevision({ impuesto: "RST", anio: 2026, periodos: p, marcas: [] }),
      },
    );
    const filas: unknown[][] = [];
    wb.getWorksheet("Cruce contable")!.eachRow((row) => filas.push((row.values as unknown[]).slice(1)));
    const titulo = filas.findIndex((f) => String(f[0]).startsWith("Impuesto al consumo por pagar · control al 31/08/2026"));
    expect(titulo).toBeGreaterThan(-1);
    expect(filas.some((f) => f[1] === numero2593(4) && f[2] === 400_000 && f[5] === "Pagado después del corte" && f[6] === 400_000)).toBe(true);
    expect(filas.some((f) => f[0] === "24950501" && f[6] === 1_000_000)).toBe(true);
    expect(filas.some((f) => String(f[0]).startsWith("Diferencia · aviso en Novedades") && f[6] === -600_000)).toBe(true);
  });

  it("sin fecha de corte no se calcula, y Retención e IVA no lo tienen", () => {
    expect(cruceRetencion(entrada({ fechaCorte: undefined })).porPagar).toBeUndefined();
    expect(RST.cruce.controlPorPagar?.cuentas).toEqual(["249505", "249510"]);
    expect(RETENCION.cruce.controlPorPagar).toBeUndefined();
    expect(IVA.cruce.controlPorPagar).toBeUndefined();
  });
});
