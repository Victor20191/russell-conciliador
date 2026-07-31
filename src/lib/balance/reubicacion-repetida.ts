// Propagación de un re-parentado MANUAL a las ocurrencias REPETIDAS del mismo par
// de cuentas — lógica PURA (sin BD ni React).
//
// Por qué existe: la reclasificación agrupadora↔movimiento se aplica por CÓDIGO (a
// todas las filas con ese código), pero el re-parentado es por FILA. En los archivos
// que repiten el mismo bloque de cuentas (balances abiertos por tercero, por sucursal
// o por centro de costo) el auditor arregla UN bloque —marca `220501` como agrupadora
// y le cuelga `220505`— y los demás quedan a medias: la agrupadora forzada se queda
// SIN hijas («Agrupadora manual sin movimientos») y su saldo vuelve a contarse junto
// al de la hija hermana → doble conteo al cargar.
//
// Aquí se detectan esas ocurrencias pendientes y se propone el destino de cada una
// emparejando POR BLOQUE: la ocurrencia de la agrupadora MÁS CERCANA ANTERIOR a la
// hija (o la más cercana posterior si el archivo la ubica después). Nunca se usa un
// destino global único: eso mezclaría el saldo de un tercero con el de otro.

import type { NodoBorrador } from "@/lib/balance/borrador";

/**
 * Mínimo que necesita el detector. Lo cumplen tanto `FilaBorrador` como las cuentas
 * del índice de reubicación (`CuentaReubicacion`), que es lo que la pantalla ya tiene
 * memoizado: así el universo son las filas VISIBLES del árbol (sin los terceros
 * colapsados ni los pies del ERP).
 */
export type FilaReubicable = {
  filaNum: number;
  codigo: string;
  nombre: string;
  padreManual?: number | null;
};

/** Una ocurrencia pendiente de anidar, con el destino propuesto para ELLA. */
export type OcurrenciaPendiente = {
  filaNum: number;
  destino: number;
};

/** Par (hija → agrupadora) ya resuelto en un bloque y pendiente en otros. */
export type PropagacionReubicacion = {
  codigoHija: string;
  codigoPadre: string;
  nombreHija: string;
  nombrePadre: string;
  /** Filas con el mismo par que hoy NO cuelgan de su agrupadora. */
  pendientes: OcurrenciaPendiente[];
};

const esNumerico = (c: string) => /^\d+$/.test(c ?? "");

/** filaNum → filaNum del padre efectivo en el árbol vigente (null = raíz). */
export function padresEfectivos(arbol: NodoBorrador[]): Map<number, number | null> {
  const padres = new Map<number, number | null>();
  const rec = (n: NodoBorrador, padre: number | null) => {
    padres.set(n.filaNum, padre);
    for (const h of n.hijos) rec(h, n.filaNum);
  };
  arbol.forEach((r) => rec(r, null));
  return padres;
}

/**
 * Elige, entre las ocurrencias del código padre, la que pertenece al MISMO bloque
 * que la fila: la más cercana ANTERIOR por `filaNum`; si el archivo no tiene ninguna
 * antes (el ERP lista el subtotal después de su detalle), la más cercana posterior.
 * `candidatos` debe venir ordenado ascendente por `filaNum`.
 */
export function destinoDelBloque(filaNum: number, candidatos: readonly number[]): number | null {
  let anterior: number | null = null;
  let posterior: number | null = null;
  for (const c of candidatos) {
    if (c === filaNum) continue;
    if (c < filaNum) anterior = c;
    else { posterior = c; break; }
  }
  return anterior ?? posterior;
}

/**
 * Detecta los pares (hija → agrupadora) que el usuario ya resolvió a mano en algún
 * bloque y siguen pendientes en las demás ocurrencias del mismo par de códigos.
 *
 * Salvaguardas:
 *  - solo cuentan los re-parentados MANUALES vigentes (`padreManual`), no la
 *    anidación automática por prefijo/orden;
 *  - ambos códigos deben ser numéricos (una cuenta PUC, no un pie del ERP);
 *  - una fila que YA cuelga de una ocurrencia de esa agrupadora no es pendiente;
 *  - una fila con un `padreManual` distinto NO se toca: su decisión manual manda;
 *  - una fila sin ninguna ocurrencia del padre en su bloque se descarta.
 *
 * `padreManualVigente` incluye los cambios en memoria (aún sin guardar): filaNum →
 * destino, o null si el usuario quitó el re-parentado.
 */
export function detectarPropagacionesReubicacion(
  filas: readonly FilaReubicable[],
  padreEfectivo: ReadonlyMap<number, number | null>,
  padreManualVigente: ReadonlyMap<number, number | null>,
): PropagacionReubicacion[] {
  const porFila = new Map<number, FilaReubicable>(filas.map((f) => [f.filaNum, f]));
  const ocurrencias = new Map<string, number[]>(); // código → filaNum ascendente
  for (const f of [...filas].sort((a, b) => a.filaNum - b.filaNum)) {
    if (!esNumerico(f.codigo)) continue;
    const arr = ocurrencias.get(f.codigo);
    if (arr) arr.push(f.filaNum);
    else ocurrencias.set(f.codigo, [f.filaNum]);
  }
  const manual = (filaNum: number): number | null => {
    if (padreManualVigente.has(filaNum)) return padreManualVigente.get(filaNum) ?? null;
    return porFila.get(filaNum)?.padreManual ?? null;
  };

  const pares = new Map<string, PropagacionReubicacion>();
  for (const fila of filas) {
    const destino = manual(fila.filaNum);
    if (destino == null) continue;
    const padre = porFila.get(destino);
    if (!padre || !esNumerico(fila.codigo) || !esNumerico(padre.codigo)) continue;
    if (padre.codigo === fila.codigo) continue; // mismo código: no es un par hija→agrupadora
    const clave = `${fila.codigo}→${padre.codigo}`;
    if (pares.has(clave)) continue;

    const candidatos = ocurrencias.get(padre.codigo) ?? [];
    const pendientes: OcurrenciaPendiente[] = [];
    for (const filaNum of ocurrencias.get(fila.codigo) ?? []) {
      if (filaNum === fila.filaNum) continue;
      const manualActual = manual(filaNum);
      // Decisión manual propia (a otra agrupadora): no se pisa.
      if (manualActual != null) continue;
      // Ya cuelga de una ocurrencia de esa agrupadora por la anidación automática.
      const padreHoy = padreEfectivo.get(filaNum) ?? null;
      if (padreHoy != null && porFila.get(padreHoy)?.codigo === padre.codigo) continue;
      const propuesto = destinoDelBloque(filaNum, candidatos);
      if (propuesto == null || propuesto === filaNum) continue;
      pendientes.push({ filaNum, destino: propuesto });
    }
    if (pendientes.length === 0) continue;
    pares.set(clave, {
      codigoHija: fila.codigo,
      codigoPadre: padre.codigo,
      nombreHija: fila.nombre,
      nombrePadre: padre.nombre,
      pendientes,
    });
  }
  return [...pares.values()];
}

/** Total de filas que aplicaría «anidar en todos los bloques». */
export function contarPendientes(props: readonly PropagacionReubicacion[]): number {
  return props.reduce((s, p) => s + p.pendientes.length, 0);
}
