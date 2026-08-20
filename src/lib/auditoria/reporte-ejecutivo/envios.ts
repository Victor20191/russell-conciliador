// Control de qué avances ya se le enviaron al cliente.
// Lógica PURA (sin BD): decide qué versiones de Novedades son "nuevas" para el
// próximo reporte, para no volver a comunicar lo mismo. El criterio es el id de
// la versión —no la fecha— porque una versión puede publicarse con retraso y aun
// así haber entrado (o no) en un envío anterior.

export type EnvioReportePrevio = {
  id: number;
  titulo: string;
  periodoDesde: string;
  periodoHasta: string;
  versionIds: number[];
  totalNovedades: number;
  totalAcciones: number;
  canal: string;
  enviadoPor: string;
  enviadoEn: string;
};

export type VersionParaEnvio = {
  id: number;
  changesCount: number;
};

/** Todos los ids de versión que ya viajaron en algún reporte enviado. */
export function idsVersionesYaEnviadas(envios: readonly EnvioReportePrevio[]): number[] {
  const ids = new Set<number>();
  for (const envio of envios) {
    for (const id of envio.versionIds) ids.add(id);
  }
  return [...ids].sort((a, b) => a - b);
}

/** Versiones que NO aparecen en ningún envío previo, en el orden recibido. */
export function versionesNoEnviadas<T extends VersionParaEnvio>(
  versiones: readonly T[],
  yaEnviadas: readonly number[],
): T[] {
  const enviadas = new Set(yaEnviadas);
  return versiones.filter((v) => !enviadas.has(v.id));
}

export type ResumenPendienteEnvio = {
  /** Ids de versión sugeridos para el próximo reporte. */
  versionIds: number[];
  totalVersiones: number;
  totalCambios: number;
  /** Fecha ISO del último envío registrado; null si nunca se ha enviado. */
  ultimoEnvioEn: string | null;
  /** true cuando ya se envió todo lo publicado (no hay nada nuevo que contar). */
  sinNovedadesNuevas: boolean;
};

/**
 * Qué debería incluir el próximo reporte para no repetir lo ya enviado.
 * Sin envíos previos, todo es "nuevo" (primer reporte del cliente).
 */
export function resumirPendienteDeEnvio(params: {
  versiones: readonly VersionParaEnvio[];
  envios: readonly EnvioReportePrevio[];
}): ResumenPendienteEnvio {
  const { versiones, envios } = params;
  const yaEnviadas = idsVersionesYaEnviadas(envios);
  const nuevas = versionesNoEnviadas(versiones, yaEnviadas);
  const ultimo = ultimoEnvio(envios);

  return {
    versionIds: nuevas.map((v) => v.id),
    totalVersiones: nuevas.length,
    totalCambios: nuevas.reduce((suma, v) => suma + v.changesCount, 0),
    ultimoEnvioEn: ultimo?.enviadoEn ?? null,
    sinNovedadesNuevas: versiones.length > 0 && nuevas.length === 0,
  };
}

/** El envío más reciente por fecha (los empates los resuelve el id mayor). */
export function ultimoEnvio(
  envios: readonly EnvioReportePrevio[],
): EnvioReportePrevio | null {
  let mejor: EnvioReportePrevio | null = null;
  for (const envio of envios) {
    if (!mejor) {
      mejor = envio;
      continue;
    }
    if (
      envio.enviadoEn > mejor.enviadoEn ||
      (envio.enviadoEn === mejor.enviadoEn && envio.id > mejor.id)
    ) {
      mejor = envio;
    }
  }
  return mejor;
}
