import "server-only";

// Lectura de las alertas que exigen comentario y de sus comentarios (`comentarios-alertas.ts`).
// La comparten la página del cargue y el cierre de la conciliación, para que el cierre evalúe
// exactamente lo que se ve en Novedades.
import prisma from "@/lib/prisma";
import { fmtDateTime } from "@/lib/format";
import type { DescriptorModulo } from "./descriptores";
import type { FilaValidable } from "./validaciones";
import {
  alertasQueExigenComentario,
  anotarAlertasConComentarios,
  esTipoAlertaComentario,
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

/** Las filas del cargue sobre las que se calculan las alertas (las mismas de Novedades). */
export async function filasValidablesDelCargue(encabezadoId: number): Promise<FilaValidable[]> {
  const filas = await prisma.moduloDatoDetalle.findMany({
    where: { encabezadoId },
    select: { filaNum: true, clasificador: true, datos: true },
    orderBy: { filaNum: "asc" },
  });
  return filas.map((f) => ({ filaNum: f.filaNum, clasificador: f.clasificador, datos: (f.datos ?? {}) as Record<string, unknown> }));
}

/**
 * Alertas del cargue que exigen comentario, con el comentario del período y su estado. Vacío en
 * los módulos que no declaran `alertasConComentario`. `filas` evita releer el detalle cuando quien
 * llama ya lo tiene.
 */
export async function alertasConComentarioDelCargue(
  descriptor: DescriptorModulo,
  encabezado: { id: number; clienteId: number; moduloCodigo: string; periodo: string },
  filas?: FilaValidable[],
): Promise<AlertaConComentario[]> {
  if (!descriptor.alertasConComentario?.length) return [];
  const alertas = alertasQueExigenComentario(descriptor, filas ?? (await filasValidablesDelCargue(encabezado.id)));
  if (alertas.length === 0) return [];
  const comentarios = await comentariosAlertasDelPeriodo(encabezado);
  return anotarAlertasConComentarios(alertas, comentarios);
}
