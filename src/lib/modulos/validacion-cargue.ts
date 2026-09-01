// VALIDACIÓN DEL ARCHIVO sobre un cargue YA PROMOVIDO. Lógica pura: reconstruye, desde lo
// que el encabezado congeló al promover, el mismo veredicto que mostró el borrador.
//
// Por qué se congela y no se recalcula: el resto de novedades del cargue (negativos,
// descuadres de valor) se deducen del detalle, pero el total que el archivo DECLARA vive en
// una fila que no es imputable — no llega al detalle — y el staging que la contenía se purga
// en la misma transacción de la promoción. Sin las columnas del encabezado, la información
// se perdería al confirmar.
import { TOLERANCIA_CONTROL, type ControlSubtotales } from "./subtotales";

/** Lo que el encabezado del cargue guarda para poder validar. */
export type CargueValidable = {
  /** Σ cargada (movimientos imputables). */
  total: number;
  /** Ítems cargados. */
  filas: number;
  /** Σ de los totales declarados por los archivos de la versión. */
  totalDeclarado: number | null;
  /** Fila del total en el archivo; null si la versión la componen varios. */
  filaTotalDeclarado: number | null;
  /** null = cargue ANTERIOR a esta validación: no hay nada que afirmar. */
  archivosDelCargue: number | null;
  archivosConTotal: number | null;
};

/** De cuántos archivos salió el total declarado (los anexos pueden no traerlo). */
export type OrigenTotalDeclarado = { archivos: number; archivosConTotal: number };

export type ValidacionCargue = {
  control: ControlSubtotales;
  resumen: { items: number; sumaMovimientos: number };
  origen: OrigenTotalDeclarado;
};

const redondear = (v: number): number => Math.round(v * 100) / 100 + 0 || 0;

/**
 * Veredicto del cargue, o `null` cuando el cargue es anterior a esta validación (ahí la
 * pantalla no muestra el panel, en vez de afirmar «no validado» sobre algo que nunca se midió).
 */
export function validacionDelCargue(enc: CargueValidable): ValidacionCargue | null {
  if (enc.archivosDelCargue == null) return null;
  const origen = { archivos: enc.archivosDelCargue, archivosConTotal: enc.archivosConTotal ?? 0 };
  const resumen = { items: enc.filas, sumaMovimientos: enc.total };
  const sinControl: ControlSubtotales = { grupos: [], granTotal: null, descuadres: 0, noValidados: 0 };

  // COBERTURA PARCIAL: contrastar la Σ de los archivos que sí declararon total contra TODO
  // lo cargado inventaría un descuadre que no existe. Sin cobertura completa no se afirma nada.
  if (enc.totalDeclarado == null || origen.archivosConTotal !== origen.archivos) {
    return { control: sinControl, resumen, origen };
  }

  const diferencia = redondear(enc.totalDeclarado - enc.total);
  const estado = Math.abs(diferencia) <= TOLERANCIA_CONTROL ? "cuadra" : "descuadre";
  return {
    control: {
      grupos: [],
      granTotal: {
        // 0 = la versión la componen varios archivos: ninguna fila concreta la identifica.
        filaNum: enc.filaTotalDeclarado ?? 0,
        subtotalArchivo: enc.totalDeclarado,
        sumaMovimientos: enc.total,
        diferencia,
        estado,
      },
      descuadres: estado === "descuadre" ? 1 : 0,
      noValidados: 0,
    },
    resumen,
    origen,
  };
}
