import { describe, expect, it } from "vitest";
import { construirCruceContable } from "./cruce-contable";
import type { HijoContableCruce } from "./cruce-contable";
import { construirCruceTerceroCartera } from "./cartera/cruce-tercero-cartera";
import {
  admiteMarca,
  anclaCruce,
  anclaCruceTercero,
  anclaObservacionMarca,
  anotarCruceConMarcas,
  anotarCruceTerceroConMarcas,
  diferenciaAjustada,
  diferenciaAjustadaModulo,
  etiquetaMarca,
  intercalarObservaciones,
  normalizarCuenta4,
  observacionesDeMarcas,
  siguienteNumeroMarca,
  validarNoModulares,
  validarClasificadoresNoModulares,
  validarNotaMarca,
  validarReferenciaAnexo,
  type MarcaCruce,
  type MarcaPeriodo,
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
  noModulares: [],
  ...over,
});

const hijos: HijoContableCruce[] = [
  { cuenta8: "14350501", nombre: "MERCANCÍAS", valor: 4_000_000, noModular: false },
  { cuenta8: "145508", nombre: "AJUSTE INVENTARIO", valor: -24_716, noModular: true },
];

describe("validarNoModulares", () => {
  it("acepta las cuentas que sí son hijas de la fila, deduplicadas y ordenadas", () => {
    expect(validarNoModulares(["145508", "14350501", "145508"], hijos)).toEqual({
      ok: true,
      cuentas8: ["14350501", "145508"],
    });
  });

  it("una selección vacía es válida: la marca explica sin excluir", () => {
    expect(validarNoModulares([], hijos)).toEqual({ ok: true, cuentas8: [] });
  });

  it("rechaza una cuenta que no pertenece a la fila del cruce vigente", () => {
    const r = validarNoModulares(["99999999"], hijos);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.message).toContain("99999999");
  });

  it("normaliza el ruido de la entrada y descarta lo que no tiene dígitos", () => {
    expect(validarNoModulares([" 145-508 ", "", "  "], hijos)).toEqual({ ok: true, cuentas8: ["145508"] });
  });
});

