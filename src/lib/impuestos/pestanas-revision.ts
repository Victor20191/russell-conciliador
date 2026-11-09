/**
 * Pestañas de una revisión de Impuestos · DIAN. Módulo NEUTRO (sin `"use client"` ni BD) para que la
 * pantalla, el descriptor de cada impuesto y la ayuda en pantalla usen los mismos identificadores.
 */
export const TABS_REVISION_IMPUESTO = ["formularios", "meses", "acumulado", "cruce", "oportunidad", "pagos", "novedades"] as const;
export type TabRevisionImpuesto = (typeof TABS_REVISION_IMPUESTO)[number];
