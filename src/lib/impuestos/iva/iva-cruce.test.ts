import { describe, expect, it } from "vitest";
import { libroRetencion } from "@/lib/export/retencion";
import { CLAVE_MARCA_IMPUESTO } from "@/lib/definitions";
import { cuentasDeFilaCruce, cruceRetencion, impuestoDelCruce, type EntradaCruce, type FilaTerceroContable } from "../retencion/cruce";
import { periodosRevision, type Formulario350 } from "../retencion/periodos-revision";
import { vistasRevision } from "../retencion/vistas";
import { MAPEO_F300_FABRICA } from "./mapeo-f300";

const f300 = (id: number, periodo: number, valores: Record<number, number>): Formulario350 & { periodo: number } => ({
  id, periodo, numero: `30066201717${String(id).padStart(2, "0")}`, codigoCorreccion: null, numeroAnterior: null, fechaPresentacion: "2026-03-12", valores,
});

// Dos bimestres declarados: ingresos (28, 40 y devoluciones 42), IVA generado (59), descontable (72 y ajuste 80) y retención de IVA (85).
const periodos = periodosRevision({
  impuesto: "IVA", periodicidad: "Bimestral", mesCorte: 4, porConfirmar: [], causales: [], formularios490: [],
  formularios350: [
    f300(1, 1, { 28: 100_000_000, 40: 3_000, 42: 1_000_000, 59: 19_000_000, 72: 2_000_000, 80: 100_000, 85: 500_000 }),
    f300(2, 2, { 28: 50_000_000, 40: 0, 42: 0, 59: 9_500_000, 72: 3_000_000, 80: 100_000, 85: 0 }),
  ],
});

const tercero = (cuentaCliente: string, cuentaRussell: string, nit: string | null, saldoFinal: number, saldoInicial = 0): FilaTerceroContable => ({
  cuentaCliente, nombreCuenta: `Cuenta ${cuentaCliente}`, cuentaRussell, nit, nombreTercero: nit ? `Tercero ${nit}` : null, saldoInicial, saldoFinal,
});
const cuenta = (cuentaCliente: string, cuentaRussell: string, saldoFinal: number) => ({ cuentaCliente, nombreCuenta: `Cuenta ${cuentaCliente}`, cuentaRussell, saldoInicial: 0, saldoFinal });

const NATURALEZAS = new Map<string, "D" | "C">([
  ["240830", "C"], ["240840", "D"], ["240850", "C"], ["135517", "D"], ["410505", "C"], ["417505", "D"], ["420505", "C"], ["421005", "C"], ["240899", "C"],
]);

function entrada(cambios: Partial<EntradaCruce> = {}): EntradaCruce {
  return {
    impuesto: "IVA",
    naturalezas: NATURALEZAS,
    periodos,
    mapeo: MAPEO_F300_FABRICA,
    sinRestaDian: new Set(),
    tercerosDian: [{ nit: "800197268" }],
    nombresRussell: new Map([["240830", "IVA generado a la tarifa general"]]),
    filasContables: [
      // IVA generado: crédito; la DIAN (pago contabilizado en la cuenta) va con signo contrario y se resta.
      tercero("24080101", "240830", "900111222", -28_500_000),
      tercero("24080101", "240830", "800197268", 5_000_000),
      // Descontable: débito; el ajuste por pérdidas (80) es crédito.
      tercero("24081001", "240840", "900333444", 5_000_000),
      tercero("24085001", "240850", "900333444", -200_000),
      // Retención de IVA que le practicaron: débito.
      tercero("13551701", "135517", "900555666", 500_000),
      // Una cuenta de 2408 que no está en el mapeo: se informa y no suma.
      tercero("24089901", "240899", "800197268", -1_234),
    ],
    filasContablesCuenta: [
      cuenta("41350501", "410505", -150_000_000),
      cuenta("42100501", "420505", -1_000),
      cuenta("42500501", "421005", -2_000),
      cuenta("41750501", "417505", 1_000_000),
    ],
    filasFueraDeRetencion: [{ cuentaCliente: "24081501", nombreCuenta: "IVA descontable mal homologado", cuentaRussell: "249505", saldoFinal: -700 }],
    inicioEnero: false,
    restarSaldoInicial: true,
    umbral: 501,
    marcas: [],
    ...cambios,
  };
}

const r = cruceRetencion(entrada());
// Las mismas cuentas de ingresos, con 7.000 más en una de las no gravadas.
const CUENTAS_CON_DIFERENCIA = entrada().filasContablesCuenta!.map((c) => (c.cuentaRussell === "420505" ? { ...c, saldoFinal: -8_000 } : c));
const filas = r.grupos.flatMap((g) => g.filas);
const fila = (cuentaRussell: string) => filas.find((f) => f.cuentaRussell === cuentaRussell)!;
const NO_GRAVADAS = "420505+421005+421020+421095+421505+422005+423005+423505+424515+425005+429595";

