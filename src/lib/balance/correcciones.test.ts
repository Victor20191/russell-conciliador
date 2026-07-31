import { describe, expect, it } from "vitest";
import {
  claveCuenta,
  construirCorrecciones,
  planAplicarCorrecciones,
  type CorreccionCuenta,
  type FilaStagingCorreccion,
} from "./correcciones";

const fila = (p: Partial<FilaStagingCorreccion> & { filaNum: number }): FilaStagingCorreccion => ({
  codigo: "",
  codigoCrudo: "",
  nombre: "",
  tipoFila: "movimiento",
  tipoFilaForzado: null,
  saldoInicial: 0,
  debitos: 0,
  creditos: 0,
  saldoFinal: 0,
  desacoplada: false,
  omitida: null,
  padreManual: null,
  ...p,
});

const correccion = (p: Partial<CorreccionCuenta> & { cuenta: string }): CorreccionCuenta => ({
  nombre: null,
  tipoFilaForzado: null,
  desacoplada: null,
  omitida: null,
  ...p,
});

describe("claveCuenta", () => {
  it("usa el código PUC cuando es numérico", () => {
    expect(claveCuenta({ codigo: "110505", codigoCrudo: "1105-05", nombre: "Caja" })).toBe("110505");
  });
  it("cae al texto crudo cuando no hay código numérico (pie/total del ERP)", () => {
    expect(claveCuenta({ codigo: "", codigoCrudo: " Total general ", nombre: "x" })).toBe("Total general");
  });
  it("cae al nombre cuando tampoco hay texto crudo", () => {
    expect(claveCuenta({ codigo: "", codigoCrudo: "  ", nombre: " Procesado en… " })).toBe("Procesado en…");
  });
});

describe("construirCorrecciones", () => {
  const filas = [
    fila({ filaNum: 1, codigo: "1105", codigoCrudo: "1105", nombre: "Caja", tipoFila: "agrupadora" }),
    fila({ filaNum: 2, codigo: "110505", codigoCrudo: "110505", nombre: "Caja general" }),
    fila({ filaNum: 3, codigo: "", codigoCrudo: "Total general", nombre: "Total general", tipoFila: "total" }),
  ];

  it("traduce override/desacopladas por código", () => {
    const cs = construirCorrecciones(filas, {
      override: { "110505": "agrupadora" },
      desacopladas: { "1105": true },
      omitidas: {},
      padres: {},
    });
    const c1 = cs.find((c) => c.cuenta === "110505")!;
    expect(c1.tipoFilaForzado).toBe("agrupadora");
    expect(c1.nombre).toBe("Caja general");
    expect(cs.find((c) => c.cuenta === "1105")?.desacoplada).toBe(true);
  });

  it("traduce omitir por filaNum a la clave de la fila (código o crudo)", () => {
    const cs = construirCorrecciones(filas, {
      override: {},
      desacopladas: {},
      omitidas: { "3": true, "2": false },
      padres: {},
    });
    expect(cs.find((c) => c.cuenta === "Total general")?.omitida).toBe(true);
    expect(cs.find((c) => c.cuenta === "110505")?.omitida).toBe(false); // rescatada
  });

  it("traduce re-parentar filaNum→filaNum a clave→clave y descarta destinos inexistentes", () => {
    const cs = construirCorrecciones(filas, {
      override: {},
      desacopladas: {},
      omitidas: {},
      padres: { "2": 1, "3": 99 },
    });
    expect(cs.find((c) => c.cuenta === "110505")?.padreCodigo).toBe("1105");
    expect(cs.find((c) => c.cuenta === "Total general")).toBeUndefined();
  });

  it("re-parentar a null memoriza QUITAR el override", () => {
    const cs = construirCorrecciones(filas, {
      override: {},
      desacopladas: {},
      omitidas: {},
      padres: { "2": null },
    });
    expect(cs.find((c) => c.cuenta === "110505")?.padreCodigo).toBeNull();
  });

  it("fusiona varios deltas de la misma cuenta en una sola corrección", () => {
    const cs = construirCorrecciones(filas, {
      override: { "110505": "agrupadora" },
      desacopladas: {},
      omitidas: { "2": true },
      padres: { "2": 1 },
    });
    expect(cs).toHaveLength(1);
    const c = cs[0];
    expect(c.cuenta).toBe("110505");
    expect(c.tipoFilaForzado).toBe("agrupadora");
    expect(c.omitida).toBe(true);
    expect(c.padreCodigo).toBe("1105");
  });
});

