/**
 * Índice de módulos (`/modulos/[codigo]`): búsqueda y orden por columna de sus dos
 * listados —borradores por confirmar y datos cargados—.
 *
 * Puro (sin BD ni React) para poder probarlo. Replica el contrato del listado de
 * Balance Borrador (`borradores-index-client.tsx`) para que ambas pantallas
 * busquen y ordenen igual.
 */
import { claveNit } from "@/lib/nit";

export type DireccionOrden = "asc" | "desc";

export type ColumnaOrdenModulo =
  | "archivo"
  | "cliente"
  | "periodo"
  | "version"
  | "filas"
  | "total"
  | "fecha";

/** Campos que ordenan/filtran una fila del listado; los comparten borradores y cargados. */
export type FilaListadoModulo = {
  archivoNombre: string | null;
  clienteNombre: string;
  clienteNit: string | null;
  periodo: string | null;
  version: number;
  filas: number;
  total: number;
  /** ISO de la fecha que ordena la fila (creación del borrador / última carga). */
  ordenFecha: string | null;
};

function normalizarBusqueda(valor: string | null | undefined): string {
  return (valor ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function marcaTiempo(valor: string | null): number {
  if (!valor) return 0;
  const fecha = Date.parse(valor);
  return Number.isFinite(fecha) ? fecha : 0;
}

function compararTexto(a: string, b: string): number {
  return a.localeCompare(b, "es", { sensitivity: "base", numeric: true });
}

/** Coincide si el término aparece en archivo, razón social, NIT (con o sin DV) o período. */
export function coincideBusquedaModulo(
  fila: Pick<
    FilaListadoModulo,
    "archivoNombre" | "clienteNombre" | "clienteNit" | "periodo"
  >,
  busqueda: string,
): boolean {
  const termino = normalizarBusqueda(busqueda);
  if (!termino) return true;

  const nitBuscado = claveNit(busqueda);
  const nitFila = claveNit(fila.clienteNit ?? "");

  return (
    normalizarBusqueda(fila.archivoNombre).includes(termino)
    || normalizarBusqueda(fila.clienteNombre).includes(termino)
    || normalizarBusqueda(fila.clienteNit).includes(termino)
    || normalizarBusqueda(fila.periodo).includes(termino)
    || (nitBuscado.length > 0 && nitFila.includes(nitBuscado))
  );
}

/** Orden explícito por columna (texto A–Z / número o fecha menor–mayor). */
export function ordenarFilasModulo<T extends FilaListadoModulo>(
  filas: readonly T[],
  columna: ColumnaOrdenModulo,
  direccion: DireccionOrden,
): T[] {
  const dir = direccion === "asc" ? 1 : -1;
  return [...filas].sort((a, b) => {
    let cmp = 0;
    switch (columna) {
      case "archivo":
        cmp = compararTexto(a.archivoNombre ?? "", b.archivoNombre ?? "");
        break;
      case "cliente":
        cmp =
          compararTexto(a.clienteNombre, b.clienteNombre)
          || compararTexto(a.clienteNit ?? "", b.clienteNit ?? "");
        break;
      case "periodo":
        cmp = compararTexto(a.periodo ?? "", b.periodo ?? "");
        break;
      case "version":
        cmp = a.version - b.version;
        break;
      case "filas":
        cmp = a.filas - b.filas;
        break;
      case "total":
        cmp = a.total - b.total;
        break;
      case "fecha":
        cmp = marcaTiempo(a.ordenFecha) - marcaTiempo(b.ordenFecha);
        break;
    }
    if (cmp !== 0) return cmp * dir;
    // Desempate estable: lo más reciente primero y, si empatan, por archivo.
    return (
      marcaTiempo(b.ordenFecha) - marcaTiempo(a.ordenFecha)
      || compararTexto(a.archivoNombre ?? "", b.archivoNombre ?? "")
    );
  });
}

/** Texto A→Z al primer clic; números y fechas de mayor a menor. */
export function direccionInicialColumnaModulo(
  columna: ColumnaOrdenModulo,
): DireccionOrden {
  return columna === "archivo" || columna === "cliente" || columna === "periodo"
    ? "asc"
    : "desc";
}

/**
 * Filtro del buscador sobre el listado AGRUPADO de cargados (cliente → períodos).
 *
 * Si el término identifica al cliente (razón social o NIT, con o sin DV) se
 * conserva la tarjeta completa; si no, se dejan solo los períodos que coinciden
 * por su etiqueta o por el archivo, y la tarjeta desaparece si no queda ninguno.
 */
export function filtrarGruposCargaModulo<
  P extends { periodo: string; archivoNombre: string | null },
  G extends { clienteNombre: string; clienteNit: string | null; periodos: P[] },
>(grupos: readonly G[], busqueda: string): G[] {
  const termino = normalizarBusqueda(busqueda);
  if (!termino) return [...grupos];

  const nitBuscado = claveNit(busqueda);

  return grupos.flatMap((grupo) => {
    const coincideCliente =
      normalizarBusqueda(grupo.clienteNombre).includes(termino)
      || normalizarBusqueda(grupo.clienteNit).includes(termino)
      || (nitBuscado.length > 0 && claveNit(grupo.clienteNit ?? "").includes(nitBuscado));
    if (coincideCliente) return [grupo];

    const periodos = grupo.periodos.filter(
      (periodo) =>
        normalizarBusqueda(periodo.periodo).includes(termino)
        || normalizarBusqueda(periodo.archivoNombre).includes(termino),
    );
    return periodos.length > 0 ? [{ ...grupo, periodos }] : [];
  });
}
