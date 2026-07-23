export type AlcanceHomologacion = "solo" | "grupo";

export function parseAlcanceHomologacion(value: unknown): AlcanceHomologacion | null {
  return value === "solo" || value === "grupo" ? value : null;
}

export function resolverAlcanceHomologacion(
  alcance: AlcanceHomologacion,
  contexto: { detalleId: number; encabezadoId: number; cuenta6: string },
) {
  return {
    filtroDetalle:
      alcance === "grupo"
        ? { encabezadoId: contexto.encabezadoId, cuenta6: contexto.cuenta6 }
        : { id: contexto.detalleId },
    memorizaPerfil: alcance === "grupo",
  };
}
