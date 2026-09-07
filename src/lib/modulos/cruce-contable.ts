// Cruce contable PURO (sin BD): compara, por cuenta Russell de 4 dígitos, el saldo
// del balance de comprobación contra el valor consolidado de los archivos del módulo
// (INV, CAR, CXP, ING, AFI, NOM…). Genérico: no depende del módulo concreto, solo de
// los agregados que le pasa el loader (`page.tsx`).

const redondear = (v: number): number => Math.round(v * 100) / 100 + 0 || 0;

export type FilaCruceContable = {
  cuenta4: string;
  nombre: string | null;
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
};

/**
 * Cruza el saldo contable (balance de comprobación) contra el valor cargado en los
 * archivos del módulo, cuenta Russell de 4 dígitos por cuenta de 4 dígitos.
 *
 * El lado "inventario" (archivos del módulo) SOLO suma clasificadores con exactamente
 * una cuenta asignada: los que no tienen cuenta o tienen varias quedan aparte
 * (`sinCuenta`/`multiAsignado`) para no repartir un valor ambiguo entre cuentas.
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

  for (const c of input.consolidado) {
    if (c.cuentas4.length === 0) {
      sinCuenta.push({ clasificador: c.clasificador, total: c.total });
    } else if (c.cuentas4.length > 1) {
      multiAsignado.push({ clasificador: c.clasificador, total: c.total, cuentas4: c.cuentas4 });
    } else {
      const cuenta = c.cuentas4[0];
      inventarioPorCuenta.set(cuenta, (inventarioPorCuenta.get(cuenta) ?? 0) + c.total);
    }
  }

  const cuentas = new Set<string>([...Object.keys(input.contablePorCuenta), ...inventarioPorCuenta.keys()]);

  const filas: FilaCruceContable[] = [...cuentas]
    .sort()
    .map((cuenta4) => {
      const contable = redondear(input.contablePorCuenta[cuenta4] ?? 0);
      const inventario = redondear(inventarioPorCuenta.get(cuenta4) ?? 0);
      const noModular = redondear(input.noModularPorCuenta?.[cuenta4] ?? 0);
      const diferenciaBruta = redondear(contable - inventario);
      const diferencia = redondear(contable - noModular - inventario);
      const cuadra = Math.abs(diferencia) <= tolerancia;
      let estado: FilaCruceContable["estado"];
      if (inventario === 0 && contable !== 0) estado = "solo_contable";
      else if (contable === 0 && inventario !== 0) estado = "solo_inventario";
      else estado = cuadra ? "cuadra" : "descuadre";
      return { cuenta4, nombre: input.nombrePorCuenta(cuenta4), contable, inventario, noModular, diferenciaBruta, diferencia, cuadra, estado };
    });

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
