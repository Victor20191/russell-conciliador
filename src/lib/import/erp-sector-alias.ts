// Normalización de ERP y Sector para los catálogos maestros (`erps`, `sectores`).
//
// El maestro de la firma trae los ERP con muchas variantes de escritura
// (SIESA / Siesa / «SIESA (Enterprise/ERP)») y los sectores en formato
// «N-Nombre» («15-ESAL»). Aquí se resuelven a una forma canónica
// { code, name } que el importador usa para hacer upsert del catálogo.

import { normalizar } from "./xlsx";

export type CatalogoRef = { code: string; name: string };

/** Código canónico a partir de un texto: MAYÚSCULAS sin acentos ni símbolos. */
function aCodigo(texto: string): string {
  return normalizar(texto)
    .replace(/[^a-z0-9]+/g, "")
    .toUpperCase();
}

/**
 * ERP canónicos con sus variantes conocidas (en forma normalizada, tal como
 * las devuelve `normalizar`). Solo hace falta listar las variantes que deben
 * FUSIONARSE; cualquier ERP no listado se crea tolerantemente (ver resolverErp).
 */
const ERP_CANONICOS: { code: string; name: string; variantes: string[] }[] = [
  { code: "SIESA", name: "SIESA", variantes: ["siesa", "siesa (enterprise/erp)", "siesa enterprise/erp", "siesa enterprise"] },
  { code: "SIIGO", name: "SIIGO", variantes: ["siigo"] },
  { code: "CONTAI", name: "Contai", variantes: ["contai", "cnt"] },
  { code: "OFIMATICA", name: "Ofimática", variantes: ["ofimatica", "offimatica"] },
  { code: "ODOO", name: "Odoo", variantes: ["odoo"] },
  { code: "LOGGRO", name: "Loggro", variantes: ["loggro", "logro"] },
  { code: "WORLDOFFICE", name: "World Office", variantes: ["world office", "worldoffice"] },
  { code: "ZEUS", name: "Zeus", variantes: ["zeus"] },
  { code: "HGI", name: "HGI", variantes: ["hgi"] },
  { code: "ILIMITADA", name: "Ilimitada", variantes: ["ilimitada"] },
  { code: "LIBRA", name: "Libra", variantes: ["libra"] },
  { code: "DMS", name: "DMS Software", variantes: ["dms software", "dms"] },
  { code: "SOFSIN", name: "ERP Sofsin", variantes: ["erp sofsin", "sofsin"] },
  { code: "EXACTSIR", name: "Exact-Sir", variantes: ["exact -sir", "exact-sir", "exact sir"] },
  { code: "ORACLENETSUITE", name: "Oracle NetSuite", variantes: ["oracle netsuit", "oracle netsuite"] },
  { code: "OASISCOM", name: "Oasiscom", variantes: ["oasiscom"] },
  { code: "PYA", name: "P&A", variantes: ["p&a", "pya"] },
  { code: "SAFIX", name: "Safix de Xenco", variantes: ["safix de xenco", "safix"] },
  { code: "SAPB1", name: "SAP Business One", variantes: ["sap business one"] },
  { code: "SAPS4", name: "SAP S/4HANA", variantes: ["sap s/4hanna", "sap s/4hana", "sap 4 hana", "sap 4hana"] },
  { code: "SAP", name: "SAP", variantes: ["sap"] },
  { code: "SERVINTE", name: "Servinte", variantes: ["servinte"] },
  { code: "SINCO", name: "SINCO", variantes: ["sinco", "sinco erp"] },
  { code: "SIEVENSOFT", name: "Sievensoft", variantes: ["sievensoft"] },
  { code: "WORKDAY", name: "Workday", variantes: ["workday"] },
  { code: "EPICOR", name: "Epicor", variantes: ["epicor"] },
  { code: "INFORMAWEB", name: "Informaweb", variantes: ["informaweb"] },
];

const ERP_POR_VARIANTE = new Map<string, CatalogoRef>();
for (const e of ERP_CANONICOS) {
  for (const v of e.variantes) ERP_POR_VARIANTE.set(v, { code: e.code, name: e.name });
}

/** Catálogo canónico de ERP (sin alias), para sembrar la BD desde el seed. */
export const ERP_CATALOGO: CatalogoRef[] = ERP_CANONICOS.map((e) => ({ code: e.code, name: e.name }));

/**
 * Resuelve el texto de ERP a su forma canónica del catálogo. Si no está en el
 * mapa de alias, crea una entrada tolerante (code = texto normalizado en
 * MAYÚSCULAS; name = texto tal cual) para no perder ERPs nuevos. Texto vacío →
 * null (el ERP es opcional: el cliente puede cargarse sin ERP).
 */
export function resolverErp(texto: string): CatalogoRef | null {
  const t = texto.trim();
  if (!t) return null;
  const ref = ERP_POR_VARIANTE.get(normalizar(t));
  if (ref) return ref;
  return { code: aCodigo(t) || "ERP", name: t };
}

/**
 * Resuelve el texto de Sector. El maestro trae «N-Nombre» (p.ej. «15-ESAL»):
 * code = el número («15»), name = el resto («ESAL»). Sin número, code = slug
 * del nombre. Texto vacío → null (el cliente puede no tener sector).
 */
export function resolverSector(texto: string): CatalogoRef | null {
  const t = texto.trim();
  if (!t) return null;
  const m = /^(\d+)\s*-\s*(.+)$/.exec(t);
  if (m) return { code: m[1], name: m[2].trim() };
  return { code: aCodigo(t) || "SECTOR", name: t };
}
