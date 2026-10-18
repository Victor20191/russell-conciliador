import { describe, expect, it } from "vitest";
import {
  balanceTerminaEnPeriodo,
  cuentasAgrupadorasExcluidas,
  describirBalanceCruce,
  motivoSinBalanceCruce,
  seleccionarBalanceCruceModulo,
  validarCompuertaPrevalidador,
  type ContextoCompuertaCruce,
} from "./compuerta-cruce";

function contexto(overrides: Partial<ContextoCompuertaCruce> = {}): ContextoCompuertaCruce {
  return {
    balance: {
      clienteId: 7,
      periodoInicio: new Date("2026-08-01T00:00:00.000Z"),
      periodoFin: new Date("2026-08-31T00:00:00.000Z"),
      estaCongelado: true,
    },
    prevalidador: { estado: "listo", modulos: [{ codigo: "ING" }], anidamientos: [] },
    revision: { estado: "aprobada", vigente: true },
    ...overrides,
  };
}

const agosto = (id: number, over: Partial<{ periodoInicio: Date; periodoFin: Date; estaCongelado: boolean; conDetalleTercero: boolean }> = {}) => ({
  id,
  periodoInicio: new Date("2026-08-01T00:00:00.000Z"),
  periodoFin: new Date("2026-08-31T00:00:00.000Z"),
  estaCongelado: true,
  ...over,
});

describe("compuerta del cruce de módulos", () => {
  it("exige que el balance sea del cliente y conserve la aprobación vigente del prevalidador", () => {
    expect(validarCompuertaPrevalidador(contexto(), 7, "ING")).toBeNull();
    expect(validarCompuertaPrevalidador(contexto({
      balance: { ...contexto().balance, clienteId: 8 },
    }), 7, "ING")).toContain("no pertenece al cliente");
    expect(validarCompuertaPrevalidador(contexto({
      revision: { estado: "desactualizada", vigente: false },
    }), 7, "ING")).toContain("desactualizada");
  });

  it("un balance YTD o trimestral de Ingresos o Nómina que termina en el mes pasa la compuerta (saldo final)", () => {
    const ytd = contexto({ balance: { ...contexto().balance, periodoInicio: new Date("2026-01-01T00:00:00.000Z") } });
    expect(validarCompuertaPrevalidador(ytd, 7, "ING")).toBeNull();
    const nomina = contexto({ ...ytd, prevalidador: { estado: "listo", modulos: [{ codigo: "NOM" }], anidamientos: [] } });
    expect(validarCompuertaPrevalidador(nomina, 7, "NOM")).toBeNull();
  });

  it("el balance tiene que terminar en el mes de corte, incluido febrero bisiesto", () => {
    expect(balanceTerminaEnPeriodo(new Date("2026-08-31T00:00:00.000Z"), "2026-08")).toBe(true);
    expect(balanceTerminaEnPeriodo(new Date("2024-02-29T00:00:00.000Z"), "2024-02")).toBe(true);
    expect(balanceTerminaEnPeriodo(new Date("2026-07-31T00:00:00.000Z"), "2026-08")).toBe(false);
    expect(balanceTerminaEnPeriodo(new Date("2026-08-31T00:00:00.000Z"), "agosto")).toBe(false);
  });

  it("expone solo las agrupadoras del prevalidador listo y normaliza sus códigos", () => {
    expect([...cuentasAgrupadorasExcluidas({
      estado: "listo",
      modulos: [{ codigo: "ING" }],
      anidamientos: [{ cuenta8: "41-05" }, { cuenta8: " 4135 " }],
    })]).toEqual(["4105", "4135"]);
    expect(cuentasAgrupadorasExcluidas({ estado: "sin_catalogo" }).size).toBe(0);
  });
});

describe("selección del balance: solo un cerrado y vigente del mes (18/Oct/2026)", () => {
  it("un balance abierto nunca se usa, aunque sea el más reciente", () => {
    const abierto = agosto(96, { estaCongelado: false });
    const cerradoYtd = agosto(91, { periodoInicio: new Date("2026-01-01T00:00:00.000Z") });
    expect(seleccionarBalanceCruceModulo([abierto, cerradoYtd], "2026-08")?.id).toBe(91);
    expect(seleccionarBalanceCruceModulo([abierto], "2026-08")).toBeNull();
  });

  it("entre varios cerrados gana el primero en el orden recibido (corte y carga más recientes)", () => {
    expect(seleccionarBalanceCruceModulo([agosto(95), agosto(94)], "2026-08")?.id).toBe(95);
  });

  it("un cerrado de otro mes o que no es la vigente de su línea no sirve", () => {
    const julio = agosto(80, { periodoFin: new Date("2026-07-31T00:00:00.000Z") });
    expect(seleccionarBalanceCruceModulo([julio], "2026-08")).toBeNull();
    expect(seleccionarBalanceCruceModulo([agosto(70), agosto(71)], "2026-08", { vigentes: new Set([71]) })?.id).toBe(71);
    expect(seleccionarBalanceCruceModulo([agosto(70)], "2026-08", { vigentes: new Set([71]) })).toBeNull();
  });

  it("Cartera y CxP exigen el detalle por tercero: un cerrado «Por cuenta» no basta", () => {
    const porCuenta = agosto(10, { conDetalleTercero: false });
    const porTerceros = agosto(11, { conDetalleTercero: true });
    expect(seleccionarBalanceCruceModulo([porCuenta, porTerceros], "2026-08", { exigirDetalleTercero: true })?.id).toBe(11);
    expect(seleccionarBalanceCruceModulo([porCuenta], "2026-08", { exigirDetalleTercero: true })).toBeNull();
    expect(seleccionarBalanceCruceModulo([porCuenta], "2026-08")?.id).toBe(10);
  });
});

describe("motivoSinBalanceCruce", () => {
  it("sin balances del mes, abiertos o sin terceros: cada caso con su mensaje; con uno válido, null", () => {
    expect(motivoSinBalanceCruce([], "2026-08")).toMatchObject({ motivo: "sin_balance_en_mes" });
    expect(motivoSinBalanceCruce([agosto(1, { estaCongelado: false })], "2026-08")).toEqual({
      motivo: "sin_balance_cerrado",
      mensaje: "No hay un balance cerrado con corte en 2026-08. Cierra el balance del período en /balance para conciliar contra él.",
    });
    const porTercerosSinDetalle = motivoSinBalanceCruce([agosto(1, { conDetalleTercero: false })], "2026-08", { exigirDetalleTercero: true, modulo: "Cartera" });
    expect(porTercerosSinDetalle?.motivo).toBe("sin_balance_cerrado_por_terceros");
    expect(porTercerosSinDetalle?.mensaje).toContain("que Cartera necesita");
    expect(motivoSinBalanceCruce([agosto(1)], "2026-08")).toBeNull();
  });

  it("una versión anterior cerrada (no vigente) cuenta como «sin balance cerrado»", () => {
    expect(motivoSinBalanceCruce([agosto(70)], "2026-08", { vigentes: new Set([71]) })?.motivo).toBe("sin_balance_cerrado");
  });
});

describe("describirBalanceCruce", () => {
  it("nombra versión, apertura y fechas", () => {
    expect(describirBalanceCruce({ version: "v1", aperturaBalance: "tercero", periodoInicio: new Date("2025-01-01T00:00:00.000Z"), periodoFin: new Date("2025-12-31T00:00:00.000Z") }))
      .toBe("v1 «Por terceros» (2025-01-01 a 2025-12-31)");
  });
});
