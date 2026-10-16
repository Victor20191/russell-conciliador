// Filtros por COLUMNA del detalle de un dato de módulo cargado (puro, sin BD ni UI).
// Genérico sobre las columnas del descriptor: texto → subcadena normalizada (o posición, con el
// comodín `*`); numérico (cantidad/moneda) → operadores >, >=, <, <=, = (igual que el balance).
// Celdas VACÍAS (15/Oct/2026): el filtro compara contra el valor crudo y el «—» solo se pinta, así
// que escribir «—» no encontraba nada. Ahora «—», «–», un guion solo «-» o «vacío» encuentran las
// celdas que la tabla pinta «—» (`celdaSinValor`), en cualquier tipo de columna; un guion dentro de
// un texto («01-15») sigue buscando como subcadena.
import { coincideComodin, tieneComodin } from "@/lib/filtro-comodin";
import { celdaSinValor } from "./celda-detalle-modulo";

/** nombre de columna del descriptor → texto del filtro (vacío = sin filtro). */
export type FiltrosDetalleModulo = Record<string, string>;

/**
 * Una columna filtrable. `familia` la traen las columnas que puso el ARCHIVO y no el
 * descriptor (los rangos de vencimiento de cartera): su valor no está en una clave plana de
 * `datos`, así que quien filtra tiene que resolverlo con `ObtenerValorColumna`.
 */
export type ColumnaFiltro = { nombre: string; tipo: string; familia?: { clave: string; etiqueta: string } };
export type FilaFiltrable = { datos: Record<string, string | number | null> };
export type ObtenerValorColumna<T extends FilaFiltrable> = (
  fila: T,
  columna: ColumnaFiltro,
) => string | number | null | undefined;

const esNumerica = (tipo: string) => tipo === "numero" || tipo === "moneda";

