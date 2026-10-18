// ¿Se puede CERRAR un balance? (18/Oct/2026) — puro, sin BD.
//
// Cerrar deja el balance inmutable y es lo que habilita a los módulos a conciliar contra él. Como
// todos los balances de un mismo corte tienen que coincidir en sus saldos finales, un balance solo
// se cierra cuando:
//  1. es la versión VIGENTE de su línea (las anteriores son historial);
//  2. ninguna versión anterior de su línea sigue cerrada (defensa para datos anteriores a la regla
//     de carga, que ya exige abrir la vigente antes de cargar una nueva);
//  3. todos los demás balances vigentes del corte están comparados y coinciden con él;
//  4. el prevalidador está listo y aprobado (como siempre).
// Mientras haya diferencias, el modal dice con qué balances y cómo resolverlo: el que sobra se
// elimina (si está cerrado, se abre primero) y uno con conciliación en firme solo se reemplaza.

export type AccionResolver = "eliminar" | "abrir_y_eliminar" | "reemplazar";

export type OtroBalanceCierre = {
  id: number;
  version: string;
  nombre: string;
  estaCongelado: boolean;
  /** Tiene una conciliación de módulo en firme contra él. */
  enFirme: boolean;
  /** null = aún no se comparó con este balance. */
  comparacion: { inconsistente: boolean; cuentas: number } | null;
};

export type BloqueoCierreBalance =
  | { tipo: "no_vigente"; vigente: { id: number; version: string } }
  | { tipo: "version_anterior_cerrada"; cerradas: { id: number; version: string }[] }
  | { tipo: "sin_comparar"; pendientes: { id: number; version: string; nombre: string }[] }
  | { tipo: "inconsistente"; balances: { id: number; version: string; nombre: string; cuentas: number; accion: AccionResolver }[] }
  | { tipo: "prevalidador"; mensaje: string };

/** Qué hay que hacer con el OTRO balance para que la diferencia desaparezca. */
export function accionParaResolver(b: Pick<OtroBalanceCierre, "estaCongelado" | "enFirme">): AccionResolver {
  if (b.enFirme) return "reemplazar";
  return b.estaCongelado ? "abrir_y_eliminar" : "eliminar";
}

export function evaluarCierreBalance(p: {
  balanceId: number;
  /** La vigente de la línea de este balance. */
  vigenteDeMiLinea: { id: number; version: string } | null;
  /** Versiones anteriores de su misma línea que siguen cerradas. */
  anterioresCerradas: readonly { id: number; version: string }[];
  /** Los demás balances vigentes del corte. */
  otros: readonly OtroBalanceCierre[];
  /** Mensaje del prevalidador si no permite cerrar (null = listo y aprobado). */
  mensajePrevalidador: string | null;
  /** La pantalla anticipa sin haber recalculado: un par sin comparar no bloquea el botón. */
  ignorarSinComparar?: boolean;
}): { ok: true } | { ok: false; bloqueo: BloqueoCierreBalance } {
  if (p.vigenteDeMiLinea && p.vigenteDeMiLinea.id !== p.balanceId) {
    return { ok: false, bloqueo: { tipo: "no_vigente", vigente: p.vigenteDeMiLinea } };
  }
  if (p.anterioresCerradas.length > 0) {
    return { ok: false, bloqueo: { tipo: "version_anterior_cerrada", cerradas: [...p.anterioresCerradas] } };
  }
  const pendientes = p.otros.filter((o) => o.comparacion == null);
  if (pendientes.length > 0 && !p.ignorarSinComparar) {
    return { ok: false, bloqueo: { tipo: "sin_comparar", pendientes: pendientes.map(({ id, version, nombre }) => ({ id, version, nombre })) } };
  }
  const difieren = p.otros.filter((o) => o.comparacion?.inconsistente);
  if (difieren.length > 0) {
    return {
      ok: false,
      bloqueo: {
        tipo: "inconsistente",
        balances: difieren.map((o) => ({ id: o.id, version: o.version, nombre: o.nombre, cuentas: o.comparacion?.cuentas ?? 0, accion: accionParaResolver(o) })),
      },
    };
  }
  if (p.mensajePrevalidador) return { ok: false, bloqueo: { tipo: "prevalidador", mensaje: p.mensajePrevalidador } };
  return { ok: true };
}

const TEXTO_ACCION: Record<AccionResolver, string> = {
  eliminar: "elimínalo",
  abrir_y_eliminar: "ábrelo y elimínalo",
  reemplazar: "tiene una conciliación en firme: reemplázalo por este con «Reemplazar el balance conciliado»",
};

/** Texto del rechazo, para el toast de la acción y el modal del botón. */
export function mensajeCierreBloqueado(bloqueo: BloqueoCierreBalance): string {
  switch (bloqueo.tipo) {
    case "no_vigente":
      return `Solo se cierra la versión vigente de su línea: esta es una versión anterior (la vigente es la ${bloqueo.vigente.version}).`;
    case "version_anterior_cerrada":
      return `La versión anterior ${bloqueo.cerradas.map((c) => c.version).join(", ")} de esta línea sigue cerrada: ábrela antes de cerrar esta.`;
    case "sin_comparar":
      return `Falta comparar los saldos finales con ${bloqueo.pendientes.map((b) => `${b.nombre} ${b.version}`).join(", ")}. Usa «Revisar comparación» y vuelve a intentarlo.`;
    case "inconsistente":
      return `No se puede cerrar: los saldos finales difieren de ${bloqueo.balances.map((b) => `${b.nombre} ${b.version} (${b.cuentas} cuenta(s))`).join("; ")}. Elimina el balance que sobre —este o el otro— y vuelve a cerrar. ${bloqueo.balances.map((b) => `Si sobra ${b.nombre} ${b.version}, ${TEXTO_ACCION[b.accion]}.`).join(" ")}`;
    case "prevalidador":
      return bloqueo.mensaje;
  }
}

/** Por qué el prevalidador no deja cerrar (null = listo y con la aprobación vigente). */
export function mensajePrevalidadorParaCerrar(contexto: {
  prevalidador: { estado: string; mensaje?: string; sinHomologar?: { cuentas: number } };
  revision: { vigente: boolean; estado: string };
}): string | null {
  const { prevalidador, revision } = contexto;
  if (prevalidador.estado === "sin_catalogo") return "No se puede cerrar el balance: el prevalidador no tiene cuentas activas configuradas.";
  if (prevalidador.estado === "bloqueado") return `No se puede cerrar el balance: quedan ${prevalidador.sinHomologar?.cuentas ?? 0} cuenta(s) sin homologar en el prevalidador.`;
  if (prevalidador.estado === "no_disponible") return `No se puede cerrar el balance: ${prevalidador.mensaje ?? "el prevalidador no está disponible."}`;
  if (prevalidador.estado !== "listo") return "No se puede cerrar el balance: el prevalidador no está listo.";
  if (revision.vigente) return null;
  if (revision.estado === "pendiente") return "No se puede cerrar el balance: el prevalidador todavía no ha sido aprobado.";
  if (revision.estado === "revocada") return "No se puede cerrar el balance: la aprobación del prevalidador fue revocada.";
  if (revision.estado === "desactualizada") return "No se puede cerrar el balance: la aprobación del prevalidador está desactualizada. Vuelve a revisarlo y aprobarlo.";
  return "No se puede cerrar el balance: el prevalidador no tiene una aprobación vigente.";
}
