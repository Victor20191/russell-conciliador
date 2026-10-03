import type { GridHoja } from "@/lib/balance/extraccion/ingesta";
import type { UsoIA } from "@/lib/ia/uso";
import type { SpecModulo } from "../extraccion/esquema";

export type OrigenLecturaInventario = "patron" | "ia" | "heuristica" | "manual";

export type PreguntaAsistenciaInventario = {
  id: string;
  etiqueta: string;
  opciones?: { valor: string; etiqueta: string }[];
  /** Resolver esta duda exige proponer una regla nueva, no sólo escoger un mapa ya leído. */
  requiereIA?: boolean;
  /** Coordenadas físicas y texto comprobado por el servidor, nunca citas fabricadas por IA. */
  evidencia?: EvidenciaCeldaInventario[];
};

export type EvidenciaCeldaInventario = { hoja: string; fila: number; columna: number; texto: string };
export type EjemploLecturaInventario = {
  fila: number;
  campos: { rol: string; valor: string | number | boolean | null; fuentes: EvidenciaCeldaInventario[] }[];
};

export type ResumenLecturaInventario = {
  filasIncluidas: number;
  filasExcluidas: number;
  valorLeido: number;
  totalDeclarado: number | null;
  /** Total del archivo menos el valor leído, nunca una cifra propuesta por IA. */
  diferencia: number | null;
  hoja: string | null;
  tipoInventario: string | null;
};

export type ResultadoAsistenciaInventario = {
  spec: SpecModulo | null;
  resumen: ResumenLecturaInventario;
  preguntas: PreguntaAsistenciaInventario[];
  advertencias: string[];
  errores: string[];
  usos: UsoIA[];
  origen: OrigenLecturaInventario;
  estructuraValida: boolean;
  listoParaBorrador: boolean;
  /** Un problema del proveedor no significa que el archivo sea incompatible. */
  errorProveedorIA?: boolean;
  /** Ejemplos leídos por el motor para revisar una interpretación estructurada nueva. */
  ejemplosLectura?: EjemploLecturaInventario[];
};

export type EntradaAsistenciaInventario = {
  hojas: GridHoja[];
  specBase?: SpecModulo | null;
  origenBase?: OrigenLecturaInventario;
  instrucciones?: string;
  respuestas?: Record<string, string>;
  preguntasPendientes?: PreguntaAsistenciaInventario[];
  /** Sólo los cambios de esta petición, para que respuestas guardadas no repitan IA. */
  respuestasNuevas?: Record<string, string>;
  /** Releer con indicaciones nuevas. Las instrucciones guardadas solas no repiten IA. */
  forzarIA?: boolean;
  nombreArchivo?: string;
  aplicativo?: string;
};

export type EntradaValidacionInventario = {
  hojas: GridHoja[];
  spec: SpecModulo;
  respuestas?: Record<string, string>;
  origen?: OrigenLecturaInventario;
};

export function resultadoInventarioVacio(origen: OrigenLecturaInventario = "heuristica"): ResultadoAsistenciaInventario {
  return {
    spec: null,
    resumen: { filasIncluidas: 0, filasExcluidas: 0, valorLeido: 0, totalDeclarado: null, diferencia: null, hoja: null, tipoInventario: null },
    preguntas: [], advertencias: [], errores: [], usos: [], origen,
    estructuraValida: false, listoParaBorrador: false,
  };
}
