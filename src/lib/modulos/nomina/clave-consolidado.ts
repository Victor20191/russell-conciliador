// Clave de un renglón del CONSOLIDADO de Nómina: el concepto y, cuando el archivo trae centro
// de costo / clase, el agrupador. La pestaña «Consolidado», sus acciones de guardado y las
// anclas de comentarios llavean por un solo string (el `clasificador`), así que el par se
// serializa en uno con un separador que ningún código de concepto usa, y el servidor lo parte.
//
// Puro. Pruebas en `clave-consolidado.test.ts`.

/** «1 ∥ GYA»: concepto 1 en el centro GYA. Sin agrupador la clave es el concepto a secas. */
export const SEPARADOR_AGRUPADOR = " ∥ ";

export function claveConsolidado(clasificador: string, agrupador: string | null | undefined): string {
  const a = String(agrupador ?? "").trim();
  return a ? `${clasificador}${SEPARADOR_AGRUPADOR}${a}` : clasificador;
}

export function partirClaveConsolidado(clave: string): { clasificador: string; agrupador: string } {
  const t = String(clave ?? "");
  const i = t.indexOf(SEPARADOR_AGRUPADOR);
  if (i < 0) return { clasificador: t.trim(), agrupador: "" };
  return { clasificador: t.slice(0, i).trim(), agrupador: t.slice(i + SEPARADOR_AGRUPADOR.length).trim() };
}