describe("cruce contable de IVA", () => {
  it("va por las secciones del levantamiento, con los ingresos al final, y sin las sanciones ni el saldo a favor anterior", () => {
    expect(r.grupos.map((g) => g.etiqueta)).toEqual(["Impuesto generado (67)", "Impuesto descontable (81)", "Retención de IVA (85)", "Ingresos (43)"]);
    expect(impuestoDelCruce(r).clave).toBe("IVA");
    expect(filas.some((f) => f.conceptos.some((c) => c.concepto === "sanciones" || c.concepto === "saldo_favor_anterior"))).toBe(false);
  });

  it("el IVA generado (crédito) queda en positivo y la DIAN se tacha", () => {
    expect(fila("240830")).toMatchObject({ declarado: 28_500_000, contable: 28_500_000, diferencia: 0, dianRestado: -5_000_000, nivel: "cero" });
  });

  it("el descontable (débito) queda en positivo y el ajuste (80) resta en el subtotal", () => {
    expect(fila("240840")).toMatchObject({ declarado: 5_000_000, contable: 5_000_000 });
    expect(fila("240850")).toMatchObject({ declarado: 200_000, contable: 200_000, signoSubtotal: -1 });
    expect(r.grupos.find((g) => g.grupo === "descontable")?.subtotal).toEqual({ declarado: 4_800_000, contable: 4_800_000, diferencia: 0 });
  });

  it("la retención de IVA (85) va contra 135517, en positivo", () => {
    expect(fila("135517")).toMatchObject({ declarado: 500_000, contable: 500_000, diferencia: 0 });
  });

  it("los ingresos van por el saldo de la cuenta, sin terceros; el 40 reúne sus once cuentas y las devoluciones restan", () => {
    const gravados = fila("410505");
    expect(gravados).toMatchObject({ declarado: 150_000_000, contable: 150_000_000 });
    expect(gravados.cuentasCliente).toEqual([{ cuenta: "41350501", nombre: "Cuenta 41350501", saldo: 150_000_000, terceros: [], porCuenta: true }]);
    const noGravadas = fila(NO_GRAVADAS);
    expect(cuentasDeFilaCruce(noGravadas)).toHaveLength(11);
    expect(noGravadas).toMatchObject({ declarado: 3_000, contable: 3_000, nombreCuenta: null });
    expect(fila("417505")).toMatchObject({ declarado: 1_000_000, contable: 1_000_000, signoSubtotal: -1 });
    expect(r.grupos.find((g) => g.grupo === "ingresos")?.subtotal).toEqual({ declarado: 149_003_000, contable: 149_003_000, diferencia: 0 });
  });

  it("informa las cuentas de 2408 fuera del mapeo y las del cliente en 2408 homologadas fuera de IVA", () => {
    expect(r.fueraDelMapeo).toEqual([{ cuentaRussell: "240899", cuentas: ["24089901"], saldo: 1_234 }]);
    expect(r.fueraDeRetencion).toEqual([{ cuenta: "24081501", nombre: "IVA descontable mal homologado", cuentaRussell: "249505", nombreRussell: null, saldo: 700 }]);
  });

  it("una diferencia desde el umbral exige marca; la marca de una fila de varias cuentas usa su clave con «+»", () => {
    const conDiferencia = cruceRetencion(entrada({ filasContablesCuenta: CUENTAS_CON_DIFERENCIA }));
    const f = conDiferencia.grupos.flatMap((g) => g.filas).find((x) => x.clave === NO_GRAVADAS)!;
    expect(f).toMatchObject({ diferencia: -7_000, requiereMarca: true });
    expect(CLAVE_MARCA_IMPUESTO.test(NO_GRAVADAS)).toBe(true);
    const marcado = cruceRetencion(entrada({
      filasContablesCuenta: CUENTAS_CON_DIFERENCIA,
      marcas: [{ clave: NO_GRAVADAS, numero: 1, nota: "Ingreso no gravado de otro período", referenciaAnexo: null, diferencia: -7_000, marcadoPor: null, marcadoEn: "2026-11-08T00:00:00.000Z" }],
    }));
    expect(marcado.pendientesMarca).toBe(0);
  });

  it("con balance desde enero resta el saldo inicial de los terceros de IVA, no de los ingresos", () => {
    const desdeEnero = cruceRetencion(entrada({
      inicioEnero: true,
      filasContables: [tercero("24080101", "240830", "900111222", -30_000_000, -1_500_000)],
    }));
    const generado = desdeEnero.grupos.flatMap((g) => g.filas).find((f) => f.cuentaRussell === "240830")!;
    expect(generado).toMatchObject({ contable: 28_500_000, saldoInicial: { terceros: 1, monto: 1_500_000, restado: true } });
    expect(desdeEnero.grupos.flatMap((g) => g.filas).find((f) => f.cuentaRussell === "410505")?.saldoInicial).toBeNull();
  });
});

describe("Excel del cruce de IVA", () => {
  it("lleva la hoja del cruce sin total general y con la cuenta de los ingresos sin terceros", () => {
    const vista = vistasRevision(periodos, "IVA", "Bimestral");
    const wb = libroRetencion(
      { impuesto: "IVA", cliente: "Cliente de prueba", nit: "902058973", anio: 2026, corte: "abril", periodicidad: "Bimestral" },
      vista,
      [],
      { cruce: { estado: "listo", mensaje: null, umbral: 501, inicioEnero: false, resultado: r, balance: { id: 1, periodo: "Enero 2026 – Abril 2026", descripcion: "v1", periodoInicio: "2026-01-01", periodoFin: "2026-04-30" } } },
    );
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Por períodos", "Acumulado", "Formularios", "Cruce contable"]);
    const textos: string[] = [];
    wb.getWorksheet("Cruce contable")!.eachRow((row) => textos.push(String(row.getCell(1).value ?? "")));
    expect(textos).not.toContain("Total retenciones (136)");
    expect(textos).toContain("Subtotal · Ingresos (43)");
    const celdas: string[] = [];
    wb.getWorksheet("Cruce contable")!.eachRow((row) => celdas.push(String(row.getCell(8).value ?? "")));
    expect(celdas).toContain("Saldo de la cuenta (sin terceros)");
  });
});
