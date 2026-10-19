// Balances por FECHA DE CORTE (18/Oct/2026) — puro, sin BD ni `server-only`.
//
// Toda la conciliación de los módulos se hace contra el SALDO FINAL, así que lo que importa de un
// balance es su fecha de corte (`periodoFin`). Un mismo corte puede tener varios balances: el
// mensual («Diciembre 2025»), el anual («Enero 2025 – Diciembre 2025») y cada uno por cuenta o por
// terceros. Esos balances deben coincidir en sus saldos finales y por eso se comparan entre sí.
//
// Dentro del corte, cada (texto del período, apertura) es una LÍNEA de versiones: recargar el mismo
// archivo crea una versión nueva de esa línea. Solo la VIGENTE de cada línea —la más reciente— entra
// a la comparación; las anteriores son historial. Los cargues legados sin apertura declarada se
// pliegan como en el listado (`aperturaDeListado`): sobre la única apertura declarada del período o,
// si no la hay, en su propia línea.
import { fechaCalendarioISO } from "@/lib/fecha-hora";
import { aperturaDeListado, aperturasDeclaradasPorGrupo, claveRenglonApertura } from "./agrupacion-aperturas";
import { etiquetaApertura, type AperturaBalance } from "./apertura-balance";

/** Encabezado reducido a lo que necesitan la agrupación y la comparación por corte. */
export type EncabezadoCorte = {
  id: number;
  clienteId: number;
  periodo: string;
  periodoFin: Date | string;
  aperturaBalance: string | null;
  creadoEn: Date | string;
  estaCongelado: boolean;
};

/** Fecha de corte `AAAA-MM-DD` (columna DATE, sin zona horaria). */
export function fechaCorteISO(periodoFin: Date | string): string {
  return fechaCalendarioISO(periodoFin);
}

/** Clave del corte: cliente + fecha fin exacta. */
export function claveCorte(b: Pick<EncabezadoCorte, "clienteId" | "periodoFin">): string {
  return `${b.clienteId}::${fechaCorteISO(b.periodoFin)}`;
}

/** «Corte 31/12/2025». */
export function etiquetaCorte(periodoFin: Date | string): string {
  const [anio, mes, dia] = fechaCorteISO(periodoFin).split("-");
  return `Corte ${dia}/${mes}/${anio}`;
}

/** Agrupa encabezados por corte, conservando el orden de entrada dentro de cada grupo. */
export function agruparPorCorte<T extends Pick<EncabezadoCorte, "clienteId" | "periodoFin">>(encabezados: readonly T[]): Map<string, T[]> {
  const grupos = new Map<string, T[]>();
  for (const e of encabezados) {
    const clave = claveCorte(e);
    const grupo = grupos.get(clave);
    if (grupo) grupo.push(e);
    else grupos.set(clave, [e]);
  }
  return grupos;
}

/** Una línea de versiones dentro del corte: mismo texto de período y misma apertura efectiva. */
export type LineaCorte<T> = {
  clave: string;
  periodo: string;
  apertura: AperturaBalance | null;
  /** La versión más reciente: la única que entra a la comparación del corte. */
  vigente: T;
  /** Todas las versiones de la línea, de la más reciente a la más antigua. */
  versiones: T[];
};

const instante = (v: Date | string) => (v instanceof Date ? v.getTime() : new Date(v).getTime());

/** La más reciente primero; a igual fecha de carga, el id mayor. */
function compararRecientes(a: Pick<EncabezadoCorte, "id" | "creadoEn">, b: Pick<EncabezadoCorte, "id" | "creadoEn">): number {
  return instante(b.creadoEn) - instante(a.creadoEn) || b.id - a.id;
}

/**
 * Líneas de versiones de los encabezados de UN corte. Las líneas salen ordenadas por período y
 * apertura para que el listado sea estable.
 */
export function lineasDelCorte<T extends EncabezadoCorte>(encabezados: readonly T[]): LineaCorte<T>[] {
  const declaradas = aperturasDeclaradasPorGrupo(encabezados.map((e) => ({ clave: e.periodo, aperturaBalance: e.aperturaBalance })));
  const lineas = new Map<string, LineaCorte<T>>();
  for (const e of encabezados) {
    const apertura = aperturaDeListado(e.aperturaBalance, declaradas.get(e.periodo));
    const clave = claveRenglonApertura(e.periodo, apertura);
    const linea = lineas.get(clave);
    if (linea) linea.versiones.push(e);
    else lineas.set(clave, { clave, periodo: e.periodo, apertura, vigente: e, versiones: [e] });
  }
  return [...lineas.values()]
    .map((l) => {
      const versiones = [...l.versiones].sort(compararRecientes);
      return { ...l, versiones, vigente: versiones[0] };
    })
    .sort((a, b) => a.periodo.localeCompare(b.periodo, "es") || etiquetaApertura(a.apertura).localeCompare(etiquetaApertura(b.apertura), "es"));
}