function normalizarTexto(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

function numeroFiltro(valor: string): number | null {
  const limpio = valor.replace(/[$%\s]/g, "");
  if (!limpio) return null;
  // es-CO: el punto agrupa miles y la coma es decimal; también admite punto decimal simple.
  const colombiano = /^[-+]?\d{1,3}(?:\.\d{3})+(?:,\d+)?$/.test(limpio);
  const canonico = colombiano ? limpio.replace(/\./g, "").replace(",", ".") : limpio.replace(",", ".");
  const numero = Number(canonico);
  return Number.isFinite(numero) ? numero : null;
}

/** Admite igualdad implícita y los operadores >, >=, <, <= y =. Filtro vacío → true. */
export function coincideFiltroNumerico(valor: number | null | undefined, filtro: string): boolean {
  const entrada = filtro.trim();
  if (!entrada) return true;
  if (valor == null || !Number.isFinite(valor)) return false;
  const match = /^(<=|>=|<|>|=)?\s*(.+)$/.exec(entrada);
  if (!match) return false;
  const esperado = numeroFiltro(match[2]);
  if (esperado == null) return false;
  switch (match[1] ?? "=") {
    case ">": return valor > esperado;
    case ">=": return valor >= esperado;
    case "<": return valor < esperado;
    case "<=": return valor <= esperado;
    default: return Math.abs(valor - esperado) < 0.0001;
  }
}

/** Lo que, escrito como filtro ENTERO, pide las celdas vacías (las que la tabla pinta «—»). */
const FILTROS_CELDA_VACIA = new Set(["—", "–", "-", "vacio", "vacia", "(vacio)", "(vacia)"]);

/** ¿El filtro pide las celdas vacías? «—», «–», un guion solo o «vacío» (sin tildes ni mayúsculas). */
export function esFiltroCeldaVacia(filtro: string | null | undefined): boolean {
  return FILTROS_CELDA_VACIA.has(normalizarTexto(filtro ?? "").replace(/\s+/g, ""));
}

export function hayFiltrosDetalleModulo(filtros: FiltrosDetalleModulo): boolean {
  return Object.values(filtros).some((v) => v.trim() !== "");
}

const valorDesdeDatos = <T extends FilaFiltrable>(fila: T, columna: ColumnaFiltro) =>
  fila.datos[columna.nombre];

/** ¿La fila cumple TODOS los filtros de columna activos? */
export function coincideFilaDetalle<T extends FilaFiltrable>(
  fila: T,
  columnas: ColumnaFiltro[],
  filtros: FiltrosDetalleModulo,
  obtenerValor: ObtenerValorColumna<T> = valorDesdeDatos,
): boolean {
  for (const col of columnas) {
    const f = filtros[col.nombre];
    if (!f || !f.trim()) continue;
    const v = obtenerValor(fila, col);
    // «—» (o «-», «vacío»): las celdas que la tabla pinta vacías, con la misma regla que la pinta.
    if (esFiltroCeldaVacia(f)) {
      if (!celdaSinValor(v, col)) return false;
      continue;
    }
    if (esNumerica(col.tipo)) {
      if (!coincideFiltroNumerico(v == null || v === "" ? null : Number(v), f)) return false;
    } else if (!coincideFiltroTexto(v == null ? "" : String(v), f)) {
      return false;
    }
  }
  return true;
}

/**
 * ¿El texto contiene el filtro, sin distinguir tildes ni mayúsculas? Filtro vacío → true. Con un
 * `*` (o `?`) manda la POSICIÓN y no la subcadena: «**25» casa con 112505 pero no con 110525.
 */
export function coincideFiltroTexto(valor: string | null | undefined, filtro: string | null | undefined): boolean {
  const buscado = normalizarTexto(filtro ?? "");
  if (!buscado) return true;
  if (tieneComodin(buscado)) return coincideComodin(valor, buscado);
  return normalizarTexto(String(valor ?? "")).includes(buscado);
}

/** Grupo del borrador tal como lo ve el filtro: su clasificador y, si lo tiene, su nombre. */
export type GrupoFiltrable = { clasificador: string; descripcion?: string | null };

/**
 * ¿El GRUPO sigue a la vista con los filtros puestos? La tabla del borrador lista grupos y solo
 * trae las filas del que se abre, así que los filtros de las dos columnas que identifican al
 * grupo —la del clasificador y la de su nombre— se resuelven aquí, sin pedir nada al servidor:
 * escribir «cesantías» deja a la vista los grupos de cesantías en vez de la lista entera. Los
 * filtros de las demás columnas no deciden: su dato vive en las filas, que aún no se han traído.
 */
export function coincideGrupoDetalle(
  grupo: GrupoFiltrable,
  roles: { clasificador: string; descripcion?: string | null },
  filtros: FiltrosDetalleModulo,
): boolean {
  // El filtro de celdas vacías no decide aquí: el grupo queda a la vista y deciden sus filas (si
  // no, un «—» en la columna del clasificador escondería todos los grupos).
  const delClasificador = filtros[roles.clasificador];
  if (!esFiltroCeldaVacia(delClasificador) && !coincideFiltroTexto(grupo.clasificador, delClasificador)) return false;
  // Sin nombre propio, el del grupo es su clasificador (así se guarda cuando son iguales).
  const nombre = roles.descripcion ? filtros[roles.descripcion] : "";
  return esFiltroCeldaVacia(nombre) || coincideFiltroTexto(grupo.descripcion ?? grupo.clasificador, nombre);
}

/** Filtra las filas del detalle por los filtros de columna (sin filtros → mismas filas). */
export function filtrarFilasDetalleModulo<T extends FilaFiltrable>(
  filas: T[],
  columnas: ColumnaFiltro[],
  filtros: FiltrosDetalleModulo,
  obtenerValor: ObtenerValorColumna<T> = valorDesdeDatos,
): T[] {
  if (!hayFiltrosDetalleModulo(filtros)) return filas;
  return filas.filter((f) => coincideFilaDetalle(f, columnas, filtros, obtenerValor));
}
