// Filas del tablero Configuración › Perfiles de carga: lógica PURA (sin BD) que
// convierte los agregados de la memoria de carga en UNA fila por (cliente, fuente).
//
// La «memoria de carga» tiene hoy dos familias de fuentes que se administran igual:
//   - `balance`: formatos por huella (`perfiles_carga_balance`), correcciones por
//     cuenta (`correcciones_carga_balance`) y preferencias (`ajustes_carga_balance`).
//   - cada MÓDULO (INV, CAR, CXP, ING, AFI, NOM): formatos por huella
//     (`perfiles_carga_modulo`) y preferencias (`ajustes_carga_modulo`). Los módulos
//     no memorizan correcciones por fila (correcciones = null → «no aplica»).
// La página acumula los conteos por fuente con los `registrar*` y luego arma las filas
// con `construirFilasMemoria`; solo salen las fuentes con algo guardado, ordenadas por
// actividad reciente (crear/editar perfil, corrección o preferencia), desempatando
// por razón social y por el orden de las fuentes (balance primero, luego los módulos
// en su orden de declaración).
import { MODULOS_IMPORT } from "@/lib/modulos/descriptores";

/** Clave de la fuente «balance de comprobación». Las demás son códigos de módulo. */
export const FUENTE_BALANCE = "balance";

export type ClienteMemoriaBase = {
  id: number;
  code: string;
  name: string;
  nit: string;
  erpName: string | null;
};

export type ResumenMemoriaFuente = {
  clienteId: number;
  fuente: string;
  perfiles: number;
  ultimoUso: Date | null;
  perfilesActualizadoEn: Date | null;
  /** `null` = la fuente no memoriza correcciones (módulos). */
  correcciones: number | null;
  correccionesActualizadoEn: Date | null;
  tienePreferencias: boolean;
  preferenciasActualizadoEn: Date | null;
};

/** Fila serializable que consume el componente cliente del tablero. */
export type FilaMemoriaCarga = {
  id: number;
  code: string;
  name: string;
  nit: string;
  erpName: string | null;
  fuente: string;
  fuenteLabel: string;
  perfiles: number;
  ultimoUso: string | null; // ISO
  correcciones: number | null;
  tienePreferencias: boolean;
};

export type AcumuladorMemoria = Map<string, ResumenMemoriaFuente>;

export function crearAcumuladorMemoria(): AcumuladorMemoria {
  return new Map();
}

function entrada(acc: AcumuladorMemoria, clienteId: number, fuente: string): ResumenMemoriaFuente {
  const clave = `${clienteId}:${fuente}`;
  let actual = acc.get(clave);
  if (!actual) {
    actual = {
      clienteId,
      fuente,
      perfiles: 0,
      ultimoUso: null,
      perfilesActualizadoEn: null,
      correcciones: fuente === FUENTE_BALANCE ? 0 : null,
      correccionesActualizadoEn: null,
      tienePreferencias: false,
      preferenciasActualizadoEn: null,
    };
    acc.set(clave, actual);
  }
  return actual;
}

export function registrarPerfiles(
  acc: AcumuladorMemoria,
  clienteId: number,
  fuente: string,
  cantidad: number,
  ultimoUso: Date | null | undefined,
  actualizadoEn: Date | null | undefined,
): void {
  const e = entrada(acc, clienteId, fuente);
  e.perfiles += cantidad;
  e.ultimoUso = masReciente(e.ultimoUso, ultimoUso);
  e.perfilesActualizadoEn = masReciente(e.perfilesActualizadoEn, actualizadoEn);
}

export function registrarCorrecciones(
  acc: AcumuladorMemoria,
  clienteId: number,
  fuente: string,
  cantidad: number,
  actualizadoEn: Date | null | undefined,
): void {
  const e = entrada(acc, clienteId, fuente);
  e.correcciones = (e.correcciones ?? 0) + cantidad;
  e.correccionesActualizadoEn = masReciente(e.correccionesActualizadoEn, actualizadoEn);
}

