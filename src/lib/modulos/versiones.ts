/**
 * Versionado, agrupación y orden de los cargues del motor de módulos.
 *
 * Los encabezados promovidos sí persisten su versión. Los borradores son
 * efímeros, por lo que su número se deriva cronológicamente por
 * (cliente, módulo, período), igual que en Balance Borrador.
 *
 * El índice del módulo (`/modulos/[codigo]`) NO lista un renglón por cargue:
 * agrupa igual que `/balance` —una tarjeta por cliente y, dentro, una fila por
 * período con su conteo de versiones—, de modo que volver a cargar el archivo
 * del mismo cliente y período suma una versión al período en vez de agregar
 * otra fila suelta al listado.
 */

type FechaSerializada = string | null;

function marcaTiempo(fecha: FechaSerializada): number {
  if (!fecha) return 0;
  const valor = Date.parse(fecha);
  return Number.isFinite(valor) ? valor : 0;
}

/** Un encabezado cargado (una VERSIÓN de un período), tal como lo lee el índice. */
export type CargaModuloAgrupable = {
  id: number;
  clienteId: number;
  clienteNombre: string;
  clienteNit: string | null;
  moduloCodigo: string;
  periodo: string;
  version: number;
  esOficial: boolean;
  estaCongelado: boolean;
  filas: number;
  total: number;
  archivoNombre: string | null;
  /** Hoja importada del archivo principal (null en cargues previos a su registro). */
  hoja: string | null;
  /** De aquí se derivan los anexos por fraccionamiento (ver `archivos-carga.ts`). */
  observaciones: string | null;
  origen: string | null;
  cargadoPor: string | null;
  ultimaCarga: FechaSerializada;
  comentarios: number;
};

/**
 * Un período del cliente. Lo que se ve (filas, total, archivo…) es de la versión
 * que lo REPRESENTA: su versión vigente y, si ninguna lo es —cargues legado
 * inconsistentes—, la más reciente.
 */
export type PeriodoCargaModulo = {
  periodo: string;
  /** Cuántas versiones existen del mismo (cliente, módulo, período). */
  versiones: number;
  /** Encabezado que se abre desde la fila. */
  id: number;
  version: number;
  esOficial: boolean;
  estaCongelado: boolean;
  filas: number;
  total: number;
  archivoNombre: string | null;
  hoja: string | null;
  observaciones: string | null;
  origen: string | null;
  cargadoPor: string | null;
  ultimaCarga: FechaSerializada;
  comentarios: number;
};

/** Una tarjeta del listado: el cliente y sus períodos. */
export type GrupoClienteModulo = {
  clienteId: number;
  clienteNombre: string;
  clienteNit: string | null;
  periodos: PeriodoCargaModulo[];
};

/** La más reciente primero; a igual fecha, la versión (y el id) mayor. */
function masReciente(a: CargaModuloAgrupable, b: CargaModuloAgrupable): number {
  return (
    marcaTiempo(b.ultimaCarga) - marcaTiempo(a.ultimaCarga)
    || b.version - a.version
    || b.id - a.id
  );
}

/**
 * Agrupa los cargues en clientes → períodos. La clave del cliente es el
 * `clienteId` (NO la razón social, que está denormalizada en el encabezado: dos
 * clientes homónimos no deben fundirse ni uno renombrado partirse) y la del
 * período, (módulo, período). Clientes y períodos quedan ordenados por su carga
 * más reciente.
 */
export function agruparCargasModuloPorCliente(
  cargas: readonly CargaModuloAgrupable[],
): GrupoClienteModulo[] {
  type Agrupado = {
    clienteId: number;
    clienteNombre: string;
    clienteNit: string | null;
    ultimaCarga: number;
    periodos: Map<string, CargaModuloAgrupable[]>;
  };

  const porCliente = new Map<number, Agrupado>();
  for (const carga of cargas) {
    const ts = marcaTiempo(carga.ultimaCarga);
    let grupo = porCliente.get(carga.clienteId);
    if (!grupo) {
      grupo = {
        clienteId: carga.clienteId,
        clienteNombre: carga.clienteNombre,
        clienteNit: carga.clienteNit,
        ultimaCarga: ts,
        periodos: new Map(),
      };
      porCliente.set(carga.clienteId, grupo);
    }
    // La razón social y el NIT los aporta el cargue más reciente del cliente.
    if (ts >= grupo.ultimaCarga) {
      grupo.ultimaCarga = ts;
      grupo.clienteNombre = carga.clienteNombre;
      grupo.clienteNit = carga.clienteNit;
    }
    const clave = `${carga.moduloCodigo}|${carga.periodo}`;
    const periodo = grupo.periodos.get(clave);
    if (periodo) periodo.push(carga);
    else grupo.periodos.set(clave, [carga]);
  }

  const clientes = [...porCliente.values()].sort(
    (a, b) =>
      b.ultimaCarga - a.ultimaCarga
      || a.clienteNombre.localeCompare(b.clienteNombre, "es", { sensitivity: "base" }),
  );

  return clientes.map((grupo) => ({
    clienteId: grupo.clienteId,
    clienteNombre: grupo.clienteNombre,
    clienteNit: grupo.clienteNit,
    periodos: [...grupo.periodos.values()]
      .map((versiones): PeriodoCargaModulo => {
        const ordenadas = [...versiones].sort(masReciente);
        const representante = ordenadas.find((v) => v.esOficial) ?? ordenadas[0];
        return {
          periodo: representante.periodo,
          versiones: ordenadas.length,
          id: representante.id,
          version: representante.version,
          esOficial: representante.esOficial,
          estaCongelado: representante.estaCongelado,
          filas: representante.filas,
          total: representante.total,
          archivoNombre: representante.archivoNombre,
          hoja: representante.hoja,
          observaciones: representante.observaciones,
          origen: representante.origen,
          cargadoPor: representante.cargadoPor,
          // El período se ordena por su cargue más reciente, aunque la versión
          // vigente sea una anterior (se puede volver oficial una histórica).
          ultimaCarga: ordenadas[0].ultimaCarga,
          comentarios: representante.comentarios,
        };
      })
      .sort(
        (a, b) =>
          marcaTiempo(b.ultimaCarga) - marcaTiempo(a.ultimaCarga)
          || b.periodo.localeCompare(a.periodo),
      ),
  }));
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
