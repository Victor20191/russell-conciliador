import { describe, expect, it } from "vitest";
import { construirCruceContable } from "./cruce-contable";
import type { HijoContableCruce } from "./cruce-contable";
import { construirCruceTerceroCartera } from "./cartera/cruce-tercero-cartera";
import { emparejarCedulaActivos } from "./activos/cedula-activos";
import {
  admiteMarca,
  anclaCruce,
  anclaCruceTercero,
  anclaObservacionMarca,
  anotarControlConMarcas,
  anotarCruceConMarcas,
  anotarCruceTerceroConMarcas,
  diferenciaAjustada,
  totalNoContabilizado,
  destinosMarcaSinRenglon,
  diferenciaAjustadaModulo,
  motivoNoPasarMarca,
  etiquetaMarca,
  intercalarObservaciones,
  leerMontoMarca,
  montoDeMarca,
  normalizarCuenta4,
  observacionesDeMarcas,
  terceroRelacionable,
  textoMontoMarca,
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

  // Conceptos NO CONTABILIZADOS: lo que el archivo trae y la contabilidad no registra en esa
  // cuenta se resta del lado del MÓDULO, así que la diferencia SUBE.
  it("resta del lado del módulo lo que se declara no contabilizado", () => {
    expect(diferenciaAjustada({ contable: 500, inventario: 300 }, hijos, [], 120)).toBe(320);
  });

  it("una exclusión por cada lado deja la fila cuadrada", () => {
    expect(diferenciaAjustada({ contable: 500, inventario: 300 }, [{ cuenta8: "14350501", nombre: "x", valor: 200, noModular: true }], ["14350501"], 0)).toBe(0);
    expect(diferenciaAjustada({ contable: 500, inventario: 500 }, hijos, [], 0)).toBe(0);
  });
});

describe("totalNoContabilizado", () => {
  const conceptos = [
    { clasificador: "MATERNIDAD", total: 5_694_500 },
    { clasificador: "BONIFICACIÓN", total: 9_472_750 },
    { clasificador: "AJUSTE", total: -1_000 },
  ];

  it("suma solo los conceptos elegidos", () => {
    expect(totalNoContabilizado(conceptos, ["MATERNIDAD"])).toBe(5_694_500);
    expect(totalNoContabilizado(conceptos, ["MATERNIDAD", "BONIFICACIÓN"])).toBe(15_167_250);
  });

  it("sin selección es cero y respeta el signo del concepto", () => {
    expect(totalNoContabilizado(conceptos, [])).toBe(0);
    expect(totalNoContabilizado(conceptos, ["AJUSTE"])).toBe(-1_000);
  });

  it("ignora un concepto que no está en el renglón", () => {
    expect(totalNoContabilizado(conceptos, ["OTRO"])).toBe(0);
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

    expect(filas.find((f) => f.cuenta4 === "1410")).toMatchObject({ admiteMarca: false, marcas: [] });
    expect(resumen).toMatchObject({ conDiferencia: 2, marcadas: 0, pendientes: 2, desactualizadas: 0 });
    // -988.836.804,40 (solo inventario) + 4.120.895.928,40 (descuadre)
    expect(resumen.montoPendiente).toBeCloseTo(3_132_059_124, 2);
  });

  it("pega la marca a su cuenta y la descuenta de lo pendiente", () => {
    const { filas, resumen } = anotarCruceConMarcas(cruce(), [
      marca({ cuenta4: "1435", numero: 2, diferencia: 4_120_895_928.4 }),
    ]);

    const fila = filas.find((f) => f.cuenta4 === "1435");
    expect(fila?.marcas.map((m) => m.numero)).toEqual([2]);
    expect(fila?.marcas[0]?.nota).toBe("Mercancía en tránsito no facturada.");
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
    expect(fila?.marcas[0]?.nota).toBeTruthy();
    expect(fila?.admiteMarca).toBe(false);
    expect(fila?.desactualizada).toBe(false);
    expect(resumen).toMatchObject({ conDiferencia: 2, marcadas: 0, pendientes: 2 });
  });

  it("ignora una marca de una cuenta que ya no está en el cruce", () => {
    const { resumen } = anotarCruceConMarcas(cruce(), [marca({ cuenta4: "9999" })]);
    expect(resumen).toMatchObject({ conDiferencia: 2, marcadas: 0 });
  });
});

