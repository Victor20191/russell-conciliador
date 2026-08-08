/** Pestañas del detalle del balance. Vive en un módulo NEUTRO (sin `"use client"`)
 *  porque lo comparten el RSC —que resuelve `?tab=` al renderizar— y el componente
 *  cliente que las pinta: una función exportada desde un archivo cliente no se
 *  puede invocar desde el servidor. */
export type Tab = "breakdown" | "validations" | "versions" | "clases" | "prevalidador";

const TAB_POR_PARAMETRO: Record<string, Tab> = {
  detalle: "breakdown",
  validaciones: "validations",
  versiones: "versions",
  clases: "clases",
  prevalidador: "prevalidador",
};

/** `?tab=versiones` abre el detalle directamente en la bitácora de versiones
 *  (así el listado de `/balance` puede enlazar a las versiones del período). */
export function tabDesdeParametro(valor: string | undefined): Tab | null {
  return valor ? TAB_POR_PARAMETRO[valor] ?? null : null;
}
