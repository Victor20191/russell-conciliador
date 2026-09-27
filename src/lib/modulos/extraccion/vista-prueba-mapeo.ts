// «Probar el mapeo»: las primeras filas de la muestra TAL COMO LAS LEE EL MOTOR — puro, sin BD.
//
// El editor de patrones mapea columnas a ciegas: de todo el archivo solo se ven dos celdas al
// lado de cada selector. Esta vista convierte el resultado del transform —el mismo que corre al
// guardar la versión (`revisarMapeoMuestra`)— en una tabla chica que viaja al navegador: qué
// fila del archivo es, si suma o no y por qué, qué clasificador y qué valor sacó el motor, y
// qué quedó en cada columna mapeada. Nada crece con el tamaño del archivo.
import type { GridHoja } from "@/lib/balance/extraccion/ingesta";
import { columnasDetalleModulo, type ColumnaDetalle } from "../cartera/columnas-cartera";
import { datosConExtrasCartera } from "../cartera/detalle-cartera";
import { valorColumnaDetalle } from "../celda-detalle-modulo";
import type { DescriptorModulo } from "../descriptores";
import type { RecorteMuestra } from "../patrones/revision-mapeo";
import { letraColumnaModulo, modoClasificadorDe, valorAlternoMapeado } from "../perfil-modulo";
import { esImputable, type FilaStagingModulo } from "../promocion";
import { etiquetaRenglonNoSuma } from "../renglones-archivo";
import type { SpecModulo } from "./esquema";
import type { ResultadoTransformModulo, TipoFilaModulo } from "./transformar";

/** Cuántas filas leídas se muestran. Lo justo para reconocer el archivo de un vistazo. */
export const LIMITE_FILAS_PRUEBA = 15;
/** Un texto más largo que esto no ayuda a reconocer la columna y sí infla la respuesta. */
const MAX_TEXTO_CELDA = 60;

export type ColumnaPruebaMapeo = ColumnaDetalle & {
  /** Letra de Excel de la columna en el archivo, o «—» cuando el motor no la lee de una celda. */
  letra: string;
  /** Por qué no hay letra: «global», «se deriva». */
  nota?: string;
};

export type FilaPruebaMapeo = {
  /** Fila FÍSICA del archivo, la que se ve en Excel. */
  filaNum: number;
  clasificador: string | null;
  valor: number;
  tipoFila: TipoFilaModulo;
  /** Qué hace la fila, ya legible: «suma», «subtotal del archivo», «total del archivo»… */
  motivoTexto: string;
  /** ¿Esta fila suma al dato del módulo? (`esImputable`, el mismo criterio de la promoción.) */
  imputa: boolean;
  /** Se saltaron filas para llegar hasta ella (la salvaguarda del primer movimiento). */
  salto?: boolean;
  /** Alineadas 1:1 con `columnas`. */
  celdas: (string | number | null)[];
};

export type VistaPruebaMapeo = {
  hoja: string;
  /** Filas físicas de la hoja, incluidas las que el motor descarta. */
  totalFilasHoja: number;
  /** Filas que el mapeo produce (movimientos + totales + agrupadoras). */
  filasProducidas: number;
  movimientos: number;
  columnas: ColumnaPruebaMapeo[];
  filas: FilaPruebaMapeo[];
  /** Lo que impide guardar la versión (`revisarMapeoMuestra`). Vacío = se puede guardar. */
  impedimentos: string[];
  /** Lo que explica la tabla sin ser un problema: el período de Nómina, la divisa sin TRM. */
  avisos: string[];
  /** Cuando la prueba no leyó el archivo entero (ver `FILAS_MAXIMAS_PRUEBA`). */
  recorte: RecorteMuestra | null;
};

/** De qué archivo se probó: la muestra recién subida, la guardada de la versión, o la del cliente. */
export type OrigenPruebaMapeo = { tipo: "muestra" | "version" | "original"; nombre: string; cliente?: string };

export type ResultadoPruebaMapeo =
  | ({ ok: true; origen: OrigenPruebaMapeo } & VistaPruebaMapeo)
  | { ok: false; message: string };

/**
 * Lo que la tabla necesita que le expliquen: el patrón no fija ni el período ni la TRM —esos
 * son del cargue—, así que en la prueba Nómina trae todos los meses y una hoja en divisa se ve
 * sin convertir. Sin decirlo, las dos cosas se leen como errores del mapeo.
 */
function avisosDeLaPrueba(descriptor: DescriptorModulo, spec: SpecModulo): string[] {
  const avisos: string[] = [];
  if (descriptor.nomina?.periodoPorFila) {
    avisos.push("El patrón no fija el período: aquí entran todas las filas del archivo. El mes de corte se declara en cada carga.");
  }
  if (spec.monedaArchivo && spec.monedaArchivo !== "COP" && spec.trmCierre == null) {
    avisos.push(`Los importes están en ${spec.monedaArchivo}. La TRM de cierre se indica en cada carga, no en el patrón: aquí se ven sin convertir a pesos.`);
  }
  return avisos;
}

/** El motivo crudo del motor («subtotal:rotulo,aritmetica»), en palabras del auditor. */
export function motivoPruebaLegible(tipoFila: TipoFilaModulo, motivo: string | null | undefined): string {
  if (motivo?.startsWith("gran_total")) return "total del archivo · no suma";
  if (motivo?.startsWith("cola_control")) return "cuadro de control al pie · no suma";
  if (motivo?.startsWith("subtotal:")) return "subtotal del archivo · no suma";
  if (motivo === "fuera_de_periodo") return "fuera del período · no suma";
  if (tipoFila === "movimiento") return "suma";
  if (tipoFila === "total") return "total del archivo · no suma";
  return etiquetaRenglonNoSuma(motivo);
}

