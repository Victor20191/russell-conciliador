/**
 * Campos de APLICATIVO (ERP) de la ficha del cliente. Son cuatro y cada uno admite VARIOS
 * aplicativos: un cliente puede liquidar la nómina en SAP y en Siesa. Cartera, Cuentas por
 * pagar e Ingresos se leen con los aplicativos de Contabilidad; Nómina, Inventarios y Activos
 * fijos, con los suyos (decisión 16/Sep/2026: se retiró el aplicativo propio por módulo).
 */
export const PROCESOS_ERP = [
  { codigo: "CONT", nombre: "Contabilidad", detalle: "Lo usan Cartera, Cuentas por pagar e Ingresos" },
  { codigo: "NOM", nombre: "Nómina", detalle: null },
  { codigo: "INV", nombre: "Inventarios", detalle: null },
  { codigo: "AFI", nombre: "Activos fijos", detalle: null },
] as const;

export type CodigoProcesoErp = (typeof PROCESOS_ERP)[number]["codigo"];

/** Los cuatro campos siempre forman parte de la ficha del cliente. */
export const CODIGOS_ERP_BASE = PROCESOS_ERP.map((proceso) => proceso.codigo) as readonly CodigoProcesoErp[];

/**
 * Aplicativo sembrado en el catálogo para los archivos que no salen de un ERP (hojas armadas a
 * mano). Con él la carga no usa patrones: se mapea a mano y se memoriza por cliente.
 */
export const ERP_MANUAL_CODE = "MANUAL";

const CODIGOS_PROCESO_ERP = new Set<string>(CODIGOS_ERP_BASE);

/** Módulo de conciliación → campo de aplicativo que lo alimenta. */
const PROCESO_POR_MODULO: Record<string, CodigoProcesoErp> = {
  CAR: "CONT",
  CXP: "CONT",
  ING: "CONT",
  NOM: "NOM",
  INV: "INV",
  AFI: "AFI",
};

export function campoErpProceso(codigo: CodigoProcesoErp): `erpProceso_${CodigoProcesoErp}` {
  return `erpProceso_${codigo}`;
}

export function esCodigoProcesoErp(value: string): value is CodigoProcesoErp {
  return CODIGOS_PROCESO_ERP.has(value);
}

export function nombreProcesoErp(codigo: CodigoProcesoErp): string {
  return PROCESOS_ERP.find((proceso) => proceso.codigo === codigo)?.nombre ?? codigo;
}

/** Campo de aplicativo que usa un módulo (CAR, CXP e ING → CONT); null si no es un módulo. */
export function procesoErpDeModulo(codigoModulo: string): CodigoProcesoErp | null {
  return PROCESO_POR_MODULO[codigoModulo.trim().toUpperCase()] ?? null;
}