describe("planAplicarCorrecciones", () => {
  it("reclasifica el tipo y deja una marca manual durable (nunca filas total)", () => {
    const filas = [
      fila({ filaNum: 1, codigo: "1105", codigoCrudo: "1105", tipoFila: "movimiento" }),
      fila({ filaNum: 2, codigo: "2405", codigoCrudo: "2405", tipoFila: "agrupadora" }),
      fila({ filaNum: 3, codigo: "3105", codigoCrudo: "3105", tipoFila: "total" }),
    ];
    const { cambios, cuentasAplicadas } = planAplicarCorrecciones(filas, [
      correccion({ cuenta: "1105", tipoFilaForzado: "agrupadora" }),
      correccion({ cuenta: "2405", tipoFilaForzado: "agrupadora" }), // ya es agrupadora → nada
      correccion({ cuenta: "3105", tipoFilaForzado: "movimiento" }), // total → nada
    ]);
    expect(cambios).toEqual([
      { filaNum: 1, tipoFila: "agrupadora", tipoFilaForzado: "agrupadora" },
      { filaNum: 2, tipoFilaForzado: "agrupadora" },
    ]);
    expect(cuentasAplicadas).toEqual(["1105", "2405"]);
  });

  it("omite/rescata solo filas con tri-estado sin tocar en el lote destino", () => {
    const filas = [
      fila({ filaNum: 1, codigo: "", codigoCrudo: "Total general", tipoFila: "total", omitida: null }),
      fila({ filaNum: 2, codigo: "110505", codigoCrudo: "110505", omitida: false }), // ya rescatada a mano → no pisar
    ];
    const { cambios } = planAplicarCorrecciones(filas, [
      correccion({ cuenta: "Total general", omitida: true }),
      correccion({ cuenta: "110505", omitida: true }),
    ]);
    expect(cambios).toEqual([{ filaNum: 1, omitida: true }]);
  });

  it("re-parenta resolviendo el destino por clave (prefiere la agrupadora) y salta si no existe", () => {
    const filas = [
      fila({ filaNum: 5, codigo: "110510", codigoCrudo: "110510", tipoFila: "agrupadora" }),
      fila({ filaNum: 6, codigo: "11051019", codigoCrudo: "1105-10-19" }),
      fila({ filaNum: 7, codigo: "130505", codigoCrudo: "130505" }),
    ];
    const { cambios } = planAplicarCorrecciones(filas, [
      correccion({ cuenta: "11051019", padreCodigo: "110510" }),
      correccion({ cuenta: "130505", padreCodigo: "999999" }), // destino inexistente → nada
    ]);
    expect(cambios).toEqual([{ filaNum: 6, padreManual: 5 }]);
  });

  it("re-parenta POR BLOQUE cuando el mismo par se repite (balance por tercero)", () => {
    // 220501/220505 repetidos en tres bloques: cada 220505 debe colgar de la
    // agrupadora de SU bloque, nunca todas de la primera.
    const filas = [
      fila({ filaNum: 10, codigo: "220501", codigoCrudo: "220501", tipoFila: "agrupadora" }),
      fila({ filaNum: 11, codigo: "220505", codigoCrudo: "220505" }),
      fila({ filaNum: 20, codigo: "220501", codigoCrudo: "220501", tipoFila: "agrupadora" }),
      fila({ filaNum: 21, codigo: "220505", codigoCrudo: "220505" }),
      fila({ filaNum: 30, codigo: "220501", codigoCrudo: "220501", tipoFila: "agrupadora" }),
      fila({ filaNum: 31, codigo: "220505", codigoCrudo: "220505" }),
    ];
    const { cambios } = planAplicarCorrecciones(filas, [
      correccion({ cuenta: "220501", tipoFilaForzado: "agrupadora" }),
      correccion({ cuenta: "220505", padreCodigo: "220501" }),
    ]);
    expect(cambios.filter((c) => c.padreManual != null)).toEqual([
      { filaNum: 11, padreManual: 10 },
      { filaNum: 21, padreManual: 20 },
      { filaNum: 31, padreManual: 30 },
    ]);
  });

  it("acepta como destino la agrupadora que la propia corrección fuerza (aún movimiento en el lote)", () => {
    const filas = [
      fila({ filaNum: 10, codigo: "221005", codigoCrudo: "221005" }), // llega como movimiento
      fila({ filaNum: 11, codigo: "221006", codigoCrudo: "221006" }),
    ];
    const { cambios } = planAplicarCorrecciones(filas, [
      correccion({ cuenta: "221005", tipoFilaForzado: "agrupadora" }),
      correccion({ cuenta: "221006", padreCodigo: "221005" }),
    ]);
    expect(cambios).toContainEqual({ filaNum: 11, padreManual: 10 });
  });

  it("usa la ocurrencia posterior si el ERP lista el subtotal después del detalle", () => {
    const filas = [
      fila({ filaNum: 5, codigo: "110505", codigoCrudo: "110505" }),
      fila({ filaNum: 6, codigo: "1105", codigoCrudo: "TOTAL 1105", tipoFila: "agrupadora" }),
    ];
    const { cambios } = planAplicarCorrecciones(filas, [
      correccion({ cuenta: "110505", padreCodigo: "1105" }),
    ]);
    expect(cambios).toEqual([{ filaNum: 5, padreManual: 6 }]);
  });

  it("padreCodigo null limpia el override solo si la fila lo tiene", () => {
    const filas = [
      fila({ filaNum: 1, codigo: "110505", codigoCrudo: "110505", padreManual: 9 }),
      fila({ filaNum: 2, codigo: "220505", codigoCrudo: "220505", padreManual: null }),
    ];
    const { cambios } = planAplicarCorrecciones(filas, [
      correccion({ cuenta: "110505", padreCodigo: null }),
      correccion({ cuenta: "220505", padreCodigo: null }),
    ]);
    expect(cambios).toEqual([{ filaNum: 1, padreManual: null }]);
  });

  it("desacopla solo cuando el flag difiere y aplica a todas las filas de la clave", () => {
    const filas = [
      fila({ filaNum: 1, codigo: "145020", codigoCrudo: "145020", desacoplada: false }),
      fila({ filaNum: 2, codigo: "145020", codigoCrudo: "145020", desacoplada: true }),
    ];
    const { cambios } = planAplicarCorrecciones(filas, [correccion({ cuenta: "145020", desacoplada: true })]);
    expect(cambios).toEqual([{ filaNum: 1, desacoplada: true }]);
  });

  it("cuentas sin fila coincidente en el lote destino no aplican ni cuentan", () => {
    const filas = [fila({ filaNum: 1, codigo: "110505", codigoCrudo: "110505" })];
    const { cambios, cuentasAplicadas } = planAplicarCorrecciones(filas, [
      correccion({ cuenta: "999999", tipoFilaForzado: "agrupadora", omitida: true }),
    ]);
    expect(cambios).toEqual([]);
    expect(cuentasAplicadas).toEqual([]);
  });

  it("ida y vuelta: lo construido de un lote se re-aplica igual en un lote nuevo", () => {
    const loteViejo = [
      fila({ filaNum: 10, codigo: "1105", codigoCrudo: "1105", nombre: "Caja", tipoFila: "agrupadora" }),
      fila({ filaNum: 11, codigo: "110505", codigoCrudo: "110505", nombre: "Caja general", tipoFila: "agrupadora" }),
      fila({ filaNum: 12, codigo: "", codigoCrudo: "Total general", nombre: "Total general", tipoFila: "total" }),
    ];
    const correcciones = construirCorrecciones(loteViejo, {
      override: { "110505": "movimiento" },
      desacopladas: {},
      omitidas: { "12": true },
      padres: { "11": 10 },
    });
    // Lote nuevo: mismas cuentas en otras filas.
    const loteNuevo = [
      fila({ filaNum: 1, codigo: "1105", codigoCrudo: "1105", nombre: "Caja", tipoFila: "agrupadora" }),
      fila({ filaNum: 2, codigo: "110505", codigoCrudo: "110505", nombre: "Caja general", tipoFila: "agrupadora" }),
      fila({ filaNum: 3, codigo: "", codigoCrudo: "Total general", nombre: "Total general", tipoFila: "total" }),
    ];
    const { cambios } = planAplicarCorrecciones(loteNuevo, correcciones);
    expect(cambios).toContainEqual({ filaNum: 2, tipoFila: "movimiento", tipoFilaForzado: "movimiento", padreManual: 1 });
    expect(cambios).toContainEqual({ filaNum: 3, omitida: true });
  });
});