/**
 * Marca que la fuente tiene preferencias CONFIGURADAS. Quien llama decide si la fila
 * de ajustes tiene algún valor real (la sola existencia de la fila no cuenta: el flujo
 * de balance crea un perfil base con todo en null en la primera carga).
 */
export function registrarPreferencias(
  acc: AcumuladorMemoria,
  clienteId: number,
  fuente: string,
  actualizadoEn: Date | null | undefined,
): void {
  const e = entrada(acc, clienteId, fuente);
  e.tienePreferencias = true;
  e.preferenciasActualizadoEn = masReciente(e.preferenciasActualizadoEn, actualizadoEn);
}

function masReciente(a: Date | null | undefined, b: Date | null | undefined): Date | null {
  if (!(a instanceof Date)) return b instanceof Date ? b : null;
  if (!(b instanceof Date)) return a;
  return b.getTime() > a.getTime() ? b : a;
}

/** ¿La fuente tiene algo administrable? */
export function tieneMemoria(r: Pick<ResumenMemoriaFuente, "perfiles" | "correcciones" | "tienePreferencias">): boolean {
  return r.perfiles > 0 || (r.correcciones ?? 0) > 0 || r.tienePreferencias;
}

/** Ms del evento más reciente de la fuente (crear/editar perfil, corrección o preferencia). */
export function msActividadReciente(r: ResumenMemoriaFuente): number {
  const fechas = [r.perfilesActualizadoEn, r.correccionesActualizadoEn, r.preferenciasActualizadoEn]
    .filter((d): d is Date => d instanceof Date);
  if (fechas.length === 0) return 0;
  return Math.max(...fechas.map((d) => d.getTime()));
}

/** Etiqueta legible de una fuente («Balance», «Inventarios», …). */
export function etiquetaFuente(fuente: string): string {
  if (fuente === FUENTE_BALANCE) return "Balance";
  return MODULOS_IMPORT[fuente]?.label ?? fuente;
}

/** Orden canónico de las fuentes: balance primero, luego los módulos según el catálogo. */
export function ordenFuentes(): string[] {
  return [FUENTE_BALANCE, ...Object.keys(MODULOS_IMPORT)];
}

/**
 * Arma las filas del tablero: solo (cliente, fuente) con memoria; más recientes
 * primero; desempate por razón social y luego por el orden canónico de fuentes.
 * Las fuentes cuyo cliente ya no existe se omiten (FK suave a `clientes`).
 */
export function construirFilasMemoria(
  clientes: readonly ClienteMemoriaBase[],
  acc: AcumuladorMemoria,
): FilaMemoriaCarga[] {
  const clientePorId = new Map(clientes.map((c) => [c.id, c]));
  const posicionFuente = new Map(ordenFuentes().map((f, i) => [f, i]));
  const ordenables: Array<{ fila: FilaMemoriaCarga; actividadMs: number; posFuente: number }> = [];
  for (const r of acc.values()) {
    if (!tieneMemoria(r)) continue;
    const c = clientePorId.get(r.clienteId);
    if (!c) continue;
    ordenables.push({
      fila: {
        id: c.id,
        code: c.code,
        name: c.name,
        nit: c.nit,
        erpName: c.erpName,
        fuente: r.fuente,
        fuenteLabel: etiquetaFuente(r.fuente),
        perfiles: r.perfiles,
        ultimoUso: r.ultimoUso?.toISOString() ?? null,
        correcciones: r.correcciones,
        tienePreferencias: r.tienePreferencias,
      },
      actividadMs: msActividadReciente(r),
      posFuente: posicionFuente.get(r.fuente) ?? Number.MAX_SAFE_INTEGER,
    });
  }
  ordenables.sort((a, b) =>
    b.actividadMs - a.actividadMs
    || a.fila.name.localeCompare(b.fila.name, "es")
    || a.posFuente - b.posFuente,
  );
  return ordenables.map((o) => o.fila);
}
