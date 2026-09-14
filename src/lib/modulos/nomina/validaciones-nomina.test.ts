import { describe, expect, it } from "vitest";
import type { RenglonConsolidadoNomina } from "./consolidado-nomina";
import { validarNomina } from "./validaciones-nomina";

const renglon = (clasificador: string, total: number, s: Partial<RenglonConsolidadoNomina["sugerencia"]>): RenglonConsolidadoNomina => ({
  clasificador, codigo: clasificador, agrupador: "", descripcion: null, total, filas: 1, cuentas: [],
  sugerencia: { cuentas: [], via: "sin_cuenta", motivo: "", destino: "gasto", grupo: null, subcuentaPuc: null, cuentaCliente: null, clase: null, ...s },
});

describe("validarNomina", () => {
  it("neto por fila, cédulas con varios nombres, meses y conceptos por estado", () => {
    const v = validarNomina({
      detalle: [
        { filaNum: 2, valor: 100, datos: { devengo: 100, deduccion: 20, neto: 80, cedula: "1", empleado: "Ana Ruiz", periodoDesde: "2025-01" } },
        { filaNum: 3, valor: 100, datos: { devengo: 100, deduccion: -20, neto: 75, cedula: "1", empleado: "ANA  RUIZ", periodoDesde: "2025-02" } },
        { filaNum: 4, valor: 50, datos: { devengo: 50, deduccion: 0, neto: 50, cedula: "2", empleado: "Luis", periodoDesde: "2025-01" } },
        { filaNum: 5, valor: 50, datos: { devengo: 50, cedula: "2", empleado: "Luis Pérez" } },
        { filaNum: 6, valor: 0, datos: { devengo: 0, deduccion: 0, neto: 0 } },
      ],
      renglones: [
        renglon("1", 300, { via: "memoria_exacta", cuentas: ["510506"] }),
        renglon("2", 10, { via: "multi", cuentas: ["510506", "520506"] }),
        renglon("3", 5, { via: "sugerido_nombre", cuentas: ["510536"] }),
        renglon("4", -7, { destino: "control", cuentaCliente: "2370" }),
        renglon("5", 1, { via: "sin_cuenta" }),
      ],
    });
    expect(v.netos).toEqual([{ filaNum: 3, cedula: "1", devengo: 100, deduccion: -20, neto: 75, esperado: 80 }]);
    expect(v.cedulas).toEqual([{ cedula: "2", nombres: ["LUIS", "LUIS PÉREZ"], filas: 2 }]);
    expect(v.meses).toEqual(["2025-01", "2025-02"]);
    expect(v.sinCuenta.map((c) => c.clasificador)).toEqual(["3", "5"]);
    expect(v.multi.map((c) => c.clasificador)).toEqual(["2"]);
    expect(v.control).toEqual({ conceptos: 1, total: -7 });
    expect(v.total).toBe(1 + 2 + 1);
  });
});
