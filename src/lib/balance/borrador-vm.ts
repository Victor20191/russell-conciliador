// View-model del borrador a partir de las filas del staging. Compartido por la
// página de detalle (RSC) y la acción de diagnóstico asistido, para que el árbol,
// las validaciones y los hallazgos se calculen EXACTAMENTE igual en ambos lados.
import { calcularBalance, construirValidacionContable, conForzarHoja, type CuentaCruda, type ValidacionContable } from "./calcular";
import { marcarSubtotalesDuplicados, reclasificarRepetidos, reclasificarNoImputables } from "./extraccion/transformar";
import { construirArbolBorrador, reclasificarHuerfanas, marcarNoContables, corregirCodigosPlaceholder, type FilaBorrador, type NodoBorrador } from "./borrador";
import { esBalancePorTercero, colapsarTerceros, esBalancePorTerceroSufijo, consolidarTercerosPorSufijo, consolidarAuxiliaresRepetidos, esBalancePorTerceroAuxiliar, marcarCuentaNit } from "./terceros";
import { marcarRelistadoGuiones } from "./relistado";
import { diagnosticarBorrador, type Hallazgo, type PartidaDobleInfo } from "./diagnostico";
import { contarFormasCodigo, contarCodigosRepetidos, contarDescuadres, type DiagnosticoLectura } from "./diagnostico-lectura";
import { UMBRALES_ALERTAS_DEFECTO, type UmbralesAlertas } from "./umbrales-alertas";

export type AgrupadoraRef = { codigo: string; nombre: string; saldoFinal: number; descuadre: number | null };
export type TotalesPyGArchivo = { ingresos: number; gastos: number; costos: number };
/** Total de CLASE leído del pie rotulado del archivo; null donde no haya pie. */
export type TotalesClaseArchivo = {
  activo: number | null; pasivo: number | null; patrimonio: number | null;
  ingresos: number | null; gastos: number | null; costos: number | null;
};
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
  filasContabilizadas: number[]; // filas efectivas usadas en validación, tras omisiones/duplicados/consolidación
  diagnostico: DiagnosticoLectura; // huella observacional de la lectura (para medir)
};

const normalizarEtiquetaRaiz = (valor: string): string =>
  valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/**
 * Algunos ERP numeran las SECCIONES visuales del estado de resultados con un
 * esquema propio (p. ej. 5=Costos, 6=Gastos, 7=Otros ingresos, 8=Otros gastos),
 * aunque las cuentas que cuelgan de ellas conservan sus códigos PUC reales.
 *
 * Este resolvedor solo reemplaza los TOTALES DEL ARCHIVO usados para comparar
 * la vista: no renombra cuentas ni altera el cálculo/persistencia PUC. Es
 * deliberadamente conservador: exige al menos una raíz inequívoca de cada
 * categoría y hace fallback si una raíz material 4–9 es ambigua o desconocida.
 */
// Pie de subtotal del ERP: la columna de código trae la etiqueta («TOTAL CAJA») en vez
// de un código. Misma detección que usa `borrador.ts` para decidir el layout
// summary-below; se repite aquí (una línea) en lugar de exportarla desde allí, para no
// tocar un archivo que está bajo cobertura de los golden.
const esPieTotal = (fila: FilaBorrador): boolean => /^\s*(?:sub)?total/i.test(fila.codigoCrudo ?? "");

// Palabra de cada clase. Las 6 y 7 comparten «costos»: el archivo las cierra por
// separado (ventas / producción) y la validación las suma, igual que el camino por dígito.
const PALABRA_DE_CLASE: Record<string, string> = {
  "1": "activo", "2": "pasivo", "3": "patrimonio",
  "4": "ingresos", "5": "gastos", "6": "costos", "7": "costos",
};
const PALABRAS_CLASE: { clave: string; re: RegExp }[] = [
  { clave: "activo", re: /\bactivos?\b/ },
  { clave: "pasivo", re: /\bpasivos?\b/ },
  { clave: "patrimonio", re: /\bpatrimonio\b/ },
  { clave: "ingresos", re: /\bingresos?\b/ },
  { clave: "gastos", re: /\bgastos?\b/ },
  { clave: "costos", re: /\bcostos?\b/ },
];

