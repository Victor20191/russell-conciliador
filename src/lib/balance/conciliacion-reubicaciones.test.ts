import { describe, expect, it } from "vitest";
import type { ManipulacionRiesgosaBorrador } from "./borrador";
import {
  calcularExplicacionesClaseReubicacion,
  filtrarHallazgosClaseResueltos,
} from "./conciliacion-reubicaciones";
import type { Hallazgo } from "./diagnostico";

const riesgoBase: ManipulacionRiesgosaBorrador = {
  filaNum: 737,
  codigo: "28059501",
  codigoCrudo: "28059501",
  nombre: "CONSIGNACIONES SIN IDENTIFICAR",
  monto: -302_477_965.9,
  claseOrigen: "2",
  claseDestino: "1",
  destino: {
    filaNum: 60,
    codigo: "13170103",
    codigoCrudo: "13170103",
    nombre: "EDUCACION FORMAL-SUPERIOR FORMACION PROF",
  },
};

const aprobadas = (...filas: number[]) => new Set(filas);
const contabilizadas = (...filas: number[]) => new Set(filas);

describe("conciliación de diferencias por reubicaciones aprobadas", () => {
  it("resuelve origen y destino cuando el movimiento explica el residual completo", () => {
    const explicaciones = calcularExplicacionesClaseReubicacion(
      [riesgoBase],
      aprobadas(737),
      contabilizadas(737),
      { "1": -302_477_965.9, "2": -302_477_965.9 },
    );

    expect(explicaciones.get("1")).toMatchObject({
      montoExplicado: 302_477_965.9,
      residual: 0,
      resuelta: true,
      sobreExplicada: false,
      filas: [737],
    });
    expect(explicaciones.get("2")?.resuelta).toBe(true);
  });

  it("no explica una fila sin aprobación, no contabilizada o sin total de archivo", () => {
    expect(calcularExplicacionesClaseReubicacion(
      [riesgoBase],
      aprobadas(),
      contabilizadas(737),
      { "1": -302_477_965.9 },
    ).size).toBe(0);
    expect(calcularExplicacionesClaseReubicacion(
      [riesgoBase],
      aprobadas(737),
      contabilizadas(),
      { "1": -302_477_965.9 },
    ).size).toBe(0);
    expect(calcularExplicacionesClaseReubicacion(
      [riesgoBase],
      aprobadas(737),
      contabilizadas(737),
      { "1": null },
    ).size).toBe(0);
  });

  it("mantiene pendiente una explicación parcial o sobreexplicada", () => {
    const parcial = calcularExplicacionesClaseReubicacion(
      [riesgoBase],
      aprobadas(737),
      contabilizadas(737),
      { "1": -400_000_000 },
    ).get("1");
    expect(parcial).toMatchObject({ resuelta: false, sobreExplicada: false });
    expect(parcial?.residual).toBeCloseTo(97_522_034.1);

    const excesiva = calcularExplicacionesClaseReubicacion(
      [riesgoBase],
      aprobadas(737),
      contabilizadas(737),
      { "1": -200_000_000 },
    ).get("1");
    expect(excesiva).toMatchObject({ resuelta: false, sobreExplicada: true });
    expect(excesiva?.residual).toBeCloseTo(-102_477_965.9);
  });

  it("suma movimientos del mismo sentido y netea movimientos contrarios", () => {
    const mismoSentido = calcularExplicacionesClaseReubicacion(
      [
        { ...riesgoBase, monto: -100_000 },
        { ...riesgoBase, filaNum: 910, monto: -22_000 },
      ],
      aprobadas(737, 910),
      contabilizadas(737, 910),
      { "1": -122_000, "2": -122_000 },
    );
    expect(mismoSentido.get("1")).toMatchObject({ montoExplicado: 122_000, residual: 0, resuelta: true });

    const contrario = calcularExplicacionesClaseReubicacion(
      [
        { ...riesgoBase, monto: 100_000 },
        { ...riesgoBase, filaNum: 910, claseOrigen: "1", claseDestino: "2", monto: 100_000 },
      ],
      aprobadas(737, 910),
      contabilizadas(737, 910),
      { "1": -100_000, "2": -100_000 },
    );
    expect(contrario.get("1")).toMatchObject({ flujoNeto: 0, montoExplicado: 0, resuelta: false });
    expect(contrario.get("2")).toMatchObject({ flujoNeto: 0, montoExplicado: 0, resuelta: false });
  });

  it("combina las clases 6 y 7 en Costos", () => {
    const explicaciones = calcularExplicacionesClaseReubicacion(
      [{ ...riesgoBase, claseOrigen: "7", claseDestino: "4", monto: -50_000 }],
      aprobadas(737),
      contabilizadas(737),
      { "4": -50_000, "6": -50_000 },
    );
    expect(explicaciones.get("6")?.resuelta).toBe(true);
    expect(explicaciones.get("4")?.resuelta).toBe(true);
  });

  it("retira únicamente hallazgos de clase resueltos", () => {
    const clase = (clase: string): Hallazgo => ({
      tipo: "clase",
      severidad: "alta",
      titulo: `Diferencia ${clase}`,
      detalle: "Detalle",
      monto: -302_477_965.9,
      clase,
    });
    const nodo: Hallazgo = {
      tipo: "nodo",
      severidad: "media",
      titulo: "Agrupadora descuadrada",
      detalle: "Detalle",
      monto: 10_000,
    };
    const explicaciones = calcularExplicacionesClaseReubicacion(
      [riesgoBase],
      aprobadas(737),
      contabilizadas(737),
      { "1": -302_477_965.9, "2": -302_477_965.9 },
    );

    expect(filtrarHallazgosClaseResueltos(
      [clase("Activo"), clase("Pasivo"), clase("Patrimonio"), nodo],
      explicaciones,
    )).toEqual([clase("Patrimonio"), nodo]);
  });
});
