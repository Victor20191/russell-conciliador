// Cruce contable PURO (sin BD): compara, por cuenta Russell de 4 dígitos, el saldo
// del balance de comprobación contra el valor consolidado de los archivos del módulo
// (INV, CAR, CXP, ING, AFI, NOM…). Genérico: no depende del módulo concreto, solo de
// los agregados que le pasa el loader (`page.tsx`).

const redondear = (v: number): number => Math.round(v * 100) / 100 + 0 || 0;

export type FilaCruceContable = {
  /**
   * Clave de la fila: la cuenta Russell (4 o 6 díg.) o, en una FILA AGRUPADA, las cuentas del
   * grupo unidas con «+» («130505+280505»; ver `claveGrupoCruce`). Es también la llave de la marca.
   */
  cuenta4: string;
  nombre: string | null;
  /** Solo en filas agrupadas: las cuentas que suman el lado contable, ordenadas. */
  cuentas?: string[];
  /** Solo en filas agrupadas: los clasificadores asignados a varias cuentas que originaron el grupo. */
  clasificadores?: string[];
  /** Solo en filas agrupadas: el lado contable de cada cuenta, en el orden de `cuentas`. */
  desglose?: { cuenta: string; nombre: string | null; contable: number; noModular: number }[];
  contable: number; // saldo del balance de comprobación
  inventario: number; // suma de clasificadores con asignación 1:1 a esta cuenta
  /** Parte de `contable` que corresponde a cuentas marcadas NO MODULARES (no se concilia). */
  noModular: number;
  /** contable - inventario, SIN descontar lo no modular. Es la cifra de control. */
  diferenciaBruta: number;
  diferencia: number; // (contable - noModular) - inventario → la que se concilia
  cuadra: boolean; // |diferencia| <= tolerancia
  estado: "cuadra" | "descuadre" | "solo_contable" | "solo_inventario";
};

/**
 * Cuenta del cliente que aporta a una fila del cruce: el desglose que se ve al expandir.
 * `valor` está en la misma convención que `contable` (ya pasó por la regla del módulo).
 */
export type HijoContableCruce = {
  cuenta8: string;
  nombre: string;
  valor: number;
  noModular: boolean;
};

export type ResumenCruceContable = {
  filas: FilaCruceContable[];
  totales: { contable: number; inventario: number; noModular: number; diferenciaBruta: number; diferencia: number };
  sinCuenta: { clasificador: string; total: number }[]; // clasificadores sin cuenta asignada
  multiAsignado: { clasificador: string; total: number; cuentas4: string[] }[]; // asignados a >1 cuenta (ambiguo)
};

export type ClasificadorCruce = { clasificador: string; total: number; cuentas4: string[] };

export type InputCruceContable = {
  contablePorCuenta: Record<string, number>;
  /**
   * Σ por cuenta4 del valor de las cuentas marcadas NO MODULARES, en la MISMA convención
   * que `contablePorCuenta` (ya incluido en él). Ausente o 0 → el cruce es el de siempre.
   */
  noModularPorCuenta?: Record<string, number>;
  consolidado: ClasificadorCruce[];
  nombrePorCuenta: (cod: string) => string | null;
  /**
   * Un clasificador asignado a VARIAS cuentas se compara contra la SUMA de ellas en una fila
   * agrupada, en vez de quedar fuera como `multiAsignado`. Nómina no lo usa: allí esos
   * conceptos se reparten entre cuentas (RF-NOM-12).
   */
  agruparMultiAsignados?: boolean;
  /**
   * Llave de orden de una fila por su clave. Ausente = por código. Activos fijos la usa para que
   * cada depreciación 1592xx quede justo debajo de su activo (159205 tras 1516).
   */
  ordenCuenta?: (clave: string) => string;
};

const SEPARADOR_GRUPO = "+";

/** Clave de una fila agrupada: las cuentas sin repetir, ordenadas y unidas con «+». */
export function claveGrupoCruce(cuentas: readonly string[]): string {
  return [...new Set(cuentas)].sort().join(SEPARADOR_GRUPO);
}

/** Cuentas de la clave de una fila del cruce (una sola si no es agrupada). */
export function cuentasDeClaveCruce(clave: string): string[] {
  return clave.split(SEPARADOR_GRUPO).filter(Boolean);
}

