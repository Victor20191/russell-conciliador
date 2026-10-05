import "server-only";

import type { TransactionClient } from "@/lib/concurrency";
import { aprenderPatronConfirmado, type PatronAprendido } from "./aprender-confirmado";
import { leerPropuestaPatronDeLote } from "./propuesta-lote";

/**
 * Cartera, CxP, Ingresos, Activos fijos y Nómina: al confirmar un cargue cuya lectura se
 * configuró en la carga (el aplicativo no tenía patrón), guarda ese formato como versión
 * `validada_cliente` del aplicativo si el usuario lo pidió. Corre DENTRO de la transacción de la
 * promoción, después de marcar el original como cargado: guardar el patrón y confirmar el cargue
 * se confirman o revierten juntos. Inventarios va por `confirmarAprendizajeInventario`.
 */
export async function proponerPatronDesdeCarga(tx: TransactionClient, entrada: {
  loteId: string;
  encabezadoId: number;
  /** El spec del lote tal como se leyó (antes de purgar el lote). */
  specLote: unknown;
  aprender: boolean;
  usuario: { id: number | null; nombre: string | null };
}): Promise<PatronAprendido | null> {
  if (!entrada.aprender) return null;
  const propuesta = leerPropuestaPatronDeLote(entrada.specLote);
  if (!propuesta) return null;
  const original = await tx.archivoOriginalModulo.findUnique({
    where: { loteId: entrada.loteId },
    select: { id: true, clienteId: true, moduloCodigo: true, esAnexo: true },
  });
  if (!original || original.moduloCodigo === "INV") return null;
  const aprendido = await aprenderPatronConfirmado(tx, {
    moduloCodigo: original.moduloCodigo, originalId: original.id, clienteId: original.clienteId,
    erpId: propuesta.erpId, spec: propuesta.spec, encabezado: propuesta.encabezado, usuario: entrada.usuario,
  });
  // Un anexo se suma a una versión leída con otro formato: no la rebautiza.
  if (!original.esAnexo) {
    await tx.moduloDatoEncabezado.update({
      where: { id: entrada.encabezadoId },
      data: { patronVersionId: aprendido.id, patronCoincidencia: null },
    });
  }
  return aprendido;
}
