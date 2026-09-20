import { describe, expect, it } from "vitest";
import {
  alertaComparativo,
  compararUso,
  diasDePeriodo,
  variacion,
  soloFecha,
  UMBRAL_ALERTA_USO_PCT,
} from "@/lib/auditoria/reporte-ejecutivo/comparativo";
import type { ResumenUsoFactual } from "@/lib/auditoria/reporte-ejecutivo/metricas";

function resumen(p: Partial<ResumenUsoFactual> & { periodoDesde: string; periodoHasta: string }): ResumenUsoFactual {
  return {
    totalAcciones: 0,
    totalNavegaciones: 0,
    totalConexiones: 0,
    totalUsuarios: 0,
    totalClientes: 0,
    primeraAccion: null,
    ultimaAccion: null,
    porFamilia: [],
    navegacionesPorFamilia: [],
    topAcciones: [],
    topUsuarios: [],
    detalleUsuarios: [],
    topClientes: [],
    serieDiaria: [],
    evidencia: [],
    ...p,
  };
}

const previo = resumen({
  periodoDesde: "2026-07-22T00:00:00.000Z",
  periodoHasta: "2026-08-20T23:59:59.999Z",
  totalAcciones: 1000,
  totalUsuarios: 10,
  totalConexiones: 80,
  totalClientes: 20,
  porFamilia: [
    { nombre: "Balance de comprobación", total: 600 },
    { nombre: "Inventarios", total: 400 },
  ],
  topUsuarios: [
    { usuario: "Luisa", correo: null, total: 600, porFamilia: [] },
    { usuario: "Camilo", correo: null, total: 400, porFamilia: [] },
  ],
});

const actual = resumen({
  periodoDesde: "2026-08-22T00:00:00.000Z",
  periodoHasta: "2026-09-20T23:59:59.999Z",
  totalAcciones: 1200,
  totalUsuarios: 9,
  totalConexiones: 80,
  totalClientes: 25,
  porFamilia: [
    { nombre: "Balance de comprobación", total: 900 },
    { nombre: "Mapeo de cuentas", total: 300 },
  ],
  topUsuarios: [
    { usuario: "Luisa", correo: null, total: 900, porFamilia: [] },
    { usuario: "Camilo", correo: null, total: 300, porFamilia: [] },
  ],
});

describe("diasDePeriodo", () => {
  it("cuenta ambos extremos", () => {
    expect(diasDePeriodo("2026-09-01T00:00:00Z", "2026-09-30T23:59:59Z")).toBe(30);
    expect(diasDePeriodo("2026-09-01T00:00:00Z", "2026-09-01T10:00:00Z")).toBe(1);
  });
});

describe("variacion", () => {
  it("calcula diferencia, porcentaje y dirección", () => {
    expect(variacion("x", 120, 100)).toEqual({
      etiqueta: "x",
      actual: 120,
      previo: 100,
      diferencia: 20,
      variacionPct: 20,
      direccion: "subio",
    });
  });

  it("deja el porcentaje en null cuando el período previo estaba en cero", () => {
    expect(variacion("x", 5, 0).variacionPct).toBeNull();
    expect(variacion("x", 5, 0).direccion).toBe("subio");
  });

  it("marca «igual» sin variación", () => {
    expect(variacion("x", 7, 7).direccion).toBe("igual");
  });
});

