// Qué muestra cada celda de la tabla de DETALLE de un módulo — puro, sin BD ni UI.
//
// Lo comparten el borrador, el dato cargado y la exportación a Excel. Casi todas las columnas
// se leen tal cual de `datos`, que guarda lo que traía el archivo. Tres no:
//  - los rangos de vencimiento, que viven en un mapa dentro de `datos` (`_edades`);
//  - el SALDO cuando el motor lo fijó —suma de los rangos, divisa con la TRM—: ahí el archivo
//    trae otra cosa (SIESA imprime el total del documento en $0) y mostrarla hacía creer que el
//    documento no sumaba;
//  - las fechas, que algunos libros entregan como número de serie de Excel («46009»).
import { fmtContable, fmtNum } from "@/lib/format";
import { CLAVE_FORMULA, CLAVE_MONEDA, CLAVE_ORIGEN_VALOR, CLAVE_SALDO_DIVISA, CLAVE_SALDO_REPORTADO, CLAVE_TRM } from "./cartera/detalle-cartera";
import { esRotuloEdad } from "./cartera/edades";
import { fechaISO } from "./cartera/fecha-corte";
import { parsearFechaCelda } from "./nomina/periodo";
import { esDescuadreProducto } from "./validaciones";

export type ColumnaCeldaDetalle = {
  nombre: string;
  tipo: string;
  /** La columna del valor del descriptor (la marca `columnasDetalleModulo`). */
  esValor?: boolean;
  /** Dónde leer el valor dentro de `datos` cuando la columna la puso el archivo. */
  familia?: { clave: string; etiqueta: string };
  /** Columna calculada por la tabla: valor total − cantidad × valor unitario. */
  calculada?: { resultado: string; producto: [string, string] };
};
export type FilaCeldaDetalle = { valor: number; datos: Record<string, unknown> };

const numero = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : Number.NaN;
  return Number.isFinite(n) ? n : null;
};

/** ¿El saldo de la fila lo fijó el motor (rangos, divisa, signo) en vez de copiarse de la columna? */
function saldoDelMotor(datos: Record<string, unknown>): boolean {
  return datos[CLAVE_ORIGEN_VALOR] != null || datos[CLAVE_SALDO_DIVISA] != null;
}

/** Fecha ISO de una celda: ISO, «dd/mm/aaaa», Date o serial de Excel (número o texto). */
export function fechaDeCelda(valor: unknown): string | null {
  return fechaISO(valor) ?? parsearFechaCelda(valor);
}

/**
 * Valor total − cantidad × valor unitario, solo cuando no cuadra: con el mismo criterio y la misma
 * tolerancia del aviso de «Novedades de la carga», para que la tabla y el aviso digan lo mismo.
 */
function diferenciaProducto(datos: Record<string, unknown>, regla: NonNullable<ColumnaCeldaDetalle["calculada"]>): number | null {
  const total = numero(datos[regla.resultado]);
  const cantidad = numero(datos[regla.producto[0]]);
  const unitario = numero(datos[regla.producto[1]]);
  if (total == null || cantidad == null || unitario == null || cantidad === 0 || unitario === 0) return null;
  if (!esDescuadreProducto(total, cantidad, unitario)) return null;
  return Math.round((total - Math.round(cantidad * unitario * 100) / 100) * 100) / 100;
}

/** El valor que representa la celda: el que se pinta, se filtra y se exporta. */
export function valorColumnaDetalle(fila: FilaCeldaDetalle, columna: ColumnaCeldaDetalle): string | number | null {
  if (columna.calculada) return diferenciaProducto(fila.datos, columna.calculada);
  if (columna.familia) {
    const mapa = fila.datos[columna.familia.clave];
    if (mapa == null || typeof mapa !== "object") return null;
    return numero((mapa as Record<string, unknown>)[columna.familia.etiqueta]);
  }
  // Las cabeceras de tercero no traen origen: conservan el total que declaran para su bloque.
  if (columna.esValor && saldoDelMotor(fila.datos)) return fila.valor;
  const v = fila.datos[columna.nombre];
  if (v == null) return null;
  return typeof v === "number" || typeof v === "string" ? v : String(v);
}

/**
 * Con qué valor se ordena y se filtra la celda. La diferencia, por su tamaño sin importar el
 * signo: «de mayor a menor» y «> 1000» deben traer también las que el archivo declara de menos.
 */
export function valorOrdenFiltroDetalle(fila: FilaCeldaDetalle, columna: ColumnaCeldaDetalle): string | number | null {
  const valor = valorColumnaDetalle(fila, columna);
  return columna.calculada && typeof valor === "number" ? Math.abs(valor) : valor;
}