describe("marcas del control de deducciones (Nómina)", () => {
  const filaControl = (cuentaCliente: string, contable: number | null, modulo: number) => ({
    cuentaCliente,
    nombre: contable == null ? null : `Cuenta ${cuentaCliente}`,
    cuentasBalance: contable == null ? [] : [cuentaCliente],
    contable,
    modulo,
    diferencia: contable == null ? null : Math.round((contable - modulo) * 100) / 100,
    cuadra: contable != null && Math.abs(contable - modulo) <= 0.01,
    conceptos: [],
  });

  it("toda diferencia desde un centavo exige marca; sin la cuenta en el balance, contra cero", () => {
    const { filas, resumen } = anotarControlConMarcas([
      filaControl("236505", -1_000, -1_000),
      filaControl("237005", -500, -500.02),
      filaControl("237025", null, -300),
    ], []);
    expect(filas.map((f) => [f.cuentaCliente, f.diferenciaEfectiva, f.requiereMarca])).toEqual([
      ["236505", 0, false],
      ["237005", 0.02, true],
      ["237025", 300, true],
    ]);
    expect(resumen).toMatchObject({ conDiferencia: 2, pendientes: 2, marcadas: 0 });
  });

  it("la marca se pega por la cuenta del cliente y queda desactualizada si cambia la diferencia", () => {
    const marcaControl = marca({ dimension: "control", cuenta4: "", clave: "237025", diferencia: 300, numero: 7 });
    const vigente = anotarControlConMarcas([filaControl("237025", null, -300)], [marcaControl]);
    expect(vigente.filas[0].marcas.map((m) => m.numero)).toEqual([7]);
    expect(vigente.filas[0].desactualizada).toBe(false);
    expect(vigente.resumen).toMatchObject({ marcadas: 1, pendientes: 0 });
    const cambio = anotarControlConMarcas([filaControl("237025", null, -450)], [marcaControl]);
    expect(cambio.resumen).toMatchObject({ desactualizadas: 1 });
    // Una marca de cuenta con la misma clave no se confunde con la del control.
    expect(anotarControlConMarcas([filaControl("237025", null, -300)], [marca({ cuenta4: "237025" })]).filas[0].marcas).toEqual([]);
  });
});