/**
 * ¿La etiqueta de un pie (ya sin el «TOTAL » inicial) cierra la clase indicada?
 *
 * Dos condiciones. ABRE con la palabra de la clase —no se exige el nombre exacto porque
 * un ERP real rotula la clase 7 como «TOTAL COSTOS DE PRODUCCIÓN O DE OPERACIÓN»— y no
 * menciona NINGUNA otra clase, que es lo que descarta «TOTAL PASIVO Y PATRIMONIO»: abre
 * con «pasivo» pero trae la suma de dos clases y tomarla como pasivo sería un error.
 */
const cierraLaClase = (resto: string, clase: string): boolean => {
  const propia = PALABRA_DE_CLASE[clase];
  const abre = PALABRAS_CLASE.find((p) => p.clave === propia);
  if (!abre || !new RegExp(`^${abre.re.source}`).test(resto)) return false;
  return !PALABRAS_CLASE.some((p) => p.clave !== propia && p.re.test(resto));
};

/**
 * Total de cada CLASE leído de los pies rotulados «TOTAL <clase>».
 *
 * Hay ERP que exportan cada grupo con un encabezado SIN totales y un pie CON el subtotal
 * («1 ACTIVO» con saldo 0 arriba, «TOTAL ACTIVO» con el total real abajo, sin código).
 * En esos archivos `totalArchivo("1")` lee el encabezado y devuelve 0 —no null—, así que
 * la Validación 2 (archivo vs calculado) marcaba las 6 clases en descuadre siendo falso.
 *
 * La clase se deduce por POSICIÓN: el pie pertenece a la clase de la última fila con
 * código numérico que lo precede. Es más robusto que buscar la raíz «1», que puede no
 * existir. De los pies candidatos de una clase se toma el ÚLTIMO —el que cierra la
 * clase, no un subtotal intermedio— y solo si su etiqueta abre con la palabra de esa
 * clase; si no, se devuelve null y manda el camino de siempre.
 *
 * Solo alimenta la comparación de las tarjetas: no toca el cálculo ni lo que se persiste.
 */
export function resolverTotalesClaseArchivo(filas: readonly FilaBorrador[]): TotalesClaseArchivo | null {
  const porClase = new Map<string, number>();
  let claseActual: string | null = null;
  for (const fila of filas) {
    const primerDigito = /^[1-9]/.test(fila.codigo) ? fila.codigo[0] : null;
    if (primerDigito) { claseActual = primerDigito; continue; }
    if (!claseActual || fila.omitida || fila.tipoFila === "movimiento" || !esPieTotal(fila)) continue;
    const resto = normalizarEtiquetaRaiz(fila.codigoCrudo).replace(/^(?:sub)?total\s*/, "");
    // El último pie válido de la clase gana: es el que la CIERRA, no un subtotal
    // intermedio. En el archivo de referencia hay seis «TOTAL GASTOS …» antes del
    // «TOTAL GASTOS» real, y todos abren con la palabra de la clase.
    if (cierraLaClase(resto, claseActual)) porClase.set(claseActual, fila.saldoFinal);
  }
  if (porClase.size === 0) return null;

  // Costos = clase 6 (ventas) + clase 7 (producción), igual que el camino por dígito.
  const costos6 = porClase.get("6");
  const costos7 = porClase.get("7");
  const costos = costos6 == null && costos7 == null ? null : (costos6 ?? 0) + (costos7 ?? 0);
  return {
    activo: porClase.get("1") ?? null,
    pasivo: porClase.get("2") ?? null,
    patrimonio: porClase.get("3") ?? null,
    ingresos: porClase.get("4") ?? null,
    gastos: porClase.get("5") ?? null,
    costos,
  };
}

