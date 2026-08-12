import type { NodoBalance } from "./calcular";
import {
  esSaldoContrarioInformativo,
  type UmbralesAlertas,
} from "./umbrales-alertas";

export type FiltroValidacionDetalle =
  | "todas"
  | "ok"
  | "alerta";

export const OPCIONES_FILTRO_VALIDACION: { value: FiltroValidacionDetalle; label: string }[] = [
  { value: "todas", label: "Todas" },
  { value: "ok", label: "OK" },
  { value: "alerta", label: "Alerta pendiente" },
];

export type FiltrosColumnasDetalle = {
  codigo: string;
  cuenta: string;
  mapeo: string;
  saldoAnterior: string;
  debito: string;
  credito: string;
  saldo: string;
  variacion: string;
  validacion: FiltroValidacionDetalle;
};

export const FILTROS_COLUMNAS_DETALLE_INICIALES: FiltrosColumnasDetalle = {
  codigo: "",
  cuenta: "",
  mapeo: "",
  saldoAnterior: "",
  debito: "",
  credito: "",
  saldo: "",
  variacion: "",
  validacion: "todas",
};

function normalizarTexto(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function numeroFiltro(valor: string): number | null {
  const limpio = valor.replace(/[$%\s]/g, "");
  if (!limpio) return null;

  // En es-CO el punto separa miles y la coma decimales. También admitimos el
  // punto decimal cuando no tiene forma de agrupación de miles.
  const colombiano = /^[-+]?\d{1,3}(?:\.\d{3})+(?:,\d+)?$/.test(limpio);
  const canonico = colombiano
    ? limpio.replace(/\./g, "").replace(",", ".")
    : limpio.replace(",", ".");
  const numero = Number(canonico);
  return Number.isFinite(numero) ? numero : null;
}

/** Admite igualdad implícita y los operadores >, >=, <, <= y =. */
export function coincideFiltroNumerico(
  valor: number | null | undefined,
  filtro: string,
): boolean {
  const entrada = filtro.trim();
  if (!entrada) return true;
  if (valor == null) return false;

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

function textoMapeo(nodo: NodoBalance): string {
  if (nodo.nivel === 6) {
    return nodo.mapped
      ? `russell mapeado ${nodo.code} ${nodo.std ?? ""}`
      : "sin mapeo";
  }
  if (nodo.nivel === 8) {
    return nodo.std
      ? `mapeado ${nodo.std}`
      : "asignar sin mapeo";
  }
  return "";
}

type EstadoValidacionFila = Exclude<FiltroValidacionDetalle, "todas"> | "informativa" | "vacia";

function estadoValidacion(
  nodo: NodoBalance,
  validados: ReadonlySet<string>,
  umbrales: UmbralesAlertas,
): EstadoValidacionFila {
  // Replica lo que pinta `celdaValidacion`. OK cubre dos casos equivalentes:
  // saldo correcto en subcuenta Russell, o alerta a la que ya se dio OK.
  if (nodo.saldoOk) {
    return nodo.nivel === 6 && nodo.mapped ? "ok" : "vacia";
  }
  if (esSaldoContrarioInformativo(nodo.balance, nodo.saldoOk, umbrales)) {
    return "informativa";
  }
  if (validados.has(nodo.code)) return "ok";
  return "alerta";
}

function coincideNodo(
  nodo: NodoBalance,
  filtros: FiltrosColumnasDetalle,
  validados: ReadonlySet<string>,
  umbrales: UmbralesAlertas,
): boolean {
  const codigo = normalizarTexto(filtros.codigo);
  if (codigo && !normalizarTexto(nodo.code).includes(codigo)) return false;

  const cuenta = normalizarTexto(filtros.cuenta);
  if (cuenta && !normalizarTexto(nodo.name).includes(cuenta)) return false;

  const mapeo = normalizarTexto(filtros.mapeo);
  if (mapeo && !normalizarTexto(textoMapeo(nodo)).includes(mapeo)) return false;

  if (!coincideFiltroNumerico(nodo.prevBalance, filtros.saldoAnterior)) return false;
  if (!coincideFiltroNumerico(nodo.debe, filtros.debito)) return false;
  if (!coincideFiltroNumerico(nodo.haber, filtros.credito)) return false;
  if (!coincideFiltroNumerico(nodo.balance, filtros.saldo)) return false;
  if (!coincideFiltroNumerico(nodo.variation, filtros.variacion)) return false;

  return filtros.validacion === "todas"
    || estadoValidacion(nodo, validados, umbrales) === filtros.validacion;
}

export function hayFiltrosColumnasDetalle(
  filtros: FiltrosColumnasDetalle,
): boolean {
  return filtros.codigo.trim() !== ""
    || filtros.cuenta.trim() !== ""
    || filtros.mapeo.trim() !== ""
    || filtros.saldoAnterior.trim() !== ""
    || filtros.debito.trim() !== ""
    || filtros.credito.trim() !== ""
    || filtros.saldo.trim() !== ""
    || filtros.variacion.trim() !== ""
    || filtros.validacion !== "todas";
}

/**
 * Conserva cada coincidencia y su ruta de ancestros, pero no incorpora hermanos
 * que no cumplen. El árbol original no se muta; sin filtros se devuelve tal cual
 * para evitar trabajo adicional en balances grandes.
 *
 * Excepción: si hay filtro de validación, un ancestro con OTRO estado no se
 * conserva. Pedir «OK» no debe arrastrar grupos vacíos ni filas en alerta.
 */
export function filtrarArbolDetallePorColumnas(
  nodos: NodoBalance[],
  filtros: FiltrosColumnasDetalle,
  validados: ReadonlySet<string>,
  umbrales: UmbralesAlertas,
): NodoBalance[] {
  if (!hayFiltrosColumnasDetalle(filtros)) return nodos;

  const soloEstadoValidacion = filtros.validacion !== "todas";

  const podar = (rama: readonly NodoBalance[]): NodoBalance[] => {
    const resultado: NodoBalance[] = [];
    for (const nodo of rama) {
      const hijos = podar(nodo.hijos);
      if (coincideNodo(nodo, filtros, validados, umbrales)) {
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
