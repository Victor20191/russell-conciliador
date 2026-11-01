/** Pestañas de una revisión de Retención en la fuente. Vive en un módulo NEUTRO (sin `"use client"`)
 *  para que la ayuda en pantalla (`src/lib/ayuda`) use los mismos identificadores que la pantalla. */
export const TABS_REVISION_RETENCION = ["formularios", "meses", "acumulado"] as const;
export type TabRevisionRetencion = (typeof TABS_REVISION_RETENCION)[number];