/** Los balances vigentes del corte (uno por línea). */
export function balancesVigentesDelCorte<T extends EncabezadoCorte>(encabezados: readonly T[]): T[] {
  return lineasDelCorte(encabezados).map((l) => l.vigente);
}

/** Nombre de una línea para mensajes: «Diciembre 2025 · Por cuenta». */
export function nombreLinea(l: { periodo: string; aperturaBalance?: string | null; apertura?: string | null }): string {
  const apertura = etiquetaApertura(l.apertura ?? l.aperturaBalance ?? null);
  return apertura === "—" ? l.periodo : `${l.periodo} · ${apertura}`;
}

export type ParCorte = { balanceAId: number; balanceBId: number };

/** Par ordenado: el id menor siempre es `a` (así lo exige la tabla). */
export function parOrdenado(a: number, b: number): ParCorte {
  return a < b ? { balanceAId: a, balanceBId: b } : { balanceAId: b, balanceBId: a };
}

/** Todos los pares que hay que comparar entre los vigentes del corte. */
export function paresEsperados(vigentes: readonly { id: number }[]): ParCorte[] {
  const pares: ParCorte[] = [];
  for (let i = 0; i < vigentes.length; i++) {
    for (let j = i + 1; j < vigentes.length; j++) pares.push(parOrdenado(vigentes[i].id, vigentes[j].id));
  }
  return pares;
}

/**
 * Estado del corte:
 *  - `unico`: un solo balance vigente, no hay con qué comparar.
 *  - `inconsistente`: algún par de vigentes difiere en saldos finales.
 *  - `sin_comparar`: falta comparar algún par (nadie ha disparado el cálculo).
 *  - `consistente`: todos los pares están comparados y coinciden.
 */
export type EstadoCorte = "unico" | "consistente" | "inconsistente" | "sin_comparar";

export function estadoDelCorte(
  vigentes: readonly { id: number }[],
  pares: readonly (ParCorte & { inconsistente: boolean })[],
): EstadoCorte {
  if (vigentes.length <= 1) return "unico";
  const guardados = new Map(pares.map((p) => [`${p.balanceAId}|${p.balanceBId}`, p.inconsistente]));
  let faltan = false;
  for (const par of paresEsperados(vigentes)) {
    const inconsistente = guardados.get(`${par.balanceAId}|${par.balanceBId}`);
    if (inconsistente === true) return "inconsistente";
    if (inconsistente === undefined) faltan = true;
  }
  return faltan ? "sin_comparar" : "consistente";
}

/**
 * Rótulo del estado del corte para el listado. Con `cuentasDiferentes` (un corte de dos balances
 * que difieren), dice cuántas cuentas alcanzan el umbral.
 */
export function etiquetaEstadoCorte(estado: EstadoCorte, cuentasDiferentes: number | null = null): string {
  return estado === "consistente" ? "Coinciden"
    : estado === "inconsistente" ? (cuentasDiferentes != null ? `Difieren · ${cuentasDiferentes} cuenta(s)` : "Difieren")
    : estado === "sin_comparar" ? "Sin comparar"
    : "Único";
}

/**
 * Una versión nueva de una línea solo se carga si la vigente de esa línea está abierta: así nunca
 * quedan versiones viejas cerradas. Devuelve la vigente cerrada que lo impide, o null.
 * `nuevo` es el cargue que se va a confirmar (su apertura y su texto de período).
 */
export function vigenteCerradaDeLaLinea<T extends EncabezadoCorte>(
  encabezadosDelCorte: readonly T[],
  nuevo: { clienteId: number; periodo: string; periodoFin: Date | string; aperturaBalance: string | null },
): T | null {
  const ID_NUEVO = -1;
  const virtual = { ...nuevo, id: ID_NUEVO, creadoEn: new Date(8.64e15), estaCongelado: false } as unknown as T;
  const linea = lineasDelCorte([...encabezadosDelCorte, virtual]).find((l) => l.versiones.some((v) => v.id === ID_NUEVO));
  const anterior = linea?.versiones.find((v) => v.id !== ID_NUEVO);
  return anterior && anterior.estaCongelado ? anterior : null;
}

export function motivoVersionSobreCerrada(cerrada: { version: string; periodo: string; aperturaBalance: string | null }): string {
  return `La versión ${cerrada.version} de ${nombreLinea(cerrada)} está cerrada: ábrela con «Abrir balance» antes de cargar una versión nueva.`;
}

/** Rechazo de negocio (no un fallo de BD) de una versión nueva sobre una vigente cerrada. */
export class ErrorVersionSobreCerrada extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ErrorVersionSobreCerrada";
  }
}
