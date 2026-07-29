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
