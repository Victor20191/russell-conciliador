import { describe, expect, test } from "vitest";
import { construirSeccionGraficosHtml, inyectarGraficosEnHtml } from "./graficos";
import type { ResumenAdopcion } from "./adopcion";
import type { ResumenUsoFactual } from "./metricas";

const usoVacio: ResumenUsoFactual = {
  periodoDesde: "2026-06-01T00:00:00.000Z",
  periodoHasta: "2026-06-30T23:59:59.000Z",
  totalAcciones: 0,
  totalConexiones: 0,
  totalUsuarios: 0,
  totalClientes: 0,
  primeraAccion: null,
  ultimaAccion: null,
  porFamilia: [],
  topAcciones: [],
  topUsuarios: [],
  detalleUsuarios: [],
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
        totalConexiones: 7,
        detalleUsuarios: [
          {
            usuario: "Ana",
            conexiones: 5,
            totalAcciones: 6,
            accionesPrincipales: [{ nombre: "CARGÓ BALANCE", total: 4 }],
            porFamilia: [{ nombre: "Balance de comprobación", total: 6 }],
          },
          {
            usuario: "Marta",
            conexiones: 2,
            totalAcciones: 0,
            accionesPrincipales: [],
            porFamilia: [],
          },
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
    expect(html).toContain("Usuarios con más actividad (top 5)");
    expect(html).toContain("Detalle de actividad por usuario");
    expect(html).toContain("inicios de sesión exitosos");
    expect(html).toContain("CARGÓ BALANCE (4)");
    expect(html).toContain("Sin acciones auditables registradas.");
    expect(html).toContain("Ana");
    expect(html).toContain("Acme SAS");
    expect(html).toContain("Adopción de nuevas funcionalidades");
    expect(html).toContain("Con actividad relacionada");
    expect(html).toContain("Sin actividad relacionada");
    expect(html).toContain("No se puede medir");
    expect(html).toContain("No confirma que una funcionalidad específica haya sido usada");
    expect(html).toContain("66.7% de las funcionalidades medibles tienen actividad relacionada");
    expect(html).toContain("Ritmo de uso diario");
    expect(html).toContain('<table role="presentation" width="100%"');
    expect(html).toContain('align="right"');
    expect(html).not.toContain("display:flex;align-items:baseline;justify-content:space-between");
    expect(html).not.toContain("<script");
  });

  test("no inventa un porcentaje cuando no hay funcionalidades medibles", () => {
    const html = construirSeccionGraficosHtml({
      uso: usoVacio,
      adopcion: {
        ...adopcionVacia,
        totalCambios: 1,
        noMedibles: 1,
        porcentajeAdopcion: null,
      },
    });

    expect(html).toContain("Porcentaje no calculable");
    expect(html).not.toContain("% de las funcionalidades medibles tienen actividad relacionada");
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

  test("reemplaza el bloque completo aunque el modelo anide <section> por gráfico", () => {
    const charts = construirSeccionGraficosHtml({ uso: usoVacio, adopcion: adopcionVacia });
    // Lo que devuelve un modelo que copió el bloque: secciones anidadas.
    const base =
      `<html><body><h1>t</h1>` +
      `<section id="rd-graficos-uso">` +
      `<section class="rd-chart" id="rd-chart-a">grafico viejo A</section>` +
      `<section class="rd-chart" id="rd-chart-b">grafico viejo B</section>` +
      `</section><footer>pie</footer></body></html>`;
    const out = inyectarGraficosEnHtml(base, charts);
    expect(out).toContain("Uso en gráficos");
    expect(out).not.toContain("grafico viejo A");
    expect(out).not.toContain("grafico viejo B");
    expect(out).toContain("<footer>pie</footer>");
    expect((out.match(/id="rd-graficos-uso"/g) ?? []).length).toBe(1);
  });

  test("no pierde el resto del documento si el modelo deja la sección sin cerrar", () => {
    const charts = construirSeccionGraficosHtml({ uso: usoVacio, adopcion: adopcionVacia });
    const base = `<html><body><h1>t</h1><section id="rd-graficos-uso"><section>a</section>`;
    const out = inyectarGraficosEnHtml(base, charts);
    expect(out).toContain("<h1>t</h1>");
    expect(out).toContain("Uso en gráficos");
    expect((out.match(/id="rd-graficos-uso"/g) ?? []).length).toBe(1);
  });
});
