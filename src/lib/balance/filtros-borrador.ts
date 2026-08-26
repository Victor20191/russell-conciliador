import type { NodoBorrador } from "./borrador";
import { estadoValidacionBorrador } from "./alerta-borrador";
import {
  coincideFiltroNumerico,
  type FiltroValidacionDetalle,
} from "./filtros-detalle";
import {
  UMBRALES_ALERTAS_DEFECTO,
  type UmbralesAlertas,
} from "./umbrales-alertas";
import { codigoEmpiezaPor } from "./busqueda-cuenta";

/**
 * Filtros por columna de la tabla de movimiento del borrador.
 * Misma Validación que el balance oficial (Todas / OK / Alerta / Informativa).
 */
export type FiltrosColumnasBorrador = {
  codigo: string;
  cuenta: string;
  saldoAnterior: string;
  debito: string;
  credito: string;
  saldo: string;
  validacion: FiltroValidacionDetalle;
};

export const FILTROS_COLUMNAS_BORRADOR_INICIALES: FiltrosColumnasBorrador = {
  codigo: "",
  cuenta: "",
  saldoAnterior: "",
  debito: "",
  credito: "",
  saldo: "",
  validacion: "todas",
};

function normalizarTexto(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function coincideNodo(
  nodo: NodoBorrador,
  filtros: FiltrosColumnasBorrador,
  umbrales: UmbralesAlertas,
  riesgos: { has(filaNum: number): boolean },
): boolean {
  const codigo = normalizarTexto(filtros.codigo);
  if (codigo) {
    if (!codigoEmpiezaPor(nodo.codigo, codigo) && !codigoEmpiezaPor(nodo.codigoCrudo, codigo)) return false;
  }

  const cuenta = normalizarTexto(filtros.cuenta);
  if (cuenta && !normalizarTexto(nodo.nombre ?? "").includes(cuenta)) return false;

  if (!coincideFiltroNumerico(nodo.saldoInicial, filtros.saldoAnterior)) return false;
  if (!coincideFiltroNumerico(nodo.debitos, filtros.debito)) return false;
  if (!coincideFiltroNumerico(nodo.creditos, filtros.credito)) return false;
  if (!coincideFiltroNumerico(nodo.saldoFinal, filtros.saldo)) return false;

  return filtros.validacion === "todas"
    || estadoValidacionBorrador(nodo, umbrales, riesgos) === filtros.validacion;
}

export function hayFiltrosColumnasBorrador(
  filtros: FiltrosColumnasBorrador,
): boolean {
  return filtros.codigo.trim() !== ""
    || filtros.cuenta.trim() !== ""
    || filtros.saldoAnterior.trim() !== ""
    || filtros.debito.trim() !== ""
    || filtros.credito.trim() !== ""
    || filtros.saldo.trim() !== ""
    || filtros.validacion !== "todas";
}

/**
 * Conserva cada coincidencia y su ruta de ancestros, sin incorporar hermanos
 * que no cumplen. Sin filtros devuelve el mismo array (identidad) para evitar
 * clonar árboles grandes del borrador.
 *
 * Si hay filtro de validación, un ancestro con OTRO estado no se conserva.
 */
export function filtrarArbolBorradorPorColumnas(
  nodos: NodoBorrador[],
  filtros: FiltrosColumnasBorrador,
  umbrales: UmbralesAlertas = UMBRALES_ALERTAS_DEFECTO,
  riesgos: { has(filaNum: number): boolean } = new Set(),
): NodoBorrador[] {
  if (!hayFiltrosColumnasBorrador(filtros)) return nodos;

  const soloEstadoValidacion = filtros.validacion !== "todas";

  const podar = (rama: readonly NodoBorrador[]): NodoBorrador[] => {
    const resultado: NodoBorrador[] = [];
    for (const nodo of rama) {
      const hijos = podar(nodo.hijos);
      if (coincideNodo(nodo, filtros, umbrales, riesgos)) {
        resultado.push({ ...nodo, hijos });
      } else if (hijos.length > 0) {
        if (soloEstadoValidacion) resultado.push(...hijos);
        else resultado.push({ ...nodo, hijos });
      }
    }
    return resultado;
  };

  return podar(nodos);
}
