// NOMBRE DEL AGRUPADOR que el usuario le pone en el borrador a los grupos que no traen nombre
// del archivo — puro, sin BD.
//
// Dos grupos del borrador los nombra el sistema, no el archivo:
//  - «(sin clasificar)»: el archivo no trae la columna del clasificador (la cuenta en Cartera y
//    CxP) y la fila queda con el clasificador nulo;
//  - «GLOBAL»: el modo «único para todo el archivo» (Inventarios) le pone ese nombre fijo.
// Con un nombre propio se concilian como un renglón más del Consolidado. En un anexo, un nombre
// que ya usa el cargue destino junta las filas en ese renglón (comparten la cuenta); uno nuevo
// abre un renglón aparte, con su propia cuenta. Un nombre que ya tiene cuenta en la memoria del
// cliente la trae sola el mes siguiente: por eso se ofrecen.
import { CLASIFICADOR_GLOBAL } from "./extraccion/transformar";
import { SIN_CLASIFICAR } from "./promocion";

export const MAX_NOMBRE_CLASIFICADOR = 80;

/** Grupo del borrador que nombra el sistema. */
export type GrupoSinNombre = "sin_clasificar" | "global";

export const ETIQUETA_GRUPO_SIN_NOMBRE: Record<GrupoSinNombre, string> = {
  sin_clasificar: SIN_CLASIFICAR,
  global: CLASIFICADOR_GLOBAL,
};

export const esGrupoSinNombre = (valor: unknown): valor is GrupoSinNombre =>
  valor === "sin_clasificar" || valor === "global";

/** A qué grupo del sistema pertenece un clasificador; null si lo trajo el archivo. */
export function grupoSinNombreDe(clasificador: string | null | undefined): GrupoSinNombre | null {
  const valor = clasificador?.trim() ?? "";
  if (!valor) return "sin_clasificar";
  return valor === CLASIFICADOR_GLOBAL ? "global" : null;
}

/** Forma comparable: sin mayúsculas, tildes ni espacios de más. */
export const comparableNombre = (texto: string): string =>
  texto.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toLowerCase();

/** Valida y limpia el nombre escrito. Letras, números y signos se aceptan tal cual. */
export function normalizarNombreClasificador(texto: unknown): { ok: true; nombre: string } | { ok: false; message: string } {
  const nombre = String(texto ?? "").replace(/\s+/g, " ").trim();
  if (!nombre) return { ok: false, message: "Escribe el nombre del agrupador." };
  if (nombre.length > MAX_NOMBRE_CLASIFICADOR) {
    return { ok: false, message: `El nombre del agrupador admite hasta ${MAX_NOMBRE_CLASIFICADOR} caracteres.` };
  }
  if (comparableNombre(nombre) === comparableNombre(SIN_CLASIFICAR)) {
    return { ok: false, message: `«${SIN_CLASIFICAR}» es el nombre de las filas sin agrupador: escribe otro.` };
  }
  return { ok: true, nombre };
}

export type OpcionNombreClasificador = {
  nombre: string;
  /** Por qué se ofrece: «ya en la v3 · se junta con esas filas», «usado antes · R-130505»… */
  detalle: string;
  /** Está en el cargue al que se suma el anexo: elegirlo junta las filas en ese renglón. */
  enDestino: boolean;
};

/**
 * Nombres que se ofrecen: los del cargue destino del anexo, los que ya tienen cuenta en la
 * memoria del cliente y los que ya trae el propio borrador. Sin repetir ni ofrecer los nombres
 * del sistema; primero los del destino, después los de la memoria.
 */
export function opcionesNombreClasificador(input: {
  destino?: { version: number; nombres: readonly (string | null)[] } | null;
  memoria?: readonly { nombre: string; cuentas: readonly string[] }[];
  delBorrador?: readonly (string | null)[];
}): OpcionNombreClasificador[] {
  const opciones = new Map<string, { nombre: string; detalles: string[]; enDestino: boolean; orden: number }>();
  const sumar = (crudo: string | null | undefined, detalle: string, orden: number, enDestino = false) => {
    const nombre = crudo?.trim() ?? "";
    if (!nombre || grupoSinNombreDe(nombre) === "sin_clasificar" || comparableNombre(nombre) === comparableNombre(SIN_CLASIFICAR)) return;
    const previa = opciones.get(nombre);
    if (previa) {
      if (!previa.detalles.includes(detalle)) previa.detalles.push(detalle);
      previa.enDestino ||= enDestino;
      previa.orden = Math.min(previa.orden, orden);
      return;
    }
    opciones.set(nombre, { nombre, detalles: [detalle], enDestino, orden });
  };
  if (input.destino) {
    for (const n of input.destino.nombres) sumar(n, `ya en la v${input.destino.version} · se junta con esas filas`, 0, true);
  }
  for (const m of input.memoria ?? []) {
    const cuentas = [...new Set(m.cuentas.filter(Boolean))];
    sumar(m.nombre, cuentas.length ? `usado antes · ${cuentas.map((c) => `R-${c}`).join(", ")}` : "usado antes", 1);
  }
  for (const n of input.delBorrador ?? []) sumar(n, "en este borrador", 2);
  return [...opciones.values()]
    .sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre, "es"))
    .map(({ nombre, detalles, enDestino }) => ({ nombre, detalle: detalles.join(" · "), enDestino }));
}

/**
 * Opción que se parece a lo escrito salvo en mayúsculas, tildes o espacios: serían dos renglones
 * distintos del Consolidado («Mercancía» ≠ «MERCANCIA»). null si es idéntica o no se parece.
 */
export function nombreParecido(escrito: string, opciones: readonly Pick<OpcionNombreClasificador, "nombre">[]): string | null {
  const limpio = escrito.replace(/\s+/g, " ").trim();
  if (!limpio) return null;
  const comparable = comparableNombre(limpio);
  const parecida = opciones.find((o) => o.nombre !== limpio && comparableNombre(o.nombre) === comparable);
  return parecida?.nombre ?? null;
}
