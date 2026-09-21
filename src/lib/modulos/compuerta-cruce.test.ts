import { describe, expect, it } from "vitest";
import {
  balanceTerminaEnPeriodo,
  cuentasAgrupadorasExcluidas,
  seleccionarBalanceCruceModulo,
  avisoSeleccionBalance,
  validarCompuertaPrevalidador,
  type ContextoCompuertaCruce,
} from "./compuerta-cruce";

function contexto(overrides: Partial<ContextoCompuertaCruce> = {}): ContextoCompuertaCruce {
  return {
    balance: {
      clienteId: 7,
      periodoInicio: new Date("2026-08-01T00:00:00.000Z"),
      periodoFin: new Date("2026-08-31T00:00:00.000Z"),
      esOficial: true,
      estaCongelado: true,
    },
    prevalidador: { estado: "listo", modulos: [{ codigo: "ING" }], anidamientos: [] },
    revision: { estado: "aprobada", vigente: true },
    ...overrides,
  };
}

describe("compuerta del cruce de módulos", () => {
  it("exige aprobación vigente del prevalidador, pero NO que el balance esté congelado", () => {
    expect(validarCompuertaPrevalidador(contexto(), 7, "ING")).toBeNull();
    // Congelar ya no es un paso previo a conciliar: las cuentas del módulo quedan en firme
    // al CERRAR la conciliación, no al congelar toda la versión.
    expect(validarCompuertaPrevalidador(contexto({
      balance: { ...contexto().balance, esOficial: false, estaCongelado: false },
    }), 7, "ING")).toBeNull();
    expect(validarCompuertaPrevalidador(contexto({
      balance: { ...contexto().balance, clienteId: 8 },
    }), 7, "ING")).toContain("no pertenece al cliente");
    expect(validarCompuertaPrevalidador(contexto({
      revision: { estado: "desactualizada", vigente: false },
    }), 7, "ING")).toContain("desactualizada");
  });

  it("un balance YTD o trimestral de Ingresos o Nómina que termina en el mes pasa la compuerta (saldo final)", () => {
    // Antes Ingresos y Nómina exigían un balance del mes exacto (cruzaban por movimiento). Todos
    // los módulos comparan ahora saldos finales: sirve cualquier balance que termine en el corte.
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

  it("un YTD oficial gana a un mensual sin congelar: ya no se antepone el mes exacto", () => {
    const ytdOficial = {
      id: 91,
      periodoInicio: new Date("2026-01-01T00:00:00.000Z"),
      periodoFin: new Date("2026-08-31T00:00:00.000Z"),
      esOficial: true,
      estaCongelado: true,
    };
    const mensualSinCongelar = {
      id: 96,
      periodoInicio: new Date("2026-08-01T00:00:00.000Z"),
      periodoFin: new Date("2026-08-31T00:00:00.000Z"),
      esOficial: false,
      estaCongelado: false,
    };
    expect(seleccionarBalanceCruceModulo([ytdOficial, mensualSinCongelar], "2026-08")?.id).toBe(91);
    // Un balance que termina en otro mes nunca sirve, aunque sea oficial.
    const julio = { ...ytdOficial, id: 80, periodoFin: new Date("2026-07-31T00:00:00.000Z") };
    expect(seleccionarBalanceCruceModulo([julio], "2026-08")).toBeNull();
  });

  it("prefiere el oficial del período sobre un mensual no oficial", () => {
    const noOficial = {
      id: 92,
      periodoInicio: new Date("2026-08-01T00:00:00.000Z"),
      periodoFin: new Date("2026-08-31T00:00:00.000Z"),
      esOficial: false,
      estaCongelado: false,
    };
    const valido = { ...noOficial, id: 88, esOficial: true, estaCongelado: true };
    expect(seleccionarBalanceCruceModulo([noOficial, valido], "2026-08")?.id).toBe(88);
  });

  it("sin balance oficial, cruza contra la versión sin congelar del período (la primera en el orden recibido)", () => {
    const v2 = {
      id: 95,
      periodoInicio: new Date("2026-08-01T00:00:00.000Z"),
      periodoFin: new Date("2026-08-31T00:00:00.000Z"),
      esOficial: false,
      estaCongelado: false,
    };
    const v1 = { ...v2, id: 94 };
    expect(seleccionarBalanceCruceModulo([v2, v1], "2026-08")?.id).toBe(95);
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

describe("balance con detalle por tercero (Cartera y CxP)", () => {
  const diciembre = { periodoInicio: new Date("2025-12-01T00:00:00.000Z"), periodoFin: new Date("2025-12-31T00:00:00.000Z"), version: "v1" };
  // Mineralin: la oficial congelada es «Por cuenta»; la «Por terceros» llegó después sin congelar.
  const porCuentaOficial = { ...diciembre, id: 10, esOficial: true, estaCongelado: true, aperturaBalance: "cuenta", conDetalleTercero: false };
  const porTerceros = { ...diciembre, id: 11, esOficial: false, estaCongelado: false, aperturaBalance: "tercero", conDetalleTercero: true };

  it("prefiere la versión que conserva el detalle por tercero aunque la oficial sea «Por cuenta»", () => {
    const candidatos = [porCuentaOficial, porTerceros];
    expect(seleccionarBalanceCruceModulo(candidatos, "2025-12", { preferirDetalleTercero: true })?.id).toBe(11);
    expect(seleccionarBalanceCruceModulo(candidatos, "2025-12")?.id).toBe(10);
    expect(avisoSeleccionBalance(candidatos, porTerceros, "2025-12")).toBe(
      "Se cruza contra el balance v1 «Por terceros» (2025-12-01 a 2025-12-31) porque conserva el detalle por tercero; el oficial del período, v1 «Por cuenta» (2025-12-01 a 2025-12-31), no lo trae.",
    );
  });

  it("sin ninguna versión con detalle conserva la oficial y no avisa", () => {
    const sinDetalle = { ...porTerceros, conDetalleTercero: false };
    expect(seleccionarBalanceCruceModulo([porCuentaOficial, sinDetalle], "2025-12", { preferirDetalleTercero: true })?.id).toBe(10);
    expect(avisoSeleccionBalance([porCuentaOficial, sinDetalle], porCuentaOficial, "2025-12")).toBeNull();
  });

  it("avisa cuando el mes tiene dos oficiales de distinto rango (KP Empaques)", () => {
    const mensual = { ...porCuentaOficial, id: 30 };
    const anual = { ...porTerceros, id: 26, esOficial: true, estaCongelado: true, periodoInicio: new Date("2025-01-01T00:00:00.000Z") };
    const candidatos = [mensual, anual]; // orden de la consulta: oficiales, fin de período, id descendente
    const elegido = seleccionarBalanceCruceModulo(candidatos, "2025-12", { preferirDetalleTercero: true });
    expect(elegido?.id).toBe(26);
    expect(avisoSeleccionBalance(candidatos, elegido, "2025-12")).toBe(
      "Hay 2 balances oficiales que terminan en 2025-12: v1 «Por cuenta» (2025-12-01 a 2025-12-31), v1 «Por terceros» (2025-01-01 a 2025-12-31). Se cruza contra el v1 «Por terceros» (2025-01-01 a 2025-12-31), el que conserva el detalle por tercero.",
    );
  });

  it("también en Ingresos y Nómina avisa de dos oficiales que terminan en el mes", () => {
    const mensual = { ...porCuentaOficial, id: 30, aperturaBalance: null, conDetalleTercero: false };
    const anual = { ...mensual, id: 26, periodoInicio: new Date("2025-01-01T00:00:00.000Z") };
    const elegido = seleccionarBalanceCruceModulo([mensual, anual], "2025-12");
    expect(elegido?.id).toBe(30);
    expect(avisoSeleccionBalance([mensual, anual], elegido, "2025-12")).toBe(
      "Hay 2 balances oficiales que terminan en 2025-12: v1 (2025-12-01 a 2025-12-31), v1 (2025-01-01 a 2025-12-31). Se cruza contra el v1 (2025-12-01 a 2025-12-31), el cargado más recientemente.",
    );
  });
});
