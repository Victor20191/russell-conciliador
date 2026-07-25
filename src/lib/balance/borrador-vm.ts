// View-model del borrador a partir de las filas del staging. Compartido por la
// página de detalle (RSC) y la acción de diagnóstico asistido, para que el árbol,
// las validaciones y los hallazgos se calculen EXACTAMENTE igual en ambos lados.
import { calcularBalance, construirValidacionContable, conForzarHoja, type CuentaCruda, type ValidacionContable } from "./calcular";
import { marcarSubtotalesDuplicados, reclasificarRepetidos, reclasificarNoImputables } from "./extraccion/transformar";
import { construirArbolBorrador, reclasificarHuerfanas, marcarNoContables, corregirCodigosPlaceholder, type FilaBorrador, type NodoBorrador } from "./borrador";
import { esBalancePorTercero, colapsarTerceros, esBalancePorTerceroSufijo, consolidarTercerosPorSufijo, consolidarAuxiliaresRepetidos, marcarCuentaNit } from "./terceros";
import { marcarRelistadoGuiones } from "./relistado";
import { diagnosticarBorrador, type Hallazgo, type PartidaDobleInfo } from "./diagnostico";
import { contarFormasCodigo, contarCodigosRepetidos, contarDescuadres, type DiagnosticoLectura } from "./diagnostico-lectura";
import { UMBRALES_ALERTAS_DEFECTO, type UmbralesAlertas } from "./umbrales-alertas";

