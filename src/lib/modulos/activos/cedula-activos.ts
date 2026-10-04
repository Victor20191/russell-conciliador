/**
 * CÉDULA DE ACTIVOS FIJOS: un renglón por grupo de activo con TRES columnas por lado
 * (costo, depreciación acumulada y neto), en vez de un renglón para el activo y otro
 * suelto para su depreciación.
 *
 * El papel de trabajo del auditor compara 1516 contra 159205 en la misma línea y concluye
 * por el NETO; con la depreciación en un renglón aparte, una reclasificación entre costo y
 * depreciación se leía como dos descuadres que se anulaban y pedía dos marcas.
 *
 * Funciona como un POST-PROCESO de `construirCruceContable`: ese ya resolvió por cuenta el
 * saldo contable, lo no modular, las filas agrupadas y el detalle del módulo; aquí solo se
 * funden las parejas. Así ningún otro módulo cambia.
 *
 * Invariante que sostiene todo lo de aguas abajo (marcas, cierre, totales): el renglón
 * fusionado presenta el NETO en `contable`/`inventario`, de modo que
 * `diferencia = (contable − noModular) − (inventario − noModularModulo)` sigue siendo la
 * cifra que se concilia y la que congela la marca. Las dos columnas quedan en `columnas`,
 * con sus propias diferencias, para verlas y para avisar de una reclasificación.
 */
import {
  CLAVE_SIN_CUENTA,
  claveGrupoCruce,
  cuentasDeClaveCruce,
  type ColumnaCifrasCruce,
  type ColumnasActivoFijo,
  type FilaCruceContable,
  type ResumenCruceContable,
} from "../cruce-contable";

const redondear = (v: number): number => Math.round(v * 100) / 100 + 0 || 0;

const CIFRAS_EN_CERO: ColumnaCifrasCruce = {
  contable: 0,
  inventario: 0,
  noModular: 0,
  noModularModulo: 0,
  diferencia: 0,
  cuadra: true,
};

/** Las cifras de una columna con su diferencia ya ajustada por lo no modular de cada lado. */
function cifras(
  valores: { contable: number; inventario: number; noModular: number; noModularModulo: number },
  tolerancia: number,
): ColumnaCifrasCruce {
  const diferencia = redondear(valores.contable - valores.noModular - (valores.inventario - valores.noModularModulo));
  return {
    contable: redondear(valores.contable),
    inventario: redondear(valores.inventario),
    noModular: redondear(valores.noModular),
    noModularModulo: redondear(valores.noModularModulo),
    diferencia,
    cuadra: Math.abs(diferencia) <= tolerancia,
  };
}

const sumarCifras = (a: ColumnaCifrasCruce, b: ColumnaCifrasCruce, tolerancia: number): ColumnaCifrasCruce =>
  cifras(
    {
      contable: a.contable + b.contable,
      inventario: a.inventario + b.inventario,
      noModular: a.noModular + b.noModular,
      noModularModulo: a.noModularModulo + b.noModularModulo,
    },
    tolerancia,
  );

/** Las cifras de una fila tal como vienen del cruce, para usarlas como columna. */
const columnaDeFila = (f: FilaCruceContable, tolerancia: number): ColumnaCifrasCruce =>
  cifras(
    { contable: f.contable, inventario: f.inventario, noModular: f.noModular, noModularModulo: f.noModularModulo },
    tolerancia,
  );

/**
 * ¿La fila es un renglón de DEPRECIACIÓN? Lo es cuando todas las cuentas de su clave cuelgan de
 * un subgrupo de depreciación (el 1592 de las parejas), esté o no esa cuenta en la relación: una
 * 159299 que ninguna pareja reclame sigue siendo depreciación y tiene que RESTAR del neto, no
 * sumar como si fuera costo. Una fila agrupada que mezcle activo y depreciación no lo es y se
 * deja intacta: repartirla sería inventar.
 */
const esFilaDepreciacion = (clave: string, prefijos: ReadonlySet<string>): boolean => {
  const cuentas = cuentasDeClaveCruce(clave);
  return cuentas.length > 0 && cuentas.every((c) => prefijos.has(c.slice(0, 4)));
};

/**
 * Funde cada renglón de depreciación con el del activo que le corresponde.
 *
 * Reglas de borde, todas pensadas para no perder saldo:
 * - Un activo SIN pareja configurada (1504 Terrenos, 1512 Montaje) conserva su renglón con la
 *   columna de depreciación en cero: su neto es el costo.
 * - Una 1592xx que ninguna pareja reclame (una 159299 suelta en el balance) queda en su propio
 *   renglón, con el costo en cero; su neto es negativo, que es justo lo que resta del total.
 * - Una 1592xx cuya pareja no tiene renglón de activo (el activo está en cero en los dos lados)
 *   abre el renglón del activo con el costo en cero, para que la marca viva en la llave del
 *   activo y no cambie de sitio cuando el costo aparezca.
 * - Una fila de depreciación AGRUPADA cuyas cuentas pertenecen a activos distintos no se puede
 *   partir: se deja como está y se informa en `sinEmparejar`.
 */
