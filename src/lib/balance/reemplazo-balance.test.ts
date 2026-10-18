import { describe, expect, it } from "vitest";
import { descripcionReemplazo, evaluarReemplazoBalance, type CierreParaReemplazo } from "./reemplazo-balance";

const DIC = new Date(Date.UTC(2025, 11, 31));
const cierre: CierreParaReemplazo = { id: 5, moduloCodigo: "INV", periodo: "2025-12", cerradoPor: "Ana", moduloDatoEncabezadoId: 38, cuentasRussell: ["1435"], cuentasRussell6: [] };
const bloqueada = { cierreId: 5, cuenta8: "14350501", cuenta6Russell: "143505", saldoInicial: 0, debitos: 0, creditos: 0, saldoFinal: 1000 };
const fila = (over: Partial<typeof bloqueada> = {}) => ({ cuenta8: "14350501", cuenta6Russell: "143505", saldoInicial: 50, debitos: 9, creditos: 1, saldoFinal: 1000, ...over });
const base = {
  viejo: { id: 1, clienteId: 7, periodoFin: DIC },
  nuevo: { id: 2, clienteId: 7, periodoFin: DIC, esVigente: true },
  cierresDelViejo: [cierre],
  bloqueadas: [bloqueada],
  filasNuevas: [fila()],
  tercero: [],
  mensajePrevalidador: null,
  conciliacionesFormales: 0,
};

describe("evaluarReemplazoBalance", () => {
  it("reemplaza cuando las cuentas en firme son idénticas en saldo final y homologación", () => {
    // Saldo inicial y movimientos distintos (anual vs mensual) no importan.
    expect(evaluarReemplazoBalance(base)).toEqual({ ok: true, cuentasEnFirme: 1 });
  });

  it("rechaza un saldo final distinto en una cuenta en firme", () => {
    const r = evaluarReemplazoBalance({ ...base, filasNuevas: [fila({ saldoFinal: 999 })] });
    expect(r).toMatchObject({ ok: false, motivo: "cuentas_en_firme" });
    if (!r.ok) expect(r.mensaje).toContain("14350501 cambia saldo final");
  });

  it("rechaza otra homologación en una cuenta en firme", () => {
    expect(evaluarReemplazoBalance({ ...base, filasNuevas: [fila({ cuenta6Russell: "143510" })] })).toMatchObject({ ok: false, motivo: "cuentas_en_firme" });
  });

  it("rechaza una cuenta nueva con saldo que entra al alcance cerrado", () => {
    expect(evaluarReemplazoBalance({ ...base, filasNuevas: [fila(), fila({ cuenta8: "14350599", saldoFinal: 5 })] })).toMatchObject({ ok: false, motivo: "cuentas_en_firme" });
  });

  it.each([
    [{ viejo: { id: 2, clienteId: 7, periodoFin: DIC } }, "mismo_balance"],
    [{ nuevo: { id: 2, clienteId: 8, periodoFin: DIC, esVigente: true } }, "otro_cliente"],
    [{ nuevo: { id: 2, clienteId: 7, periodoFin: new Date(Date.UTC(2025, 10, 30)), esVigente: true } }, "otro_corte"],
    [{ cierresDelViejo: [] }, "viejo_sin_cierre"],
    [{ nuevo: { id: 2, clienteId: 7, periodoFin: DIC, esVigente: false } }, "nuevo_no_vigente"],
    [{ conciliacionesFormales: 1 }, "conciliacion_formal"],
    [{ mensajePrevalidador: "No se puede cerrar el balance: el prevalidador todavía no ha sido aprobado." }, "prevalidador"],
  ] as const)("rechaza %o con motivo %s", (cambio, motivo) => {
    expect(evaluarReemplazoBalance({ ...base, ...cambio })).toMatchObject({ ok: false, motivo });
  });

  describe("cierres con cruce por tercero", () => {
    const t = (cuenta8: string, tercero: string, saldoFinal: number) => ({ cuenta8, tercero, saldoFinal });
    it("exige que el nuevo conserve el detalle por tercero", () => {
      expect(evaluarReemplazoBalance({ ...base, tercero: [{ cierre, conciliado: [t("14350501", "900", 1000)], nuevo: null }] }))
        .toMatchObject({ ok: false, motivo: "sin_detalle_tercero" });
    });
    it("rechaza un reparto distinto entre terceros de una cuenta en firme", () => {
      expect(evaluarReemplazoBalance({ ...base, tercero: [{ cierre, conciliado: [t("14350501", "900", 1000)], nuevo: [t("14350501", "900", 600), t("14350501", "901", 400)] }] }))
        .toMatchObject({ ok: false, motivo: "detalle_tercero" });
    });
    it("acepta el mismo detalle por tercero, y un conciliado sin detalle no exige nada", () => {
      expect(evaluarReemplazoBalance({ ...base, tercero: [{ cierre, conciliado: [t("14350501", "900", 1000)], nuevo: [t("14350501", "900", 1000)] }] }).ok).toBe(true);
      expect(evaluarReemplazoBalance({ ...base, tercero: [{ cierre, conciliado: null, nuevo: null }] }).ok).toBe(true);
    });
  });
});

describe("descripcionReemplazo", () => {
  it("nombra los dos balances, los cierres y las cuentas en firme", () => {
    expect(descripcionReemplazo({
      viejo: { id: 1, version: "v1", nombre: "Diciembre 2025 · Por cuenta" },
      nuevo: { id: 2, version: "v2", nombre: "Diciembre 2025 · Por cuenta" },
      cierres: [cierre],
      cuentasEnFirme: 15,
    })).toBe("Diciembre 2025 · Por cuenta v1 (#1) → Diciembre 2025 · Por cuenta v2 (#2) · conciliación de INV · 2025-12 (cargue #38) · 15 cuenta(s) en firme idéntica(s)");
  });
});
