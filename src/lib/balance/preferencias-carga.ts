import type { MappingSpec } from "@/lib/balance/extraccion/esquema";

export type PreferenciasCargaAplicables = {
  convencionCredito: string | null;
  agregarPorTercero: boolean | null;
};

/**
 * Aplica los valores por defecto del cliente sobre el mapa detectado del archivo.
 * Las preferencias del cliente siempre tienen prioridad, tanto si el mapa vino de
 * un perfil como si lo detectó la IA o se ajustó manualmente.
 */
export function aplicarPreferenciasCarga(
  spec: MappingSpec,
  preferencias: PreferenciasCargaAplicables | null,
): MappingSpec {
  if (!preferencias) return spec;
  const signoCredito =
    preferencias.convencionCredito === "firmado" || preferencias.convencionCredito === "magnitud"
      ? preferencias.convencionCredito
      : spec.signoCredito;
  const agregarPorTercero =
    preferencias.agregarPorTercero == null
      ? spec.agregarPorTercero
      : preferencias.agregarPorTercero;

  if (signoCredito === spec.signoCredito && agregarPorTercero === spec.agregarPorTercero) {
    return spec;
  }
  return { ...spec, signoCredito, agregarPorTercero };
}
