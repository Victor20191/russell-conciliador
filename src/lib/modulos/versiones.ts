/**
 * Versionado y orden de los cargues del motor de módulos.
 *
 * Los encabezados promovidos sí persisten su versión. Los borradores son
 * efímeros, por lo que su número se deriva cronológicamente por
 * (cliente, módulo, período), igual que en Balance Borrador.
 */

type FechaSerializada = string | null;

function marcaTiempo(fecha: FechaSerializada): number {
  if (!fecha) return 0;
  const valor = Date.parse(fecha);
  return Number.isFinite(valor) ? valor : 0;
}

export type CargaModuloVersionable = {
  id: number;
  clienteId: number;
  moduloCodigo: string;
  periodo: string;
  version: number;
  ultimaCarga: FechaSerializada;
};

export type ResumenCargaModulo<T extends CargaModuloVersionable> = T & {
  versiones: number;
};

/**
 * Deja una fila por (cliente, módulo, período), siempre la recarga más reciente,
 * y conserva el total de versiones para enlazar su bitácora.
 */
export function resumirCargasModulo<T extends CargaModuloVersionable>(
  cargas: readonly T[],
): ResumenCargaModulo<T>[] {
  const grupos = new Map<string, T[]>();
  for (const carga of cargas) {
    const clave = `${carga.clienteId}|${carga.moduloCodigo}|${carga.periodo}`;
    const grupo = grupos.get(clave);
    if (grupo) grupo.push(carga);
    else grupos.set(clave, [carga]);
  }

  return [...grupos.values()]
    .map((grupo) => {
      const ordenado = [...grupo].sort(
        (a, b) =>
          marcaTiempo(b.ultimaCarga) - marcaTiempo(a.ultimaCarga)
          || b.version - a.version
          || b.id - a.id,
      );
      return { ...ordenado[0], versiones: grupo.length };
    })
    .sort(
      (a, b) =>
        marcaTiempo(b.ultimaCarga) - marcaTiempo(a.ultimaCarga)
        || b.version - a.version
        || b.id - a.id,
    );
}

export type BorradorModuloVersionable = {
  loteId: string;
  clienteId: number | null;
  moduloCodigo: string;
  periodoInicial: FechaSerializada;
  periodoFinal: FechaSerializada;
  creadoEn: FechaSerializada;
};

export type BorradorModuloVersionado<T extends BorradorModuloVersionable> = T & {
  version: number;
  versionesGrupo: number;
  claveGrupo: string | null;
};

export function claveGrupoBorradorModulo(
  borrador: BorradorModuloVersionable,
): string | null {
  if (borrador.clienteId == null || !borrador.periodoInicial || !borrador.periodoFinal) return null;
  const inicio = borrador.periodoInicial.slice(0, 7);
  const fin = borrador.periodoFinal.slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(inicio) || !/^\d{4}-\d{2}$/.test(fin)) return null;
  return `${borrador.clienteId}|${borrador.moduloCodigo}|${inicio}|${fin}`;
}

/**
 * Numera los borradores de cada grupo del más antiguo (v1) al más reciente y
 * devuelve los grupos por su última recarga, con sus versiones juntas de la
 * más nueva a la más antigua.
 */
export function versionarYOrdenarBorradoresModulo<
  T extends BorradorModuloVersionable,
>(borradores: readonly T[]): BorradorModuloVersionado<T>[] {
  const grupos = new Map<string, T[]>();
  for (const borrador of borradores) {
    const clave = claveGrupoBorradorModulo(borrador) ?? `lote:${borrador.loteId}`;
    const grupo = grupos.get(clave);
    if (grupo) grupo.push(borrador);
    else grupos.set(clave, [borrador]);
  }

  const enriquecidos = [...grupos.entries()].map(([claveInterna, grupo]) => {
    const claveGrupo = claveInterna.startsWith("lote:") ? null : claveInterna;
    const cronologico = [...grupo].sort(
      (a, b) =>
        marcaTiempo(a.creadoEn) - marcaTiempo(b.creadoEn)
        || a.loteId.localeCompare(b.loteId),
    );
    const versiones = cronologico.map((borrador, i) => ({
      ...borrador,
      version: i + 1,
      versionesGrupo: cronologico.length,
      claveGrupo,
    }));
    return {
      ultimaCarga: Math.max(...cronologico.map((borrador) => marcaTiempo(borrador.creadoEn))),
      versiones,
    };
  });

  enriquecidos.sort((a, b) => b.ultimaCarga - a.ultimaCarga);
  return enriquecidos.flatMap((grupo) => grupo.versiones.sort((a, b) => b.version - a.version));
}
