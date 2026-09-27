// Revisión de un mapeo contra la MUESTRA de un patrón de archivo — puro, sin BD.
//
// Es la única comprobación de que un mapeo sirve, y la comparten los dos caminos:
//  - GUARDAR la versión (`prepararVersion`), que lanza con el primer impedimento;
//  - PROBAR el mapeo desde el editor, que muestra los impedimentos JUNTO con las filas leídas.
// Que sea la misma función es lo que garantiza que lo que el administrador ve en la prueba es
// exactamente lo que se va a guardar: nunca dos lecturas distintas del mismo archivo.
//
// Nunca lanza. Devuelve `impedimentos` en el ORDEN en que se descubren, y la `lectura` solo
// cuando tiene significado: con un spec que no valida (o sin la hoja) transformar no diría nada.
import type { GridHoja } from "@/lib/balance/extraccion/ingesta";
import type { DescriptorModulo } from "../descriptores";
import type { SpecModulo } from "../extraccion/esquema";
import { invalidarValorAmbiguoIngresos } from "../extraccion/sugerir";
import { transformarModulo, type ResultadoTransformModulo } from "../extraccion/transformar";
import { normalizarSpecModulo, normalizarSpecModuloArchivo, validarSpecModulo } from "../perfil-modulo";
import { encabezadoParaGuardar, normalizarRotulo } from "./rotulos";

/** Mínimo de rótulos con texto para que el encabezado sirva de huella del formato. */
const MINIMO_ROTULOS = 2;

export const MENSAJE_TIPO_FORMATO =
  "Elige el tipo de formato del archivo: por documento, por edades o por documento y edades.";
export const MENSAJE_SIN_FILAS =
  "Con este mapeo la muestra no produce ninguna fila. Revisa las filas y las columnas.";
export const MENSAJE_VALOR_AMBIGUO_INGRESOS =
  "Ingresos no admite una columna de total de factura como valor. Mapea ingreso neto sin IVA/impuestos, subtotal o base gravable.";
export const MENSAJE_ENCABEZADO_POBRE =
  "La fila de encabezado de la muestra no tiene rótulos suficientes para reconocer el archivo.";

/**
 * Cuántas filas de datos lee una PRUEBA del mapeo. El guardado no lleva tope: lee la muestra
 * entera, como siempre. La prueba sí, porque `transformarModulo` es sincrónico —mientras corre,
 * el servidor no atiende nada— y leer 125.000 filas para enseñar las 15 primeras no compensa:
 * una nómina de ese tamaño son 25 s, y con este tope, un segundo. No es un parche del barrido
 * cuadrático que se arregló el 28/Sep/2026 en `subtotales.ts` (eso hacía que la misma lectura
 * tardara minutos y afectaba también al guardado y a cada carga): es no hacer trabajo de más.
 */
export const FILAS_MAXIMAS_PRUEBA = 5_000;

export type RecorteMuestra = {
  /** Filas de datos que se leyeron. */
  filasLeidas: number;
  /** Filas que tiene el archivo. */
  filasArchivo: number;
};

export type RevisionMapeoMuestra = {
  /** El spec normalizado: lo que se guardaría en la versión. */
  spec: SpecModulo;
  /** La hoja del spec dentro de la muestra; `null` si no existe. */
  hoja: GridHoja | null;
  /** Los rótulos con que se reconocerán los archivos; `null` sin hoja. */
  encabezado: string[] | null;
  /** La lectura de la muestra, o `null` cuando el spec no da para leerla. */
  lectura: ResultadoTransformModulo | null;
  /** Lo que impide guardar la versión, en orden de descubrimiento. Vacío = se puede guardar. */
  impedimentos: string[];
  /** Solo con `maxFilasDatos`: qué parte del archivo se leyó, cuando no se leyó entero. */
  recorte: RecorteMuestra | null;
};

/** La misma hoja hasta la fila `hasta`, conservando negrita y numeración física. */
function recortarHoja(hoja: GridHoja, hasta: number): GridHoja {
  return {
    ...hoja,
    filas: hoja.filas.slice(0, hasta),
    ...(hoja.negrita ? { negrita: hoja.negrita.slice(0, hasta) } : {}),
    ...(hoja.filasFisicas ? { filasFisicas: hoja.filasFisicas.slice(0, hasta) } : {}),
  };
}

export function revisarMapeoMuestra(
  descriptor: DescriptorModulo,
  hojas: readonly GridHoja[],
  specEntrada: SpecModulo,
  opciones: {
    exigirTipoFormato: boolean;
    /** Tope de filas de DATOS a leer (solo la prueba lo usa; el guardado lee todo). */
    maxFilasDatos?: number;
  },
): RevisionMapeoMuestra {
  const spec = normalizarSpecModulo(descriptor, specEntrada);
  const vacia: RevisionMapeoMuestra = { spec, hoja: null, encabezado: null, lectura: null, impedimentos: [], recorte: null };

  // Cartera y CxP: el tipo de formato decide qué controles se validan en cada cargue.
  if (opciones.exigirTipoFormato && descriptor.crucePorTercero.detalleTercero && !spec.tipoFormato) {
    return { ...vacia, impedimentos: [MENSAJE_TIPO_FORMATO] };
  }
  const error = validarSpecModulo(descriptor, spec);
  if (error) return { ...vacia, impedimentos: [error] };

  const completa = hojas.find((h) => h.nombre === spec.hoja);
  if (!completa) return { ...vacia, impedimentos: [`La muestra no tiene la hoja «${spec.hoja}».`] };

  // Con tope, se lee solo el principio del archivo (ver `FILAS_MAXIMAS_PRUEBA`). El encabezado
  // queda intacto: el corte empieza después de la primera fila de datos.
  const hasta = opciones.maxFilasDatos != null
    ? spec.primeraFilaDatos - 1 + opciones.maxFilasDatos
    : completa.filas.length;
  const recortada = hasta < completa.filas.length;
  const hoja = recortada ? recortarHoja(completa, hasta) : completa;
  const recorte: RecorteMuestra | null = recortada
    ? {
      filasLeidas: opciones.maxFilasDatos ?? 0,
      filasArchivo: completa.filasFisicas?.at(-1) ?? completa.filas.length,
    }
    : null;

  // De aquí en adelante la lectura SÍ significa algo: los impedimentos que falten se devuelven
  // junto con ella, que es justo donde el administrador necesita ver por qué.
  const encabezado = encabezadoParaGuardar(hoja.filas[spec.filaEncabezado - 1] ?? []);
  const lectura = transformarModulo(descriptor, normalizarSpecModuloArchivo(descriptor, spec), hoja);
  const impedimentos: string[] = [];
  if (encabezado.filter((rotulo) => normalizarRotulo(rotulo) !== "").length < MINIMO_ROTULOS) {
    impedimentos.push(MENSAJE_ENCABEZADO_POBRE);
  }
  if (invalidarValorAmbiguoIngresos(descriptor, hoja, spec).invalidado) {
    impedimentos.push(MENSAJE_VALOR_AMBIGUO_INGRESOS);
  }
  if (!lectura.filas.some((f) => f.tipoFila === "movimiento")) impedimentos.push(MENSAJE_SIN_FILAS);
  return { spec, hoja, encabezado, lectura, impedimentos, recorte };
}