describe("anotarCruceConMarcas con la tolerancia de la cédula", () => {
  // 1405: −1.999,99 · 1410: −2.000 · 1435: 500 · 1440: cuadra.
  const conTolerancia = () =>
    construirCruceContable({
      contablePorCuenta: { "1405": 0, "1410": 0, "1435": 500, "1440": 300 },
      consolidado: [
        { clasificador: "A", total: 1_999.99, cuentas4: ["1405"] },
        { clasificador: "B", total: 2_000, cuentas4: ["1410"] },
        { clasificador: "D", total: 300, cuentas4: ["1440"] },
      ],
      nombrePorCuenta: (cod) => `Cuenta ${cod}`,
    }).filas;

  it("exige marca desde la tolerancia inclusive; por debajo es opcional y cuenta aparte", () => {
    const { filas, resumen } = anotarCruceConMarcas(conTolerancia(), [], { toleranciaMarca: 2_000 });
    const por = (c: string) => filas.find((f) => f.cuenta4 === c);

    expect(por("1405")).toMatchObject({ admiteMarca: true, requiereMarca: false });
    expect(por("1410")).toMatchObject({ admiteMarca: true, requiereMarca: true });
    expect(por("1435")).toMatchObject({ admiteMarca: true, requiereMarca: false });
    expect(por("1440")).toMatchObject({ admiteMarca: false, requiereMarca: false });
    expect(resumen).toEqual({ conDiferencia: 1, marcadas: 0, pendientes: 1, desactualizadas: 0, montoPendiente: -2_000, montoPorExplicar: 0, bajoUmbral: 2 });
  });

  it("una marca dentro de la tolerancia se conserva; lo que falta por debajo de la tolerancia no la desactualiza", () => {
    const { filas, resumen } = anotarCruceConMarcas(conTolerancia(), [marca({ cuenta4: "1435", diferencia: 100 })], { toleranciaMarca: 2_000 });
    expect(filas.find((f) => f.cuenta4 === "1435")).toMatchObject({ requiereMarca: false, desactualizada: false, explicado: 100, porExplicar: 400 });
    expect(resumen).toMatchObject({ marcadas: 0, desactualizadas: 0, bajoUmbral: 2 });
  });

  it("Activos fijos: con el neto cuadrado, el detalle exige marca desde su tolerancia y la marca congela el costo", () => {
    const afi = (costoModulo: number, depModulo: number) => {
      const cruce = construirCruceContable({
        contablePorCuenta: { "1516": 100_000, "159205": 30_000 },
        consolidado: [
          { clasificador: "EDIFICIOS", total: costoModulo, cuentas4: ["1516"] },
          { clasificador: "EDIFICIOS · depreciación", total: depModulo, cuentas4: ["159205"], relacionado: true },
        ],
        nombrePorCuenta: () => null,
      });
      return emparejarCedulaActivos(cruce, new Map([["1516", "159205"]])).filas;
    };
    // Reclasificación de 12.000 entre costo y depreciación: el neto cuadra.
    const reclasificada = afi(88_000, 18_000);
    const { filas, resumen } = anotarCruceConMarcas(reclasificada, [], { toleranciaMarca: 2_000, toleranciaDetalle: 10_000 });
    expect(filas[0]).toMatchObject({ cuadra: true, admiteMarca: true, requiereMarca: true });
    expect(resumen).toMatchObject({ conDiferencia: 1, pendientes: 1 });
    // Por debajo de la tolerancia del detalle la marca es opcional.
    const chica = anotarCruceConMarcas(afi(95_000, 25_000), [], { toleranciaMarca: 2_000, toleranciaDetalle: 10_000 });
    expect(chica.filas[0]).toMatchObject({ admiteMarca: true, requiereMarca: false });
    expect(chica.resumen.bajoUmbral).toBe(1);
    // La marca explica la diferencia del costo: si la reclasificación crece más allá de la tolerancia
    // del detalle, falta por explicar.
    const vigente = anotarCruceConMarcas(reclasificada, [marca({ cuenta4: "1516", diferencia: 12_000 })], { toleranciaMarca: 2_000, toleranciaDetalle: 10_000 });
    expect(vigente.filas[0].desactualizada).toBe(false);
    const cambio = anotarCruceConMarcas(afi(70_000, 0), [marca({ cuenta4: "1516", diferencia: 12_000 })], { toleranciaMarca: 2_000, toleranciaDetalle: 10_000 });
    expect(cambio.filas[0]).toMatchObject({ requiereMarca: true, desactualizada: true, porExplicar: 18_000 });
    // Sin la tolerancia del detalle (cierre anterior), el detalle solo admite marca opcional.
    expect(anotarCruceConMarcas(reclasificada, [], { toleranciaMarca: 2_000 }).filas[0]).toMatchObject({ admiteMarca: true, requiereMarca: false });
  });

  it("sin tolerancia toda diferencia exige marca, como antes del parámetro", () => {
    const { resumen } = anotarCruceConMarcas(conTolerancia(), []);
    expect(resumen).toMatchObject({ conDiferencia: 3, pendientes: 3, bajoUmbral: 0 });
  });
});

