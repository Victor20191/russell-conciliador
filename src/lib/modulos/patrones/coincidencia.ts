// % de COINCIDENCIA entre el encabezado de un archivo y el de un patrón — puro.
//
// Regla acordada con la firma (16/Sep/2026):
//  - se comparan los rótulos normalizados, sin importar la columna en que estén;
//  - el universo son las columnas del patrón que tienen rótulo; las que el patrón LEE (un rol,
//    un rango de vencimiento, la columna que marca los totales, la fila rotulada del tercero)
//    pesan doble, las demás sencillo;
//  - el nombre de la hoja, la fila del encabezado y las columnas de más del archivo no descuentan;
//  - con 80 % o más el archivo se lee solo, siempre que ninguna columna obligatoria falte.
// Las columnas encontradas en otra letra se RE-MAPEAN al aplicar el patrón (ver `aplicar.ts`).
import type { DescriptorModulo } from "../descriptores";
import type { SpecModulo } from "../extraccion/esquema";
import { esTipoFormatoCartera, tipoConDocumento, tipoConEdades } from "../cartera/tipo-formato";
import { modoClasificadorDe } from "../perfil-modulo";
import { clavesEncabezado } from "./rotulos";

export const UMBRAL_COINCIDENCIA_PATRON = 80;

export type PatronComparable = { encabezado: readonly unknown[]; spec: SpecModulo };

export type ColumnaEncontrada = { columnaPatron: number; columnaArchivo: number; rotulo: string; peso: 1 | 2 };
export type ColumnaFaltante = { columnaPatron: number; rotulo: string; peso: 1 | 2; roles: string[] };

export type ResultadoCoincidencia = {
  /** 0 a 100, entero. */
  porcentaje: number;
  encontradas: ColumnaEncontrada[];
  faltantes: ColumnaFaltante[];
  /**
   * Columna del patrón (1-based) → columna del archivo. Incluye las encontradas por rótulo y
   * las columnas SIN rótulo que el patrón lee, ubicadas por su vecina con rótulo.
   */
  mapaColumnas: Record<number, number>;
  /** Etiquetas de los roles obligatorios que el archivo no trae. */
  faltantesRequeridos: string[];
  elegible: boolean;
};

/** Columnas que el patrón LEE, con los roles que las usan (para decir qué falta). */
function columnasLeidas(descriptor: DescriptorModulo, spec: SpecModulo): Map<number, string[]> {
  const leidas = new Map<number, string[]>();
  const anotar = (columna: number | undefined, quien: string) => {
    if (!Number.isInteger(columna) || (columna as number) < 1) return;
    const lista = leidas.get(columna as number) ?? [];
    if (!lista.includes(quien)) lista.push(quien);
    leidas.set(columna as number, lista);
  };
  for (const rol of descriptor.columnas) anotar(spec.columnas[rol.nombre], rol.etiqueta);
  for (const familia of descriptor.familiasDinamicas ?? []) {
    for (const columna of spec.familias?.[familia.nombre] ?? []) anotar(columna.columna, familia.etiqueta);
  }
  if (spec.subtotales === "manual") anotar(spec.subtotalesColumna, "Marca de los totales");
  if (spec.filaTercero) {
    anotar(spec.filaTercero.columnaRotulo, "Rótulo del tercero");
    anotar(spec.filaTercero.columnaClave, "Identificación del tercero");
    anotar(spec.filaTercero.columnaNombre, "Nombre del tercero");
  }
  return leidas;
}

/**
 * Ubica una columna SIN rótulo que el patrón lee (p. ej. el nombre del tercero bajo una celda
 * vacía, en SIESA) por su vecina con rótulo más cercana: conserva la distancia. Solo se acepta si
 * en el archivo esa posición también viene sin rótulo.
 */
function ubicarSinRotulo(
  columna: number,
  mapa: ReadonlyMap<number, number>,
  clavesArchivo: readonly string[],
): number | null {
  const anclas = [...mapa.keys()].sort((a, b) => Math.abs(a - columna) - Math.abs(b - columna) || a - b);
  for (const ancla of anclas) {
    const destino = (mapa.get(ancla) as number) + (columna - ancla);
    if (destino < 1) continue;
    return (clavesArchivo[destino - 1] ?? "") === "" ? destino : null;
  }
  return null;
}

