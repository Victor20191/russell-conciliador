// TIPO DE RENGLÓN del Consolidado de un cargue — puro, sin BD ni UI.
//
// La pestaña Consolidado solo dejaba SELECCIONAR «Todas» o «Sin cuenta» y filtrar por texto; no
// había forma de VER solo un tipo de renglón (12/Oct/2026, MELONN agrupado por cuenta: 85
// renglones mezclados). El filtro «Mostrar» los separa por lo que hace cada uno en el cruce:
//
//  - `modulo`     tiene cuenta que cruza contra la cédula: guardada (memoria o «Solo {período}»)
//                 o resuelta por la cuenta contable del archivo (Nómina).
//  - `propuesta`  muestra una cuenta propuesta que todavía no cruza: hay que guardarla.
//  - `sin_cuenta` ninguna cuenta: suma en «Saldo del módulo sin cuenta asignada».
//  - `control`    Nómina: la cuenta del cliente es de pasivo/activo/ingreso; va al control de
//                 deducciones, no a la cédula.
//  - `fuera`      Nómina: cuenta de una clase de gasto que el módulo no concilia (61…).
//
// Control y fuera salen de la sugerencia calculada al abrir (como el chip del renglón); el resto,
// del estado vivo de la pestaña, así guardar una cuenta mueve el renglón sin recargar.

export const CATEGORIAS_CONSOLIDADO = ["modulo", "propuesta", "sin_cuenta", "control", "fuera"] as const;
export type CategoriaConsolidado = (typeof CATEGORIAS_CONSOLIDADO)[number];

export const ETIQUETA_CATEGORIA: Record<CategoriaConsolidado, string> = {
  modulo: "Cuentas del módulo",
  propuesta: "Propuesta sin guardar",
  sin_cuenta: "Sin cuenta",
  control: "Control de deducciones",
  fuera: "Fuera del módulo",
};

/** Qué dice el chip al pasar el mouse. */
export const AYUDA_CATEGORIA: Record<CategoriaConsolidado, string> = {
  modulo: "Tienen cuenta que cruza contra la cédula: guardada o resuelta por la cuenta del archivo.",
  propuesta: "Muestran una cuenta propuesta que todavía no cruza: guárdala para que cuente.",
  sin_cuenta: "Sin ninguna cuenta: suman en «Saldo del módulo sin cuenta asignada».",
  control: "La cuenta del cliente es de pasivo, activo o ingreso: van al control de deducciones, no a la cédula.",
  fuera: "Cuenta de una clase que el módulo no concilia: no entran a la cédula.",
};

export type RenglonCategorizable = {
  /** Cuentas guardadas del renglón (memoria del cliente o asignación del período). */
  guardadas: readonly string[];
  /** Cuentas que el renglón muestra (guardadas, editadas o propuestas sin guardar). */
  visibles: readonly string[];
  /** Nómina: ya cruza por la cuenta contable del archivo sin necesidad de guardarla. */
  resueltaPorArchivo?: boolean;
  /** Nómina: destino de la homologación sugerida al abrir el cargue. */
  destino?: "gasto" | "control" | "fuera" | null;
};

/** El tipo del renglón, en este orden: control/fuera, cruza, propuesta, sin cuenta. */
export function categoriaRenglon(r: RenglonCategorizable): CategoriaConsolidado {
  if (r.destino === "control") return "control";
  if (r.destino === "fuera") return "fuera";
  if (r.guardadas.length > 0 || r.resueltaPorArchivo === true) return "modulo";
  if (r.visibles.length > 0) return "propuesta";
  return "sin_cuenta";
}

/** Cuántos renglones hay de cada tipo (todos los tipos, aunque sea cero). */
export function contarCategorias(categorias: Iterable<CategoriaConsolidado>): Record<CategoriaConsolidado, number> {
  const conteo = Object.fromEntries(CATEGORIAS_CONSOLIDADO.map((c) => [c, 0])) as Record<CategoriaConsolidado, number>;
  for (const c of categorias) conteo[c] += 1;
  return conteo;
}
