import type { NodoBorrador } from "./borrador";
import {
  esDescuadreAccionable,
  esDescuadreInformativo,
  esMagnitudAccionable,
  esMagnitudInformativo,
  type UmbralesAlertas,
} from "./umbrales-alertas";
import type { FiltroValidacionDetalle } from "./filtros-detalle";

/**
 * ¿La fila merece «Alerta»? Una AGRUPADORA cuyo total ≠ suma de sus hijos (Δ), una
 * agrupadora fijada manualmente que quedó sin hijos pero conserva valores materiales, o un
 * MOVIMIENTO problemático: con un valor de MAGNITUD (débito o crédito que vino con signo
 * CONTRARIO al dominante de su columna → se subió en negativo) o marcado «descuadre» (no
 * cuadra en ninguna orientación). Las filas omitidas no alertan.
 */
export function esAlertaNodo(n: NodoBorrador, umbrales: UmbralesAlertas): boolean {
  if (esDescuadreAccionable(n.descuadre, umbrales)) return true;
  if (n.omitida) return false;
  // Una corrección memorizada puede conservar una cuenta como AGRUPADORA aunque en
  // este archivo ya no tenga movimientos debajo. La vista preserva esa decisión y,
  // por tanto, su saldo queda fuera del cálculo: debe aparecer en «Alertas» para que
  // el revisor pueda localizar la causa del descuadre superior. La materialidad usa
  // el mismo umbral parametrizado que los demás descuadres del borrador.
  if (
    n.tipoFila === "agrupadora"
    && n.tipoFilaForzado === "agrupadora"
    && n.hijos.length === 0
    && [n.saldoInicial, n.debitos, n.creditos, n.saldoFinal]
      .some((valor) => esDescuadreAccionable(valor, umbrales))
  ) return true;
  const diferenciaControl = n.saldoInicial + n.debitos - n.creditos - n.saldoFinal;
  if (n.tipoFila === "descuadre") return esDescuadreAccionable(diferenciaControl, umbrales);
  if (n.tipoFila !== "movimiento") return false;
  return esMagnitudAccionable(n.debitos) || esMagnitudAccionable(n.creditos);
}

export type EstadoValidacionBorrador = Exclude<FiltroValidacionDetalle, "todas"> | "informativa" | "vacia";

/** Replica lo que pinta la columna Validación del borrador. */
export function estadoValidacionBorrador(
  n: NodoBorrador,
  umbrales: UmbralesAlertas,
  riesgos: { has(filaNum: number): boolean },
): EstadoValidacionBorrador {
  if (esAlertaNodo(n, umbrales) || riesgos.has(n.filaNum)) return "alerta";

  if (esDescuadreInformativo(n.descuadre, umbrales)) return "informativa";
  const diferenciaControl = n.saldoInicial + n.debitos - n.creditos - n.saldoFinal;
  if (n.tipoFila === "descuadre" && esDescuadreInformativo(diferenciaControl, umbrales)) {
    return "informativa";
  }
  if (
    !n.omitida
    && (n.tipoFila === "movimiento" || n.tipoFila === "descuadre")
    && (esMagnitudInformativo(n.debitos) || esMagnitudInformativo(n.creditos))
  ) {
    return "informativa";
  }

  if (!n.omitida && (n.tipoFila === "movimiento" || n.tipoFila === "descuadre")) return "ok";
  return "vacia";
}
