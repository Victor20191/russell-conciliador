import { createHash } from "node:crypto";
import type { CruceRetencionVista } from "./cruce";
import type { FilaOportunidad } from "./oportunidad";
import type { ResultadoPagos } from "./pagos";
import type { PeriodoRevision } from "./periodos-revision";

/**
 * Copia congelada de una revisión de Retención en la fuente en firme (pura). Guarda el resultado
 * completo tal como se evaluó al cerrar —períodos con sus formularios vigentes, cruce contable con
 * todos los terceros y sus marcas, oportunidad y pagos efectuados— en
 * `conciliacion_modulo_cierre.copia_congelada`. Mientras la revisión esté en firme la pantalla y el
 * Excel leen esta copia: una corrección del mismo año importada después (desde la revisión del
 * cierre, por ejemplo) no cambia lo que quedó en firme.
 */

export type CopiaRetencionV1 = {
  tipo: "retencion";
  version: 1;
  tomadaEn: string;
  periodos: PeriodoRevision[];
  cruce: CruceRetencionVista;
  oportunidad: FilaOportunidad[];
  pagos: ResultadoPagos;
  /** SHA-256 del contenido (sin la fecha): la auditoría del cierre la cita. */
  huella: string;
};

type Contenido = Pick<CopiaRetencionV1, "periodos" | "cruce" | "oportunidad" | "pagos">;

const huellaDe = (c: Contenido) => createHash("sha256").update(JSON.stringify([c.periodos, c.cruce, c.oportunidad, c.pagos])).digest("hex");

export function construirCopiaRetencion(c: Contenido & { tomadaEn: Date }): CopiaRetencionV1 {
  const contenido = { periodos: c.periodos, cruce: c.cruce, oportunidad: c.oportunidad, pagos: c.pagos };
  return { tipo: "retencion", version: 1, tomadaEn: c.tomadaEn.toISOString(), ...contenido, huella: huellaDe(contenido) };
}

/** La copia guardada, o null si no es una copia de Retención válida (falta o la alteraron). */
export function leerCopiaRetencion(valor: unknown): CopiaRetencionV1 | null {
  if (!valor || typeof valor !== "object") return null;
  const c = valor as Partial<CopiaRetencionV1>;
  if (c.tipo !== "retencion" || c.version !== 1 || !Array.isArray(c.periodos) || !Array.isArray(c.oportunidad) || !c.cruce || !c.pagos || typeof c.huella !== "string") return null;
  const copia = c as CopiaRetencionV1;
  return huellaDe(copia) === copia.huella ? copia : null;
}