describe("diferenciaAjustada", () => {
  it("resta el valor de las cuentas elegidas al lado contable", () => {
    expect(diferenciaAjustada({ contable: 4_000_000, inventario: 3_000_000 }, hijos, ["14350501"])).toBe(-3_000_000);
  });

  it("sin selección devuelve la diferencia de siempre", () => {
    expect(diferenciaAjustada({ contable: 500, inventario: 300 }, hijos, [])).toBe(200);
  });

  it("respeta el signo de una cuenta correctora negativa", () => {
    // Excluir −24.716 SUBE la diferencia: 500 − (−24.716) − 300.
    expect(diferenciaAjustada({ contable: 500, inventario: 300 }, hijos, ["145508"])).toBe(24_916);
  });
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

describe("marcas del cruce por tercero", () => {
  const cruceTercero = construirCruceTerceroCartera({
    contable: [
      { clave: "900000001", cuenta6: "130505", valor: 10_000, nombre: "UNO" },
      { clave: "900000002", cuenta6: "130505", valor: 1_000, nombre: "DOS" },
      { clave: "900000003", cuenta6: "130505", valor: 500, nombre: "TRES" },
      { clave: "900000004", cuenta6: "130505", valor: 700, nombre: "CUATRO" },
    ],
    modulo: [
      { clave: "900000001", saldo: 4_000, nombre: null, origenCartera: null, cuenta6: null },
      { clave: "900000002", saldo: 900, nombre: null, origenCartera: null, cuenta6: null },
      { clave: "900000004", saldo: 700, nombre: null, origenCartera: null, cuenta6: null },
      { clave: "900000005", saldo: 3_000, nombre: null, origenCartera: null, cuenta6: null },
    ],
    cuentasModulo: ["130505"],
  });
  const marcaTercero = (clave: string, diferencia: number, numero: number) =>
    marca({ dimension: "tercero", clave, cuenta4: "", diferencia, numero });

  it("toda diferencia admite marca, pero para cerrar solo se exige desde el umbral", () => {
    const { filas, resumen } = anotarCruceTerceroConMarcas(
      cruceTercero.filas,
      [marcaTercero("900000001", 6_000, 4), marca({ cuenta4: "1305", numero: 1 })],
      { umbralDescuadre: 2_000 },
    );
    const porClave = Object.fromEntries(filas.map((f) => [f.clave, [f.admiteMarca, f.requiereMarca, f.marca?.numero ?? null, f.desactualizada]]));
    expect(porClave).toEqual({
      "900000001": [true, true, 4, false], // diferencia de 6.000, marcada
      "900000002": [true, false, null, false], // 100: bajo el umbral
      "900000003": [true, false, null, false], // solo en contabilidad por 500
      "900000004": [false, false, null, false], // cuadra
      "900000005": [true, true, null, false], // solo en el auxiliar por 3.000
    });
    expect(resumen).toEqual({ conDiferencia: 2, marcadas: 1, pendientes: 1, desactualizadas: 0, montoPendiente: -3_000, bajoUmbral: 2 });
  });

  it("marca desactualizada cuando la diferencia del tercero cambió", () => {
    const { resumen } = anotarCruceTerceroConMarcas(cruceTercero.filas, [marcaTercero("900000001", 5_000, 4)], { umbralDescuadre: 2_000 });
    expect(resumen).toMatchObject({ marcadas: 1, desactualizadas: 1 });
  });

  it("la cédula contable no toma las marcas de tercero, aunque coincida el texto", () => {
    const { filas } = anotarCruceConMarcas(cruce(), [marca({ dimension: "tercero", clave: "1435", cuenta4: "1435", numero: 9 })]);
    expect(filas.every((f) => f.marca === null)).toBe(true);
  });

  it("ancla del hilo de un tercero", () => {
    expect(anclaCruceTercero("~CONSUMIDOR FINAL")).toBe("tercero:~CONSUMIDOR FINAL");
  });
});

describe("intercalarObservaciones (numeración compartida entre pestañas)", () => {
  const periodo = (numero: number, dimension: "cuenta4" | "tercero", llave: string): MarcaPeriodo => ({
    numero, dimension, llave, nota: `nota ${numero}`, diferencia: -numero, marcadoPor: "Ana", marcadoEn: "17/Sep/2026", soportes: 0,
  });
  const todas = [periodo(1, "cuenta4", "133005"), periodo(2, "tercero", "890903938"), periodo(3, "cuenta4", "220505+221005"), periodo(4, "cuenta4", "2335")];

  it("la pestaña contable lista la marca 2 del cruce por tercero y la que perdió su renglón", () => {
    const propias = [{ n: 3 }, { n: 1 }];
    const r = intercalarObservaciones(propias, (p) => p.n, todas);
    expect(r.map((e) => [e.numero, e.tipo])).toEqual([[1, "propia"], [2, "referencia"], [3, "propia"], [4, "referencia"]]);
    expect(r[1]).toMatchObject({ marca: { dimension: "tercero", llave: "890903938" } });
  });

  it("la pestaña por tercero lista las de cuenta como referencia", () => {
    const r = intercalarObservaciones([{ n: 2 }], (p) => p.n, todas);
    expect(r.map((e) => [e.numero, e.tipo])).toEqual([[1, "referencia"], [2, "propia"], [3, "referencia"], [4, "referencia"]]);
  });

  it("sin marcas del período quedan solo las propias", () => {
    expect(intercalarObservaciones([{ n: 5 }], (p) => p.n, [])).toEqual([{ tipo: "propia", numero: 5, item: { n: 5 } }]);
  });
});

describe("no modulares del saldo sin cuenta (lado del módulo)", () => {
  const hijos = [
    { clasificador: "241205", total: 320_648_000, noModular: false },
    { clasificador: "212020", total: 87_000_000, noModular: false },
  ];

  it("valida los clasificadores contra el renglón vigente, sin normalizarlos a dígitos", () => {
    expect(validarClasificadoresNoModulares(["212020", " 212020 ", ""], hijos)).toEqual({ ok: true, clasificadores: ["212020"] });
    expect(validarClasificadoresNoModulares([], hijos)).toEqual({ ok: true, clasificadores: [] });
    const r = validarClasificadoresNoModulares(["233535"], hijos);
    expect(r.ok).toBe(false);
  });

  it("la diferencia congelada descuenta lo excluido del lado del módulo", () => {
    const fila = { contable: 0, noModular: 0, inventario: 407_648_000 };
    expect(diferenciaAjustadaModulo(fila, hijos, [])).toBe(-407_648_000);
    expect(diferenciaAjustadaModulo(fila, hijos, ["212020"])).toBe(-320_648_000);
    expect(diferenciaAjustadaModulo(fila, hijos, ["241205", "212020"])).toBe(0);
  });
});