/**
 * Lo que el TIPO DE FORMATO declarado exige y el archivo no trae (Cartera y CxP): la columna del
 * documento en los formatos por documento y algún rango de edades en los formatos por edades.
 * Así un archivo por edades no se lee con una versión por documento, ni al revés.
 */
function faltantesDelTipoFormato(
  descriptor: DescriptorModulo,
  spec: SpecModulo,
  mapaColumnas: Readonly<Record<number, number>>,
): string[] {
  if (!descriptor.crucePorTercero.detalleTercero || !esTipoFormatoCartera(spec.tipoFormato)) return [];
  const faltan: string[] = [];
  const etiquetaDe = (rol: string) => descriptor.columnas.find((c) => c.nombre === rol)?.etiqueta ?? rol;
  const ubicada = (rol: string) => {
    const columna = spec.columnas[rol] ?? 0;
    return columna >= 1 && mapaColumnas[columna] != null;
  };
  if (tipoConDocumento(spec.tipoFormato) && !ubicada("documento")) faltan.push(etiquetaDe("documento"));
  if (tipoConEdades(spec.tipoFormato)) {
    const rangos = spec.familias?.edades ?? [];
    const conEdades = rangos.length > 0
      ? rangos.some((r) => mapaColumnas[r.columna] != null)
      : ubicada("edadEtiqueta");
    if (!conEdades) {
      faltan.push(rangos.length > 0
        ? descriptor.familiasDinamicas?.find((f) => f.nombre === "edades")?.etiqueta ?? "Rangos de vencimiento"
        : etiquetaDe("edadEtiqueta"));
    }
  }
  return faltan;
}

export function coincidenciaPatron(
  descriptor: DescriptorModulo,
  patron: PatronComparable,
  filaArchivo: readonly unknown[],
): ResultadoCoincidencia {
  const clavesPatron = clavesEncabezado(descriptor, patron.encabezado);
  const clavesArchivo = clavesEncabezado(descriptor, filaArchivo);
  const leidas = columnasLeidas(descriptor, patron.spec);

  // Columnas del archivo disponibles por rótulo, en orden: un rótulo repetido se consume en orden.
  const libres = new Map<string, number[]>();
  clavesArchivo.forEach((clave, i) => {
    if (!clave) return;
    const lista = libres.get(clave) ?? [];
    lista.push(i + 1);
    libres.set(clave, lista);
  });

  const encontradas: ColumnaEncontrada[] = [];
  const faltantes: ColumnaFaltante[] = [];
  const mapa = new Map<number, number>();
  let total = 0;
  let logrado = 0;
  clavesPatron.forEach((clave, i) => {
    if (!clave) return;
    const columnaPatron = i + 1;
    const roles = leidas.get(columnaPatron) ?? [];
    const peso: 1 | 2 = roles.length > 0 ? 2 : 1;
    const rotulo = String(patron.encabezado[i] ?? "").trim();
    total += peso;
    const columnaArchivo = libres.get(clave)?.shift();
    if (columnaArchivo == null) {
      faltantes.push({ columnaPatron, rotulo, peso, roles });
      return;
    }
    logrado += peso;
    mapa.set(columnaPatron, columnaArchivo);
    encontradas.push({ columnaPatron, columnaArchivo, rotulo, peso });
  });

  const mapaColumnas: Record<number, number> = Object.fromEntries(mapa);
  for (const columna of leidas.keys()) {
    if ((clavesPatron[columna - 1] ?? "") !== "" || mapaColumnas[columna] != null) continue;
    const destino = ubicarSinRotulo(columna, mapa, clavesArchivo);
    if (destino != null) mapaColumnas[columna] = destino;
  }

  const modo = modoClasificadorDe(patron.spec);
  const faltantesRequeridos = descriptor.columnas
    .filter((rol) => rol.requerido && !(rol.nombre === descriptor.clasificador && modo === "global"))
    .filter((rol) => {
      const columna = patron.spec.columnas[rol.nombre] ?? 0;
      return columna < 1 || mapaColumnas[columna] == null;
    })
    .map((rol) => rol.etiqueta);
  faltantesRequeridos.push(...faltantesDelTipoFormato(descriptor, patron.spec, mapaColumnas));

  const porcentaje = total > 0 ? Math.round((100 * logrado) / total) : 0;
  return {
    porcentaje,
    encontradas,
    faltantes,
    mapaColumnas,
    faltantesRequeridos,
    elegible: porcentaje >= UMBRAL_COINCIDENCIA_PATRON && faltantesRequeridos.length === 0,
  };
}
