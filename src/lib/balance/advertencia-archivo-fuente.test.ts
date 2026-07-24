import { describe, expect, it } from "vitest";
import type { ValidacionContable } from "./calcular";
import type { Hallazgo, PartidaDobleInfo } from "./diagnostico";
import {
  esDescuadreDelArchivoFuente,
  MAX_COMENTARIO_PROMOCION,
  validarComentarioPromocion,
} from "./advertencia-archivo-fuente";

function validacion(
  cambios: Partial<ValidacionContable> = {},
): ValidacionContable {
  return {
    activo: 100,
    pasivo: 50,
    patrimonio: 40,
    ingresos: 30,
    gastos: 10,
    costos: 5,
    resultado: 15,
    activoArchivo: 100,
    pasivoArchivo: 50,
    patrimonioArchivo: 40,
    ingresosArchivo: 30,
    gastosArchivo: 10,
    costosArchivo: 5,
    resultadoArchivo: 15,
    ecuacionDiff: -2_500,
    ecuacionCuadra: false,
    activoDiff: 0,
    activoCuadra: true,
    pasivoDiff: 0,
    pasivoCuadra: true,
    patrimonioDiff: 0,
    patrimonioCuadra: true,
    ingresosDiff: 0,
    ingresosCuadra: true,
    gastosDiff: 0,
    gastosCuadra: true,
    costosDiff: 0,
    costosCuadra: true,
    resultadoDiff: 0,
    resultadoCuadra: true,
    ...cambios,
  };
}

const PARTIDA_DOBLE_OK: PartidaDobleInfo = {
  debitos: 100,
  creditos: 100,
  diff: 0,
  cuadra: true,
};

describe("esDescuadreDelArchivoFuente", () => {
  it("identifica la ecuación inconsistente cuando todo lo demás cruza", () => {
    const hallazgos: Hallazgo[] = [
      {
        tipo: "ecuacion",
        severidad: "alta",
        titulo: "Ecuación contable no cuadra",
        detalle: "La diferencia ya está en los totales del archivo.",
        monto: -2_500,
      },
    ];

    expect(
      esDescuadreDelArchivoFuente(
        validacion(),
        PARTIDA_DOBLE_OK,
        hallazgos,
      ),
    ).toBe(true);
  });

  it("no lo atribuye al archivo cuando existe una alerta por cuenta", () => {
    const hallazgos: Hallazgo[] = [
      {
        tipo: "nodo",
        severidad: "media",
        titulo: "Cuenta descuadrada",
        detalle: "El subtotal no coincide con sus cuentas.",
        monto: 5,
      },
    ];

    expect(
      esDescuadreDelArchivoFuente(
        validacion(),
        PARTIDA_DOBLE_OK,
        hallazgos,
      ),
    ).toBe(false);
  });

  it("no lo atribuye al archivo si un total no cruza", () => {
    expect(
      esDescuadreDelArchivoFuente(
        validacion({ gastosCuadra: false, gastosDiff: 5 }),
        PARTIDA_DOBLE_OK,
        [],
      ),
    ).toBe(false);
  });

  it("no lo atribuye solo al archivo si la partida doble tampoco cuadra", () => {
    expect(
      esDescuadreDelArchivoFuente(
        validacion(),
        { debitos: 100, creditos: 95, diff: 5, cuadra: false },
        [],
      ),
    ).toBe(false);
  });

  it("no muestra la advertencia cuando la ecuación sí cuadra", () => {
    expect(
      esDescuadreDelArchivoFuente(
        validacion({ ecuacionCuadra: true, ecuacionDiff: 0 }),
        PARTIDA_DOBLE_OK,
        [],
      ),
    ).toBe(false);
  });
});

describe("validarComentarioPromocion", () => {
  it("exige el comentario cuando la advertencia del archivo fuente está activa", () => {
    expect(validarComentarioPromocion("   ", true)).toEqual({
      ok: false,
      message: "Escribe un comentario para cargar este balance con la diferencia del archivo fuente.",
    });
  });

  it("recorta y conserva el comentario diligenciado", () => {
    expect(
      validarComentarioPromocion("  Diferencia revisada con el cliente.  ", true),
    ).toEqual({
      ok: true,
      comentario: "Diferencia revisada con el cliente.",
    });
  });

  it("permite omitirlo cuando la advertencia no aplica", () => {
    expect(validarComentarioPromocion(null, false)).toEqual({
      ok: true,
      comentario: null,
    });
  });

  it("limita la longitud antes de guardar la nota oficial", () => {
    expect(
      validarComentarioPromocion("x".repeat(MAX_COMENTARIO_PROMOCION + 1), true),
    ).toEqual({
      ok: false,
      message: `El comentario no puede superar ${MAX_COMENTARIO_PROMOCION} caracteres.`,
    });
  });
});
