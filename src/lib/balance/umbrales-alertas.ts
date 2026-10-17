// Umbrales funcionales que separan los avisos INFORMATIVOS de las alertas
// ACCIONABLES en el borrador y en el balance oficial.
//
// Son PARAMETRIZABLES desde /config/parametros: este módulo es el CATÁLOGO
// (fuente de los valores de fábrica y de la forma del dato) y se mantiene PURO
// —sin BD, sin `server-only`— para que lo compartan el cálculo, las pruebas, el
// seed y los componentes cliente. El valor VIGENTE lo resuelve el cargador
// server-only `src/lib/parametros/umbrales.ts`.

/** Umbrales vigentes que gobiernan las alertas del balance y de los módulos de conciliación. */
export type UmbralesAlertas = {
  /** Balance · descuadres: por debajo es informativo; desde este monto (inclusive), alerta. */
  descuadre: number;
  /** Balance · saldos contrarios a la naturaleza: hasta este monto (inclusive) es informativo. */
  naturaleza: number;
  /** Módulos · cédula contable: desde este monto (inclusive) la diferencia exige marca para cerrar. */
  cedula_modulos: number;
  /** Cartera y CxP · cruce por tercero: desde este monto (inclusive) la diferencia exige marca. */
  tercero_diferencia: number;
  /** Cartera y CxP · saldo contable por tercero contrario a la naturaleza: por encima, se informa. */
  tercero_naturaleza: number;
  /** Activos fijos · el neto cuadra pero costo o depreciación difieren: desde este monto, exige marca. */
  afi_detalle: number;
};

export type ClaveUmbral = keyof UmbralesAlertas;

// Valores de FÁBRICA. Se conservan como constantes exportadas porque los usan el
// seed, las pruebas y el fallback del cargador cuando la BD no responde.
export const UMBRAL_DESCUADRE_ALERTA = 2_000;
export const UMBRAL_NATURALEZA_ALERTA = 50_000;
export const UMBRAL_CEDULA_MODULOS = 2_000;
export const UMBRAL_TERCERO_DIFERENCIA = 2_000;
export const UMBRAL_TERCERO_NATURALEZA = 10_000;
export const UMBRAL_AFI_DETALLE = 10_000;
// Un movimiento (débito o crédito) que vino con signo CONTRARIO al dominante de su
// columna se sube en NEGATIVO. Ese negativo es la "alerta de magnitud".
export const UMBRAL_MAGNITUD_ALERTA = 50_000;

export const UMBRALES_ALERTAS_DEFECTO: UmbralesAlertas = {
  descuadre: UMBRAL_DESCUADRE_ALERTA,
  naturaleza: UMBRAL_NATURALEZA_ALERTA,
  cedula_modulos: UMBRAL_CEDULA_MODULOS,
  tercero_diferencia: UMBRAL_TERCERO_DIFERENCIA,
  tercero_naturaleza: UMBRAL_TERCERO_NATURALEZA,
  afi_detalle: UMBRAL_AFI_DETALLE,
};

/** Dónde vive el umbral: lo usa la pantalla de parámetros para agruparlos. */
export type SeccionUmbral = "balance" | "modulos";

