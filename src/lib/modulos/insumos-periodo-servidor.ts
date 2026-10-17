import "server-only";

// Insumos del cruce de UN período que se comparten entre meses o se leen en vivo: el Consolidado
// (memoria del cliente + asignación del período), las reglas del prevalidador, las clases por
// centro y la homologación de cuentas de Nómina, el umbral del cruce por tercero, la tolerancia de la
// cédula y las agrupadoras excluidas del balance. Con la conciliación del período EN FIRME salen de la copia congelada del
// cierre (`copia-cierre.ts`), así lo que se cambie desde otro mes no altera lo conciliado; si no, en
// vivo, como siempre. Una sola puerta para la página, el cruce, las acciones y el Excel.
import prisma from "@/lib/prisma";
import type { FilaCatalogoPrevalidador } from "@/lib/balance/prevalidador/catalogo";
import { getCatalogoPrevalidador } from "@/lib/parametros/prevalidador";
import { ESTADO_CIERRE_FIRME } from "@/lib/conciliacion/cuentas-bloqueo";
import { insumosDesdeCopia, leerCopiaCierre, type OrigenCopiaCierre } from "@/lib/conciliacion/copia-cierre";
import type { FilaAsignacionPeriodo } from "./asignacion-periodo";
import { cargarConsolidacionDelPeriodo, type FilaConsolidacionPeriodo } from "./asignacion-periodo-servidor";
import { leerHomologacionNomina } from "./insumos-periodo-lectura";
import type { AgruparPorNomina } from "./nomina/agrupar-por";
import type { ClaseNomina } from "./nomina/homologacion";

/** El cierre EN FIRME del período, con lo que el cruce necesita para fijarse a él. */
export type CierreFirmePeriodo = {
  id: number;
  /** El balance contra el que se concilió: con la conciliación en firme el cruce se fija a él. */
  balanceEncabezadoId: number;
  moduloDatoEncabezadoId: number;
  cerradoPor: string;
  cerradoEn: Date;
  /** De dónde salen los insumos: la copia (y su origen) o null si el cierre es anterior a ella. */
  copia: { origen: OrigenCopiaCierre; tomadaEn: string } | null;
  /** La copia existe pero no pasa la validación: el cruce se bloquea en vez de usar cifras dudosas. */
  copiaInvalida: boolean;
};

export type InsumosPeriodo = {
  cierre: CierreFirmePeriodo | null;
  consolidacion: { filas: FilaConsolidacionPeriodo[]; filasPeriodo: FilaAsignacionPeriodo[] };
  catalogoPrevalidador: FilaCatalogoPrevalidador[];
  /** Solo Nómina. */
  nomina: { reglasClase: Map<string, ClaseNomina>; mapeoCliente: Map<string, string> } | null;
  /** Del cierre: el umbral con que se cerró el cruce por tercero. null = el vigente. */
  umbralDescuadre: number | null;
  /** Del cierre: la tolerancia de la cédula con que se cerró. null = la vigente. */
  toleranciaCedula: number | null;
  /** Del cierre: desde qué diferencia del detalle de Activos fijos se exigía marca. null = la vigente. */
  toleranciaDetalleActivos: number | null;
  /** Del cierre: las cuentas agrupadoras que se excluyeron. null = calcularlas del balance. */
  agrupadorasExcluidas: Set<string> | null;
};

export async function cargarInsumosPeriodo(p: {
  clienteId: number;
  moduloCodigo: string;
  periodo: string;
  agruparPor?: AgruparPorNomina;
  esNomina: boolean;
}): Promise<InsumosPeriodo> {
  const cierreRow = await prisma.conciliacionModuloCierre.findFirst({
    where: { clienteId: p.clienteId, moduloCodigo: p.moduloCodigo, periodo: p.periodo, estado: ESTADO_CIERRE_FIRME },
    select: { id: true, balanceEncabezadoId: true, moduloDatoEncabezadoId: true, cerradoPor: true, cerradoEn: true, copiaCongelada: true },
  });
  const lectura = cierreRow ? leerCopiaCierre(cierreRow.copiaCongelada, p.moduloCodigo) : null;
  const cierre: CierreFirmePeriodo | null = cierreRow
    ? {
        id: cierreRow.id,
        balanceEncabezadoId: cierreRow.balanceEncabezadoId,
        moduloDatoEncabezadoId: cierreRow.moduloDatoEncabezadoId,
        cerradoPor: cierreRow.cerradoPor,
        cerradoEn: cierreRow.cerradoEn,
        copia: lectura?.ok ? { origen: lectura.copia.origen, tomadaEn: lectura.copia.tomadaEn } : null,
        copiaInvalida: lectura != null && !lectura.ok && lectura.motivo !== "ausente",
      }
    : null;

  if (lectura?.ok) {
    const desdeCopia = insumosDesdeCopia(lectura.copia);
    return {
      cierre,
      consolidacion: desdeCopia.consolidacion,
      catalogoPrevalidador: desdeCopia.catalogoPrevalidador,
      nomina: p.esNomina ? desdeCopia.nomina ?? { reglasClase: new Map(), mapeoCliente: new Map() } : null,
      umbralDescuadre: desdeCopia.umbralDescuadre,
      toleranciaCedula: desdeCopia.toleranciaCedula,
      toleranciaDetalleActivos: desdeCopia.toleranciaDetalleActivos,
      agrupadorasExcluidas: desdeCopia.agrupadorasExcluidas,
    };
  }

  // En vivo: período abierto, cierre anterior a la copia o copia inválida (el cruce se bloquea igual,
  // pero el Consolidado se sigue pudiendo consultar).
  const [consolidacion, catalogoPrevalidador, nomina] = await Promise.all([
    cargarConsolidacionDelPeriodo(p.clienteId, p.moduloCodigo, p.periodo, p.esNomina && p.agruparPor ? { agruparPor: p.agruparPor } : undefined),
    getCatalogoPrevalidador(),
    p.esNomina ? leerHomologacionNomina(prisma, p.clienteId, p.moduloCodigo) : Promise.resolve(null),
  ]);
  return { cierre, consolidacion, catalogoPrevalidador, nomina, umbralDescuadre: null, toleranciaCedula: null, toleranciaDetalleActivos: null, agrupadorasExcluidas: null };
}
