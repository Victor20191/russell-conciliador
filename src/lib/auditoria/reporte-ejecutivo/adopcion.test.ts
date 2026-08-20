import { describe, expect, test } from "vitest";
import { evaluarAdopcion } from "./adopcion";
import type { FamiliaProceso } from "./metricas";

const vacio: Record<FamiliaProceso, number> = {
  balance: 0,
  conciliaciones: 0,
  dian: 0,
  clientes: 0,
  mapeo: 0,
  usuarios: 0,
  administracion: 0,
  otros: 0,
};

describe("evaluarAdopcion", () => {
  test("clasifica por actividad de la familia sin afirmar uso individual", () => {
    const resumen = evaluarAdopcion({
      conteosPorFamilia: { ...vacio, balance: 5 },
      cambios: [
        {
          versionNumero: "1.0.0",
          versionTitulo: "Lanzamiento",
          tipo: "nueva",
          titulo: "Carga de balance con IA",
          descripcion: "…",
          modulo: "balance",
          ruta: "/balance",
          comoOperar: null,
          ejemplo: null,
          estadoFuncionalidad: "disponible",
        },
        {
          versionNumero: "1.0.0",
          versionTitulo: "Lanzamiento",
          tipo: "mejora",
          titulo: "Conciliación mejorada",
          descripcion: "…",
          modulo: "conciliaciones",
          ruta: "/conciliacion",
          comoOperar: null,
          ejemplo: null,
          estadoFuncionalidad: "disponible",
        },
        {
          versionNumero: "1.0.0",
          versionTitulo: "Lanzamiento",
          tipo: "mejora",
          titulo: "Cambio cosmético",
          descripcion: "…",
          modulo: null,
          ruta: null,
          comoOperar: null,
          ejemplo: null,
          estadoFuncionalidad: "disponible",
        },
      ],
    });

    expect(resumen.totalCambios).toBe(3);
    expect(resumen.usadas).toBe(1);
    expect(resumen.sinEvidencia).toBe(1);
    expect(resumen.noMedibles).toBe(1);
    expect(resumen.evaluables).toBe(2);
    expect(resumen.porcentajeAdopcion).toBe(50);
    expect(resumen.items[0]?.estado).toBe("usada");
    expect(resumen.items[0]?.estadoEtiqueta).toBe("Con actividad relacionada");
    expect(resumen.items[1]?.estado).toBe("sin_evidencia");
    expect(resumen.items[1]?.estadoEtiqueta).toBe("Sin actividad relacionada");
    expect(resumen.items[2]?.estado).toBe("no_medible");
    expect(resumen.items[2]?.estadoEtiqueta).toBe("No se puede medir");
  });

  test("sin evaluables → porcentaje null", () => {
    const resumen = evaluarAdopcion({
      conteosPorFamilia: vacio,
      cambios: [
        {
          versionNumero: "1.0.0",
          versionTitulo: "X",
          tipo: "mejora",
          titulo: "Sin módulo",
          descripcion: "…",
          modulo: null,
          ruta: null,
          comoOperar: null,
          ejemplo: null,
          estadoFuncionalidad: "disponible",
        },
      ],
    });
    expect(resumen.porcentajeAdopcion).toBe(null);
    expect(resumen.evaluables).toBe(0);
  });
});
