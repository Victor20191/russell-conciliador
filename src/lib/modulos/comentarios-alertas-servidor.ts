import "server-only";

// Lectura de las alertas que exigen comentario y de sus comentarios (`comentarios-alertas.ts`).
// La comparten la página del cargue y el cierre de la conciliación, para que el cierre evalúe
// exactamente lo que se ve en Novedades.
import prisma from "@/lib/prisma";
import { fmtDateTime } from "@/lib/format";
import { fechaCalendarioISO } from "@/lib/fecha-hora";
import { getUmbralesAlertas } from "@/lib/parametros/umbrales";
import type { DescriptorModulo } from "./descriptores";
import type { FilaValidable } from "./validaciones";
import { validarAuxiliarTercero, type FilaValidacionTercero, type ValidacionesTercero } from "./cartera/validaciones-tercero";
import type { ResumenCruceTerceroCartera } from "./cartera/cruce-tercero-cartera";
import { leerFormatosCartera } from "./cartera/tipo-formato";
import { finDePeriodo } from "./cartera/fecha-corte";
import {
  alertasQueExigenComentario,
  alertasTerceroQueExigenComentario,
  anotarAlertasConComentarios,
  esTipoAlertaComentario,
  type AlertaComentable,
  type AlertaConComentario,
  type ComentarioAlerta,
} from "./comentarios-alertas";

/** Los comentarios de las alertas del período (por tipo). */
export async function comentariosAlertasDelPeriodo(p: { clienteId: number; moduloCodigo: string; periodo: string }): Promise<ComentarioAlerta[]> {
  const filas = await prisma.comentarioAlertaModulo.findMany({
    where: { clienteId: p.clienteId, moduloCodigo: p.moduloCodigo, periodo: p.periodo },
    select: { tipo: true, comentario: true, referencias: true, valor: true, comentadoPor: true, comentadoEn: true },
  });
  return filas
    .filter((f) => esTipoAlertaComentario(f.tipo))
    .map((f) => ({
      tipo: f.tipo as ComentarioAlerta["tipo"],
      comentario: f.comentario,
      referencias: f.referencias,
      valor: Number(f.valor),
      comentadoPor: f.comentadoPor,
      comentadoEn: fmtDateTime(f.comentadoEn),
    }));
}

/** Las filas del cargue sobre las que se calculan las alertas de Inventarios (las mismas de Novedades). */
export async function filasValidablesDelCargue(encabezadoId: number): Promise<FilaValidable[]> {
  const filas = await prisma.moduloDatoDetalle.findMany({
    where: { encabezadoId },
    select: { filaNum: true, clasificador: true, datos: true },
    orderBy: { filaNum: "asc" },
  });
  return filas.map((f) => ({ filaNum: f.filaNum, clasificador: f.clasificador, datos: (f.datos ?? {}) as Record<string, unknown> }));
}

/** Lo del encabezado que necesitan las validaciones del auxiliar por tercero. */
export type EncabezadoValidacionTercero = {
  periodo: string;
  fechaCorte: Date | string | null;
  nivelSaldo: string | null;
  formatosCartera: unknown;
};

/** Fecha de corte del cargue: la declarada o, si no, el fin del período. */
export function fechaCorteDelCargue(encabezado: Pick<EncabezadoValidacionTercero, "periodo" | "fechaCorte">): string | null {
  return encabezado.fechaCorte ? fechaCalendarioISO(encabezado.fechaCorte) : finDePeriodo(encabezado.periodo);
}

/**
 * Cartera y CxP: las validaciones del auxiliar por tercero de un cargue (las de Novedades), sobre su
 * detalle y su cruce por tercero. El umbral de saldo contrario es «Saldo contrario por tercero».
 */
export async function validacionesTerceroDelCargue(p: {
  descriptor: DescriptorModulo;
  encabezado: EncabezadoValidacionTercero;
  filas: readonly FilaValidacionTercero[];
  cruce: ResumenCruceTerceroCartera | null;
}): Promise<ValidacionesTercero> {
  const nivel = p.encabezado.nivelSaldo;
  return validarAuxiliarTercero({
    filas: p.filas,
    cruce: p.cruce,
    naturaleza: p.descriptor.crucePorTercero.naturaleza,
    umbralNaturaleza: (await getUmbralesAlertas()).tercero_naturaleza,
    fechaCorte: fechaCorteDelCargue(p.encabezado),
    // Tipo de formato de cada archivo: decide qué controles aplican y cuáles no se pudieron
    // validar. Los cargues anteriores (null) se deducen de sus filas.
    nivelImputable: nivel === "documento" || nivel === "tercero" ? nivel : undefined,
    formatos: leerFormatosCartera(p.encabezado.formatosCartera),
  });
}

/** Para el cierre: lee el encabezado y el detalle del cargue y calcula las validaciones del auxiliar. */
export async function cargarValidacionesTercero(
  descriptor: DescriptorModulo,
  encabezadoId: number,
  cruce: ResumenCruceTerceroCartera | null,
): Promise<ValidacionesTercero | null> {
  const [encabezado, filas] = await Promise.all([
    prisma.moduloDatoEncabezado.findUnique({
      where: { id: encabezadoId },
      select: { periodo: true, fechaCorte: true, nivelSaldo: true, formatosCartera: true },
    }),
    prisma.moduloDatoDetalle.findMany({
      where: { encabezadoId },
      select: { filaNum: true, valor: true, imputable: true, nitCanonico: true, datos: true, nivel: true },
      orderBy: { filaNum: "asc" },
    }),
  ]);
  if (!encabezado) return null;
  return validacionesTerceroDelCargue({
    descriptor,
    encabezado,
    filas: filas.map((f) => ({ ...f, valor: Number(f.valor), datos: (f.datos ?? {}) as Record<string, unknown> })),
    cruce,
  });
}

/**
 * Alertas del cargue que exigen comentario, con el comentario del período y su estado. Vacío en
 * los módulos que no declaran `alertasConComentario`. Inventarios las calcula de sus filas (`filas`
 * evita releer el detalle); Cartera y CxP, de las validaciones del auxiliar por tercero.
 */
export async function alertasConComentarioDelCargue(
  descriptor: DescriptorModulo,
  encabezado: { id: number; clienteId: number; moduloCodigo: string; periodo: string },
  fuente?: { filas?: FilaValidable[]; validacionesTercero?: ValidacionesTercero | null },
): Promise<AlertaConComentario[]> {
  if (!descriptor.alertasConComentario?.length) return [];
  let alertas: AlertaComentable[];
  if (descriptor.crucePorTercero.detalleTercero) {
    if (!fuente?.validacionesTercero) return [];
    alertas = alertasTerceroQueExigenComentario(descriptor, fuente.validacionesTercero);
  } else {
    alertas = alertasQueExigenComentario(descriptor, fuente?.filas ?? (await filasValidablesDelCargue(encabezado.id)));
  }
  if (alertas.length === 0) return [];
  const comentarios = await comentariosAlertasDelPeriodo(encabezado);
  return anotarAlertasConComentarios(alertas, comentarios);
}
