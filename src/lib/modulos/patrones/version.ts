// Ciclo de vida de una versión de patrón de archivo — puro.
//
// Una versión nace PENDIENTE (la crea un administrador, o la migración desde el perfil de un
// cliente). Para APROBARLA —y ofrecerla a todos los clientes del aplicativo— necesita su archivo
// de muestra. Una aprobada no se edita: se crea otra versión. INACTIVA deja de ofrecerse.

export const ESTADOS_PATRON = ["pendiente", "aprobada", "inactiva"] as const;
export type EstadoPatron = (typeof ESTADOS_PATRON)[number];

export const ETIQUETA_ESTADO_PATRON: Record<EstadoPatron, string> = {
  pendiente: "Pendiente",
  aprobada: "Aprobada",
  inactiva: "Inactiva",
};

export function esEstadoPatron(valor: unknown): valor is EstadoPatron {
  return typeof valor === "string" && (ESTADOS_PATRON as readonly string[]).includes(valor);
}

/** Siguiente número de versión del (aplicativo, módulo): máximo + 1, nunca el conteo. */
export function siguienteVersionPatron(numeros: readonly number[]): number {
  return numeros.reduce((max, n) => (Number.isInteger(n) && n > max ? n : max), 0) + 1;
}

type VersionEstado = { estado: string; muestraClaveObjeto: string | null };

/** Por qué no se puede aprobar (o reactivar) la versión; null si se puede. */
export function motivoNoAprobable(version: VersionEstado): string | null {
  if (version.estado === "aprobada") return "La versión ya está aprobada.";
  if (!esEstadoPatron(version.estado)) return "La versión tiene un estado desconocido.";
  if (!version.muestraClaveObjeto) return "Sube el archivo de muestra antes de aprobar la versión.";
  return null;
}

/** Transiciones permitidas entre estados. */
export function transicionPatronPermitida(actual: string, destino: EstadoPatron): boolean {
  if (actual === destino) return false;
  if (actual === "pendiente") return destino === "aprobada" || destino === "inactiva";
  if (actual === "aprobada") return destino === "inactiva";
  if (actual === "inactiva") return destino === "aprobada";
  return false;
}

/** Solo una versión pendiente se edita en sitio: la aprobada ya pudo leer archivos. */
export function esVersionEditable(version: { estado: string }): boolean {
  return version.estado === "pendiente";
}
