import { describe, expect, test } from "vitest";
import {
  compararVersiones,
  fechasDesdeHistorial,
  leerHistorialServidor,
  primerArranquePorVersion,
  versionesQueEntran,
  versionMayor,
} from "./registro-despliegue";
import { fechaDespliegueTexto, instanteDespliegue } from "./despliegue";

describe("compararVersiones / versionMayor", () => {
  test("ordena por número, no por texto", () => {
    expect(compararVersiones("3.10.0", "3.9.0")).toBeGreaterThan(0);
    expect(compararVersiones("3.7.1", "3.7.1")).toBe(0);
    expect(compararVersiones("2.5.0", "3.0.0")).toBeLessThan(0);
    expect(versionMayor(["3.7.0", "3.10.0", "x", "3.9.9"])).toBe("3.10.0");
    expect(versionMayor([])).toBeNull();
  });
});

describe("versionesQueEntran", () => {
  const versiones = [
    { number: "3.6.0", deployedAt: instanteDespliegue("2026-11-06") },
    { number: "3.7.0", deployedAt: null },
    { number: "3.7.1", deployedAt: null },
    { number: "3.8.0", deployedAt: null },
    { number: "2.1.2", deployedAt: null },
  ];

  test("entran las mayores que la anterior y hasta la actual, sin fecha", () => {
    expect(versionesQueEntran({ versiones, anterior: "3.6.0", actual: "3.7.1" }).map((v) => v.number))
      .toEqual(["3.7.0", "3.7.1"]);
  });

  test("el primer registro no le pone fecha al pasado", () => {
    expect(versionesQueEntran({ versiones, anterior: null, actual: "3.8.0" })).toEqual([]);
  });

  test("volver a una versión anterior no fecha nada", () => {
    expect(versionesQueEntran({ versiones, anterior: "3.8.0", actual: "3.7.1" })).toEqual([]);
  });

  test("no cambia una fecha que ya existe", () => {
    expect(versionesQueEntran({ versiones, anterior: "3.5.0", actual: "3.6.0" })).toEqual([]);
  });
});

describe("historial del servidor", () => {
  const texto = [
    'HEAD@{2026-11-12 22:15:00 -0500} 9f8e7d6 "version": "3.7.1",',
    'HEAD@{2026-11-06 09:10:00 -0500} 5ef1eaf "version": "3.6.0",',
    "basura que no es una entrada",
    'HEAD@{2026-10-19 16:00:00 -0500} 6d9c2c8 "version": "3.0.0",',
    "2026-10-01 2.5.0",
  ].join("\n");

  test("lee las líneas del reflog y las escritas a mano, en orden", () => {
    const entradas = leerHistorialServidor(texto);
    expect(entradas.map((e) => e.version)).toEqual(["2.5.0", "3.0.0", "3.6.0", "3.7.1"]);
  });

  test("cada versión toma el día (en Colombia) en que el servidor la tuvo por primera vez", () => {
    const fechas = fechasDesdeHistorial(leerHistorialServidor(texto), ["3.0.0", "3.1.0", "3.6.0", "3.7.0", "3.7.1", "3.8.0"]);
    const dia = (n: string) => fechaDespliegueTexto(fechas.get(n));
    expect(dia("3.0.0")).toBe("2026-10-19");
    // 3.1.0 no aparece sola: llegó con la primera versión mayor que tuvo el servidor.
    expect(dia("3.1.0")).toBe("2026-11-06");
    expect(dia("3.6.0")).toBe("2026-11-06");
    expect(dia("3.7.0")).toBe("2026-11-12");
    // 22:15 en Colombia sigue siendo el 12 (en UTC ya sería el 13).
    expect(dia("3.7.1")).toBe("2026-11-12");
    expect(fechas.has("3.8.0")).toBe(false);
  });

  test("lo que ya estaba en la entrada más antigua no tiene día conocido", () => {
    const fechas = fechasDesdeHistorial(leerHistorialServidor(texto), ["2.4.0", "2.5.0"]);
    expect(fechas.size).toBe(0);
  });

  test("primer arranque de cada versión del historial", () => {
    const primeras = primerArranquePorVersion(leerHistorialServidor(texto));
    expect([...primeras.keys()]).toEqual(["2.5.0", "3.0.0", "3.6.0", "3.7.1"]);
  });
});
