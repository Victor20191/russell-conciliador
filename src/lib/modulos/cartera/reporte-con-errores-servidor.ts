import "server-only";

// Lee del staging las filas que el archivo trae como documentos y evalúa el «reporte con errores»
// (`reporte-con-errores.ts`). Lo usan el borrador (para avisar y deshabilitar «Cargar») y la acción
// que lo aprueba (que no confía en el navegador).
import prisma from "@/lib/prisma";
import { fechaCorteSugeridaDe } from "@/lib/fecha-cargue";
import { fechaISO } from "./fecha-corte";
import { reporteConErroresCartera, type ReporteConErrores } from "./reporte-con-errores";

/**
 * Fecha de corte del borrador: la que declaró quien cargó (spec del lote) o, por defecto, la que se
 * sugiere para el período (fin de mes, u hoy si es el mes en curso). La misma regla de la promoción.
 */
export function fechaCorteDelBorrador(specJson: unknown, periodo: string | null): string | null {
  const declarada = fechaISO((specJson as { fechaCorte?: unknown } | null)?.fechaCorte);
  return declarada ?? (periodo ? fechaCorteSugeridaDe(periodo) : null);
}

/**
 * Las filas que el lector tomó como documentos (`tipo_fila = movimiento`), aunque se hayan omitido, y
 * las que alguien reclasificó a mano: ni omitir ni reclasificar quita el bloqueo.
 */
export async function reporteConErroresDelLote(loteId: string, fechaCorte: string | null): Promise<ReporteConErrores> {
  const filas = await prisma.moduloImportacionStaging.findMany({
    where: { loteId, OR: [{ tipoFila: "movimiento" }, { tipoFilaForzado: { not: null } }] },
    select: { filaNum: true, valor: true, datos: true },
    orderBy: { filaNum: "asc" },
  });
  return reporteConErroresCartera(
    filas.map((f) => ({ filaNum: f.filaNum, valor: Number(f.valor), datos: (f.datos ?? {}) as Record<string, unknown> })),
    fechaCorte,
  );
}
