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

/**
 * Por qué no se puede eliminar cada alcance (null = se puede): el balance con que se cerró una
 * conciliación de módulo en firme no se elimina —ni sola su versión, ni su período, ni el historial
 * del cliente que lo incluye— hasta que el senior o gerente la desbloquee. Es lo mismo que rechaza
 * `eliminarBalance` en el servidor; la pantalla lo usa para no ofrecer lo que se va a rechazar.
 */
export function bloqueosEliminacionBalance(p: {
  balanceId: number;
  idsPeriodo: readonly number[];
  cierresCliente: readonly CierreDeBalance[];
}): Record<AlcanceEliminacionBalance, string | null> {
  const motivo = (cierres: readonly CierreDeBalance[], que: string) =>
    cierres.length === 0
      ? null
      : `No se puede eliminar ${que}: incluye el balance con que se cerró la conciliación de ${cierres.map((c) => `${c.moduloCodigo} · ${c.periodo} (cerró ${c.cerradoPor})`).join("; ")}. Pide al senior o gerente del cliente que la desbloquee primero.`;
  const delPeriodo = new Set([p.balanceId, ...p.idsPeriodo]);
  return {
    version: motivo(p.cierresCliente.filter((c) => c.balanceEncabezadoId === p.balanceId), "esta versión"),
    periodo: motivo(p.cierresCliente.filter((c) => delPeriodo.has(c.balanceEncabezadoId)), "este período"),
    cliente_perfiles: motivo(p.cierresCliente, "el historial del cliente"),
  };
}