export function emparejarCedulaActivos(
  resumen: ResumenCruceContable,
  pares: ReadonlyMap<string, string>,
  opciones?: { tolerancia?: number },
): ResumenCruceContable & { sinEmparejar: string[] } {
  const tolerancia = opciones?.tolerancia ?? 0.01;
  if (pares.size === 0) return { ...resumen, sinEmparejar: [] };

  // Los subgrupos de depreciación salen de las propias parejas (hoy, solo el 1592).
  const prefijosDepreciacion = new Set([...pares.values()].map((c) => c.slice(0, 4)));
  const activoDeDepreciacion = new Map<string, string>();
  for (const [subgrupo, cuenta6] of pares) activoDeDepreciacion.set(cuenta6, subgrupo);

  // Qué renglón del cruce contiene cada subgrupo de activo, para saber a cuál llevar la depreciación.
  const filaDeActivo = new Map<string, FilaCruceContable>();
  for (const f of resumen.filas) {
    if (f.cuenta4 === CLAVE_SIN_CUENTA || esFilaDepreciacion(f.cuenta4, prefijosDepreciacion)) continue;
    for (const cuenta of cuentasDeClaveCruce(f.cuenta4)) filaDeActivo.set(cuenta, f);
  }

  // Cada renglón de depreciación va al renglón de activo de sus parejas; si son varios, no se parte.
  const depreciacionPorFila = new Map<string, FilaCruceContable[]>();
  const absorbidas = new Set<FilaCruceContable>();
  const sinEmparejar: string[] = [];
  /** Depreciaciones cuyo activo todavía no tiene renglón: abren uno con el costo en cero. */
  const nuevasPorActivo = new Map<string, FilaCruceContable[]>();

  /** Depreciaciones que ninguna pareja reclama: su propio renglón, restando del neto. */
  const huerfanas = new Set<FilaCruceContable>();

  for (const f of resumen.filas) {
    if (f.cuenta4 === CLAVE_SIN_CUENTA || !esFilaDepreciacion(f.cuenta4, prefijosDepreciacion)) continue;
    const activos = [...new Set(cuentasDeClaveCruce(f.cuenta4).map((c) => activoDeDepreciacion.get(c)).filter((a): a is string => !!a))];
    if (activos.length === 0) {
      huerfanas.add(f);
      continue;
    }
    const destinos = [...new Set(activos.map((a) => filaDeActivo.get(a)).filter((x): x is FilaCruceContable => !!x))];
    if (destinos.length > 1) {
      // La depreciación de varios activos que hoy están en renglones distintos: no se reparte.
      sinEmparejar.push(f.cuenta4);
      continue;
    }
    if (destinos.length === 1) {
      depreciacionPorFila.set(destinos[0].cuenta4, [...(depreciacionPorFila.get(destinos[0].cuenta4) ?? []), f]);
      absorbidas.add(f);
      continue;
    }
    if (activos.length === 1) {
      nuevasPorActivo.set(activos[0], [...(nuevasPorActivo.get(activos[0]) ?? []), f]);
      absorbidas.add(f);
      continue;
    }
    sinEmparejar.push(f.cuenta4);
  }

  /**
   * Une el renglón del activo con sus depreciaciones y deja el NETO en las cifras de la fila.
   * Con `activo` nulo el renglón es solo depreciación: su neto queda negativo, que es lo que resta.
   */
  const fusionar = (activo: FilaCruceContable | null, deps: readonly FilaCruceContable[], claveActivo: string, nombre?: string | null): FilaCruceContable => {
    const costo = activo ? columnaDeFila(activo, tolerancia) : CIFRAS_EN_CERO;
    const depreciacion = deps.reduce(
      (acc, d) => sumarCifras(acc, columnaDeFila(d, tolerancia), tolerancia),
      CIFRAS_EN_CERO,
    );
    const cuentasDep = [...new Set(deps.flatMap((d) => cuentasDeClaveCruce(d.cuenta4)))].sort();
    const contable = redondear(costo.contable - depreciacion.contable);
    const inventario = redondear(costo.inventario - depreciacion.inventario);
    const noModular = redondear(costo.noModular - depreciacion.noModular);
    const noModularModulo = redondear(costo.noModularModulo - depreciacion.noModularModulo);
    const diferenciaBruta = redondear(contable - inventario);
    const diferencia = redondear(contable - noModular - (inventario - noModularModulo));
    const cuadra = Math.abs(diferencia) <= tolerancia;
    let estado: FilaCruceContable["estado"];
    if (inventario === 0 && contable !== 0) estado = "solo_contable";
    else if (contable === 0 && inventario !== 0) estado = "solo_inventario";
    else estado = cuadra ? "cuadra" : "descuadre";
    const detalleModulo = [...(activo?.detalleModulo ?? []), ...deps.flatMap((d) => d.detalleModulo ?? [])]
      .sort((a, b) => Math.abs(b.total) - Math.abs(a.total) || a.clasificador.localeCompare(b.clasificador));
    const columnas: ColumnasActivoFijo = { costo, depreciacion: { ...depreciacion, cuentas: cuentasDep } };
    return {
      ...(activo ?? { cuenta4: claveActivo, nombre: nombre ?? null }),
      cuenta4: claveActivo,
      detalleModulo,
      columnas,
      contable,
      inventario,
      noModular,
      noModularModulo,
      diferenciaBruta,
      diferencia,
      cuadra,
      estado,
    };
  };

  const filas: FilaCruceContable[] = [];
  for (const f of resumen.filas) {
    if (absorbidas.has(f)) continue;
    if (f.cuenta4 === CLAVE_SIN_CUENTA) {
      // El saldo sin cuenta no tiene depreciación que emparejar: todo su valor es costo.
      filas.push({ ...f, columnas: { costo: columnaDeFila(f, tolerancia), depreciacion: { ...CIFRAS_EN_CERO, cuentas: [] } } });
      continue;
    }
    if (huerfanas.has(f)) {
      // Depreciación sin pareja: toda su cifra va a la columna de depreciación, no a la de costo.
      filas.push(fusionar(null, [f], f.cuenta4, f.nombre));
      continue;
    }
    const deps = depreciacionPorFila.get(f.cuenta4) ?? [];
    filas.push(fusionar(f, deps, f.cuenta4));
    // Un activo de este renglón puede además tener depreciación de una pareja aún sin activo propio.
    for (const cuenta of cuentasDeClaveCruce(f.cuenta4)) nuevasPorActivo.delete(cuenta);
  }
  // Las depreciaciones cuyo activo no tenía renglón abren el suyo, en el orden de su cuenta.
  for (const [activo, deps] of [...nuevasPorActivo].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    filas.push(fusionar(null, deps, claveGrupoCruce([activo])));
  }

  const totales = filas.reduce(
    (acc, f) => ({
      contable: acc.contable + f.contable,
      inventario: acc.inventario + f.inventario,
      noModular: acc.noModular + f.noModular,
      noModularModulo: acc.noModularModulo + f.noModularModulo,
      diferenciaBruta: acc.diferenciaBruta + f.diferenciaBruta,
      diferencia: acc.diferencia + f.diferencia,
    }),
    { contable: 0, inventario: 0, noModular: 0, noModularModulo: 0, diferenciaBruta: 0, diferencia: 0 },
  );

  return {
    ...resumen,
    filas,
    totales: {
      contable: redondear(totales.contable),
      inventario: redondear(totales.inventario),
      noModular: redondear(totales.noModular),
      noModularModulo: redondear(totales.noModularModulo),
      diferenciaBruta: redondear(totales.diferenciaBruta),
      diferencia: redondear(totales.diferencia),
    },
    sinEmparejar: [...new Set(sinEmparejar)].sort(),
  };
}

