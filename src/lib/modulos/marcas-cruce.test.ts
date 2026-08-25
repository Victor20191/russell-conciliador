import { describe, expect, it } from "vitest";
import { construirCruceContable } from "./cruce-contable";
import {
  admiteMarca,
  anclaCruce,
  anclaObservacionMarca,
  anotarCruceConMarcas,
  etiquetaMarca,
  normalizarCuenta4,
  observacionesDeMarcas,
  siguienteNumeroMarca,
  validarNotaMarca,
  validarReferenciaAnexo,
  type MarcaCruce,
} from "./marcas-cruce";

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

const marca = (over: Partial<MarcaCruce> & { cuenta4: string }): MarcaCruce => ({
  numero: 1,
  nota: "Mercancía en tránsito no facturada.",
  referenciaAnexo: null,
  diferencia: 0,
  marcadoPor: "Victor Rivera",
  marcadoEn: "18/Ago/2026 8:07 a. m.",
  comentarioId: 10,
  adjuntos: [],
  ...over,
});

describe("admiteMarca", () => {
  it("solo las filas que no cuadran", () => {
    expect(admiteMarca({ cuadra: false })).toBe(true);
    expect(admiteMarca({ cuadra: true })).toBe(false);
  });
});

describe("anotarCruceConMarcas", () => {
  it("señala las filas con diferencia y resume lo pendiente", () => {
    const { filas, resumen } = anotarCruceConMarcas(cruce(), []);

    expect(filas.find((f) => f.cuenta4 === "1410")).toMatchObject({ admiteMarca: false, marca: null });
    expect(resumen).toMatchObject({ conDiferencia: 2, marcadas: 0, pendientes: 2, desactualizadas: 0 });
    // -988.836.804,40 (solo inventario) + 4.120.895.928,40 (descuadre)
    expect(resumen.montoPendiente).toBeCloseTo(3_132_059_124, 2);
  });

  it("pega la marca a su cuenta y la descuenta de lo pendiente", () => {
    const { filas, resumen } = anotarCruceConMarcas(cruce(), [
      marca({ cuenta4: "1435", numero: 2, diferencia: 4_120_895_928.4 }),
    ]);

    const fila = filas.find((f) => f.cuenta4 === "1435");
    expect(fila?.marca?.numero).toBe(2);
    expect(fila?.marca?.nota).toBe("Mercancía en tránsito no facturada.");
    expect(fila?.desactualizada).toBe(false);
    expect(resumen).toMatchObject({ conDiferencia: 2, marcadas: 1, pendientes: 1, desactualizadas: 0 });
    expect(resumen.montoPendiente).toBeCloseTo(-988_836_804.4, 2);
  });

  it("marca desactualizada la observación cuyo monto ya no coincide", () => {
    const { filas, resumen } = anotarCruceConMarcas(cruce(), [marca({ cuenta4: "1435", diferencia: 1_000 })]);

    expect(filas.find((f) => f.cuenta4 === "1435")?.desactualizada).toBe(true);
    // Sigue contando como marcada: la observación existe, pero pide revisión.
    expect(resumen).toMatchObject({ marcadas: 1, pendientes: 1, desactualizadas: 1 });
  });

  it("tolera un cambio de centavos sin marcar desactualizada", () => {
    const { filas } = anotarCruceConMarcas(cruce(), [
      marca({ cuenta4: "1435", diferencia: 4_120_895_928.4 + 0.005 }),
    ]);
    expect(filas.find((f) => f.cuenta4 === "1435")?.desactualizada).toBe(false);
  });

  it("conserva la observación de una cuenta que volvió a cuadrar, sin contarla como pendiente", () => {
    const { filas, resumen } = anotarCruceConMarcas(cruce(), [marca({ cuenta4: "1410", diferencia: 500 })]);

    const fila = filas.find((f) => f.cuenta4 === "1410");
    expect(fila?.marca?.nota).toBeTruthy();
    expect(fila?.admiteMarca).toBe(false);
    expect(fila?.desactualizada).toBe(false);
    expect(resumen).toMatchObject({ conDiferencia: 2, marcadas: 0, pendientes: 2 });
  });

  it("ignora una marca de una cuenta que ya no está en el cruce", () => {
    const { resumen } = anotarCruceConMarcas(cruce(), [marca({ cuenta4: "9999" })]);
    expect(resumen).toMatchObject({ conDiferencia: 2, marcadas: 0 });
  });
});

describe("observacionesDeMarcas", () => {
  it("lista solo las filas marcadas, ordenadas por número", () => {
    const { filas } = anotarCruceConMarcas(cruce(), [
      marca({ cuenta4: "1435", numero: 7, diferencia: 4_120_895_928.4 }),
      marca({ cuenta4: "1405", numero: 3, diferencia: -988_836_804.4 }),
    ]);

    expect(observacionesDeMarcas(filas).map((f) => f.marca?.numero)).toEqual([3, 7]);
  });

  it("deja fuera las filas sin marca", () => {
    const { filas } = anotarCruceConMarcas(cruce(), []);
    expect(observacionesDeMarcas(filas)).toEqual([]);
  });
});

describe("siguienteNumeroMarca", () => {
  it("empieza en 1 cuando el período no tiene marcas", () => {
    expect(siguienteNumeroMarca([])).toBe(1);
  });

  it("no recicla números: toma el mayor usado más uno aunque haya huecos", () => {
    expect(siguienteNumeroMarca([1, 2, 3])).toBe(4);
    expect(siguienteNumeroMarca([1, 5])).toBe(6);
    expect(siguienteNumeroMarca([4])).toBe(5);
  });
});

describe("etiquetaMarca y anclas", () => {
  it("etiqueta la marca como en el papel de trabajo", () => {
    expect(etiquetaMarca(3)).toBe("Marca 3");
  });

  it("ancla el hilo por cuenta y la observación por número", () => {
    expect(anclaCruce("1435")).toBe("cruce:1435");
    expect(anclaObservacionMarca(3)).toBe("marca-3");
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

describe("validarNotaMarca", () => {
  it("exige texto y recorta espacios", () => {
    expect(validarNotaMarca("   ")).toMatchObject({ ok: false });
    expect(validarNotaMarca("  en tránsito  ")).toEqual({ ok: true, nota: "en tránsito" });
  });

  it("rechaza notas demasiado largas", () => {
    expect(validarNotaMarca("x".repeat(2001))).toMatchObject({ ok: false });
    expect(validarNotaMarca("x".repeat(2000))).toMatchObject({ ok: true });
  });
});

describe("validarReferenciaAnexo", () => {
  it("es opcional: vacío queda en null", () => {
    expect(validarReferenciaAnexo("")).toEqual({ ok: true, referencia: null });
    expect(validarReferenciaAnexo("   ")).toEqual({ ok: true, referencia: null });
    expect(validarReferenciaAnexo(null)).toEqual({ ok: true, referencia: null });
  });

  it("recorta espacios y rechaza referencias larguísimas", () => {
    expect(validarReferenciaAnexo("  Anexo A-3  ")).toEqual({ ok: true, referencia: "Anexo A-3" });
    expect(validarReferenciaAnexo("x".repeat(121))).toMatchObject({ ok: false });
    expect(validarReferenciaAnexo("x".repeat(120))).toMatchObject({ ok: true });
  });
});