export function resolverTotalesPyGArchivo(filas: readonly FilaBorrador[]): TotalesPyGArchivo | null {
  const raices = filas.filter(
    (fila) => /^[4-9]$/.test(fila.codigo) && fila.tipoFila !== "movimiento" && fila.tipoFila !== "descuadre",
  );
  if (raices.length === 0) return null;

  const totales: TotalesPyGArchivo = { ingresos: 0, gastos: 0, costos: 0 };
  const encontradas = new Set<keyof TotalesPyGArchivo>();
  const esMaterial = (fila: FilaBorrador): boolean =>
    [fila.saldoInicial, fila.debitos, fila.creditos, fila.saldoFinal].some((valor) => Math.abs(valor) > 1);

  for (const raiz of raices) {
    const etiqueta = normalizarEtiquetaRaiz(raiz.nombre);
    const candidatas: (keyof TotalesPyGArchivo)[] = [];
    if (/\bingresos?\b/.test(etiqueta)) candidatas.push("ingresos");
    if (/\bgastos?\b/.test(etiqueta)) candidatas.push("gastos");
    if (/\bcostos?\b/.test(etiqueta)) candidatas.push("costos");

    if (candidatas.length !== 1) {
      if (esMaterial(raiz)) return null;
      continue;
    }
    const categoria = candidatas[0];
    totales[categoria] += raiz.saldoFinal;
    encontradas.add(categoria);
  }

  return encontradas.has("ingresos") && encontradas.has("gastos") && encontradas.has("costos")
    ? totales
    : null;
}

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
  // Pies rotulados «TOTAL <clase>»: se leen del archivo CRUDO, antes de cualquier
  // transformación. Más abajo `marcarNoContables` los marca omitida —tienen código no
  // numérico— y `corregirCodigosPlaceholder`/`marcarCuentaNit` mutan las filas, así que
  // leerlos después devolvería null. Es además lo semánticamente correcto: es lo que el
  // ARCHIVO declara, no un resultado del procesamiento.
  const totalesClase = resolverTotalesClaseArchivo(filas);
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
  const movimientosAntesDeConsolidar = base.filter((f) => f.tipoFila === "movimiento" && !f.omitida).length;
  const aux = opciones.consolidarAuxiliares ? consolidarAuxiliaresRepetidos(base) : { filas: base, consolidados: 0, absorbidas: 0 };
  base = aux.filas;
  // El archivo es «por tercero» por auxiliar solo si la consolidación absorbió una
  // PROPORCIÓN relevante de sus movimientos: un puñado de códigos repetidos es normal
  // en un informe por cuenta (sucursales, re-listados, variantes INAC) y no debe
  // rotularlo como abierto por tercero.
  const porTercero = porTerceroNit || porTerceroSufijo
    || esBalancePorTerceroAuxiliar(movimientosAntesDeConsolidar, aux.absorbidas);
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
  const movimientoContabilizado = movimiento.filter((f) => !dup.has(f));
  const filasContabilizadas = movimientoContabilizado.map((f) => f.filaNum);
  const importReady: CuentaCruda[] = conForzarHoja(
    movimientoContabilizado
      .map((f) => ({ code: f.codigo, name: f.nombre, prevBalance: f.saldoInicial, balance: f.saldoFinal, debitos: f.debitos, creditos: f.creditos })),
  );
  const calc = calcularBalance(importReady, [], undefined, undefined, undefined, umbrales);

  const totalArchivo = (clase: string) => {
    const fs = base.filter((f) => f.codigo === clase && !f.omitida);
    return fs.length > 0 ? fs.reduce((s, f) => s + f.saldoFinal, 0) : null;
  };
  const totalesPyGPorEtiqueta = resolverTotalesPyGArchivo(base);
  const costosArchivoPorCodigo = [totalArchivo("6"), totalArchivo("7")].filter((v): v is number => v != null);
  const validacion = construirValidacionContable(calc, {
    activo: totalesClase?.activo ?? totalArchivo("1"),
    pasivo: totalesClase?.pasivo ?? totalArchivo("2"),
    patrimonio: totalesClase?.patrimonio ?? totalArchivo("3"),
    ingresos: totalesClase?.ingresos ?? totalesPyGPorEtiqueta?.ingresos ?? totalArchivo("4"),
    gastos: totalesClase?.gastos ?? totalesPyGPorEtiqueta?.gastos ?? totalArchivo("5"),
    costos: totalesClase?.costos ?? totalesPyGPorEtiqueta?.costos
      ?? (costosArchivoPorCodigo.length > 0 ? costosArchivoPorCodigo.reduce((s, v) => s + v, 0) : null),
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

  return { arbol, validacion, partidaDoble, hallazgos, agrupadoras, porTercero, relistadoGuiones, filasOcultas, clasesCorregidas, nitTachados, filasContabilizadas, diagnostico };
}
