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

/** Procesos que siempre forman parte de la ficha del cliente. Los demas se
 * agregan de manera explicita desde el CRUD de sistemas por proceso. */
export const CODIGOS_ERP_BASE = ["CONT", "NOM", "INV"] as const satisfies readonly CodigoProcesoErp[];

export const PROCESOS_ERP_BASE = PROCESOS_ERP.filter((proceso) =>
  (CODIGOS_ERP_BASE as readonly string[]).includes(proceso.codigo),
);

const CODIGOS_ERP_BASE_SET = new Set<string>(CODIGOS_ERP_BASE);

const CODIGOS_PROCESO_ERP = new Set<string>(PROCESOS_ERP.map((proceso) => proceso.codigo));

export function campoErpProceso(codigo: CodigoProcesoErp): `erpProceso_${CodigoProcesoErp}` {
  return `erpProceso_${codigo}`;
}

export function esCodigoProcesoErp(value: string): value is CodigoProcesoErp {
  return CODIGOS_PROCESO_ERP.has(value);
}

export function esProcesoErpBase(value: string): value is (typeof CODIGOS_ERP_BASE)[number] {
  return CODIGOS_ERP_BASE_SET.has(value);
}

export function procesoErpDeModulo(codigoModulo: string): CodigoProcesoErp | null {
  const codigo = codigoModulo.trim().toUpperCase();
  return esCodigoProcesoErp(codigo) && codigo !== "CONT" ? codigo : null;
}
