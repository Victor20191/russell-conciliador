// Ventana de la grilla del archivo para la lectura por ejemplo: un tramo de filas con su número
// físico y la letra real de cada columna, y —si hay una lectura en curso— qué productos y qué
// problemas caen en ese tramo. El texto va tal cual (los tramos que el usuario seleccione se
// miden sobre él) y el servidor lo vuelve a leer del archivo al deducir. Puro.
import type { CeldaCruda, GridHoja } from "@/lib/balance/extraccion/ingesta";
import { MODULOS_IMPORT } from "../descriptores";
import type { SpecModulo } from "../extraccion/esquema";
import { ejecutarLecturaEstructurada, ROLES_LECTURA_INVENTARIO, type IncidenciaLectura, type RolLecturaInventario } from "../extraccion/lectura-estructurada";
import { transformarModulo } from "../extraccion/transformar";
import { normalizarSpecModuloArchivo } from "../perfil-modulo";

export const FILAS_VENTANA = 80;
export const MAX_FILAS_VENTANA = 200;
export const MAX_COLUMNAS_VENTANA = 60;
export const MAX_TEXTO_CELDA_VENTANA = 2_000;

export type CeldaVentana = { t: string; truncada?: true; negrita?: true };
export type TrazaVentana = {
  tipo: "registro" | "total" | "subtotal";
  filaAncla: number;
  filasOrigen: number[];
  campos: { rol: RolLecturaInventario; valor: string | null; fuentes: { fila: number; columna: number; inicio: number; fin: number }[] }[];
};
export type VentanaMuestra = {
  hojas: { nombre: string; oculta: boolean; filas: number }[];
  hoja: string;
  /** Columnas vacías a la izquierda que la grilla omite: la columna 1 de la grilla es la columnaInicial + 1 de Excel. */
  columnaInicial: number;
  columnas: number;
  columnasTotales: number;
  totalFilas: number;
  indiceDesde: number;
  filas: { fila: number; celdas: CeldaVentana[] }[];
  lectura: null | {
    trazas: TrazaVentana[];
    /** Problemas en el tramo visible, para pintarlos en la grilla. */
    incidencias: IncidenciaLectura[];
    /** Todos los problemas (con tope), para navegar hasta ellos. */
    todas: IncidenciaLectura[];
    registros: number;
  };
};

const texto = (v: CeldaCruda | undefined) => (v == null ? "" : String(v));

export function construirVentanaMuestra(
  hojas: readonly GridHoja[],
  opciones: { hoja?: string | null; filaDesde?: number | null; cantidad?: number | null; spec?: SpecModulo | null },
): VentanaMuestra | null {
  const hoja = hojas.find((h) => h.nombre === opciones.hoja) ?? hojas.find((h) => !h.oculta) ?? hojas[0];
  if (!hoja) return null;
  const filaFisica = (i: number) => hoja.filasFisicas?.[i] ?? i + 1;
  const cantidad = Math.min(MAX_FILAS_VENTANA, Math.max(1, Math.trunc(opciones.cantidad ?? FILAS_VENTANA)));
  let indiceDesde = 0;
  if (opciones.filaDesde && opciones.filaDesde > 1) {
    const i = hoja.filas.findIndex((_, n) => filaFisica(n) >= opciones.filaDesde!);
    indiceDesde = i < 0 ? Math.max(0, hoja.filas.length - cantidad) : i;
  }
  const hasta = Math.min(hoja.filas.length, indiceDesde + cantidad);
  const columnasTotales = hoja.filas.reduce((m, f) => Math.max(m, f.length), 0);
  const columnas = Math.min(columnasTotales, MAX_COLUMNAS_VENTANA);
  const filas: VentanaMuestra["filas"] = [];
  for (let i = indiceDesde; i < hasta; i++) {
    const celdas: CeldaVentana[] = [];
    for (let c = 0; c < columnas; c++) {
      const t = texto(hoja.filas[i]?.[c]);
      celdas.push({
        t: t.length > MAX_TEXTO_CELDA_VENTANA ? t.slice(0, MAX_TEXTO_CELDA_VENTANA) : t,
        ...(t.length > MAX_TEXTO_CELDA_VENTANA ? { truncada: true as const } : {}),
        ...(hoja.negrita?.[i]?.[c] ? { negrita: true as const } : {}),
      });
    }
    filas.push({ fila: filaFisica(i), celdas });
  }
  const primera = filas[0]?.fila ?? 0;
  const ultima = filas.at(-1)?.fila ?? 0;
  const enTramo = (f: number) => f >= primera && f <= ultima;
  return {
    hojas: hojas.map((h) => ({ nombre: h.nombre, oculta: h.oculta === true, filas: h.filas.length })),
    hoja: hoja.nombre,
    columnaInicial: hoja.columnaInicial ?? 0,
    columnas,
    columnasTotales,
    totalFilas: hoja.filas.length,
    indiceDesde,
    filas,
    lectura: opciones.spec && opciones.spec.hoja === hoja.nombre ? lecturaEnTramo(hoja, opciones.spec, enTramo) : null,
  };
}

function lecturaEnTramo(hoja: GridHoja, spec: SpecModulo, enTramo: (fila: number) => boolean): VentanaMuestra["lectura"] {
  if (spec.lecturaEstructurada) {
    const r = ejecutarLecturaEstructurada(hoja, spec.lecturaEstructurada, spec.primeraFilaDatos);
    return {
      trazas: r.trazas.filter((t) => t.filasOrigen.some(enTramo) || t.campos.some((c) => c.fuentes.some((f) => enTramo(f.fila)))).map((t) => ({
        tipo: t.tipo, filaAncla: t.filaAncla, filasOrigen: t.filasOrigen,
        campos: t.campos.map((c) => ({ rol: c.rol, valor: c.valor == null ? null : String(c.valor), fuentes: c.fuentes.map(({ fila, columna, inicio, fin }) => ({ fila, columna, inicio, fin })) })),
      })),
      incidencias: r.incidencias.filter((i) => enTramo(i.fila)),
      todas: r.incidencias,
      registros: r.trazas.filter((t) => t.tipo === "registro").length,
    };
  }
  // Lectura por columnas: cada fila que queda en el detalle, con la celda de cada campo.
  const desplazamiento = hoja.columnaInicial ?? 0;
  const lectura = transformarModulo(MODULOS_IMPORT.INV, normalizarSpecModuloArchivo(MODULOS_IMPORT.INV, spec), hoja);
  const porFila = new Map(hoja.filas.map((f, i) => [hoja.filasFisicas?.[i] ?? i + 1, f]));
  const trazas: TrazaVentana[] = [];
  for (const f of lectura.filas) {
    if (!enTramo(f.filaNum) || (f.tipoFila !== "movimiento" && f.tipoFila !== "total")) continue;
    const cruda = porFila.get(f.filaNum) ?? [];
    trazas.push({
      tipo: f.tipoFila === "total" ? "total" : "registro",
      filaAncla: f.filaNum,
      filasOrigen: [f.filaNum],
      campos: ROLES_LECTURA_INVENTARIO.filter((rol) => (spec.columnas[rol] ?? 0) > 0).map((rol) => {
        const t = texto(cruda[spec.columnas[rol] - 1]);
        return { rol, valor: t || null, fuentes: t ? [{ fila: f.filaNum, columna: spec.columnas[rol] + desplazamiento, inicio: 0, fin: t.length }] : [] };
      }),
    });
  }
  return { trazas, incidencias: [], todas: [], registros: lectura.filas.filter((f) => f.tipoFila === "movimiento").length };
}
