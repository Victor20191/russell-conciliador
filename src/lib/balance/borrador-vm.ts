// View-model del borrador a partir de las filas del staging. Compartido por la
// página de detalle (RSC) y la acción de diagnóstico asistido, para que el árbol,
// las validaciones y los hallazgos se calculen EXACTAMENTE igual en ambos lados.
import { calcularBalance, construirValidacionContable, conForzarHoja, type CuentaCruda, type ValidacionContable } from "./calcular";
import { marcarSubtotalesDuplicados, reclasificarRepetidos, reclasificarNoImputables } from "./extraccion/transformar";
import { construirArbolBorrador, reclasificarHuerfanas, type FilaBorrador, type NodoBorrador } from "./borrador";
import { esBalancePorTercero, colapsarTerceros } from "./terceros";
import { diagnosticarBorrador, type Hallazgo, type PartidaDobleInfo } from "./diagnostico";

export type AgrupadoraRef = { codigo: string; nombre: string; saldoFinal: number; descuadre: number | null };
export type VistaBorrador = {
  arbol: NodoBorrador[];
  validacion: ValidacionContable;
  partidaDoble: PartidaDobleInfo;
  hallazgos: Hallazgo[];
  agrupadoras: AgrupadoraRef[]; // estructura compacta (sin hojas) para aterrizar la IA
  porTercero: boolean; // el archivo venía abierto por tercero → se colapsó el detalle
};

function aplanar(nodos: NodoBorrador[]): NodoBorrador[] {
  const out: NodoBorrador[] = [];
  const rec = (n: NodoBorrador) => { out.push(n); n.hijos.forEach(rec); };
  nodos.forEach(rec);
  return out;
}

/**
 * Construye el view-model del borrador. MUTA `filas` (reclasifica códigos
 * repetidos). Reproduce el mismo pipeline en la página y en la acción de IA.
 */
export function construirVistaBorrador(filas: FilaBorrador[]): VistaBorrador {
  // ¿Balance ABIERTO POR TERCERO? Se COLAPSA el detalle de tercero y se concilia por
  // CUENTA (lógica separada; los demás informes no se tocan). Al quitar los terceros,
  // las cuentas quedan sin hijos y `reclasificarHuerfanas` las vuelve imputables.
  const porTercero = esBalancePorTercero(filas);
  const base = porTercero ? colapsarTerceros(filas) : filas;

  reclasificarRepetidos(base);
  // Pie/total del reporte sin código («Total general», «Totales», marca del software)
  // mal clasificado como movimiento → «total»: si no, se cuelga de la última
  // agrupadora inflando su Δ y se cuenta al cargar. MUTA `base`.
  reclasificarNoImputables(base);
  // Agrupadoras HUÉRFANAS (sin hijos, con saldo) → movimiento: son hojas imputables
  // que el ERP exportó sin desglose; si no, su saldo se pierde. MUTA `base`.
  reclasificarHuerfanas(base);
  const arbol = construirArbolBorrador(base);

  // Las filas OMITIDAS se conservan en el árbol (crudo) pero NO cuentan en los cálculos.
  const movimiento = base.filter((f) => f.tipoFila === "movimiento" && !f.omitida);
  const dup = marcarSubtotalesDuplicados(movimiento);
  const importReady: CuentaCruda[] = conForzarHoja(
    movimiento
      .filter((f) => !dup.has(f))
      .map((f) => ({ code: f.codigo, name: f.nombre, prevBalance: f.saldoInicial, balance: f.saldoFinal, debitos: f.debitos, creditos: f.creditos })),
  );
  const calc = calcularBalance(importReady, []);

  const totalArchivo = (clase: string) => {
    const fs = base.filter((f) => f.codigo === clase && !f.omitida);
    return fs.length > 0 ? fs.reduce((s, f) => s + f.saldoFinal, 0) : null;
  };
  const costosArchivo = [totalArchivo("6"), totalArchivo("7")].filter((v): v is number => v != null);
  const validacion = construirValidacionContable(calc, {
    activo: totalArchivo("1"), pasivo: totalArchivo("2"), patrimonio: totalArchivo("3"),
    ingresos: totalArchivo("4"), gastos: totalArchivo("5"),
    costos: costosArchivo.length > 0 ? costosArchivo.reduce((s, v) => s + v, 0) : null,
  });
  const partidaDoble: PartidaDobleInfo = {
    debitos: calc.totalDebe,
    creditos: calc.totalHaber,
    diff: calc.diffMov,
    cuadra: calc.movimientosCuadran,
  };
  const hallazgos = diagnosticarBorrador(validacion, arbol, partidaDoble);
  const agrupadoras: AgrupadoraRef[] = aplanar(arbol)
    .filter((n) => n.tipoFila !== "movimiento")
    .map((n) => ({ codigo: n.codigo, nombre: n.nombre, saldoFinal: n.saldoFinal, descuadre: n.descuadre }));

  return { arbol, validacion, partidaDoble, hallazgos, agrupadoras, porTercero };
}
