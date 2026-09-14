// HOJAS GEMELAS en un mismo libro — puro, sin BD.
//
// Un libro puede traer dos hojas con exactamente el mismo formato. A veces es legítimo
// (una hoja por sucursal o por mes) y a veces es una trampa: el ERP exportó la misma
// cartera dos veces con días de diferencia y quedaron las dos. En un archivo real de SAP,
// «Cartera» y «Cartera.» comparten encabezado, difieren en dos filas, y cargar la que viene
// primero —la desactualizada— metía 37,7 millones de más sin que ningún control interno lo
// notara: las dos hojas son coherentes consigo mismas.
//
// El motor no puede saber cuál es la buena, así que no bloquea: AVISA, para que quien carga
// confirme la hoja. Comparar el encabezado completo (no solo su comienzo) es lo que evita el
// falso positivo en los libros cuyas hojas se parecen pero no son la misma cosa: la hoja en
// dólares de un reporte trae una columna de tasa que la de pesos no tiene.
import type { CeldaCruda } from "@/lib/balance/extraccion/ingesta";
import { normalizarEncabezado } from "@/lib/balance/extraccion/huella";

export type HojaConEncabezado = {
  nombre: string;
  /** La fila de encabezado detectada en esa hoja. */
  encabezado: readonly CeldaCruda[];
};

export type GrupoHojasGemelas = {
  /** Nombres de las hojas que comparten encabezado, en el orden del libro. */
  hojas: string[];
};

/** Grupos de dos o más hojas cuyo encabezado normalizado es idéntico. */
export function hojasConMismoEncabezado(hojas: readonly HojaConEncabezado[]): GrupoHojasGemelas[] {
  const porEncabezado = new Map<string, string[]>();
  for (const h of hojas) {
    const clave = normalizarEncabezado([...h.encabezado]);
    if (!clave) continue; // una hoja sin encabezado utilizable no es gemela de nadie
    const grupo = porEncabezado.get(clave) ?? [];
    grupo.push(h.nombre);
    porEncabezado.set(clave, grupo);
  }
  return [...porEncabezado.values()]
    .filter((grupo) => grupo.length > 1)
    .map((grupo) => ({ hojas: grupo }));
}

/**
 * Aviso para quien carga, o `null` si la hoja elegida no tiene gemelas. Nombra las otras
 * hojas: la decisión es del usuario y necesita saber contra qué está eligiendo.
 */
export function avisoHojasGemelas(
  grupos: readonly GrupoHojasGemelas[],
  hojaElegida: string | null,
): string | null {
  if (!hojaElegida) return null;
  const grupo = grupos.find((g) => g.hojas.includes(hojaElegida));
  if (!grupo) return null;
  const otras = grupo.hojas.filter((h) => h !== hojaElegida).map((h) => `«${h}»`);
  return `El libro trae ${otras.length === 1 ? "otra hoja" : "otras hojas"} con el mismo formato que «${hojaElegida}»: `
    + `${otras.join(", ")}. Si es la misma cartera exportada en otro momento, confirma que estás `
    + "cargando la versión vigente: los totales de cada hoja cuadran por sí solos y ningún control "
    + "detectaría que elegiste la equivocada.";
}
