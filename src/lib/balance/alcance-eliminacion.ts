export const ALCANCES_ELIMINACION_BALANCE = [
  "version",
  "periodo",
  "cliente_perfiles",
] as const;

export type AlcanceEliminacionBalance =
  (typeof ALCANCES_ELIMINACION_BALANCE)[number];

export function parseAlcanceEliminacionBalance(
  value: unknown,
): AlcanceEliminacionBalance | null {
  return ALCANCES_ELIMINACION_BALANCE.includes(
    value as AlcanceEliminacionBalance,
  )
    ? (value as AlcanceEliminacionBalance)
    : null;
}

export function resolverAlcanceEliminacionBalance(
  alcance: AlcanceEliminacionBalance,
  referencia: { id: number; clienteId: number; periodo: string },
) {
  if (alcance === "version") {
    return {
      filtroBalance: { id: referencia.id },
      eliminaPerfiles: false,
    };
  }
  if (alcance === "periodo") {
    return {
      filtroBalance: {
        clienteId: referencia.clienteId,
        periodo: referencia.periodo,
      },
      eliminaPerfiles: false,
    };
  }
  return {
    filtroBalance: { clienteId: referencia.clienteId },
    eliminaPerfiles: true,
  };
}

/** Cierre en firme de un módulo, con el balance contra el que se concilió. */
export type CierreDeBalance = { moduloCodigo: string; periodo: string; cerradoPor: string; balanceEncabezadoId: number };

/** Balance cerrado del cliente (`estaCongelado`), para los motivos de eliminación. */
export type BalanceCerrado = { id: number; periodo: string; version: string };

/**
 * Por qué no se pueden eliminar los balances cerrados de un alcance (null = ninguno cerrado): un
 * balance cerrado se ABRE antes de eliminarlo (18/Oct/2026), para que nunca desaparezca sin rastro
 * un balance contra el que los módulos estaban conciliando.
 */
export function motivoEliminacionCerrados(que: string, cerrados: readonly Pick<BalanceCerrado, "periodo" | "version">[]): string | null {
  if (cerrados.length === 0) return null;
  const lista = cerrados.map((c) => `${c.version} de ${c.periodo}`).join(", ");
  return `No se puede eliminar ${que}: ${cerrados.length === 1 ? "el balance" : "los balances"} ${lista} ${cerrados.length === 1 ? "está cerrado" : "están cerrados"}. Ábrelo primero con «Abrir balance».`;
}

/**
 * Por qué no se puede eliminar cada alcance (null = se puede): el balance con que se cerró una
 * conciliación de módulo en firme no se elimina —ni sola su versión, ni su período, ni el historial
 * del cliente que lo incluye— hasta que el senior o gerente la desbloquee (o se reemplace por otro
 * del mismo corte); un balance cerrado se abre antes. Es lo mismo que rechaza `eliminarBalance` en
 * el servidor; la pantalla lo usa para no ofrecer lo que se va a rechazar.
 */
export function bloqueosEliminacionBalance(p: {
  balanceId: number;
  idsPeriodo: readonly number[];
  cierresCliente: readonly CierreDeBalance[];
  /** Balances cerrados del cliente; ausente = no se evalúa. */
  cerradosCliente?: readonly BalanceCerrado[];
}): Record<AlcanceEliminacionBalance, string | null> {
  const motivo = (cierres: readonly CierreDeBalance[], que: string) =>
    cierres.length === 0
      ? null
      : `No se puede eliminar ${que}: incluye el balance con que se cerró la conciliación de ${cierres.map((c) => `${c.moduloCodigo} · ${c.periodo} (cerró ${c.cerradoPor})`).join("; ")}. Pide al senior o gerente del cliente que la desbloquee primero, o reemplázalo por otro balance del mismo corte.`;
  const cerrados = p.cerradosCliente ?? [];
  const delPeriodo = new Set([p.balanceId, ...p.idsPeriodo]);
  return {
    version: motivo(p.cierresCliente.filter((c) => c.balanceEncabezadoId === p.balanceId), "esta versión")
      ?? motivoEliminacionCerrados("esta versión", cerrados.filter((c) => c.id === p.balanceId)),
    periodo: motivo(p.cierresCliente.filter((c) => delPeriodo.has(c.balanceEncabezadoId)), "este período")
      ?? motivoEliminacionCerrados("este período", cerrados.filter((c) => delPeriodo.has(c.id))),
    cliente_perfiles: motivo(p.cierresCliente, "el historial del cliente")
      ?? motivoEliminacionCerrados("el historial del cliente", cerrados),
  };
}
