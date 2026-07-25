import { describe, expect, test } from "vitest";
import { construirSeccionGraficosHtml, inyectarGraficosEnHtml } from "./graficos";
import type { ResumenAdopcion } from "./adopcion";
import type { ResumenUsoFactual } from "./metricas";

const usoVacio: ResumenUsoFactual = {
  periodoDesde: "2026-06-01T00:00:00.000Z",
  periodoHasta: "2026-06-30T23:59:59.000Z",
  totalAcciones: 0,
  totalUsuarios: 0,
  totalClientes: 0,
  primeraAccion: null,
  ultimaAccion: null,
  porFamilia: [],
  topAcciones: [],
  topUsuarios: [],
  topClientes: [],
  serieDiaria: [],
  evidencia: [],
};

const adopcionVacia: ResumenAdopcion = {
  totalCambios: 0,
  evaluables: 0,
  usadas: 0,
  sinEvidencia: 0,
  noMedibles: 0,
  porcentajeAdopcion: null,
  items: [],
  porEstado: [],
};

describe("construirSeccionGraficosHtml", () => {
  test("incluye marca y títulos de gráficos con datos", () => {
    const html = construirSeccionGraficosHtml({
      uso: {
        ...usoVacio,
        totalAcciones: 10,
        totalUsuarios: 2,
        porFamilia: [
          { nombre: "Balance de comprobación", total: 7 },
          { nombre: "Conciliaciones", total: 3 },
        ],
        topUsuarios: [
          { usuario: "Ana", total: 6, porFamilia: [{ nombre: "Balance de comprobación", total: 6 }] },
          { usuario: "Luis", total: 4, porFamilia: [] },
        ],
        topAcciones: [{ nombre: "CARGÓ BALANCE", total: 5 }],
        topClientes: [{ clienteId: 1, nombre: "Acme SAS", total: 3 }],
        serieDiaria: [
          { fecha: "2026-06-01", total: 2 },
          { fecha: "2026-06-02", total: 8 },
        ],
      },
      adopcion: {
        ...adopcionVacia,
        totalCambios: 4,
        evaluables: 3,
        usadas: 2,
        sinEvidencia: 1,
        noMedibles: 1,
        porcentajeAdopcion: 66.7,
      },
    });

    expect(html).toContain('id="rd-graficos-uso"');
    expect(html).toContain("Módulos y procesos más usados");
    expect(html).toContain("Usuarios con más actividad");
    expect(html).toContain("Ana");
    expect(html).toContain("Acme SAS");
    expect(html).toContain("Adopción de novedades");
    expect(html).toContain("Ritmo de uso diario");
    expect(html).not.toContain("<script");
  });
});

describe("inyectarGraficosEnHtml", () => {
  test("inserta antes de Recomendaciones si no existe", () => {
    const base = "<html><body><h2>Intro</h2><h2>Recomendaciones</h2></body></html>";
    const charts = construirSeccionGraficosHtml({ uso: usoVacio, adopcion: adopcionVacia });
    const out = inyectarGraficosEnHtml(base, charts);
    expect(out.indexOf("rd-graficos-uso")).toBeLessThan(out.indexOf("Recomendaciones"));
  });

  test("reemplaza si ya existe la marca", () => {
    const charts = construirSeccionGraficosHtml({ uso: usoVacio, adopcion: adopcionVacia });
    const base = `<html><body><section id="rd-graficos-uso">viejo</section><footer>x</footer></body></html>`;
    const out = inyectarGraficosEnHtml(base, charts);
    expect(out).toContain("Uso en gráficos");
    expect(out).not.toContain(">viejo<");
    expect((out.match(/id="rd-graficos-uso"/g) ?? []).length).toBe(1);
  });
});
