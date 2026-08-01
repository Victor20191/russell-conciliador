import { describe, expect, it } from "vitest";
import { crearHuellaPrevalidador } from "./huella";
import type { PrevalidadorVM } from "./calcular";

const balance = {
  id: 7,
  clienteId: 3,
  periodo: "Julio 2026",
  periodoInicio: new Date("2026-07-01T00:00:00.000Z"),
  periodoFin: new Date("2026-07-31T00:00:00.000Z"),
  version: "1",
};
const catalogo = [{
  id: 2,
  moduloCodigo: "CAR",
  moduloNombre: "Cartera",
  moduloOrden: 1,
  cuentaRussell: "13",
  etiqueta: "Clientes",
  baseCalculo: "saldo" as const,
  orden: 10,
  activa: true,
}];
const filas = [{
  cuenta8: "130505",
  nombreCuenta: "Clientes nacionales",
  cuenta6Russell: "130505",
  debitos: 20,
  creditos: 10,
  saldoFinal: 100,
}];
const prevalidador: PrevalidadorVM = {
  estado: "listo",
  modulos: [],
  anidamientos: [],
  opcionesCliente: [],
  filasConDiferencia: 0,
  modulosConDiferencia: 0,
};

describe("crearHuellaPrevalidador", () => {
  it("es estable aunque cambie el orden de filas y overrides", () => {
    const otraFila = { ...filas[0], cuenta8: "130510", saldoFinal: 25 };
    const overrides = [
      { catalogoId: 9, cuentaCliente: "15" },
      { catalogoId: 2, cuentaCliente: "13" },
    ];
    const a = crearHuellaPrevalidador({ balance, filas: [filas[0], otraFila], catalogo, overrides, prevalidador });
    const b = crearHuellaPrevalidador({ balance, filas: [otraFila, filas[0]], catalogo, overrides: [...overrides].reverse(), prevalidador });
    expect(a).toBe(b);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
  });

  it("cambia ante saldos, homologación, catálogo u override diferentes", () => {
    const base = crearHuellaPrevalidador({ balance, filas, catalogo, overrides: [], prevalidador });
    const variantes = [
      crearHuellaPrevalidador({ balance, filas: [{ ...filas[0], saldoFinal: 100.01 }], catalogo, overrides: [], prevalidador }),
      crearHuellaPrevalidador({ balance, filas: [{ ...filas[0], cuenta6Russell: "139999" }], catalogo, overrides: [], prevalidador }),
      crearHuellaPrevalidador({ balance, filas, catalogo: [{ ...catalogo[0], baseCalculo: "movimiento" }], overrides: [], prevalidador }),
      crearHuellaPrevalidador({ balance, filas, catalogo, overrides: [{ catalogoId: 2, cuentaCliente: "14" }], prevalidador }),
    ];
    for (const variante of variantes) expect(variante).not.toBe(base);
  });

  it("conserva centavos en Decimal(18,2) aunque el monto supere el entero seguro de Number", () => {
    const a = crearHuellaPrevalidador({
      balance,
      filas: [{ ...filas[0], saldoFinal: "9999999999999999.98" }],
      catalogo,
      overrides: [],
      prevalidador,
    });
    const b = crearHuellaPrevalidador({
      balance,
      filas: [{ ...filas[0], saldoFinal: "9999999999999999.99" }],
      catalogo,
      overrides: [],
      prevalidador,
    });
    expect(a).not.toBe(b);
  });

  it("cambia si cambia el resultado aunque las entradas contables sean iguales", () => {
    const a = crearHuellaPrevalidador({ balance, filas, catalogo, overrides: [], prevalidador });
    const b = crearHuellaPrevalidador({
      balance,
      filas,
      catalogo,
      overrides: [],
      prevalidador: { ...prevalidador, filasConDiferencia: 1 },
    });
    expect(a).not.toBe(b);
  });
});