/**
 * Normaliza la clave de una fila del cruce que llega de un formulario: una cuenta de 4 o 6
 * dígitos, o un grupo de al menos dos. Devuelve "" si no es válida.
 */
export function normalizarClaveCruce(valor: string): string {
  const partes = String(valor ?? "").split(SEPARADOR_GRUPO).map((p) => p.replace(/\D/g, ""));
  if (partes.some((p) => p.length !== 4 && p.length !== 6)) return "";
  const clave = claveGrupoCruce(partes);
  return partes.length > 1 && cuentasDeClaveCruce(clave).length < 2 ? "" : clave;
}

/**
 * Cruza el saldo contable (balance de comprobación) contra el valor cargado en los
 * archivos del módulo, cuenta Russell de 4 dígitos por cuenta de 4 dígitos.
 *
 * El lado "inventario" (archivos del módulo) SOLO suma clasificadores con exactamente
 * una cuenta asignada: los que no tienen cuenta o tienen varias quedan aparte
 * (`sinCuenta`/`multiAsignado`) para no repartir un valor ambiguo entre cuentas.
 *
 * FILAS AGRUPADAS (`agruparMultiAsignados`): asignar un clasificador a varias cuentas dice que
 * su total se concilia contra la SUMA de ellas (la bolsa GLOBAL de Cartera contra 130505 y
 * 280505). Las cuentas enlazadas por esos clasificadores —también en cadena: A→{1,2} y
 * B→{2,3} forman {1,2,3}— se funden en UNA fila: contable y no modular suman las cuentas, y el
 * lado archivos suma los clasificadores del grupo, incluidos los 1:1 de cualquiera de sus
 * cuentas, que dejan de salir como filas sueltas. Así no se reparte nada y no se cuenta dos veces.
 *
 * CUENTAS NO MODULARES: una fila agrega todas las cuentas del cliente homologadas a esa
 * cuenta Russell, y algunas no hacen parte de la conciliación del módulo (un ajuste, una
 * mercancía en tránsito que el archivo no trae). Lo que el analista marcó como no modular
 * llega en `noModularPorCuenta` y se DESCUENTA del lado contable: `diferencia` —la que
 * decide `cuadra` y la que se concilia— ya viene ajustada, y `diferenciaBruta` conserva
 * la cifra sin descontar como control. Sin exclusiones ambas coinciden.
 *
 * `estado` sigue mirando la PRESENCIA de saldo, no la diferencia ajustada: una cuenta con
 * todo excluido y sin archivos sigue siendo «solo contable» y además cuadra; las dos cosas
 * son ciertas y conviene verlas.
 */
