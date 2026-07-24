// Umbrales funcionales que separan los avisos INFORMATIVOS de las alertas
// ACCIONABLES en el borrador y en el balance oficial.
//
// Son PARAMETRIZABLES desde /config/parametros: este módulo es el CATÁLOGO
// (fuente de los valores de fábrica y de la forma del dato) y se mantiene PURO
// —sin BD, sin `server-only`— para que lo compartan el cálculo, las pruebas, el
// seed y los componentes cliente. El valor VIGENTE lo resuelve el cargador
// server-only `src/lib/parametros/umbrales.ts`.

/** Umbrales vigentes que gobiernan las alertas de un balance. */
export type UmbralesAlertas = {
  /** Descuadres: por debajo es informativo; desde este monto (inclusive), alerta. */
  descuadre: number;
  /** Saldos contrarios a la naturaleza: hasta este monto (inclusive) es informativo. */
  naturaleza: number;
};

export type ClaveUmbral = keyof UmbralesAlertas;

// Valores de FÁBRICA. Se conservan como constantes exportadas porque los usan el
// seed, las pruebas y el fallback del cargador cuando la BD no responde.
export const UMBRAL_DESCUADRE_ALERTA = 2_000;
export const UMBRAL_NATURALEZA_ALERTA = 50_000;

export const UMBRALES_ALERTAS_DEFECTO: UmbralesAlertas = {
  descuadre: UMBRAL_DESCUADRE_ALERTA,
  naturaleza: UMBRAL_NATURALEZA_ALERTA,
};

export type UmbralDef = {
  clave: ClaveUmbral;
  nombre: string;
  descripcion: string;
  /** Dónde se ve el efecto del cambio, para orientar a quien lo configura. */
  dondeAplica: string;
  defecto: number;
  minimo: number;
  maximo: number;
};

// Tope de cordura: por encima de mil millones el umbral dejaría de filtrar nada
// en la práctica y solo serviría para apagar las alertas por accidente.
export const UMBRAL_MAXIMO = 1_000_000_000;

export const UMBRALES_CATALOGO: UmbralDef[] = [
  {
    clave: "descuadre",
    nombre: "Diferencias y descuadres",
    descripcion:
      "Monto mínimo para que una diferencia cuente como alerta. Por debajo, la diferencia se sigue viendo pero queda marcada como informativa y no entra en «Alertas» ni en el diagnóstico superior.",
    dondeAplica:
      "Borrador de balance: partida doble, ecuación contable, totales de clase vs. archivo, cuentas agrupadoras que no cuadran con su desglose y débito/crédito invertidos.",
    defecto: UMBRAL_DESCUADRE_ALERTA,
    minimo: 0,
    maximo: UMBRAL_MAXIMO,
  },
  {
    clave: "naturaleza",
    nombre: "Saldos contrarios a la naturaleza",
    descripcion:
      "Monto hasta el cual un saldo contrario a la naturaleza de la cuenta se considera informativo. Por encima, se convierte en alerta y exige «Dar OK» para poder continuar.",
    dondeAplica:
      "Balance de comprobación (validación «Naturaleza de cuenta vs saldo») y el árbol de cuentas del balance.",
    defecto: UMBRAL_NATURALEZA_ALERTA,
    minimo: 0,
    maximo: UMBRAL_MAXIMO,
  },
];

const POR_CLAVE = new Map<string, UmbralDef>(UMBRALES_CATALOGO.map((u) => [u.clave, u]));

export const CLAVES_UMBRAL: ClaveUmbral[] = UMBRALES_CATALOGO.map((u) => u.clave);

/** Definición de catálogo del umbral indicado (undefined si la clave no existe). */
export function getUmbralDef(clave: string): UmbralDef | undefined {
  return POR_CLAVE.get(clave);
}

/** `true` si la clave corresponde a un umbral conocido del catálogo. */
export function esClaveUmbral(clave: string): clave is ClaveUmbral {
  return POR_CLAVE.has(clave);
}

/** Diferencia que alcanza el umbral: cuenta como alerta accionable. */
export function esDescuadreAccionable(valor: number | null | undefined, umbrales: UmbralesAlertas): boolean {
  return valor != null && Math.abs(valor) >= umbrales.descuadre;
}

/** Diferencia real pero por debajo del umbral: se muestra, no cuenta como alerta. */
export function esDescuadreInformativo(valor: number | null | undefined, umbrales: UmbralesAlertas): boolean {
  return valor != null && Math.abs(valor) > 0 && Math.abs(valor) < umbrales.descuadre;
}

/** Saldo contrario a la naturaleza que supera el umbral: exige validación del revisor. */
export function esSaldoContrarioAccionable(saldo: number, saldoOk: boolean, umbrales: UmbralesAlertas): boolean {
  return !saldoOk && Math.abs(saldo) > umbrales.naturaleza;
}

/** Saldo contrario dentro del umbral: se informa sin bloquear. */
export function esSaldoContrarioInformativo(saldo: number, saldoOk: boolean, umbrales: UmbralesAlertas): boolean {
  return !saldoOk && Math.abs(saldo) <= umbrales.naturaleza;
}
