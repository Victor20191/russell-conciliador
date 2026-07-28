import { z } from "zod";
import { fmtContable, fmtDateTime } from "@/lib/format";
import {
  detectarManipulacionesRiesgosas,
  type FilaBorrador,
  type ManipulacionRiesgosaBorrador,
} from "./borrador";
import type { FilaStagingCorreccion } from "./correcciones";

export type RevisionReubicacionFuente = {
  filaNum: number;
  justificacion: string;
  revisadaPor: string | null;
  revisadaEn: string;
};

export type RevisionReubicacionBalance = RevisionReubicacionFuente & {
  codigo: string;
  nombre: string;
  monto: number;
  claseOrigen: string;
  claseDestino: string;
  destinoCodigo: string;
  destinoNombre: string;
};

const NOMBRE_CLASE: Readonly<Record<string, string>> = {
  "1": "Activo",
  "2": "Pasivo",
  "3": "Patrimonio",
  "4": "Ingresos",
  "5": "Gastos",
  "6": "Costos",
  "7": "Costos",
};

/** Etiqueta de la masa contable a la que pertenece un código PUC. */
export const nombreClaseContable = (clase: string): string =>
  NOMBRE_CLASE[clase] ?? `Clase ${clase}`;

/**
 * Forma persistida de la constancia (columna `reubicaciones_aprobadas`). Se valida
 * al LEER porque es JSON: un cargue viejo o un dato manipulado no debe tumbar la
 * pantalla del balance.
 */
const RevisionReubicacionBalanceSchema = z.object({
  filaNum: z.number().int(),
  justificacion: z.string(),
  revisadaPor: z.string().nullable().catch(null),
  revisadaEn: z.string(),
  codigo: z.string(),
  nombre: z.string(),
  monto: z.number(),
  claseOrigen: z.string(),
  claseDestino: z.string(),
  destinoCodigo: z.string(),
  destinoNombre: z.string(),
});

export function parsearRevisionesReubicacionBalance(
  valor: unknown,
): RevisionReubicacionBalance[] {
  const parsed = z.array(RevisionReubicacionBalanceSchema).safeParse(valor);
  return parsed.success ? parsed.data : [];
}

export function construirRevisionesReubicacionBalance(
  riesgos: ManipulacionRiesgosaBorrador[],
  revisiones: Iterable<RevisionReubicacionFuente>,
): RevisionReubicacionBalance[] {
  const revisionesPorFila = new Map(
    [...revisiones].map((revision) => [revision.filaNum, revision]),
  );
  const porFila = new Map<number, RevisionReubicacionBalance>();
  for (const riesgo of riesgos) {
    const revision = revisionesPorFila.get(riesgo.filaNum);
    if (!revision || porFila.has(riesgo.filaNum)) continue;
    porFila.set(riesgo.filaNum, {
      ...revision,
      codigo: riesgo.codigoCrudo || riesgo.codigo,
      nombre: riesgo.nombre,
      monto: riesgo.monto,
      claseOrigen: riesgo.claseOrigen,
      claseDestino: riesgo.claseDestino,
      destinoCodigo: riesgo.destino.codigoCrudo || riesgo.destino.codigo,
      destinoNombre: riesgo.destino.nombre,
    });
  }
  return [...porFila.values()].sort((a, b) => a.filaNum - b.filaNum);
}

export function evaluarRevisionesReubicacionStaging(
  filas: FilaStagingCorreccion[],
): {
  riesgosPendientes: ManipulacionRiesgosaBorrador[];
  revisionesAprobadas: RevisionReubicacionBalance[];
} {
  const riesgos = detectarManipulacionesRiesgosas(filas.map((fila) => ({
    ...fila,
    nivel: /^\d+$/.test(fila.codigo) ? fila.codigo.length : null,
    tipoFila: fila.tipoFila as FilaBorrador["tipoFila"],
    omitida: fila.omitida ?? undefined,
  })));
  const filasPorNumero = new Map(filas.map((fila) => [fila.filaNum, fila]));
  const riesgosPendientes = riesgos.filter((riesgo) => {
    const fila = filasPorNumero.get(riesgo.filaNum);
    return !fila?.justificacionReubicacion?.trim() || fila.reubicacionRevisadaEn == null;
  });
  const revisionesAprobadas = construirRevisionesReubicacionBalance(
    riesgos,
    filas.flatMap((fila) =>
      fila.justificacionReubicacion?.trim() && fila.reubicacionRevisadaEn
        ? [{
            filaNum: fila.filaNum,
            justificacion: fila.justificacionReubicacion,
            revisadaPor: fila.reubicacionRevisadaPor ?? null,
            revisadaEn: fila.reubicacionRevisadaEn.toISOString(),
          }]
        : [],
    ),
  );
  return { riesgosPendientes, revisionesAprobadas };
}

/**
 * Une las notas aclaratorias del cargue con las revisiones de reubicación en el
 * campo durable que ya acompaña a cada versión oficial del balance.
 */
export function construirNotasAprobacionBalance(
  comentarioPromocion: string | null | undefined,
  revisiones: RevisionReubicacionBalance[],
): string | null {
  const secciones: string[] = [];
  const comentario = comentarioPromocion?.trim();
  if (comentario) {
    secciones.push(`Nota aclaratoria adicional:\n${comentario}`);
  }
  if (revisiones.length > 0) {
    const lineas = revisiones.map((revision) => {
      const origen = nombreClaseContable(revision.claseOrigen);
      const destino = nombreClaseContable(revision.claseDestino);
      return [
        `• ${revision.codigo} ${revision.nombre}`,
        `${origen} → ${destino}`,
        `destino ${revision.destinoCodigo} ${revision.destinoNombre}`,
        `saldo ${fmtContable(revision.monto)}`,
        `justificación: ${revision.justificacion.trim()}`,
        `revisada por ${revision.revisadaPor ?? "—"} el ${fmtDateTime(revision.revisadaEn)}`,
      ].join(" · ");
    });
    secciones.push(`Reubicaciones contables aprobadas:\n${lineas.join("\n")}`);
  }
  return secciones.length > 0 ? secciones.join("\n\n") : null;
}
