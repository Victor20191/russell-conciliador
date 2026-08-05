import { ORIGEN_MANUAL_CUENTA, ORIGEN_MANUAL_GRUPO } from "./mapeo-cliente-config";

export type AlcanceHomologacion = "solo" | "grupo";

export function parseAlcanceHomologacion(value: unknown): AlcanceHomologacion | null {
  return value === "solo" || value === "grupo" ? value : null;
}

/**
 * Traduce el alcance elegido en el modal a (a) qué filas del balance actual se
 * reescriben y (b) qué se memoriza en `cuentas_cliente` para las próximas cargas
 * del cliente.
 *
 * AMBOS alcances memorizan: una homologación hecha a mano se respeta en el
 * siguiente período. Lo que cambia es la GRANULARIDAD — el grupo de 6 dígitos o
 * una excepción de esa sola cuenta. Antes «solo esta cuenta» no dejaba rastro en
 * la memoria y la carga siguiente volvía a clasificar la cuenta con la cascada
 * (exacto → descripción → IA), que es la novedad que reportó operación.
 */
export function resolverAlcanceHomologacion(
  alcance: AlcanceHomologacion,
  contexto: { detalleId: number; encabezadoId: number; cuenta6: string; cuenta8: string },
) {
  return {
    filtroDetalle:
      alcance === "grupo"
        ? { encabezadoId: contexto.encabezadoId, cuenta6: contexto.cuenta6 }
        : { id: contexto.detalleId },
    memoriaCliente:
      alcance === "grupo"
        ? { codigo: contexto.cuenta6, origen: ORIGEN_MANUAL_GRUPO, propagaGrupo: true }
        : { codigo: contexto.cuenta8, origen: ORIGEN_MANUAL_CUENTA, propagaGrupo: false },
  };
}
