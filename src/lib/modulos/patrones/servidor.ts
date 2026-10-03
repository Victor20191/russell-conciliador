import "server-only";

// Lecturas de BD de los patrones de archivo que comparten la carga de un módulo y la interfaz
// de patrones. La lógica (coincidencia, elección, aplicación) vive en los módulos puros vecinos.
import prisma from "@/lib/prisma";
import { authorizePermiso } from "@/lib/rbac";
import { ERP_MANUAL_CODE, procesoErpDeModulo } from "@/lib/erp-procesos";
import type { DescriptorModulo } from "../descriptores";
import { SpecModuloSchema } from "../extraccion/esquema";
import { descripcionSubtotalesModulo, normalizarSpecModulo, resumenColumnasModulo } from "../perfil-modulo";
import { versionesAplicables, type VersionCandidata } from "./mejor-version";
import { esEstadoPatron, type EstadoPatron } from "./version";
import { INFO_TIPO_FORMATO, nivelCarteraDeSpec, tipoFormatoCartera, type TipoFormatoCartera } from "../cartera/tipo-formato";
import type { NivelCartera } from "../cartera/saldos-tercero";
import type { SpecModulo } from "../extraccion/esquema";

export type VersionPatronVm = {
  id: number;
  version: number;
  estado: EstadoPatron;
  hoja: string;
  filaEncabezado: number;
  primeraFilaDatos: number;
  /** Rótulos del encabezado con que se reconoce el archivo (sin vacíos). */
  rotulos: string[];
  resumenColumnas: string;
  totales: string;
  /** Cartera y CxP: tipo de formato de la versión (null en los demás módulos). */
  formato: FormatoVersionVm | null;
  muestra: { nombre: string; tamanoBytes: number | null } | null;
  vecesUsado: number;
  ultimoUsoEn: string | null;
  clienteOrigenNombre: string | null;
  nota: string | null;
  creadoPor: string | null;
  creadoEn: string;
  aprobadoPor: string | null;
  aprobadoEn: string | null;
  actualizadoEn: string;
  evidencia: { nombreArchivo: string; loteId: string | null; confirmadoEn: string } | null;
  diferencias: string[];
  versionBase: number | null;
  lecturaEstructurada?: SpecModulo["lecturaEstructurada"];
};

export type PatronAplicativoVm = {
  erp: { id: number; nombre: string; activo: boolean };
  /** Clientes que tienen el aplicativo en el campo del módulo. */
  clientes: number;
  versiones: VersionPatronVm[];
};

/** Tipo de formato de una versión: el declarado o el que se deduce de su mapeo. */
export type FormatoVersionVm = {
  tipo: TipoFormatoCartera;
  etiqueta: string;
  declarado: boolean;
  /** Cómo se lee hoy cada fila de un archivo con esta versión. */
  nivel: NivelCartera;
};

function formatoDeVersion(spec: SpecModulo): FormatoVersionVm {
  const { tipo, declarado } = tipoFormatoCartera(spec);
  return { tipo, etiqueta: INFO_TIPO_FORMATO[tipo].etiqueta, declarado, nivel: nivelCarteraDeSpec(spec) };
}