/**
 * Totales de las columnas de costo y depreciación de una cédula ya emparejada: el pie de la
 * tabla y el Excel muestran las seis cifras, no solo el neto.
 */
export function totalesColumnasActivos(
  filas: readonly FilaCruceContable[],
  opciones?: { tolerancia?: number },
): { costo: ColumnaCifrasCruce; depreciacion: ColumnaCifrasCruce } {
  const tolerancia = opciones?.tolerancia ?? 0.01;
  let costo = CIFRAS_EN_CERO;
  let depreciacion = CIFRAS_EN_CERO;
  for (const f of filas) {
    if (!f.columnas) continue;
    costo = sumarCifras(costo, f.columnas.costo, tolerancia);
    depreciacion = sumarCifras(depreciacion, f.columnas.depreciacion, tolerancia);
  }
  return { costo, depreciacion };
}

/**
 * El renglón cuadra por el NETO pero una de sus columnas no: casi siempre es una
 * reclasificación entre costo y depreciación, no un faltante. Se avisa sin exigir marca.
 */
export function hayReclasificacionEntreColumnas(fila: FilaCruceContable): boolean {
  if (!fila.columnas || !fila.cuadra) return false;
  return !fila.columnas.costo.cuadra || !fila.columnas.depreciacion.cuadra;
}
