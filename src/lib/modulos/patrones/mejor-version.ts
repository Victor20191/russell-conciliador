// Cuál versión de patrón corresponde a un archivo, y dónde está su encabezado — puro.
//
// El archivo no dice en qué fila está su encabezado ni cuál de sus hojas es el auxiliar. Se
// prueba cada versión aplicable contra las primeras filas de cada hoja visible y gana la que sirve
// y reconoce más columnas del archivo (ver `mejorQue`); se devuelve aunque no alcance el umbral,
// para explicar por qué no se leyó. Un aplicativo puede tener varias versiones aprobadas a la vez
// (p. ej. Cartera por edades y por documento).
import type { CeldaCruda, GridHoja } from "@/lib/balance/extraccion/ingesta";
import type { DescriptorModulo } from "../descriptores";
import type { SpecModulo } from "../extraccion/esquema";
import { coincidenciaPatron, type ResultadoCoincidencia } from "./coincidencia";
import { normalizarRotulo } from "./rotulos";

/** Filas en que se busca el encabezado (SAP imprime un bloque técnico largo antes). */
export const FILAS_BUSQUEDA_ENCABEZADO_PATRON = 60;

export type EstadoVersionAplicable = "pendiente" | "aprobada";

export type VersionCandidata = {
  id: number;
  version: number;
  estado: EstadoVersionAplicable;
  /** Solo las versiones migradas de un perfil: mientras están pendientes sirven a ese cliente. */
  clienteOrigenId: number | null;
  hoja: string;
  filaEncabezado: number;
  primeraFilaDatos: number;
  encabezado: readonly unknown[];
  spec: SpecModulo;
};

export type UbicacionPatron = {
  version: VersionCandidata;
  hoja: string;
  /** Fila de la grilla compacta (1-based) donde está el encabezado en ESTE archivo. */
  filaEncabezado: number;
  encabezadoArchivo: readonly CeldaCruda[];
  coincidencia: ResultadoCoincidencia;
};

/** Las aprobadas, y las pendientes solo para el cliente del que salieron. */
export function versionesAplicables<T extends { estado: string; clienteOrigenId: number | null }>(
  versiones: readonly T[],
  clienteId: number,
): T[] {
  return versiones.filter((v) => v.estado === "aprobada" || (v.estado === "pendiente" && v.clienteOrigenId === clienteId));
}

const celdasConDato = (fila: readonly unknown[]): number =>
  fila.reduce<number>((n, celda) => (celda != null && String(celda).trim() !== "" ? n + 1 : n), 0);

/** Hojas donde buscar: la elegida si existe; si no, las visibles (o todas, si todas están ocultas). */
function hojasCandidatas(hojas: readonly GridHoja[], hojaElegida: string | null | undefined): GridHoja[] {
  if (hojaElegida) {
    const elegida = hojas.find((h) => h.nombre === hojaElegida);
    if (elegida) return [elegida];
  }
  const visibles = hojas.filter((h) => !h.oculta);
  return visibles.length > 0 ? visibles : [...hojas];
}

type Opciones = {
  /** Hoja que nombró el usuario: solo se busca en ella. */
  hojaElegida?: string | null;
  /** Hoja que propone el contenido o la preferencia del cliente: desempata. */
  hojaPropuesta?: string | null;
  filasBusqueda?: number;
};

/** Peso de las columnas del ARCHIVO que la versión reconoce (las que lee pesan doble). */
const pesoReconocido = (u: UbicacionPatron): number =>
  u.coincidencia.encontradas.reduce((suma, columna) => suma + columna.peso, 0);

/**
 * ¿`a` es mejor candidata que `b`? En empate total se queda la primera encontrada.
 *
 * Una versión que sirve gana siempre a una que no (una con más % pero sin una columna
 * obligatoria no debe detener la carga). Entre las que sirven gana la que explica MÁS columnas
 * del archivo: las columnas de más no descuentan del %, así que un formato por edades cuyos
 * rótulos también trae el detallado coincidiría al 100 % con un archivo por documento.
 */
function mejorQue(a: UbicacionPatron, b: UbicacionPatron, hojaPropuesta: string | null): boolean {
  const criterios: [number, number][] = [
    [Number(a.coincidencia.elegible), Number(b.coincidencia.elegible)],
    [pesoReconocido(a), pesoReconocido(b)],
    [a.coincidencia.porcentaje, b.coincidencia.porcentaje],
    [Number(a.version.estado === "aprobada"), Number(b.version.estado === "aprobada")],
    [Number(a.hoja === hojaPropuesta), Number(b.hoja === hojaPropuesta)],
    [
      Number(normalizarRotulo(a.hoja) === normalizarRotulo(a.version.hoja)),
      Number(normalizarRotulo(b.hoja) === normalizarRotulo(b.version.hoja)),
    ],
    [a.version.version, b.version.version],
  ];
  for (const [x, y] of criterios) if (x !== y) return x > y;
  return false;
}

export function mejorVersion(
  descriptor: DescriptorModulo,
  hojas: readonly GridHoja[],
  versiones: readonly VersionCandidata[],
  opciones: Opciones = {},
): UbicacionPatron | null {
  const limite = opciones.filasBusqueda ?? FILAS_BUSQUEDA_ENCABEZADO_PATRON;
  const propuesta = opciones.hojaPropuesta ?? null;
  let mejor: UbicacionPatron | null = null;
  for (const hoja of hojasCandidatas(hojas, opciones.hojaElegida)) {
    const filas = hoja.filas.slice(0, limite);
    for (let i = 0; i < filas.length; i++) {
      const fila = filas[i] ?? [];
      if (celdasConDato(fila) < 2) continue;
      for (const version of versiones) {
        const candidata: UbicacionPatron = {
          version,
          hoja: hoja.nombre,
          filaEncabezado: i + 1,
          encabezadoArchivo: fila,
          coincidencia: coincidenciaPatron(descriptor, { encabezado: version.encabezado, spec: version.spec }, fila),
        };
        if (!mejor || mejorQue(candidata, mejor, propuesta)) mejor = candidata;
      }
    }
  }
  return mejor;
}
