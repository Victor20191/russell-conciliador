// ¿Se puede REEMPLAZAR el balance conciliado por otro? (18/Oct/2026) — puro, sin BD.
//
// Un balance con una conciliación de módulo en firme no se elimina. Si en su mismo corte hay otro
// balance que debe quedar en su lugar (el viejo traía un error, o es la versión anterior de la
// línea), se REEMPLAZA: en un solo acto la conciliación pasa al nuevo, el viejo se elimina y el
// nuevo queda cerrado. Solo es posible si el nuevo no cambia nada de lo conciliado:
//  - misma fecha de corte exacta y mismo cliente;
//  - el nuevo es la versión vigente de su línea y tiene el prevalidador listo y aprobado;
//  - las cuentas en firme son idénticas en saldo final y homologación, y no entran cuentas nuevas
//    con saldo al alcance cerrado (`evaluarCambiosBloqueados`, la misma regla de cargar);
//  - en los cierres con cruce por tercero (Cartera, CxP), el nuevo conserva el detalle por tercero
//    y es idéntico en las cuentas en firme (`diferenciasTerceroEnFirme`).
import {
  alcanceDeCierres,
  diferenciasTerceroEnFirme,
  evaluarCambiosBloqueados,
  type CuentaBloqueada,
  type FilaDetalleBloqueo,
  type FilaTerceroEnFirme,
  type ViolacionBloqueo,
} from "@/lib/conciliacion/cuentas-bloqueo";
import { fechaCorteISO } from "./corte";

export type CierreParaReemplazo = {
  id: number;
  moduloCodigo: string;
  periodo: string;
  cerradoPor: string;
  moduloDatoEncabezadoId: number;
  cuentasRussell: string[];
  cuentasRussell6?: string[];
};

export type MotivoReemplazo =
  | "mismo_balance" | "otro_cliente" | "otro_corte" | "viejo_sin_cierre" | "nuevo_no_vigente"
  | "prevalidador" | "cuentas_en_firme" | "sin_detalle_tercero" | "detalle_tercero" | "conciliacion_formal";

export type EvaluacionReemplazo =
  | { ok: true; cuentasEnFirme: number }
  | { ok: false; motivo: MotivoReemplazo; mensaje: string; violaciones?: ViolacionBloqueo[] };

export function evaluarReemplazoBalance(p: {
  viejo: { id: number; clienteId: number; periodoFin: Date | string };
  nuevo: { id: number; clienteId: number; periodoFin: Date | string; esVigente: boolean };
  cierresDelViejo: readonly CierreParaReemplazo[];
  /** Cuentas en firme de esos cierres. */
  bloqueadas: readonly (CuentaBloqueada & { cierreId: number })[];
  filasNuevas: readonly FilaDetalleBloqueo[];
  /** Solo los cierres con cruce por tercero: el detalle por tercero de cada balance (null = no tiene). */
  tercero: readonly { cierre: CierreParaReemplazo; conciliado: FilaTerceroEnFirme[] | null; nuevo: FilaTerceroEnFirme[] | null }[];
  /** null = prevalidador listo y aprobado. */
  mensajePrevalidador: string | null;
  /** Conciliaciones del flujo anterior que guardan el viejo como evidencia. */
  conciliacionesFormales: number;
}): EvaluacionReemplazo {
  if (p.viejo.id === p.nuevo.id) return { ok: false, motivo: "mismo_balance", mensaje: "Elige otro balance para reemplazar." };
  if (p.viejo.clienteId !== p.nuevo.clienteId) return { ok: false, motivo: "otro_cliente", mensaje: "Los dos balances deben ser del mismo cliente." };
  if (fechaCorteISO(p.viejo.periodoFin) !== fechaCorteISO(p.nuevo.periodoFin)) {
    return { ok: false, motivo: "otro_corte", mensaje: "Solo se reemplaza por un balance con la misma fecha de corte." };
  }
  if (p.cierresDelViejo.length === 0) {
    return { ok: false, motivo: "viejo_sin_cierre", mensaje: "Ese balance no tiene una conciliación en firme: si sobra, ábrelo (si está cerrado) y elimínalo." };
  }
  if (!p.nuevo.esVigente) {
    return { ok: false, motivo: "nuevo_no_vigente", mensaje: "El balance que queda tiene que ser la versión vigente de su línea." };
  }
  if (p.conciliacionesFormales > 0) {
    return { ok: false, motivo: "conciliacion_formal", mensaje: `${p.conciliacionesFormales} conciliación(es) conserva(n) el balance actual como evidencia prevalidada: no se puede eliminar.` };
  }
  if (p.mensajePrevalidador) return { ok: false, motivo: "prevalidador", mensaje: p.mensajePrevalidador };

  const violaciones = evaluarCambiosBloqueados(p.bloqueadas, p.filasNuevas, alcanceDeCierres(p.cierresDelViejo));
  if (violaciones.length > 0) {
    const muestra = violaciones.slice(0, 3).map((v) => v.detalle).join("; ");
    const resto = violaciones.length > 3 ? ` y ${violaciones.length - 3} más` : "";
    return { ok: false, motivo: "cuentas_en_firme", violaciones, mensaje: `El balance nuevo cambia cuentas conciliadas: ${muestra}${resto}. Para reemplazarlo, sus cuentas en firme tienen que ser idénticas en saldo final y homologación.` };
  }
  for (const t of p.tercero) {
    if (!t.conciliado) continue; // el balance conciliado no tenía detalle por tercero
    if (!t.nuevo) {
      return { ok: false, motivo: "sin_detalle_tercero", mensaje: `${t.cierre.moduloCodigo} · ${t.cierre.periodo} se concilió con detalle por tercero y el balance nuevo no lo conserva: carga uno «Por terceros».` };
    }
    const enFirme = new Set(p.bloqueadas.filter((b) => b.cierreId === t.cierre.id).map((b) => b.cuenta8));
    const difieren = diferenciasTerceroEnFirme(enFirme, t.conciliado, t.nuevo);
    if (difieren.length > 0) {
      return { ok: false, motivo: "detalle_tercero", mensaje: `El detalle por tercero de ${difieren.slice(0, 3).join(", ")}${difieren.length > 3 ? ` y ${difieren.length - 3} más` : ""} cambia frente a lo conciliado en ${t.cierre.moduloCodigo} · ${t.cierre.periodo}.` };
    }
  }
  return { ok: true, cuentasEnFirme: new Set(p.bloqueadas.map((b) => b.cuenta8)).size };
}

/** Texto de la confirmación y de la auditoría. */
export function descripcionReemplazo(p: {
  viejo: { id: number; version: string; nombre: string };
  nuevo: { id: number; version: string; nombre: string };
  cierres: readonly Pick<CierreParaReemplazo, "moduloCodigo" | "periodo" | "moduloDatoEncabezadoId">[];
  cuentasEnFirme: number;
}): string {
  const cierres = p.cierres.map((c) => `${c.moduloCodigo} · ${c.periodo} (cargue #${c.moduloDatoEncabezadoId})`).join("; ");
  return `${p.viejo.nombre} ${p.viejo.version} (#${p.viejo.id}) → ${p.nuevo.nombre} ${p.nuevo.version} (#${p.nuevo.id}) · conciliación de ${cierres} · ${p.cuentasEnFirme} cuenta(s) en firme idéntica(s)`;
}
