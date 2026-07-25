import { describe, expect, test } from "vitest";
import {
  calcularResumenUso,
  clasificarFamilia,
  conteosPorFamiliaCanon,
  familiaDesdeModulo,
} from "./metricas";

describe("clasificarFamilia", () => {
  test("clasifica acciones de balance", () => {
    expect(clasificarFamilia("CARGÓ BALANCE")).toBe("balance");
    expect(clasificarFamilia("CONGELÓ BALANCE")).toBe("balance");
    expect(clasificarFamilia("GUARDÓ cambios en balance borrador")).toBe("balance");
  });

  test("clasifica conciliaciones y DIAN", () => {
    expect(clasificarFamilia("EJECUTÓ")).toBe("conciliaciones");
    expect(clasificarFamilia("ENVIÓ A REVISOR")).toBe("conciliaciones");
    expect(clasificarFamilia("GUARDÓ MAPEO DIAN")).toBe("dian");
    expect(clasificarFamilia("PIDIÓ ANÁLISIS IA", "Renglón 1", "DIAN 110")).toBe("dian");
  });

  test("desambigua COMENTÓ por contexto", () => {
    expect(clasificarFamilia("COMENTÓ", "Renglón 5", "DIAN 110")).toBe("dian");
    expect(clasificarFamilia("COMENTÓ", "Cuenta 1105", "Cruce 12")).toBe("conciliaciones");
  });

  test("clasifica administración de plataforma", () => {
    expect(clasificarFamilia("GENERÓ REPORTE IA", "Novedades", "")).toBe("administracion");
    expect(clasificarFamilia("EDITÓ PROMPT IA")).toBe("administracion");
  });
});

describe("familiaDesdeModulo", () => {
  test("mapea moduleKey conocidos", () => {
    expect(familiaDesdeModulo("balance")).toBe("balance");
    expect(familiaDesdeModulo("conciliaciones")).toBe("conciliaciones");
    expect(familiaDesdeModulo("dian")).toBe("dian");
    expect(familiaDesdeModulo("novedades")).toBe("administracion");
  });

  test("null si no hay módulo o es desconocido", () => {
    expect(familiaDesdeModulo(null)).toBe(null);
    expect(familiaDesdeModulo("")).toBe(null);
    expect(familiaDesdeModulo("xyz_desconocido")).toBe(null);
  });
});

describe("calcularResumenUso", () => {
  const base = new Date("2026-06-01T10:00:00.000Z");

  test("agrega totales, familias y tops", () => {
    const resumen = calcularResumenUso({
      periodoDesde: "2026-06-01T00:00:00.000Z",
      periodoHasta: "2026-06-30T23:59:59.000Z",
      nombresClientes: { 1: "Acme SAS" },
      eventos: [
        {
          user: "Ana",
          action: "CARGÓ BALANCE",
          entity: "B-1",
          detail: "periodo 2026-05",
          clientId: 1,
          createdAt: base,
        },
        {
          user: "Ana",
          action: "EJECUTÓ",
          entity: "Cruce X",
          detail: "mod · Acme",
          clientId: 1,
          createdAt: new Date("2026-06-02T10:00:00.000Z"),
        },
        {
          user: "Luis",
          action: "GUARDÓ MAPEO DIAN",
          entity: "Renglón 1",
          detail: "DIAN 110",
          clientId: null,
          createdAt: new Date("2026-06-03T10:00:00.000Z"),
        },
      ],
    });

    expect(resumen.totalAcciones).toBe(3);
    expect(resumen.totalUsuarios).toBe(2);
    expect(resumen.totalClientes).toBe(1);
    expect(resumen.topClientes[0]?.nombre).toBe("Acme SAS");
    expect(resumen.topUsuarios[0]?.usuario).toBe("Ana");
    expect(resumen.porFamilia.some((f) => f.nombre.includes("Balance"))).toBe(true);
    expect(resumen.serieDiaria).toHaveLength(3);
    expect(resumen.evidencia).toHaveLength(3);
  });

  test("sin eventos devuelve ceros", () => {
    const resumen = calcularResumenUso({
      periodoDesde: "2026-06-01T00:00:00.000Z",
      periodoHasta: "2026-06-30T23:59:59.000Z",
      eventos: [],
    });
    expect(resumen.totalAcciones).toBe(0);
    expect(resumen.totalUsuarios).toBe(0);
    expect(resumen.primeraAccion).toBe(null);
    expect(resumen.evidencia).toEqual([]);
  });
});

describe("conteosPorFamiliaCanon", () => {
  test("cuenta por clave canónica", () => {
    const c = conteosPorFamiliaCanon([
      { user: "A", action: "CARGÓ BALANCE", entity: "", detail: "", clientId: null, createdAt: new Date() },
      { user: "A", action: "EJECUTÓ", entity: "", detail: "", clientId: null, createdAt: new Date() },
      { user: "A", action: "EJECUTÓ", entity: "", detail: "", clientId: null, createdAt: new Date() },
    ]);
    expect(c.balance).toBe(1);
    expect(c.conciliaciones).toBe(2);
    expect(c.dian).toBe(0);
  });
});
