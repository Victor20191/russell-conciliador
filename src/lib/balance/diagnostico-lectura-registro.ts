// Persistencia BEST-EFFORT de la huella diagnóstica de lectura (patrón `logAudit`/
// `registrarConsumoIA`: NUNCA tumba la lectura/confirmación si falla). Server-only.
import prisma from "@/lib/prisma";
import type { DiagnosticoLectura } from "./diagnostico-lectura";

type RegistroInicial = {
  loteId: string;
  clienteId?: number | null;
  archivoNombre: string;
  modo?: string | null;
  formato?: string | null;
  confianza?: number | null;
  diag: DiagnosticoLectura;
};

/** Toma INICIAL: al leer el balance, antes de cualquier edición manual. */
export async function registrarDiagnosticoInicial(r: RegistroInicial): Promise<void> {
  try {
    await prisma.balanceLecturaDiagnostico.create({
      data: {
        loteId: r.loteId,
        clienteId: r.clienteId ?? null,
        archivoNombre: r.archivoNombre,
        modo: r.modo ?? null,
        formato: r.formato ?? null,
        filas: r.diag.filas,
        movimientos: r.diag.movimientos,
        cuadradoInicial: r.diag.cuadrado,
        resultado: "borrador",
        heuristicas: { ...r.diag, confianza: r.confianza ?? null },
      },
    });
  } catch {
    /* best-effort: la medición nunca debe tumbar la lectura */
  }
}

type CierreDiagnostico = {
  loteId: string;
  resultado: "cargado" | "descartado";
  cuadradoFinal?: boolean | null;
  manual: { omitidas: number; reparentadas: number; desacopladas: number };
};

/** Toma FINAL: al confirmar o descartar. Registra el resultado y cuánta mano metió el
 *  usuario. La huella `heuristicas` se conserva de la toma inicial (rendimiento del
 *  modelo automático), que es lo relevante para la decisión de convergencia. */
export async function cerrarDiagnostico(c: CierreDiagnostico): Promise<void> {
  try {
    await prisma.balanceLecturaDiagnostico.updateMany({
      where: { loteId: c.loteId },
      data: {
        resultado: c.resultado,
        cuadradoFinal: c.cuadradoFinal ?? null,
        manualOmitidas: c.manual.omitidas,
        manualReparentadas: c.manual.reparentadas,
        manualDesacopladas: c.manual.desacopladas,
      },
    });
  } catch {
    /* best-effort */
  }
}

/** Acumula la intervención manual que NO deja marca durable en staging: reclasificar
 *  (agrupadora↔movimiento). Se llama al APLICAR los cambios del borrador (los otros
 *  contadores se toman del staging al cerrar). */
export async function acumularIntervencionManual(
  loteId: string,
  delta: { reclasificadas?: number },
): Promise<void> {
  const reclasificadas = delta.reclasificadas ?? 0;
  if (reclasificadas === 0) return;
  try {
    await prisma.balanceLecturaDiagnostico.updateMany({
      where: { loteId },
      data: { manualReclasificadas: { increment: reclasificadas } },
    });
  } catch {
    /* best-effort */
  }
}