/** Patrones de un módulo agrupados por aplicativo, con sus versiones de la más nueva a la más vieja. */
export async function listarPatronesDeModulo(descriptor: DescriptorModulo): Promise<PatronAplicativoVm[]> {
  const proceso = procesoErpDeModulo(descriptor.codigo);
  const [versiones, usoPorErp] = await Promise.all([
    prisma.versionPatronArchivoModulo.findMany({
      where: { moduloCodigo: descriptor.codigo },
      orderBy: [{ erpId: "asc" }, { version: "desc" }],
      include: { erp: { select: { id: true, name: true, active: true } } },
    }),
    proceso
      ? prisma.clientErpProcess.groupBy({ by: ["erpId"], where: { process: { code: proceso } }, _count: { _all: true } })
      : Promise.resolve([]),
  ]);
  const clientesPorErp = new Map(usoPorErp.map((fila) => [fila.erpId, fila._count._all]));
  const alcances = new Map(await Promise.all([...new Set(versiones.flatMap((v) => v.clienteOrigenId == null ? [] : [v.clienteOrigenId]))].map(async (id) =>
    [id, (await authorizePermiso("modulos_datos:crear", { clientId: id, modo: "lectura" })).ok] as const,
  )));
  // La muestra compartida no revela el archivo original ni el nombre del cliente que lo aportó.
  const visibles = versiones.filter((v) => v.estado === "aprobada" || v.clienteOrigenId == null || alcances.get(v.clienteOrigenId));
  const idsOriginales = visibles.flatMap((v) => v.archivoOrigenId != null && v.clienteOrigenId != null && alcances.get(v.clienteOrigenId) ? [v.archivoOrigenId] : []);
  const originales = idsOriginales.length ? await prisma.archivoOriginalModulo.findMany({
    where: { id: { in: idsOriginales } },
    select: { id: true, nombreArchivo: true, loteId: true, actualizadoEn: true },
  }) : [];
  const porOriginal = new Map(originales.map((o) => [o.id, o]));
  const porVersion = new Map(visibles.map((v) => [v.id, v]));
  const porErp = new Map<number, PatronAplicativoVm>();
  for (const fila of visibles) {
    const grupo = porErp.get(fila.erpId) ?? {
      erp: { id: fila.erp.id, nombre: fila.erp.name, activo: fila.erp.active },
      clientes: clientesPorErp.get(fila.erpId) ?? 0,
      versiones: [],
    };
    const parsed = SpecModuloSchema.safeParse(fila.specJson);
    const spec = parsed.success ? normalizarSpecModulo(descriptor, parsed.data) : null;
    const rotulos = Array.isArray(fila.encabezadoJson)
      ? (fila.encabezadoJson as unknown[]).map((c) => String(c ?? "").trim()).filter(Boolean)
      : [];
    const alcanceOrigen = fila.clienteOrigenId == null || alcances.get(fila.clienteOrigenId) === true;
    const original = fila.archivoOrigenId == null ? null : porOriginal.get(fila.archivoOrigenId);
    const base = fila.versionBaseId == null ? null : porVersion.get(fila.versionBaseId);
    const specBase = base ? SpecModuloSchema.safeParse(base.specJson) : null;
    const diferencias = spec && specBase?.success ? descriptor.columnas.flatMap((col) => {
      const antes = specBase.data.columnas[col.nombre] ?? 0;
      const ahora = spec.columnas[col.nombre] ?? 0;
      return antes === ahora ? [] : [`${col.etiqueta}: columna ${antes || "sin asignar"} → ${ahora || "sin asignar"}`];
    }) : [];
    if (spec && specBase?.success && spec.subtotales !== specBase.data.subtotales) diferencias.push("Cambió la detección de totales.");
    if (spec && specBase?.success && JSON.stringify(spec.lecturaEstructurada) !== JSON.stringify(specBase.data.lecturaEstructurada)) diferencias.push("Cambió la separación de campos o la reconstrucción de productos entre filas.");
    grupo.versiones.push({
      id: fila.id,
      version: fila.version,
      estado: esEstadoPatron(fila.estado) ? fila.estado : "inactiva",
      hoja: fila.hoja,
      filaEncabezado: fila.filaEncabezado,
      primeraFilaDatos: fila.primeraFilaDatos,
      rotulos,
      resumenColumnas: spec ? resumenColumnasModulo(descriptor, spec) : "Mapeo ilegible",
      totales: spec ? descripcionSubtotalesModulo(spec) : "—",
      ...(spec?.lecturaEstructurada ? { lecturaEstructurada: spec.lecturaEstructurada } : {}),
      formato: spec && descriptor.crucePorTercero.detalleTercero ? formatoDeVersion(spec) : null,
      muestra: fila.muestraClaveObjeto ? { nombre: fila.muestraNombre ?? "muestra", tamanoBytes: fila.muestraTamanoBytes } : null,
      vecesUsado: fila.vecesUsado,
      ultimoUsoEn: fila.ultimoUsoEn?.toISOString() ?? null,
      clienteOrigenNombre: alcanceOrigen ? fila.clienteOrigenNombre : null,
      nota: alcanceOrigen ? fila.nota : null,
      creadoPor: fila.creadoPor,
      creadoEn: fila.creadoEn.toISOString(),
      aprobadoPor: fila.aprobadoPor,
      aprobadoEn: fila.aprobadoEn?.toISOString() ?? null,
      actualizadoEn: fila.actualizadoEn.toISOString(),
      evidencia: original ? { nombreArchivo: original.nombreArchivo, loteId: original.loteId, confirmadoEn: fila.creadoEn.toISOString() } : null,
      versionBase: base?.version ?? null,
      diferencias,
    });
    porErp.set(fila.erpId, grupo);
  }
  return [...porErp.values()].sort((a, b) => a.erp.nombre.localeCompare(b.erp.nombre, "es"));
}

