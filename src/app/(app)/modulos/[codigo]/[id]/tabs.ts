/** Pestañas del detalle de un cargue de módulo. Vive en un módulo NEUTRO (sin `"use client"`) para
 *  que la ayuda en pantalla (`src/lib/ayuda`) use los mismos identificadores que la pantalla. */
export const TABS_CARGUE = ["consolidado", "detalle", "cruce", "subcuenta", "cruceTercero", "novedades", "versiones"] as const;
export type TabCargue = (typeof TABS_CARGUE)[number];
