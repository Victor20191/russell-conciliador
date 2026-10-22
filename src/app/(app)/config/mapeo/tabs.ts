/** Pestañas del Plan Estándar Russell. Vive en un módulo NEUTRO (sin `"use client"`) para que la
 *  ayuda en pantalla (`src/lib/ayuda`) use los mismos identificadores que la pantalla. */
export const TABS_PLAN_RUSSELL = ["puc", "standard"] as const;
export type TabPlanRussell = (typeof TABS_PLAN_RUSSELL)[number];
