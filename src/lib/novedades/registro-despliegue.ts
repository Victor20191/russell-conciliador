// Fecha real de despliegue de las versiones de Novedades.
//
// «Desplegar» es cuando el código de master llega al servidor de producción y la
// gente ve el cambio en la URL. Cada release sube el número de `package.json`, así
// que el servidor sabe con qué versión arrancó: al arrancar por primera vez con una
// versión nueva, las versiones de Novedades que entraron desde la anterior (mayores
// que la última desplegada y hasta la actual) toman ese día como «Desplegada el».
// Los reinicios con la misma versión no cambian nada, y el primer registro (sin
// despliegue anterior conocido) no le pone fecha a nada del pasado: esas fechas se
// cargan del historial del servidor (`fechasDesdeHistorial`).
//
// Módulo PURO.
import { despliegueAlPublicar, instanteDespliegue, esFechaDespliegueValida } from "./despliegue";

const VERSION = /^\d+\.\d+\.\d+$/;

/** ¿Es un número de versión «x.y.z»? */
export function esVersionValida(version: string | null | undefined): version is string {
  return Boolean(version && VERSION.test(version.trim()));
}

/** Orden numérico de versiones «x.y.z» (3.10.0 va después de 3.9.0). */
export function compararVersiones(a: string, b: string): number {
  const pa = a.trim().split(".").map(Number);
  const pb = b.trim().split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d !== 0) return d;
  }
  return 0;
}

/** La mayor de las versiones válidas, o null si no hay ninguna. */
export function versionMayor(versiones: Iterable<string>): string | null {
  let mayor: string | null = null;
  for (const v of versiones) {
    if (!esVersionValida(v)) continue;
    if (mayor === null || compararVersiones(v, mayor) > 0) mayor = v.trim();
  }
  return mayor;
}

/**
 * Las versiones de Novedades que entran con un despliegue: mayores que la última
 * desplegada (`anterior`), hasta la que arrancó (`actual`), y aún sin fecha. Sin
 * despliegue anterior conocido no entra ninguna: no se sabe cuáles ya estaban.
 */
export function versionesQueEntran<T extends { number: string; deployedAt: Date | string | null }>(params: {
  versiones: readonly T[];
  anterior: string | null;
  actual: string;
}): T[] {
  const { anterior, actual } = params;
  if (!anterior || !esVersionValida(anterior) || !esVersionValida(actual)) return [];
  return params.versiones.filter(
    (v) =>
      !v.deployedAt &&
      esVersionValida(v.number) &&
      compararVersiones(v.number, anterior) > 0 &&
      compararVersiones(v.number, actual) <= 0,
  );
}

export type EntradaHistorial = { instante: Date; version: string };

// `HEAD@{2026-11-12 10:03:11 -0500} 1a2b3c4 "version": "3.7.1",` (git reflog con el
// comando del README) o una línea escrita a mano: `2026-11-12 3.7.1`.
const LINEA_REFLOG = /\{(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) ([+-]\d{2})(\d{2})\}.*?"version"\s*:\s*"(\d+\.\d+\.\d+)"/;
const LINEA_MANUAL = /^\s*(\d{4}-\d{2}-\d{2})\s+v?(\d+\.\d+\.\d+)\b/;

/** Lee el historial del servidor: una entrada por línea reconocible; lo demás se ignora. */
export function leerHistorialServidor(texto: string): EntradaHistorial[] {
  const entradas: EntradaHistorial[] = [];
  for (const linea of texto.split(/\r?\n/)) {
    const reflog = LINEA_REFLOG.exec(linea);
    if (reflog) {
      const [, dia, hora, zonaH, zonaM, version] = reflog;
      const instante = new Date(`${dia}T${hora}${zonaH}:${zonaM}`);
      if (Number.isFinite(instante.getTime())) entradas.push({ instante, version });
      continue;
    }
    const manual = LINEA_MANUAL.exec(linea);
    if (manual && esFechaDespliegueValida(manual[1])) {
      entradas.push({ instante: instanteDespliegue(manual[1]), version: manual[2] });
    }
  }
  return entradas.sort((a, b) => a.instante.getTime() - b.instante.getTime());
}

/**
 * Día de despliegue de cada versión según el historial: el de la PRIMERA vez que
 * el servidor tuvo esa versión o una mayor. Si ya la tenía en la entrada más
 * antigua, se desplegó antes de lo que alcanza el historial y no se sabe el día.
 */
export function fechasDesdeHistorial(
  entradas: readonly EntradaHistorial[],
  numeros: Iterable<string>,
): Map<string, Date> {
  const ordenadas = [...entradas].sort((a, b) => a.instante.getTime() - b.instante.getTime());
  const fechas = new Map<string, Date>();
  for (const numero of numeros) {
    if (!esVersionValida(numero)) continue;
    const i = ordenadas.findIndex((e) => compararVersiones(e.version, numero) >= 0);
    if (i > 0) fechas.set(numero, despliegueAlPublicar(ordenadas[i].instante));
  }
  return fechas;
}

/** Primer instante en que el servidor tuvo cada versión del historial (para la tabla de despliegues). */
export function primerArranquePorVersion(entradas: readonly EntradaHistorial[]): Map<string, Date> {
  const primeras = new Map<string, Date>();
  for (const e of [...entradas].sort((a, b) => a.instante.getTime() - b.instante.getTime())) {
    if (!primeras.has(e.version)) primeras.set(e.version, e.instante);
  }
  return primeras;
}
