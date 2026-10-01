// Clave de un renglón del CONSOLIDADO de Nómina: el concepto y, cuando el archivo trae centro
// de costo / clase, el agrupador. La pestaña «Consolidado», sus acciones de guardado y las
// anclas de comentarios llavean por un solo string (el `clasificador`), así que el par se
// serializa en uno con un separador que ningún código de concepto usa, y el servidor lo parte.
//
// Desde el 30/Sep/2026 la clave lleva además la CUENTA CONTABLE que trae el archivo, cuando la
// fila trae una válida: un concepto registrado en dos cuentas son dos renglones, cada uno con su
// valor real. Un cargue sin columna de cuenta conserva sus claves de siempre.
//
// Puro. Pruebas en `clave-consolidado.test.ts`.

/** «1 ∥ GYA»: concepto 1 en el centro GYA. Sin agrupador la clave es el concepto a secas. */
export const SEPARADOR_AGRUPADOR = " ∥ ";

/** «1 ∥ GYA # 51050601»: el renglón del concepto 1, centro GYA, con esa cuenta del archivo. */
export const SEPARADOR_CUENTA = " # ";

// La cuenta se separa por la COLA: un centro con «#» en el nombre («PLANTA #2») no se confunde.
const CUENTA_AL_FINAL = / # (\d{6,})$/;

export function claveConsolidado(
  clasificador: string,
  agrupador: string | null | undefined,
  cuentaArchivo?: string | null,
): string {
  const a = String(agrupador ?? "").trim();
  const base = a ? `${clasificador}${SEPARADOR_AGRUPADOR}${a}` : clasificador;
  const cuenta = String(cuentaArchivo ?? "").trim();
  return cuenta ? `${base}${SEPARADOR_CUENTA}${cuenta}` : base;
}

export function partirClaveConsolidado(clave: string): { clasificador: string; agrupador: string; cuentaArchivo: string | null } {
  let t = String(clave ?? "").trim();
  const conCuenta = CUENTA_AL_FINAL.exec(t);
  const cuentaArchivo = conCuenta ? conCuenta[1] : null;
  if (conCuenta) t = t.slice(0, conCuenta.index).trim();
  const i = t.indexOf(SEPARADOR_AGRUPADOR);
  if (i < 0) return { clasificador: t.trim(), agrupador: "", cuentaArchivo };
  return { clasificador: t.slice(0, i).trim(), agrupador: t.slice(i + SEPARADOR_AGRUPADOR.length).trim(), cuentaArchivo };
}