describe("compararUso", () => {
  const c = compararUso({ actual, previo, base: "reporte_anterior", generadoEn: "2026-08-21T10:00:00.000Z" });

  it("compara los totales del período", () => {
    expect(c.totales[0]).toMatchObject({ etiqueta: "Operaciones registradas", previo: 1000, actual: 1200, variacionPct: 20 });
    expect(c.totales[1]).toMatchObject({ etiqueta: "Usuarios que operaron", direccion: "bajo", diferencia: -1 });
  });

  it("marca comparables dos períodos de igual duración", () => {
    expect(c.comparable).toBe(true);
    expect(c.actual.dias).toBe(30);
    expect(c.previo.dias).toBe(30);
  });

  it("incluye las familias de ambos períodos, aunque una desaparezca", () => {
    const familias = Object.fromEntries(c.porFamilia.map((f) => [f.etiqueta, f]));
    expect(familias["Balance de comprobación"]).toMatchObject({ previo: 600, actual: 900 });
    expect(familias["Inventarios"]).toMatchObject({ previo: 400, actual: 0, direccion: "bajo" });
    expect(familias["Mapeo de cuentas"]).toMatchObject({ previo: 0, actual: 300, variacionPct: null });
  });

  it("compara a los usuarios más activos", () => {
    expect(c.porUsuario.find((u) => u.etiqueta === "Camilo")).toMatchObject({ previo: 400, actual: 300, direccion: "bajo" });
  });

  it("señala los períodos de distinta duración y calcula el promedio diario", () => {
    const corto = compararUso({
      actual: resumen({ periodoDesde: "2026-09-01T00:00:00Z", periodoHasta: "2026-09-10T23:59:59Z", totalAcciones: 500 }),
      previo,
      base: "reporte_anterior",
    });
    expect(corto.comparable).toBe(false);
    // 500/10 = 50 por día contra 1000/30 = 33,33 → sube aunque el total baje.
    expect(corto.totales[0].direccion).toBe("bajo");
    expect(corto.promedioDiario.direccion).toBe("subio");
  });
});

describe("alertaComparativo", () => {
  it("alerta en alza cuando el uso sube por encima del umbral", () => {
    const a = alertaComparativo(compararUso({ actual, previo, base: "reporte_anterior" }));
    expect(a.nivel).toBe("alza");
    expect(a.titulo).toContain("subió");
    expect(a.mensaje).toContain("reporte anterior");
  });

  it("alerta en baja cuando el uso cae", () => {
    const a = alertaComparativo(compararUso({ actual: previo, previo: actual, base: "reporte_anterior" }));
    expect(a.nivel).toBe("baja");
    expect(a.titulo).toContain("bajó");
  });

  it("no alerta por variaciones menores al umbral de materialidad", () => {
    const casiIgual = resumen({ ...actual, totalAcciones: 1020 } as Partial<ResumenUsoFactual> & { periodoDesde: string; periodoHasta: string });
    const a = alertaComparativo(compararUso({ actual: casiIgual, previo, base: "reporte_anterior" }));
    expect(a.nivel).toBe("estable");
    expect(a.mensaje).toContain(`${UMBRAL_ALERTA_USO_PCT} %`);
  });

  it("con períodos de distinta duración se apoya en el promedio diario", () => {
    const corto = compararUso({
      actual: resumen({ periodoDesde: "2026-09-01T00:00:00Z", periodoHasta: "2026-09-10T23:59:59Z", totalAcciones: 500 }),
      previo,
      base: "periodo_anterior",
    });
    const a = alertaComparativo(corto);
    expect(a.nivel).toBe("alza");
    expect(a.mensaje).toContain("por día");
    expect(a.mensaje).toContain("período anterior");
  });
});

describe("soloFecha", () => {
  it("lee tal cual una fecha de calendario declarada en UTC", () => {
    expect(soloFecha("2026-09-01T00:00:00.000Z")).toBe("2026-09-01");
    expect(soloFecha("2026-09-20T23:59:59.999Z")).toBe("2026-09-20");
  });

  it("traduce a la zona de la operación una ventana armada en hora local", () => {
    // 2026-09-20 23:59:59 en Colombia = 2026-09-21T04:59:59Z: la etiqueta sigue siendo el día 20.
    expect(soloFecha("2026-09-21T04:59:59.999Z")).toBe("2026-09-20");
    expect(soloFecha("2026-08-22T05:00:00.000Z")).toBe("2026-08-22");
  });
});