describe("varias marcas por renglón, cada una con su monto", () => {
  const dif1435 = 4_120_895_928.4;

  it("el renglón queda explicado cuando la suma de los montos cubre la diferencia", () => {
    const { filas, resumen } = anotarCruceConMarcas(cruce(), [
      marca({ cuenta4: "1435", numero: 5, diferencia: dif1435, monto: 120_895_928.4 }),
      marca({ cuenta4: "1435", numero: 2, diferencia: dif1435, monto: 4_000_000_000 }),
    ]);
    const fila = filas.find((f) => f.cuenta4 === "1435")!;
    expect(fila.marcas.map((m) => m.numero)).toEqual([2, 5]);
    expect(fila).toMatchObject({ explicado: dif1435, porExplicar: 0, desactualizada: false });
    expect(resumen).toMatchObject({ marcadas: 1, desactualizadas: 0, pendientes: 1 });
  });

  it("si los montos no alcanzan, el renglón queda con saldo por explicar e impide cerrar", () => {
    const { filas, resumen } = anotarCruceConMarcas(cruce(), [
      marca({ cuenta4: "1435", numero: 2, diferencia: dif1435, monto: 4_000_000_000 }),
    ]);
    expect(filas.find((f) => f.cuenta4 === "1435")).toMatchObject({ desactualizada: true, porExplicar: 120_895_928.4 });
    expect(resumen).toMatchObject({ marcadas: 1, desactualizadas: 1, montoPorExplicar: 120_895_928.4 });
  });

  it("lo que falta por debajo de la tolerancia de la cédula ya no impide cerrar", () => {
    const { filas } = anotarCruceConMarcas(cruce(), [
      marca({ cuenta4: "1435", numero: 2, diferencia: dif1435, monto: dif1435 - 1_500 }),
    ], { toleranciaMarca: 2_000 });
    expect(filas.find((f) => f.cuenta4 === "1435")).toMatchObject({ desactualizada: false, porExplicar: 1_500 });
  });

  it("una marca anterior, sin monto, explica toda la diferencia que congeló", () => {
    expect(montoDeMarca(marca({ cuenta4: "1435", diferencia: 77 }))).toBe(77);
    expect(montoDeMarca(marca({ cuenta4: "1435", diferencia: 77, monto: 10 }))).toBe(10);
    expect(montoDeMarca(marca({ cuenta4: "1435", diferencia: 77, monto: 0 }))).toBe(0);
  });

  it("observaciones: una entrada por marca, aunque compartan renglón", () => {
    const { filas } = anotarCruceConMarcas(cruce(), [
      marca({ cuenta4: "1435", numero: 6, diferencia: dif1435, monto: 1 }),
      marca({ cuenta4: "1435", numero: 2, diferencia: dif1435, monto: 2 }),
    ]);
    expect(observacionesDeMarcas(filas).map((o) => [o.marca.numero, o.fila.cuenta4])).toEqual([[2, "1435"], [6, "1435"]]);
  });

  it("control de deducciones: entre todas tienen que cubrir la diferencia al centavo", () => {
    const fila = { cuentaCliente: "237005", nombre: "Libranzas", cuentasBalance: ["237005"], contable: -500, modulo: -800, diferencia: 300, cuadra: false, conceptos: [] };
    const dos = (montos: number[]) =>
      anotarControlConMarcas([fila], montos.map((monto, i) => marca({ dimension: "control", cuenta4: "", clave: "237005", numero: i + 1, diferencia: 300, monto })));
    expect(dos([200, 100]).filas[0]).toMatchObject({ explicado: 300, desactualizada: false });
    expect(dos([200, 99.98]).filas[0]).toMatchObject({ desactualizada: true, porExplicar: 0.02 });
  });
});