/** Las columnas de la tabla: las que el mapeo REALMENTE lee, con su letra en el archivo. */
export function columnasPruebaMapeo(
  descriptor: DescriptorModulo,
  spec: SpecModulo,
  columnaInicial = 0,
): ColumnaPruebaMapeo[] {
  const edades = spec.familias?.edades ?? [];
  const letraDeFamilia = new Map(edades.map((e) => [e.etiqueta, letraColumnaModulo(e.columna + columnaInicial)]));
  const global = modoClasificadorDe(spec) === "global";
  const derivado = valorAlternoMapeado(descriptor, spec);

  const salida: ColumnaPruebaMapeo[] = [];
  for (const columna of columnasDetalleModulo(descriptor, edades.map((e) => e.etiqueta))) {
    if (columna.familia) {
      salida.push({ ...columna, letra: letraDeFamilia.get(columna.familia.etiqueta) ?? "—" });
      continue;
    }
    const col = spec.columnas[columna.nombre] ?? 0;
    // El clasificador y el valor van SIEMPRE, aunque el motor no los lea de una celda: son las
    // dos cifras que el patrón promueve y de las que depende todo el cruce.
    if (columna.nombre === descriptor.clasificador) {
      salida.push({ ...columna, letra: global ? "—" : letraColumnaModulo(col + columnaInicial), ...(global ? { nota: "global" } : {}) });
      continue;
    }
    if (columna.esValor) {
      const sinColumna = col < 1 && derivado;
      salida.push({ ...columna, letra: sinColumna ? "—" : letraColumnaModulo(col + columnaInicial), ...(sinColumna ? { nota: "se deriva" } : {}) });
      continue;
    }
    if (col >= 1) salida.push({ ...columna, letra: letraColumnaModulo(col + columnaInicial) });
  }
  return salida;
}

const recortar = (v: string | number | null): string | number | null =>
  typeof v === "string" && v.length > MAX_TEXTO_CELDA ? `${v.slice(0, MAX_TEXTO_CELDA)}…` : v;

export function vistaPruebaMapeo(input: {
  descriptor: DescriptorModulo;
  spec: SpecModulo;
  hoja: GridHoja | null;
  lectura: ResultadoTransformModulo | null;
  impedimentos: readonly string[];
  recorte?: RecorteMuestra | null;
}): VistaPruebaMapeo {
  const { descriptor, spec, hoja, lectura } = input;
  const columnas = columnasPruebaMapeo(descriptor, spec, hoja?.columnaInicial ?? 0);
  const todas = lectura?.filas ?? [];
  // El MISMO criterio con que la promoción decide qué suma (`modulos-datos.ts`), para que la
  // prueba no prometa una fila que el cargue luego descarta por venir toda en cero.
  const columnasNumericas = descriptor.columnas
    .filter((c) => c.tipo === "numero" || c.tipo === "moneda")
    .map((c) => c.nombre);

  // Las primeras, y —si entre ellas no hay ningún movimiento— el primero que haya. Sin esto,
  // en los archivos jerárquicos (SIESA abre con la cuenta y la cabecera del tercero) la tabla
  // se vería entera de «no suma» y parecería un mapeo roto cuando no lo está.
  const primeras = todas.slice(0, LIMITE_FILAS_PRUEBA);
  const conMovimiento = primeras.some((f) => f.tipoFila === "movimiento")
    ? primeras
    : [...primeras, ...todas.slice(LIMITE_FILAS_PRUEBA).filter((f) => f.tipoFila === "movimiento").slice(0, 1)];

  const filas: FilaPruebaMapeo[] = conMovimiento.map((f, i) => {
    const datos = datosConExtrasCartera(f.datos, f);
    const staging: FilaStagingModulo = { ...f, omitida: f.omitida ?? null, datos };
    return {
      filaNum: f.filaNum,
      clasificador: f.clasificador,
      valor: f.valor,
      tipoFila: f.tipoFila,
      motivoTexto: motivoPruebaLegible(f.tipoFila, f.motivo),
      imputa: esImputable(staging, columnasNumericas),
      ...(i >= LIMITE_FILAS_PRUEBA ? { salto: true } : {}),
      // Las dos columnas que el motor PROMUEVE muestran lo promovido, no la celda: el
      // clasificador puede venir arrastrado de una fila anterior y el valor derivarse de otras
      // columnas (Nómina), y es eso —no lo que dice la celda— lo que va a consolidar.
      celdas: columnas.map((c) =>
        c.nombre === descriptor.clasificador
          ? f.clasificador
          : c.esValor
            ? f.valor
            : recortar(valorColumnaDetalle({ valor: f.valor, datos }, c)),
      ),
    };
  });

  return {
    hoja: hoja?.nombre ?? spec.hoja,
    // Con recorte, las filas del ARCHIVO, no las de la parte leída: es lo que el usuario ve en Excel.
    totalFilasHoja: input.recorte?.filasArchivo ?? (hoja ? (hoja.filasFisicas?.at(-1) ?? hoja.filas.length) : 0),
    filasProducidas: todas.length,
    movimientos: todas.filter((f) => f.tipoFila === "movimiento").length,
    columnas,
    filas,
    impedimentos: [...input.impedimentos],
    avisos: avisosDeLaPrueba(descriptor, spec),
    recorte: input.recorte ?? null,
  };
}