export type AplicativoCarga = { id: number; code: string; name: string; manual: boolean };

/**
 * El aplicativo que el analista confirmó para la carga, validado contra la ficha del cliente
 * (campo del módulo). Fail-closed: un ERP que el cliente no tiene no lee nada.
 */
export async function aplicativoConfirmadoDeCarga(
  clienteId: number,
  moduloCodigo: string,
  erpIdCrudo: unknown,
): Promise<{ ok: true; aplicativo: AplicativoCarga } | { ok: false; message: string }> {
  const erpId = Number(erpIdCrudo);
  if (!Number.isInteger(erpId) || erpId <= 0) return { ok: false, message: "Confirma de qué aplicativo es el archivo." };
  const proceso = procesoErpDeModulo(moduloCodigo);
  if (!proceso) return { ok: false, message: "Módulo no soportado." };
  const asignacion = await prisma.clientErpProcess.findFirst({
    where: { clientId: clienteId, erpId, process: { code: proceso } },
    select: { erp: { select: { id: true, code: true, name: true } } },
  });
  if (!asignacion) {
    return { ok: false, message: "Ese aplicativo no está registrado para este cliente. Vuelve a elegirlo." };
  }
  return { ok: true, aplicativo: { ...asignacion.erp, manual: asignacion.erp.code === ERP_MANUAL_CODE } };
}

/**
 * Versiones con que se puede leer un archivo de este cliente: las aprobadas del aplicativo y
 * las pendientes que salieron de su propio perfil. Una versión con datos ilegibles se omite.
 */
export async function versionesPatronCandidatas(
  descriptor: DescriptorModulo,
  erpId: number,
  clienteId: number,
  soloId?: number,
): Promise<{ versiones: VersionCandidata[]; total: number }> {
  const filas = await prisma.versionPatronArchivoModulo.findMany({
    where: {
      erpId,
      moduloCodigo: descriptor.codigo,
      estado: { in: ["aprobada", "pendiente", "validada_cliente"] },
      ...(soloId != null ? { id: soloId } : {}),
    },
    select: {
      id: true, version: true, estado: true, clienteOrigenId: true, hoja: true,
      filaEncabezado: true, primeraFilaDatos: true, encabezadoJson: true, specJson: true,
    },
    orderBy: { version: "desc" },
  });
  const aplicables = versionesAplicables(filas, clienteId);
  const versiones = aplicables.flatMap((fila): VersionCandidata[] => {
    const spec = SpecModuloSchema.safeParse(fila.specJson);
    if (!spec.success || !Array.isArray(fila.encabezadoJson)) return [];
    return [{
      id: fila.id,
      version: fila.version,
      estado: fila.estado === "aprobada" ? "aprobada" : fila.estado === "validada_cliente" ? "validada_cliente" : "pendiente",
      clienteOrigenId: fila.clienteOrigenId,
      hoja: fila.hoja,
      filaEncabezado: fila.filaEncabezado,
      primeraFilaDatos: fila.primeraFilaDatos,
      encabezado: fila.encabezadoJson as unknown[],
      spec: normalizarSpecModulo(descriptor, spec.data),
    }];
  });
  return { versiones, total: aplicables.length };
}