export type AgrupadoraRef = { codigo: string; nombre: string; saldoFinal: number; descuadre: number | null };
export type VistaBorrador = {
  arbol: NodoBorrador[];
  validacion: ValidacionContable;
  partidaDoble: PartidaDobleInfo;
  hallazgos: Hallazgo[];
  agrupadoras: AgrupadoraRef[]; // estructura compacta (sin hojas) para aterrizar la IA
  porTercero: boolean; // el archivo venía abierto por tercero → se colapsó el detalle
  relistadoGuiones: number; // nº de filas de re-listado con guiones colapsadas (0 = ninguno)
  filasOcultas: number; // nº de filas ocultas por defecto (pies/notas + cuentas de orden 8/9)
  clasesCorregidas: number; // nº de rollups de clase SIIGO con código placeholder corregido
  nitTachados: number; // nº de filas NIT (repiten su cuenta) tachadas (SIIGO por cuenta)
  diagnostico: DiagnosticoLectura; // huella observacional de la lectura (para medir)
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
 *
 * `opciones.umbrales` son los umbrales de alerta vigentes (/config/parametros).
 * Solo afectan a validaciones y hallazgos, nunca a la estructura del árbol ni a
 * los conteos del diagnóstico de lectura.
 */
export function construirVistaBorrador(
  filas: FilaBorrador[],
  opciones: { preservarAgrupadorasForzadas?: boolean; consolidarAuxiliares?: boolean; umbrales?: UmbralesAlertas } = {},
): VistaBorrador {
  const umbrales = opciones.umbrales ?? UMBRALES_ALERTAS_DEFECTO;
  // ¿Balance ABIERTO POR TERCERO? Se COLAPSA el detalle de tercero y se concilia por
  // CUENTA (lógica separada; los demás informes no se tocan). Al quitar los terceros,
  // las cuentas quedan sin hijos y `reclasificarHuerfanas` las vuelve imputables.
  // Tercero con NIT como FILA aparte (código = NIT) → se QUITA el detalle.
  const porTerceroNit = esBalancePorTercero(filas);
  const base0 = porTerceroNit ? colapsarTerceros(filas) : filas;
  // Tercero con NIT PEGADO en el sufijo del código (`120520-0-00-800011002`, sin fila
  // consolidada) → se CONSOLIDA (suma) por cuenta en una sola fila.
  const porTerceroSufijo = esBalancePorTerceroSufijo(base0);
  let base = porTerceroSufijo ? consolidarTercerosPorSufijo(base0) : base0;
  // SIIGO «por cuenta»: los rollups de clase traen un código placeholder gigante
  // (`800000000000000`) en vez de la clase. Se corrige PRIMERO (deriva la clase de los
  // hijos) para que el código real fluya por todo lo demás. MUTA base.
  const clasesCorregidas = corregirCodigosPlaceholder(base);
  // SIIGO «por cuenta»: cada cuenta viene como fila «Cuenta» (total) + filas «NIT» que
  // REPITEN su código. Se TACHAN las repeticiones (movimientos consecutivos de igual
  // código), conservando la «Cuenta». Seguro sin umbral (resetea en agrupadoras). MUTA base.
  const nitTachados = marcarCuentaNit(base);
  // Balance abierto por tercero por AUXILIAR (mismo código repetido, sin NIT en el código
  // ni fila «Cuenta» total): se consolida por auxiliar SOLO para la VISTA (opción del
  // cliente). La exportación y las métricas llaman SIN la opción → quedan intactas. Corre
  // DESPUÉS de `marcarCuentaNit` para no tocar los bloques «Cuenta+NIT» (ya tachados).
  const aux = opciones.consolidarAuxiliares ? consolidarAuxiliaresRepetidos(base) : { filas: base, consolidados: 0 };
  base = aux.filas;
  const porTercero = porTerceroNit || porTerceroSufijo || aux.consolidados > 0;
  const terceros = filas.length - base.length;
  // RE-LISTADO CON GUIONES: algunos ERP re-listan cada cuenta además del código plano
  // con notación de guiones («1105-05-04» + «*SIN NOMBRE*»). Esas filas redundantes (las
  // que ya tienen su equivalente plano) se MARCAN como omitidas: se siguen VIENDO
  // tachadas y el usuario puede rescatar alguna con «Incluir», pero NO cuentan. MUTA base.
  const relistadoGuiones = marcarRelistadoGuiones(base);

  reclasificarRepetidos(base);
  // Pie/total del reporte sin código («Total general», «Totales», marca del software)
  // mal clasificado como movimiento → «total»: si no, se cuelga de la última
  // agrupadora inflando su Δ y se cuenta al cargar. MUTA `base`.
  reclasificarNoImputables(base);
  // Filas que NO van al balance → se ocultan por defecto (omitida, tachadas),
  // rescatables con «Incluir»: pies/notas del ERP (código que no empieza por dígito:
  // «Procesado en: …», «<none>», «Total general») y cuentas de orden (clase 8/9).
  const filasOcultas = marcarNoContables(base);
  // Agrupadoras HUÉRFANAS (sin hijos, con saldo) → movimiento: son hojas imputables
  // que el ERP exportó sin desglose; si no, su saldo se pierde. MUTA `base`. El delta
  // fresco es fiable como señal (esta pasada no se aplica en la extracción).
  const nHuerfanas = reclasificarHuerfanas(base, opciones).length;
  const arbol = construirArbolBorrador(base);

  // Las filas OMITIDAS se conservan en el árbol (crudo) pero NO cuentan en los cálculos.
  const movimiento = base.filter((f) => f.tipoFila === "movimiento" && !f.omitida);
  const dup = marcarSubtotalesDuplicados(movimiento);
  const importReady: CuentaCruda[] = conForzarHoja(
    movimiento
      .filter((f) => !dup.has(f))
      .map((f) => ({ code: f.codigo, name: f.nombre, prevBalance: f.saldoInicial, balance: f.saldoFinal, debitos: f.debitos, creditos: f.creditos })),
  );
  const calc = calcularBalance(importReady, [], undefined, undefined, undefined, umbrales);

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
  const hallazgos = diagnosticarBorrador(validacion, arbol, partidaDoble, umbrales);
  const agrupadoras: AgrupadoraRef[] = aplanar(arbol)
    .filter((n) => n.tipoFila !== "movimiento")
    .map((n) => ({ codigo: n.codigo, nombre: n.nombre, saldoFinal: n.saldoFinal, descuadre: n.descuadre }));

  // HUELLA DIAGNÓSTICA (observacional): conteos que las pasadas ya produjeron. La forma
  // del código se mide sobre `filas` (crudo, antes de colapsar terceros) para reflejar el
  // formato real del archivo. No altera nada del cálculo.
  const formas = contarFormasCodigo(filas);
  const diagnostico: DiagnosticoLectura = {
    filas: filas.length,
    movimientos: base.filter((f) => f.tipoFila === "movimiento").length,
    agrupadoras: base.filter((f) => f.tipoFila === "agrupadora").length,
    totales: base.filter((f) => f.tipoFila === "total").length,
    porTercero,
    terceros,
    relistadoGuiones,
    huerfanas: nHuerfanas,
    repetidos: contarCodigosRepetidos(base),
    subtotalesDuplicados: dup.size,
    descuadres: contarDescuadres(arbol),
    codigoDigitos: formas.digitos,
    codigoGuiones: formas.guiones,
    codigoLetras: formas.letras,
    cuadrado: calc.balanced && calc.movimientosCuadran,
    partidaDobleDiff: calc.diffMov,
    ecuacionDiff: calc.diffCuadre,
  };

  return { arbol, validacion, partidaDoble, hallazgos, agrupadoras, porTercero, relistadoGuiones, filasOcultas, clasesCorregidas, nitTachados, diagnostico };
}
