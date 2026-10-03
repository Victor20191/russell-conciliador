// Vista del Consolidado AGRUPADA POR CONCEPTO (puro, sin BD ni UI).
//
// Cuando el archivo de Nómina trae la cuenta contable, un concepto con varias cuentas se parte en
// un renglón por cuenta: así cada cuenta Russell cruza con su valor exacto y no hace falta
// repartir. Leer eso cuesta —«SUELDO» aparecía tres veces seguidas—, así que la pantalla junta
// esos renglones en uno solo por concepto (y centro) y muestra al lado qué cuenta del archivo va a
// qué cuenta Russell y por cuánto. Es SOLO la vista: los renglones por cuenta siguen siendo los
// que se editan, se guardan y se cruzan.

/** Lo que la agrupación necesita de un renglón del Consolidado. */
export type RenglonConsolidadoVista = {
  /** Clave del renglón (con centro y cuenta del archivo cuando los hay). */
  clasificador: string;
  descripcion?: string | null;
  total: number;
  filas: number;
  /** Código del concepto a secas (Nómina). */
  codigo?: string;
  /** Centro de costo / clase del archivo. */
  agrupador?: string;
  /** Cuenta del cliente que trae el archivo: es lo que parte el concepto en varios renglones. */
  cuentaArchivo?: string | null;
};

const SEPARADOR = "\u0000";

/**
 * Junta los renglones que son el MISMO concepto y centro, partidos por la cuenta del archivo. Solo
 * agrupa los que traen `cuentaArchivo`: los demás módulos y los conceptos de una sola cuenta
 * quedan tal cual. Conserva el orden en que venían.
 */
export function agruparConsolidadoPorConcepto<T extends RenglonConsolidadoVista>(filas: readonly T[]): { clave: string; filas: T[] }[] {
  const orden: string[] = [];
  const porClave = new Map<string, T[]>();
  for (const f of filas) {
    const clave = f.cuentaArchivo ? `${f.codigo ?? f.clasificador}${SEPARADOR}${f.agrupador ?? ""}` : f.clasificador;
    const previas = porClave.get(clave);
    if (previas) previas.push(f);
    else { porClave.set(clave, [f]); orden.push(clave); }
  }
  return orden.map((clave) => ({ clave, filas: porClave.get(clave)! }));
}

/** Sumas del concepto y sus cuentas (archivo → Russell), en el orden de sus renglones. */
export function resumirGrupoConcepto<T extends RenglonConsolidadoVista>(
  grupo: { clave: string; filas: T[] },
  cuentasDe: (clasificador: string) => string[],
): {
  codigo: string;
  agrupador: string;
  descripcion: string | null;
  total: number;
  filas: number;
  cuentas: { clasificador: string; cuentaArchivo: string; russell: string[]; total: number }[];
} {
  const primera = grupo.filas[0];
  return {
    codigo: primera.codigo ?? primera.clasificador,
    agrupador: primera.agrupador ?? "",
    descripcion: grupo.filas.find((f) => f.descripcion?.trim())?.descripcion?.trim() ?? null,
    total: Math.round(grupo.filas.reduce((s, f) => s + f.total, 0) * 100) / 100,
    filas: grupo.filas.reduce((s, f) => s + f.filas, 0),
    cuentas: grupo.filas.map((f) => ({
      clasificador: f.clasificador,
      cuentaArchivo: f.cuentaArchivo ?? "",
      russell: cuentasDe(f.clasificador),
      total: f.total,
    })),
  };
}