export type UmbralDef = {
  clave: ClaveUmbral;
  seccion: SeccionUmbral;
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
    seccion: "balance",
    nombre: "Diferencias y descuadres",
    descripcion:
      "Monto mínimo para que una diferencia cuente como alerta. Por debajo, la diferencia se sigue viendo pero queda marcada como informativa y no entra en «Alertas» ni en el diagnóstico superior.",
    dondeAplica:
      "Borrador de balance: partida doble, ecuación contable, totales de clase vs. archivo y cuentas agrupadoras que no cuadran con su desglose.",
    defecto: UMBRAL_DESCUADRE_ALERTA,
    minimo: 0,
    maximo: UMBRAL_MAXIMO,
  },
  {
    clave: "naturaleza",
    seccion: "balance",
    nombre: "Saldos contrarios a la naturaleza",
    descripcion:
      "Monto hasta el cual un saldo contrario a la naturaleza de la cuenta se considera informativo. Por encima, se convierte en alerta y exige «Dar OK» para poder continuar.",
    dondeAplica:
      "Balance de comprobación (validación «Naturaleza de cuenta vs saldo») y el árbol de cuentas del balance.",
    defecto: UMBRAL_NATURALEZA_ALERTA,
    minimo: 0,
    maximo: UMBRAL_MAXIMO,
  },
  {
    clave: "cedula_modulos",
    seccion: "modulos",
    nombre: "Tolerancia de la cédula contable",
    descripcion:
      "Desde este monto (inclusive), una diferencia de la cédula contable exige marca de auditoría para poder cerrar la conciliación. Por debajo se sigue viendo y se puede marcar, pero no bloquea el cierre.",
    dondeAplica:
      "Cruce contable de los seis módulos, incluido el renglón «Saldo del módulo sin cuenta asignada» y el neto de Activos fijos. No aplica al cruce por tercero de Cartera y CxP.",
    defecto: UMBRAL_CEDULA_MODULOS,
    minimo: 0,
    maximo: UMBRAL_MAXIMO,
  },
  {
    clave: "tercero_diferencia",
    seccion: "modulos",
    nombre: "Diferencia por tercero",
    descripcion:
      "Desde este monto (inclusive), la diferencia de un tercero entre contabilidad y módulo exige marca de auditoría para poder cerrar la conciliación. Por debajo la marca es opcional.",
    dondeAplica: "Pestaña «Cruce por tercero» de Cartera y Cuentas por pagar.",
    defecto: UMBRAL_TERCERO_DIFERENCIA,
    minimo: 0,
    maximo: UMBRAL_MAXIMO,
  },
  {
    clave: "tercero_naturaleza",
    seccion: "modulos",
    nombre: "Saldo contrario por tercero",
    descripcion:
      "Monto por encima del cual un saldo contable por tercero del lado opuesto a la naturaleza de su cuenta aparece en las novedades.",
    dondeAplica: "Novedades de Cartera y Cuentas por pagar («Saldo contrario a la naturaleza»).",
    defecto: UMBRAL_TERCERO_NATURALEZA,
    minimo: 0,
    maximo: UMBRAL_MAXIMO,
  },
  {
    clave: "afi_detalle",
    seccion: "modulos",
    nombre: "Detalle de Activos fijos (neto cuadra)",
    descripcion:
      "Cuando el costo neto de un renglón cuadra pero su costo o su depreciación no (típicamente una reclasificación entre ellas), desde este monto (inclusive) el renglón exige marca de auditoría para poder cerrar. Por debajo solo se avisa «Revisar columnas».",
    dondeAplica: "Cédula contable de Activos fijos (columnas de costo y depreciación de cada renglón).",
    defecto: UMBRAL_AFI_DETALLE,
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

/**
 * ¿La diferencia alcanza el umbral y exige marca? Desde el monto INCLUSIVE, la misma regla del
 * descuadre del balance: la comparten la cédula contable y el cruce por tercero de los módulos.
 */
export function requiereMarcaPorUmbral(diferencia: number, umbral: number): boolean {
  return Math.abs(diferencia) >= umbral;
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

/** Un valor de movimiento (débito/crédito) negativo = vino con signo contrario a su
 *  columna. Accionable si su cuantía supera el umbral; informativo si no. */
export function esMagnitudAccionable(valor: number | null | undefined): boolean {
  return valor != null && valor < 0 && Math.abs(valor) >= UMBRAL_MAGNITUD_ALERTA;
}

export function esMagnitudInformativo(valor: number | null | undefined): boolean {
  return valor != null && valor < 0 && Math.abs(valor) < UMBRAL_MAGNITUD_ALERTA;
}
