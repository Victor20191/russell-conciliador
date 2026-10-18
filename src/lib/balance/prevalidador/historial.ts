// Historial de revisiones del prevalidador de UN balance: cada aprobación y cada revocación
// que quedó en `prevalidador_revisiones_balance` (append-only), de la más reciente a la más
// antigua. Puro, sin BD: lo comparten la pestaña «Prevalidador» y la exportación a Excel.

import type { RevisionPrevalidadorVM } from "./contexto";

export type AccionRevisionPrevalidador = "aprobada" | "revocada";

export type RevisionHistorialVM = {
  id: number;
  accion: AccionRevisionPrevalidador;
  /** ISO; se presenta en hora de Colombia. */
  fecha: string;
  usuario: string;
  /** Justificación de la aprobación o motivo de la revocación. */
  comentario: string;
  /**
   * Solo la revisión más reciente, cuando es una aprobación: si sigue vigente o si el balance
   * cambió después y quedó desactualizada. Las anteriores ya no rigen: `null`.
   */
  situacion: "vigente" | "desactualizada" | null;
};

/** Lo que se lee de cada revisión: ni la huella ni la instantánea hacen falta aquí. */
export type RevisionHistorialCruda = {
  id: number;
  estado: string;
  justificacion: string;
  actor: string;
  creadoEn: Date;
};

export const SELECT_HISTORIAL_REVISION = {
  id: true,
  estado: true,
  justificacion: true,
  actor: true,
  creadoEn: true,
} as const;

/**
 * Arma el historial. `estadoActual` es el de la última revisión resuelto por el contexto del
 * prevalidador (huella incluida), y solo sirve para rotular esa última fila. Un estado que no
 * sea «aprobada» se lee como revocación, igual que en `contexto.ts`.
 */
export function construirHistorialRevisiones(
  filas: readonly RevisionHistorialCruda[],
  estadoActual: RevisionPrevalidadorVM["estado"],
): RevisionHistorialVM[] {
  const ordenadas = [...filas].sort(
    (a, b) => b.creadoEn.getTime() - a.creadoEn.getTime() || b.id - a.id,
  );
  return ordenadas.map((f, i) => {
    const accion: AccionRevisionPrevalidador = f.estado === "aprobada" ? "aprobada" : "revocada";
    const situacion =
      i === 0 && accion === "aprobada"
        ? estadoActual === "aprobada"
          ? "vigente"
          : estadoActual === "desactualizada"
            ? "desactualizada"
            : null
        : null;
    return {
      id: f.id,
      accion,
      fecha: f.creadoEn.toISOString(),
      usuario: f.actor,
      comentario: f.justificacion,
      situacion,
    };
  });
}

export function etiquetaAccionRevision(accion: AccionRevisionPrevalidador): string {
  return accion === "aprobada" ? "Aprobación" : "Revocación";
}

export function etiquetaSituacionRevision(situacion: RevisionHistorialVM["situacion"]): string | null {
  if (situacion === "vigente") return "Vigente";
  if (situacion === "desactualizada") return "Desactualizada";
  return null;
}
