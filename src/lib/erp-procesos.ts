export const PROCESOS_ERP = [
  { codigo: "CONT", nombre: "Contabilidad" },
  { codigo: "NOM", nombre: "Nómina" },
  { codigo: "INV", nombre: "Inventarios" },
  { codigo: "ING", nombre: "Ingresos" },
  { codigo: "CAR", nombre: "Cartera" },
  { codigo: "CXP", nombre: "Cuentas por pagar" },
  { codigo: "AFI", nombre: "Activos fijos" },
] as const;

export type CodigoProcesoErp = (typeof PROCESOS_ERP)[number]["codigo"];

const CODIGOS_PROCESO_ERP = new Set<string>(PROCESOS_ERP.map((proceso) => proceso.codigo));

export function campoErpProceso(codigo: CodigoProcesoErp): `erpProceso_${CodigoProcesoErp}` {
  return `erpProceso_${codigo}`;
}

export function esCodigoProcesoErp(value: string): value is CodigoProcesoErp {
  return CODIGOS_PROCESO_ERP.has(value);
}

export function procesoErpDeModulo(codigoModulo: string): CodigoProcesoErp | null {
  const codigo = codigoModulo.trim().toUpperCase();
  return esCodigoProcesoErp(codigo) && codigo !== "CONT" ? codigo : null;
}
