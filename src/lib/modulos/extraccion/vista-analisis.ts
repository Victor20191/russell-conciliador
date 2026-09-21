// Vista de una hoja para el editor de mapeo y la confirmación de carga — puro.
//
// La comparten la carga de un módulo y la interfaz de patrones de archivo: el encabezado y las
// filas de muestra alineados por columna (de la MISMA grilla del servidor), las últimas filas con
// contenido —donde el archivo declara su total—, los avisos sobre otras hojas del libro y, en
// Nómina, los meses que trae el archivo.
import type { CeldaCruda, GridHoja } from "@/lib/balance/extraccion/ingesta";
import type { DescriptorModulo } from "../descriptores";
import { avisoHojasGemelas, hojasConMismoEncabezado } from "../hojas-gemelas";
import { resumirPeriodos, type ResumenPeriodo } from "../nomina/periodo";
import type { SpecModulo } from "./esquema";
import { avisoSeleccionHoja, type SeleccionHoja } from "./seleccion-hoja";
import { sugerirSpec } from "./sugerir";
import { transformarModulo } from "./transformar";

/** Cuántas filas del final se devuelven al editor para señalar la fila de total. */
export const FILAS_MUESTRA_COLA = 12;
/** Filas de datos que acompañan al encabezado en la vista previa. */
export const FILAS_MUESTRA_DATOS = 12;

export type CeldaMuestra = string | number | null;

export const aCeldaMuestra = (valor: CeldaCruda): CeldaMuestra => (
  valor == null
    ? null
    : typeof valor === "number"
      ? valor
      : typeof valor === "boolean"
        ? (valor ? 1 : 0)
        : String(valor).replace(/\s+/g, " ").trim() || null
);

export const textoCeldaMuestra = (valor: CeldaMuestra): string => (
  valor == null ? "" : typeof valor === "number" ? String(valor) : valor
);

export type VistaAnalisisHoja = {
  hoja: string;
  hojas: string[];
  totalFilas: number;
  ancho: number;
  /** Columnas vacías con que empieza la hoja (`GridHoja.columnaInicial`). */
  columnaInicial?: number;
  encabezado: CeldaMuestra[];
  muestraFilas: CeldaMuestra[][];
  /** Últimas filas con contenido, con su número de fila real. */
  muestraCola: { filaNum: number; celdas: CeldaMuestra[] }[];
  advertenciaHojas?: string;
  periodosDetectados?: ResumenPeriodo[];
};

export function vistaAnalisisHoja(
  descriptor: DescriptorModulo,
  hojas: readonly GridHoja[],
  hoja: GridHoja,
  spec: SpecModulo,
  seleccion: SeleccionHoja | null,
): VistaAnalisisHoja {
  const ancho = hoja.filas.reduce((m, f) => Math.max(m, f?.length ?? 0), 0);
  const rellena = (fila: CeldaCruda[] | undefined): CeldaMuestra[] =>
    Array.from({ length: ancho }, (_, c) => aCeldaMuestra(fila?.[c] ?? null));
  const encabezado = rellena(hoja.filas[spec.filaEncabezado - 1]);
  const muestraFilas = hoja.filas
    .slice(spec.primeraFilaDatos - 1, spec.primeraFilaDatos - 1 + FILAS_MUESTRA_DATOS)
    .map(rellena);
  const muestraCola: VistaAnalisisHoja["muestraCola"] = [];
  for (let r = hoja.filas.length - 1; r >= spec.primeraFilaDatos - 1 && muestraCola.length < FILAS_MUESTRA_COLA; r--) {
    const celdas = rellena(hoja.filas[r]);
    if (celdas.every((c) => c == null || c === "")) continue;
    muestraCola.unshift({ filaNum: hoja.filasFisicas?.[r] ?? r + 1, celdas });
  }

  // HOJAS GEMELAS: otra hoja del libro con exactamente el mismo formato. No se bloquea
  // —a veces es legítimo—, pero se avisa: si es la misma cartera exportada en otro momento,
  // cada hoja cuadra consigo misma y ningún control delataría la equivocada.
  const encabezadoSeleccion = new Map(seleccion?.puntajes.map((p) => [p.nombre, p.filaEncabezado]) ?? []);
  const avisoGemelas = hojas.length > 1
    ? avisoHojasGemelas(
        hojasConMismoEncabezado(hojas.map((h) => {
          const filaEncabezado = h.nombre === hoja.nombre
            ? spec.filaEncabezado
            : encabezadoSeleccion.get(h.nombre) ?? sugerirSpec(descriptor, h).filaEncabezado;
          return { nombre: h.nombre, encabezado: h.filas[filaEncabezado - 1] ?? [] };
        })),
        hoja.nombre,
      )
    : null;
  const avisoHoja = seleccion ? avisoSeleccionHoja(seleccion.puntajes, hoja.nombre) : null;
  const advertenciaHojas = [avisoHoja, avisoGemelas].filter((aviso): aviso is string => aviso != null).join(" ");

  // Nómina: qué meses trae el archivo con este mapeo, para que el usuario vea qué entra al corte.
  const periodosDetectados = descriptor.nomina?.periodoPorFila
    ? resumirPeriodos(transformarModulo(descriptor, spec, hoja).filas.map((f) => ({
        periodoDesde: f.datos.periodoDesde, periodoHasta: f.datos.periodoHasta, valor: f.valor, tipoFila: f.tipoFila,
      })))
    : [];

  return {
    hoja: hoja.nombre,
    hojas: hojas.map((h) => h.nombre),
    totalFilas: hoja.filasFisicas?.at(-1) ?? hoja.filas.length,
    ancho,
    ...(hoja.columnaInicial ? { columnaInicial: hoja.columnaInicial } : {}),
    encabezado,
    muestraFilas,
    muestraCola,
    ...(advertenciaHojas ? { advertenciaHojas } : {}),
    ...(periodosDetectados.length ? { periodosDetectados } : {}),
  };
}
