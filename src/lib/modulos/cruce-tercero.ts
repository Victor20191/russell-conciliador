// Cruce por TERCERO (NIT) PURO (sin BD): compara, por NIT canónico, el saldo del
// balance abierto por tercero contra el auxiliar del módulo (CAR/CXP). Análogo a
// `cruce-contable.ts` pero la clave de cruce es el NIT en vez de la cuenta de 4
// dígitos. Los `nit` de entrada YA vienen canónicos (clave `nucleoNit` de
// `src/lib/nit.ts`): la tolerancia de dígito de verificación se resuelve ANTES de
// llamar a esta función (típicamente con `normalizarTerceroModulo`).

const redondear = (v: number): number => Math.round(v * 100) / 100 + 0 || 0;

export type AporteTercero = { nit: string; nombre: string | null; saldo: number };

export type FilaCruceTercero = {
  nit: string;
  nombre: string | null;
  contable: number; // saldo del balance por tercero
  modulo: number; // saldo del auxiliar del módulo
  diferencia: number; // contable - modulo
  cuadra: boolean; // |diferencia| <= tolerancia
  estado: "cuadra" | "descuadre" | "solo_contable" | "solo_modulo";
};

export type ResumenCruceTercero = {
  filas: FilaCruceTercero[];
  totales: { contable: number; modulo: number; diferencia: number };
};

export type InputCruceTercero = {
  contablePorNit: AporteTercero[];
  moduloPorNit: AporteTercero[];
};

/**
 * Cruza el saldo contable (balance por tercero) contra el auxiliar del módulo,
 * NIT canónico por NIT canónico.
 *
 * Si un mismo NIT aparece más de una vez en un mismo lado (`contablePorNit` o
 * `moduloPorNit`), sus saldos se SUMAN (agregación por NIT, no un reemplazo):
 * el llamador puede pasar aportes ya desagregados (p. ej. una fila por cuenta o
 * por documento) sin tener que pre-consolidarlos.
 */
export function construirCruceTercero(
  input: InputCruceTercero,
  opciones?: { tolerancia?: number },
): ResumenCruceTercero {
  const tolerancia = opciones?.tolerancia ?? 0.01;

  const contable = new Map<string, number>();
  const modulo = new Map<string, number>();
  const nombres = new Map<string, string>();

  for (const a of input.contablePorNit) {
    contable.set(a.nit, (contable.get(a.nit) ?? 0) + a.saldo);
    if (a.nombre) nombres.set(a.nit, a.nombre);
  }
  for (const a of input.moduloPorNit) {
    modulo.set(a.nit, (modulo.get(a.nit) ?? 0) + a.saldo);
    // El nombre contable tiene prioridad: solo se guarda el del módulo si no hay ya uno.
    if (a.nombre && !nombres.has(a.nit)) nombres.set(a.nit, a.nombre);
  }

  const nits = new Set<string>([...contable.keys(), ...modulo.keys()]);

  const filas: FilaCruceTercero[] = [...nits].map((nit) => {
    const c = redondear(contable.get(nit) ?? 0);
    const m = redondear(modulo.get(nit) ?? 0);
    const diferencia = redondear(c - m);
    const cuadra = Math.abs(diferencia) <= tolerancia;
    let estado: FilaCruceTercero["estado"];
    if (m === 0 && c !== 0) estado = "solo_contable";
    else if (c === 0 && m !== 0) estado = "solo_modulo";
    else estado = cuadra ? "cuadra" : "descuadre";
    return { nit, nombre: nombres.get(nit) ?? null, contable: c, modulo: m, diferencia, cuadra, estado };
  });

  // Descuadres primero (mayor |diferencia|), luego el resto; desempata por NIT para
  // que el orden sea determinista con diferencias iguales.
  filas.sort((a, b) => {
    if (a.cuadra !== b.cuadra) return a.cuadra ? 1 : -1;
    if (!a.cuadra) {
      const diff = Math.abs(b.diferencia) - Math.abs(a.diferencia);
      if (diff !== 0) return diff;
    }
    return a.nit.localeCompare(b.nit);
  });

  const totales = filas.reduce(
    (acc, f) => ({
      contable: acc.contable + f.contable,
      modulo: acc.modulo + f.modulo,
      diferencia: acc.diferencia + f.diferencia,
    }),
    { contable: 0, modulo: 0, diferencia: 0 },
  );

  return {
    filas,
    totales: {
      contable: redondear(totales.contable),
      modulo: redondear(totales.modulo),
      diferencia: redondear(totales.diferencia),
    },
  };
}