export function construirCruceContable(
  input: InputCruceContable,
  opciones?: { tolerancia?: number },
): ResumenCruceContable {
  const tolerancia = opciones?.tolerancia ?? 0.01;

  const inventarioPorCuenta = new Map<string, number>();
  const sinCuenta: { clasificador: string; total: number }[] = [];
  const multiAsignado: { clasificador: string; total: number; cuentas4: string[] }[] = [];

  // Grupos: unión de las cuentas que comparte cada clasificador multiasignado.
  const padre = new Map<string, string>();
  const raiz = (c: string): string => {
    let r = c;
    while (padre.has(r) && padre.get(r) !== r) r = padre.get(r)!;
    padre.set(c, r);
    return r;
  };
  const multiPorRaiz = new Map<string, ClasificadorCruce[]>();
  const agrupar = input.agruparMultiAsignados === true;

  for (const c of input.consolidado) {
    if (c.cuentas4.length === 0) {
      sinCuenta.push({ clasificador: c.clasificador, total: c.total });
    } else if (c.cuentas4.length > 1) {
      if (!agrupar) {
        multiAsignado.push({ clasificador: c.clasificador, total: c.total, cuentas4: c.cuentas4 });
        continue;
      }
      for (const cuenta of c.cuentas4) if (!padre.has(cuenta)) padre.set(cuenta, cuenta);
      const r0 = raiz(c.cuentas4[0]);
      for (const cuenta of c.cuentas4.slice(1)) {
        const r = raiz(cuenta);
        if (r !== r0) padre.set(r, r0);
      }
    } else {
      const cuenta = c.cuentas4[0];
      inventarioPorCuenta.set(cuenta, (inventarioPorCuenta.get(cuenta) ?? 0) + c.total);
    }
  }
  if (agrupar) {
    for (const c of input.consolidado) {
      if (c.cuentas4.length < 2) continue;
      const r = raiz(c.cuentas4[0]);
      multiPorRaiz.set(r, [...(multiPorRaiz.get(r) ?? []), c]);
    }
  }

  const construirFila = (base: Pick<FilaCruceContable, "cuenta4" | "nombre" | "cuentas" | "clasificadores" | "desglose">, miembros: readonly string[], extraInventario: number): FilaCruceContable => {
    const sumar = (valorDe: (c: string) => number) => miembros.reduce((s, c) => s + valorDe(c), 0);
    const contable = redondear(sumar((c) => input.contablePorCuenta[c] ?? 0));
    const inventario = redondear(sumar((c) => inventarioPorCuenta.get(c) ?? 0) + extraInventario);
    const noModular = redondear(sumar((c) => input.noModularPorCuenta?.[c] ?? 0));
    const diferenciaBruta = redondear(contable - inventario);
    const diferencia = redondear(contable - noModular - inventario);
    const cuadra = Math.abs(diferencia) <= tolerancia;
    let estado: FilaCruceContable["estado"];
    if (inventario === 0 && contable !== 0) estado = "solo_contable";
    else if (contable === 0 && inventario !== 0) estado = "solo_inventario";
    else estado = cuadra ? "cuadra" : "descuadre";
    return { ...base, contable, inventario, noModular, diferenciaBruta, diferencia, cuadra, estado };
  };

  const cuentas = new Set<string>([...Object.keys(input.contablePorCuenta), ...inventarioPorCuenta.keys(), ...padre.keys()]);
  const miembrosPorRaiz = new Map<string, string[]>();
  const filas: FilaCruceContable[] = [];
  for (const cuenta of [...cuentas].sort()) {
    if (!padre.has(cuenta)) {
      filas.push(construirFila({ cuenta4: cuenta, nombre: input.nombrePorCuenta(cuenta) }, [cuenta], 0));
      continue;
    }
    const r = raiz(cuenta);
    miembrosPorRaiz.set(r, [...(miembrosPorRaiz.get(r) ?? []), cuenta]);
  }
  for (const [r, miembros] of miembrosPorRaiz) {
    const clasificadores = multiPorRaiz.get(r) ?? [];
    const nombres = miembros.map((c) => input.nombrePorCuenta(c)).filter((n): n is string => !!n);
    filas.push(
      construirFila(
        {
          cuenta4: claveGrupoCruce(miembros),
          nombre: nombres.length > 0 ? nombres.join(" + ") : null,
          cuentas: [...miembros].sort(),
          clasificadores: clasificadores.map((c) => c.clasificador).sort(),
          desglose: [...miembros].sort().map((c) => ({
            cuenta: c,
            nombre: input.nombrePorCuenta(c),
            contable: redondear(input.contablePorCuenta[c] ?? 0),
            noModular: redondear(input.noModularPorCuenta?.[c] ?? 0),
          })),
        },
        miembros,
        clasificadores.reduce((s, c) => s + c.total, 0),
      ),
    );
  }
  const orden = input.ordenCuenta ?? ((clave: string) => clave);
  // Comparación por código (no por idioma): las claves son dígitos y la del orden usa «~».
  const comparar = (x: string, y: string) => (x < y ? -1 : x > y ? 1 : 0);
  filas.sort((a, b) => comparar(orden(a.cuenta4), orden(b.cuenta4)) || comparar(a.cuenta4, b.cuenta4));

  const totales = filas.reduce(
    (acc, f) => ({
      contable: acc.contable + f.contable,
      inventario: acc.inventario + f.inventario,
      noModular: acc.noModular + f.noModular,
      diferenciaBruta: acc.diferenciaBruta + f.diferenciaBruta,
      diferencia: acc.diferencia + f.diferencia,
    }),
    { contable: 0, inventario: 0, noModular: 0, diferenciaBruta: 0, diferencia: 0 },
  );

  return {
    filas,
    totales: {
      contable: redondear(totales.contable),
      inventario: redondear(totales.inventario),
      noModular: redondear(totales.noModular),
      diferenciaBruta: redondear(totales.diferenciaBruta),
      diferencia: redondear(totales.diferencia),
    },
    sinCuenta,
    multiAsignado,
  };
}