/**
 * ¿La celda se pinta «—»? Vacía, o —en un rango de vencimiento— en cero: un rango en cero es un
 * documento que no cae ahí, y en blanco se lee el rango que sí aplica. Es la MISMA regla del filtro
 * de celdas vacías (`filtros-detalle-modulo.ts`), así lo que se ve y lo que se filtra no se separan.
 */
export function celdaSinValor(valor: string | number | null | undefined, columna: Pick<ColumnaCeldaDetalle, "tipo" | "familia">): boolean {
  if (valor == null || valor === "") return true;
  return Boolean(columna.familia) && (columna.tipo === "moneda" || columna.tipo === "numero") && numero(valor) === 0;
}

/** Texto de la celda según el tipo de la columna. */
export function textoCeldaDetalle(valor: string | number | null | undefined, columna: ColumnaCeldaDetalle): string {
  if (celdaSinValor(valor, columna)) return "—";
  if (columna.tipo === "moneda" || columna.tipo === "numero") {
    const n = numero(valor);
    if (n == null) return String(valor);
    return columna.tipo === "moneda" ? fmtContable(n) : fmtNum(n);
  }
  if (columna.tipo === "fecha") {
    const iso = fechaDeCelda(valor);
    return iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : String(valor);
  }
  return String(valor);
}

/** Por qué el saldo que se ve no es el de la columna del archivo, cuando no lo es. */
export function tituloCeldaDetalle(fila: FilaCeldaDetalle, columna: ColumnaCeldaDetalle): string | undefined {
  if (columna.calculada) {
    return diferenciaProducto(fila.datos, columna.calculada) == null ? "Cuadra con cantidad × valor unitario." : "Valor total menos cantidad × valor unitario.";
  }
  if (!columna.esValor || !saldoDelMotor(fila.datos)) return undefined;
  const divisa = numero(fila.datos[CLAVE_SALDO_DIVISA]);
  if (divisa != null) {
    const monedaDato = fila.datos[CLAVE_MONEDA];
    const moneda = typeof monedaDato === "string" ? monedaDato : "divisa";
    const trm = numero(fila.datos[CLAVE_TRM]);
    return `${moneda} ${fmtNum(divisa)} convertidos a pesos${trm != null ? ` con la TRM ${fmtNum(trm)}` : ""}.`;
  }
  if (fila.datos[CLAVE_ORIGEN_VALOR] === "formula") {
    const terminos = fila.datos[CLAVE_FORMULA];
    if (terminos == null || typeof terminos !== "object") return "Calculado con la fórmula del mapeo.";
    const partes = Object.entries(terminos as Record<string, unknown>)
      .map(([clave, v], i) => {
        const n = numero(v) ?? 0;
        return `${i === 0 ? (n < 0 ? "−" : "") : n < 0 ? "− " : "+ "}${clave} ${fmtContable(Math.abs(n))}`;
      });
    return `Fórmula del mapeo: ${partes.join(" ")}.`;
  }
  if (fila.datos[CLAVE_ORIGEN_VALOR] !== "familia") return undefined;
  const reportado = numero(fila.datos[CLAVE_SALDO_REPORTADO]);
  const difiere = reportado != null && Math.abs(reportado - fila.valor) >= 0.005;
  return `Suma de los rangos de vencimiento${difiere ? `; el archivo traía ${fmtContable(reportado ?? 0)} en esta columna` : ""}.`;
}

/** ¿La columna trae algún dato en alguna fila? Un rango en cero cuenta como vacío. */
function columnaConDatos(columna: ColumnaCeldaDetalle, filas: readonly FilaCeldaDetalle[]): boolean {
  for (const fila of filas) {
    const v = valorColumnaDetalle(fila, columna);
    if (v == null || v === "") continue;
    if (columna.familia && numero(v) === 0) continue;
    return true;
  }
  return false;
}

/**
 * Columnas que la tabla muestra de entrada. Fuera las que no traen dato en ninguna fila del
 * cargue —el descriptor declara todos los roles posibles y cada ERP llena unos pocos— y los
 * rangos que no suman al saldo («Cupo», «Posfechados», «Deterioro»), que no son edades. Nunca
 * se ocultan la columna del valor ni las de `siempre` (el clasificador). Lo oculto está a un clic.
 */
export function columnasVisiblesDetalle<C extends ColumnaCeldaDetalle>(
  columnas: readonly C[],
  filas: readonly FilaCeldaDetalle[],
  siempre: readonly string[] = [],
): { visibles: C[]; ocultas: C[] } {
  const visibles: C[] = [];
  const ocultas: C[] = [];
  for (const columna of columnas) {
    const fija = columna.esValor === true || siempre.includes(columna.nombre);
    const noSuma = columna.familia != null && esRotuloEdad(columna.familia.etiqueta)?.clase === "excluir";
    if (fija || (!noSuma && columnaConDatos(columna, filas))) visibles.push(columna);
    else ocultas.push(columna);
  }
  return { visibles, ocultas };
}
