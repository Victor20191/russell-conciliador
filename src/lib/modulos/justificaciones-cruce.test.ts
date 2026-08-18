import { describe, expect, it } from "vitest";
import { construirCruceContable } from "./cruce-contable";
import {
  anclaCruce,
  anotarCruceConJustificaciones,
  admiteJustificacion,
  normalizarCuenta4,
  validarNotaJustificacion,
  type JustificacionCruce,
} from "./justificaciones-cruce";

const cruce = () =>
  construirCruceContable({
    contablePorCuenta: { "1405": 0, "1410": 100, "1435": 4_350_298_527.59 },
    consolidado: [
      { clasificador: "MATERIAS PRIMAS", total: 988_836_804.4, cuentas4: ["1405"] },
      { clasificador: "EN PROCESO", total: 100, cuentas4: ["1410"] },
      { clasificador: "NO FABRICADAS", total: 229_402_599.19, cuentas4: ["1435"] },
    ],
    nombrePorCuenta: (cod) => `Cuenta ${cod}`,
  }).filas;

const justificacion = (over: Partial<JustificacionCruce> & { cuenta4: string }): JustificacionCruce => ({
  nota: "Mercancía en tránsito no facturada.",
  diferencia: 0,
  justificadoPor: "Victor Rivera",
  justificadoEn: "18/Ago/2026 8:07 a. m.",
  comentarioId: 10,
  ...over,
});

describe("admiteJustificacion", () => {
  it("solo las filas que no cuadran", () => {
    expect(admiteJustificacion({ cuadra: false })).toBe(true);
    expect(admiteJustificacion({ cuadra: true })).toBe(false);
  });
});

describe("anotarCruceConJustificaciones", () => {
  it("marca las filas con diferencia y resume lo pendiente", () => {
    const { filas, resumen } = anotarCruceConJustificaciones(cruce(), []);

    expect(filas.find((f) => f.cuenta4 === "1410")).toMatchObject({ admiteJustificacion: false, justificacion: null });
    expect(resumen).toMatchObject({ conDiferencia: 2, justificadas: 0, pendientes: 2, desactualizadas: 0 });
    // -988.836.804,40 (solo inventario) + 4.120.895.928,40 (descuadre)
    expect(resumen.montoPendiente).toBeCloseTo(3_132_059_124, 2);
  });

  it("pega la justificación a su cuenta y la descuenta de lo pendiente", () => {
    const { filas, resumen } = anotarCruceConJustificaciones(cruce(), [
      justificacion({ cuenta4: "1435", diferencia: 4_120_895_928.4 }),
    ]);

    const fila = filas.find((f) => f.cuenta4 === "1435");
    expect(fila?.justificacion?.nota).toBe("Mercancía en tránsito no facturada.");
    expect(fila?.desactualizada).toBe(false);
    expect(resumen).toMatchObject({ conDiferencia: 2, justificadas: 1, pendientes: 1, desactualizadas: 0 });
    expect(resumen.montoPendiente).toBeCloseTo(-988_836_804.4, 2);
  });

  it("marca desactualizada la justificación cuyo monto ya no coincide", () => {
    const { filas, resumen } = anotarCruceConJustificaciones(cruce(), [
      justificacion({ cuenta4: "1435", diferencia: 1_000 }),
    ]);

    expect(filas.find((f) => f.cuenta4 === "1435")?.desactualizada).toBe(true);
    // Sigue contando como justificada: la nota existe, pero pide revisión.
    expect(resumen).toMatchObject({ justificadas: 1, pendientes: 1, desactualizadas: 1 });
  });

  it("tolera un cambio de centavos sin marcar desactualizada", () => {
    const { filas } = anotarCruceConJustificaciones(cruce(), [
      justificacion({ cuenta4: "1435", diferencia: 4_120_895_928.4 + 0.005 }),
    ]);
    expect(filas.find((f) => f.cuenta4 === "1435")?.desactualizada).toBe(false);
  });

  it("conserva la nota de una cuenta que volvió a cuadrar, sin contarla como pendiente", () => {
    const { filas, resumen } = anotarCruceConJustificaciones(cruce(), [
      justificacion({ cuenta4: "1410", diferencia: 500 }),
    ]);

    const fila = filas.find((f) => f.cuenta4 === "1410");
    expect(fila?.justificacion?.nota).toBeTruthy();
    expect(fila?.admiteJustificacion).toBe(false);
    expect(fila?.desactualizada).toBe(false);
    expect(resumen).toMatchObject({ conDiferencia: 2, justificadas: 0, pendientes: 2 });
  });

  it("ignora una justificación de una cuenta que ya no está en el cruce", () => {
    const { resumen } = anotarCruceConJustificaciones(cruce(), [justificacion({ cuenta4: "9999" })]);
    expect(resumen).toMatchObject({ conDiferencia: 2, justificadas: 0 });
  });
});

describe("anclaCruce", () => {
  it("ancla el hilo por cuenta", () => {
    expect(anclaCruce("1435")).toBe("cruce:1435");
  });
});

describe("normalizarCuenta4", () => {
  it("acepta solo códigos de cuatro dígitos", () => {
    expect(normalizarCuenta4("1435")).toBe("1435");
    expect(normalizarCuenta4(" 14-35 ")).toBe("1435");
    expect(normalizarCuenta4("143")).toBeNull();
    expect(normalizarCuenta4("143505")).toBeNull();
    expect(normalizarCuenta4("")).toBeNull();
  });
});

describe("validarNotaJustificacion", () => {
  it("exige texto y recorta espacios", () => {
    expect(validarNotaJustificacion("   ")).toMatchObject({ ok: false });
    expect(validarNotaJustificacion("  en tránsito  ")).toEqual({ ok: true, nota: "en tránsito" });
  });

  it("rechaza notas demasiado largas", () => {
    expect(validarNotaJustificacion("x".repeat(2001))).toMatchObject({ ok: false });
    expect(validarNotaJustificacion("x".repeat(2000))).toMatchObject({ ok: true });
  });
});
