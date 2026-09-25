import { describe, expect, it } from "vitest";
import { planEscrituraConsolidacion, type RenglonAGuardar } from "./consolidacion-escritura";

const renglon = (extra: Partial<RenglonAGuardar> = {}): RenglonAGuardar => ({
  clasificador: "1",
  agrupador: "",
  deCedula: [],
  extras: [],
  ...extra,
});

describe("planEscrituraConsolidacion · pocas sentencias, el mismo criterio", () => {
  it("solo cuentas de la cédula: reemplaza la memoria y conserva lo descriptivo del concepto", () => {
    const plan = planEscrituraConsolidacion([
      renglon({
        clasificador: "8",
        agrupador: "GYA",
        deCedula: ["510506", "5205"],
        memoria: { descripcion: "COMISIONES", grupo: "comisiones", subcuentaPuc: "18", cuentaCliente: "0005180000" },
      }),
    ]);
    expect(plan.memoriaBorrar).toEqual([{ clasificador: "8", agrupador: "GYA" }]);
    expect(plan.memoriaCrear).toEqual([
      { clasificador: "8", agrupador: "GYA", cuenta4: "5105", cuenta6: "510506", descripcion: "COMISIONES", grupo: "comisiones", subcuentaPuc: "18", cuentaCliente: "0005180000" },
      { clasificador: "8", agrupador: "GYA", cuenta4: "5205", cuenta6: "", descripcion: "COMISIONES", grupo: "comisiones", subcuentaPuc: "18", cuentaCliente: "0005180000" },
    ]);
    expect(plan.periodoBorrar).toEqual([]);
    expect(plan.periodoCrear).toEqual([]);
  });

  it("quitar todas las cuentas deja el renglón sin memoria", () => {
    const plan = planEscrituraConsolidacion([renglon({ clasificador: "5", deCedula: [] })]);
    expect(plan.memoriaBorrar).toEqual([{ clasificador: "5", agrupador: "" }]);
    expect(plan.memoriaCrear).toEqual([]);
  });

  it("con una cuenta de fuera, TODAS van al período y la memoria no se toca", () => {
    const plan = planEscrituraConsolidacion([
      renglon({ clasificador: "8", agrupador: "1", deCedula: ["510506"], extras: ["519505"] }),
    ]);
    expect(plan.memoriaBorrar).toEqual([]);
    expect(plan.memoriaCrear).toEqual([]);
    expect(plan.periodoBorrar).toEqual([{ clasificador: "8", agrupador: "1" }]);
    expect(plan.periodoCrear).toEqual([
      { clasificador: "8", agrupador: "1", cuenta4: "5105", cuenta6: "510506" },
      { clasificador: "8", agrupador: "1", cuenta4: "5195", cuenta6: "519505" },
    ]);
  });

  it("volver a una cuenta de la cédula retira la asignación del período que tenía", () => {
    const plan = planEscrituraConsolidacion([
      renglon({ clasificador: "8", deCedula: ["510506"], teniaPeriodo: true }),
      renglon({ clasificador: "9", deCedula: ["510530"], teniaPeriodo: false }),
    ]);
    expect(plan.periodoBorrar).toEqual([{ clasificador: "8", agrupador: "" }]);
    expect(plan.memoriaBorrar.map((m) => m.clasificador)).toEqual(["8", "9"]);
  });

  it("33 renglones siguen siendo cuatro grupos de datos, no 66 sentencias", () => {
    const renglones = Array.from({ length: 33 }, (_, i) => renglon({ clasificador: String(i + 1), deCedula: ["510506"] }));
    const plan = planEscrituraConsolidacion(renglones);
    expect(plan.memoriaBorrar).toHaveLength(33);
    expect(plan.memoriaCrear).toHaveLength(33);
    expect(Object.keys(plan)).toEqual(["memoriaBorrar", "memoriaCrear", "periodoBorrar", "periodoCrear"]);
  });
});
