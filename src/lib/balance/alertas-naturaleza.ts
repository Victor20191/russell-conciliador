// Alertas de saldo contrario a la naturaleza del balance cargado (20/Oct/2026) — puro, sin BD.
//
// La alerta vive SOLO en la cuenta del cliente (la hoja del árbol, nivel 8): ahí se revisa y se le
// da «Dar OK» con un comentario. Grupo, cuenta y subcuenta no tienen alerta propia: su contador «±N»
// dice cuántas cuentas del cliente debajo siguen pendientes. Antes las agrupadoras también pedían OK
// (como «Saldo contrario») sin contar en ningún número, y la hoja se llamaba «Naturaleza».
//
// Esta regla es la ÚNICA fuente de los números: los botones «Alertas» y «Naturaleza contraria» del
// árbol, la validación V2, el estado «En proceso con alertas» y el cierre del balance.
import type { Validation } from "./calcular";
import { esSaldoContrarioAccionable, esSaldoContrarioInformativo, type UmbralesAlertas } from "./umbrales-alertas";
import { fmt } from "@/lib/format";

/** `validacion_alerta.tipo_alerta` del OK que se da a una cuenta del cliente. */
export const TIPO_VALIDACION_NATURALEZA = "naturaleza";

/**
 * Cuentas del cliente con OK. Solo cuentan los de tipo «naturaleza»: los «saldo_contrario» se daban
 * a las agrupadoras hasta el 20/Oct/2026 y quedan sin efecto (su comentario sigue en la conversación).
 */
export function validadosNaturaleza(validaciones: readonly { anchor: string; tipoAlerta: string }[]): Set<string> {
  return new Set(validaciones.filter((v) => v.tipoAlerta === TIPO_VALIDACION_NATURALEZA).map((v) => v.anchor));
}

/** Lo que la regla necesita de una cuenta del cliente (`BreakdownItem` o la hoja del árbol). */
export type CuentaAlerta = { code: string; balance: number; saldoOk: boolean; mapped: boolean };

/** Saldo contrario sobre el umbral y todavía sin OK: es la alerta que pide «Dar OK». */
export function esSaldoContrarioPendiente(
  cuenta: Pick<CuentaAlerta, "code" | "balance" | "saldoOk">,
  validados: ReadonlySet<string>,
  umbrales: UmbralesAlertas,
): boolean {
  return esSaldoContrarioAccionable(cuenta.balance, cuenta.saldoOk, umbrales) && !validados.has(cuenta.code);
}

export type ResumenAlertasBalance = {
  /** Saldos contrarios a la naturaleza en las cuentas del cliente. */
  naturaleza: {
    /** Sobre el umbral (la validación V2 los cuenta). */
    total: number;
    conOk: number;
    pendientes: number;
    /** Hasta el umbral: se muestran, no piden OK. */
    informativas: number;
  };
  /** Cuentas del cliente sin cuenta Russell. */
  sinMapeo: number;
  /** Lo que deja el balance «En proceso con alertas»: saldos contrarios sin OK + cuentas sin mapeo. */
  pendientes: number;
};

export function resumenAlertasBalance(
  cuentas: readonly CuentaAlerta[],
  validados: ReadonlySet<string>,
  umbrales: UmbralesAlertas,
): ResumenAlertasBalance {
  let total = 0;
  let conOk = 0;
  let informativas = 0;
  let sinMapeo = 0;
  for (const c of cuentas) {
    if (!c.mapped) sinMapeo++;
    if (esSaldoContrarioAccionable(c.balance, c.saldoOk, umbrales)) {
      total++;
      if (validados.has(c.code)) conOk++;
    } else if (esSaldoContrarioInformativo(c.balance, c.saldoOk, umbrales)) {
      informativas++;
    }
  }
  const pendientes = total - conOk;
  return { naturaleza: { total, conOk, pendientes, informativas }, sinMapeo, pendientes: pendientes + sinMapeo };
}

/**
 * OK de la versión anterior que pasan a una versión nueva: la misma cuenta del cliente, con el MISMO
 * saldo final (al centavo) y todavía con saldo contrario sobre el umbral. Si el saldo cambió, la
 * alerta vuelve a quedar pendiente para revisarla de nuevo.
 */
export function okHeredables<V extends { anchor: string }>(
  validacionesPrevias: readonly V[],
  saldosPrevios: ReadonlyMap<string, number>,
  cuentasNuevas: readonly Pick<CuentaAlerta, "code" | "balance" | "saldoOk">[],
  umbrales: UmbralesAlertas,
): V[] {
  const nuevas = new Map(cuentasNuevas.map((c) => [c.code, c]));
  const centavos = (v: number) => Math.round(v * 100);
  return validacionesPrevias.filter((v) => {
    const nueva = nuevas.get(v.anchor);
    const previo = saldosPrevios.get(v.anchor);
    return nueva != null && previo != null
      && centavos(previo) === centavos(nueva.balance)
      && esSaldoContrarioAccionable(nueva.balance, nueva.saldoOk, umbrales);
  });
}

/**
 * La validación V2 («Naturaleza de cuenta vs saldo») con los OK descontados: `calcular.ts` no conoce
 * las validaciones (es puro sobre el detalle), así que la pantalla la completa con el resumen. Solo
 * queda en alerta mientras falte algún OK.
 */
export function ajustarValidacionNaturaleza(
  validations: readonly Validation[],
  resumen: ResumenAlertasBalance,
  umbrales: UmbralesAlertas,
): Validation[] {
  const { total, conOk, pendientes } = resumen.naturaleza;
  if (total === 0) return [...validations];
  return validations.map((v) => v.id !== "V2" ? v : {
    ...v,
    status: pendientes > 0 ? "warn" : "ok",
    detail: `${total} cuenta(s) con naturaleza contraria por encima de ${fmt(umbrales.naturaleza)} · ${conOk} con OK · ${pendientes} pendiente(s)`,
    count: pendientes > 0 ? pendientes : undefined,
  });
}

/**
 * Ancla de la conversación de una fila del árbol. La cuenta del cliente conserva su código; las
 * agrupadoras llevan su nivel delante (`n6:110505`), porque una subcuenta Russell y una cuenta del
 * cliente pueden tener el mismo código y hasta el 20/Oct/2026 compartían la conversación.
 */
export function anclaConversacion(nodo: { nivel: number; code: string }): string {
  return nodo.nivel === 8 ? nodo.code : `n${nodo.nivel}:${nodo.code}`;
}

/**
 * Dónde queda un comentario anclado por código antes de las conversaciones por nivel: si el código es
 * de una cuenta del cliente del balance, se queda (ahí se dan los OK); si solo coincide con una
 * agrupadora, pasa a la suya; si no (conversación de una cuenta que ya no está), no cambia.
 */
export function anclaReubicada(
  anchor: string,
  cuentasCliente: ReadonlySet<string>,
  agrupadoras: readonly { nivel: number; code: string }[],
): string {
  if (cuentasCliente.has(anchor) || /^n[246]:/.test(anchor)) return anchor;
  const agrupadora = agrupadoras.find((n) => n.code === anchor);
  return agrupadora ? anclaConversacion(agrupadora) : anchor;
}