describe("leerMontoMarca", () => {
  it("lee el formato colombiano, con o sin signo pesos, y el punto decimal cuando no hay coma", () => {
    expect(leerMontoMarca("-40.251.565,88")).toBe(-40_251_565.88);
    expect(leerMontoMarca("$ 1.234")).toBe(1_234);
    expect(leerMontoMarca("(1.234,5)")).toBe(-1_234.5);
    expect(leerMontoMarca("-1234.5")).toBe(-1_234.5);
    expect(leerMontoMarca("1.234.567")).toBe(1_234_567);
    expect(leerMontoMarca("0")).toBe(0);
  });

  it("rechaza lo que no es un número", () => {
    expect(leerMontoMarca("")).toBeNull();
    expect(leerMontoMarca("abc")).toBeNull();
    expect(leerMontoMarca("1,2,3")).toBeNull();
  });

  it("textoMontoMarca escribe lo que leerMontoMarca vuelve a leer", () => {
    for (const v of [-40_251_565.88, 0, 1_234.5, 999_999_999.99]) expect(leerMontoMarca(textoMontoMarca(v))).toBe(v);
  });
});

describe("observacionesDeMarcas", () => {
  it("lista solo las filas marcadas, ordenadas por número", () => {
    const { filas } = anotarCruceConMarcas(cruce(), [
      marca({ cuenta4: "1435", numero: 7, diferencia: 4_120_895_928.4 }),
      marca({ cuenta4: "1405", numero: 3, diferencia: -988_836_804.4 }),
    ]);

    expect(observacionesDeMarcas(filas).map((o) => [o.marca.numero, o.fila.cuenta4])).toEqual([[3, "1405"], [7, "1435"]]);
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
    const porClave = Object.fromEntries(filas.map((f) => [f.clave, [f.admiteMarca, f.requiereMarca, f.marcas[0]?.numero ?? null, f.desactualizada]]));
    expect(porClave).toEqual({
      "900000001": [true, true, 4, false], // diferencia de 6.000, marcada
      "900000002": [true, false, null, false], // 100: bajo el umbral
      "900000003": [true, false, null, false], // solo en contabilidad por 500
      "900000004": [false, false, null, false], // cuadra
      "900000005": [true, true, null, false], // solo en el auxiliar por 3.000
    });
    expect(resumen).toEqual({ conDiferencia: 2, marcadas: 1, pendientes: 1, desactualizadas: 0, montoPendiente: -3_000, montoPorExplicar: 0, bajoUmbral: 2 });
  });

  it("queda por explicar cuando lo que falta del tercero alcanza el umbral; por debajo, no", () => {
    const falta = anotarCruceTerceroConMarcas(cruceTercero.filas, [marcaTercero("900000001", 3_000, 4)], { umbralDescuadre: 2_000 });
    expect(falta.resumen).toMatchObject({ marcadas: 1, desactualizadas: 1, montoPorExplicar: 3_000 });
    const casi = anotarCruceTerceroConMarcas(cruceTercero.filas, [marcaTercero("900000001", 5_000, 4)], { umbralDescuadre: 2_000 });
    expect(casi.resumen).toMatchObject({ marcadas: 1, desactualizadas: 0 });
  });

  it("un tercero relacionado con una marca de la cédula queda explicado por su diferencia al relacionarlo", () => {
    const relaciones = [
      { numero: 2, clave: "900000001", diferencia: 6_000 },
      { numero: 2, clave: "900000005", diferencia: -3_000 },
    ];
    const { filas, resumen } = anotarCruceTerceroConMarcas(cruceTercero.filas, [], { umbralDescuadre: 2_000, relaciones });
    const uno = filas.find((f) => f.clave === "900000001")!;
    expect(uno).toMatchObject({ relacion: { numero: 2 }, explicado: 6_000, porExplicar: 0, desactualizada: false });
    expect(uno.marcas).toEqual([]);
    expect(resumen).toMatchObject({ conDiferencia: 2, marcadas: 2, pendientes: 0, desactualizadas: 0 });
    // Si la diferencia cambió desde la relación más allá del umbral, queda por explicar.
    const cambio = anotarCruceTerceroConMarcas(cruceTercero.filas, [], { umbralDescuadre: 2_000, relaciones: [{ numero: 2, clave: "900000001", diferencia: 3_000 }] });
    expect(cambio.filas.find((f) => f.clave === "900000001")).toMatchObject({ desactualizada: true, porExplicar: 3_000 });
    expect(cambio.resumen).toMatchObject({ marcadas: 1, desactualizadas: 1, pendientes: 1 });
  });

  it("solo se seleccionan para relacionar los terceros con diferencia, sin marcas propias ni otra relación", () => {
    const { filas } = anotarCruceTerceroConMarcas(
      cruceTercero.filas,
      [marcaTercero("900000002", 100, 7)],
      { umbralDescuadre: 2_000, relaciones: [{ numero: 2, clave: "900000001", diferencia: 6_000 }] },
    );
    const por = Object.fromEntries(filas.map((f) => [f.clave, terceroRelacionable(f)]));
    expect(por).toMatchObject({
      "900000001": false, // ya relacionado
      "900000002": false, // tiene su propia marca
      "900000003": true,
      "900000004": false, // cuadra
      "900000005": true,
    });
  });

  it("varias marcas en un tercero suman lo que explican", () => {
    const { filas, resumen } = anotarCruceTerceroConMarcas(
      cruceTercero.filas,
      [{ ...marcaTercero("900000001", 6_000, 8), monto: 3_500 }, { ...marcaTercero("900000001", 6_000, 4), monto: 2_500 }],
      { umbralDescuadre: 2_000 },
    );
    const tercero = filas.find((f) => f.clave === "900000001")!;
    expect(tercero.marcas.map((m) => m.numero)).toEqual([4, 8]);
    expect(tercero).toMatchObject({ explicado: 6_000, porExplicar: 0, desactualizada: false });
    expect(resumen).toMatchObject({ marcadas: 1, desactualizadas: 0 });
  });

  it("la cédula contable no toma las marcas de tercero, aunque coincida el texto", () => {
    const { filas } = anotarCruceConMarcas(cruce(), [marca({ dimension: "tercero", clave: "1435", cuenta4: "1435", numero: 9 })]);
    expect(filas.every((f) => f.marcas.length === 0)).toBe(true);
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

describe("marca cuyo renglón ya no aparece: a dónde puede pasar", () => {
  // La marca era del grupo de seis cuentas; hoy el Consolidado encadenó una cuenta más.
  const ORIGEN = "410505+417505+420505+421005+422005+425005";
  const filas = [
    { cuenta4: "410505+417505+420505+421005+422005+425005+425050" },
    { cuenta4: "410510" },
    { cuenta4: "SIN_CUENTA" },
  ];

  it("propone los renglones que contienen alguna de sus cuentas", () => {
    expect(destinosMarcaSinRenglon(ORIGEN, filas).map((f) => f.cuenta4)).toEqual([filas[0].cuenta4]);
    // Si el grupo se partió, cualquiera de las partes es candidata.
    expect(destinosMarcaSinRenglon(ORIGEN, [{ cuenta4: "410505" }, { cuenta4: "417505+420505" }, { cuenta4: "410510" }]).map((f) => f.cuenta4))
      .toEqual(["410505", "417505+420505"]);
    expect(destinosMarcaSinRenglon("SIN_CUENTA", filas)).toEqual([]);
    expect(destinosMarcaSinRenglon("413505", filas)).toEqual([]);
  });

  it("solo pasa una marca sin renglón a un renglón vigente que comparta cuentas", () => {
    const vigentes = new Set(filas.map((f) => f.cuenta4));
    expect(motivoNoPasarMarca(ORIGEN, filas[0].cuenta4, vigentes)).toBeNull();
    expect(motivoNoPasarMarca(ORIGEN, "410510", vigentes)).toMatch(/alguna de sus cuentas/);
    expect(motivoNoPasarMarca(ORIGEN, "499999", vigentes)).toMatch(/ya no aparece/);
    expect(motivoNoPasarMarca("410510", filas[0].cuenta4, vigentes)).toMatch(/todavía tiene su renglón/);
    expect(motivoNoPasarMarca("SIN_CUENTA", filas[0].cuenta4, vigentes)).toMatch(/saldo sin cuenta/);
    expect(motivoNoPasarMarca(ORIGEN, ORIGEN, vigentes)).toMatch(/ya está en ese renglón/);
  });
});
