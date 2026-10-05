import "server-only";
import { Prisma } from "@/generated/prisma/client";
import type { TransactionClient } from "@/lib/concurrency";
import { aprenderPatronInventarioConfirmado, type PatronAprendido } from "./patrones/aprender-confirmado";
import { leerAsistenciaInventario } from "./asistencia-inventario-estado";

/**
 * La estructura se aprende en la MISMA transacción que confirma sus datos. Con `aprender: false`
 * (el usuario desmarcó «Guardar este formato como patrón») no se crea ni se enlaza una versión
 * aprendida; un patrón que se aplicó se sigue enlazando. Devuelve la versión aprendida, si hubo.
 */
export async function confirmarAprendizajeInventario(tx: TransactionClient, entrada: {
  loteId: string;
  encabezadoId: number;
  usuario: { id: number | null; nombre: string | null };
  aprender?: boolean;
}): Promise<PatronAprendido | null> {
  const original = await tx.archivoOriginalModulo.findUnique({ where: { loteId: entrada.loteId } });
  if (!original || original.moduloCodigo !== "INV") return null;
  if (original.asistenciaJson == null) return null; // Cargues históricos y archivo manual mantienen su camino.
  const asistencia = leerAsistenciaInventario(original.asistenciaJson);
  if (!asistencia || asistencia.estado !== "borrador_preparado" || !asistencia.aplicado) {
    throw new Error("Resuelve la lectura pendiente y revisa el borrador antes de confirmar la carga.");
  }
  const lote = await tx.moduloImportacionLote.findUnique({ where: { loteId: entrada.loteId } });
  const revisionAplicada = (lote?.specJson as Record<string, unknown> | null)?.asistenciaRevision;
  if (original.estado !== "cargado" || original.encabezadoId !== entrada.encabezadoId
    || !lote || lote.clienteId !== original.clienteId || lote.moduloCodigo !== "INV"
    || original.revisionAsistencia !== asistencia.aplicado.revision
    || revisionAplicada !== asistencia.aplicado.revision) {
    throw new Error("La estructura del borrador cambió antes de confirmar su aprendizaje.");
  }
  let patronId = lote?.patronVersionId ?? null;
  if (asistencia.aplicado.origen === "patron" && (patronId == null || patronId !== asistencia.aplicado.versionBaseId)) {
    throw new Error("El patrón aplicado no corresponde a la lectura confirmada. Revisa el borrador.");
  }
  let aprendido: PatronAprendido | null = null;
  if (asistencia.aplicado.origen !== "patron" && entrada.aprender !== false) {
    aprendido = await aprenderPatronInventarioConfirmado(tx, {
      originalId: original.id, clienteId: original.clienteId, erpId: asistencia.erpId,
      spec: asistencia.aplicado.spec, encabezado: asistencia.aplicado.encabezado,
      versionBaseId: asistencia.aplicado.versionBaseId, usuario: entrada.usuario,
    });
    patronId = aprendido.id;
  }
  if (!original.esAnexo && patronId != null) {
    await tx.moduloDatoEncabezado.update({ where: { id: entrada.encabezadoId }, data: {
      patronVersionId: patronId,
      patronCoincidencia: asistencia.aplicado.origen === "patron" ? lote.patronCoincidencia : null,
    } });
  }
  await tx.archivoOriginalModulo.update({ where: { id: original.id }, data: {
    asistenciaJson: JSON.parse(JSON.stringify({ ...asistencia, estado: "confirmado", patronAprendidoId: patronId })) as Prisma.InputJsonValue,
  } });
  return aprendido;
}
