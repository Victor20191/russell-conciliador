import "server-only";
import prisma from "@/lib/prisma";
import { fechaCalendarioISO } from "@/lib/fecha-hora";
import { controlesLectura, normalizarLectura, type ControlLectura, type LecturaCruda, type LecturaFormulario } from "./lectura";
import { periodosRevision, type PeriodoRevision } from "./periodos-revision";
import type { EstadoFormulario } from "./tipos";

/** Lecturas de Impuestos · Retención en la fuente para las pantallas (sin caché). */

export type FormularioVista = {
  id: number;
  formulario: "350" | "490";
  periodo: number;
  numero: string;
  estado: EstadoFormulario;
  codigoCorreccion: number | null;
  numeroAnterior: string | null;
  concepto: string | null;
  numeroPagado: string | null;
  cuota: number | null;
  deCuotas: number | null;
  fechaSello: string | null;
  autoadhesivo: string | null;
  razonSocial: string | null;
  nombreArchivo: string;
  tieneArchivo: boolean;
  /** Importes guardados (los confirmados o, por confirmar, los leídos). */
  valores: Record<number, number>;
  /** Lo que leyó la IA, normalizado (para comparar con lo corregido). */
  leido: LecturaFormulario;
  controles: ControlLectura[];
  corregidoAMano: number[];
  modeloLectura: string;
  cargadoPor: string | null;
  creadoEn: string;
  confirmadoPor: string | null;
  confirmadoEn: string | null;
};

export type RevisionVista = {
  id: number;
  clienteId: number;
  nombreCliente: string;
  nitCliente: string;
  anio: number;
  mesCorte: number;
  periodo: string;
  periodicidad: string;
  estado: string;
  creadoPor: string | null;
  creadoEn: string;
  formularios: FormularioVista[];
  causales: { periodo: number; causal: string; registradoPor: string | null; registradoEn: string }[];
  periodos: PeriodoRevision[];
};

export async function cargarRevision(id: number): Promise<RevisionVista | null> {
  const r = await prisma.revisionRetencion.findUnique({ where: { id } });
  if (!r) return null;
  const [filas, causales] = await Promise.all([
    prisma.formularioDianCargado.findMany({
      where: { clienteId: r.clienteId, anio: r.anio, estado: { not: "descartado" } },
      include: { renglones: { select: { renglon: true, valor: true } } },
      orderBy: [{ periodo: "asc" }, { formulario: "asc" }, { fechaSello: "asc" }, { id: "asc" }],
    }),
    prisma.periodoSinFormulario.findMany({ where: { clienteId: r.clienteId, anio: r.anio, formulario: "350" }, orderBy: { periodo: "asc" } }),
  ]);
  const ctx = { nitCliente: r.nitCliente, anio: r.anio, mesCorte: r.mesCorte };
  const formularios: FormularioVista[] = filas.map((f) => {
    const leido = normalizarLectura(f.lecturaJson as unknown as LecturaCruda);
    const valores = Object.fromEntries(f.renglones.map((x) => [x.renglon, Number(x.valor)]));
    const fechaSello = f.fechaSello ? fechaCalendarioISO(f.fechaSello) : null;
    const actual: LecturaFormulario = {
      ...leido,
      formulario: f.formulario === "490" ? "490" : "350",
      periodo: f.periodo,
      numero: f.numero,
      codigoCorreccion: f.codigoCorreccion,
      numeroAnterior: f.numeroAnterior,
      concepto: f.concepto,
      numeroPagado: f.numeroPagado,
      fechaSello,
      valores,
    };
    return {
      id: f.id,
      formulario: f.formulario === "490" ? "490" : "350",
      periodo: f.periodo,
      numero: f.numero,
      estado: f.estado as EstadoFormulario,
      codigoCorreccion: f.codigoCorreccion,
      numeroAnterior: f.numeroAnterior,
      concepto: f.concepto,
      numeroPagado: f.numeroPagado,
      cuota: f.cuota,
      deCuotas: f.deCuotas,
      fechaSello,
      autoadhesivo: f.autoadhesivo,
      razonSocial: f.razonSocial,
      nombreArchivo: f.nombreArchivo,
      tieneArchivo: Boolean(f.claveObjeto),
      valores,
      leido,
      controles: controlesLectura(actual, ctx),
      corregidoAMano: Array.isArray(f.corregidoAMano) ? (f.corregidoAMano as number[]) : [],
      modeloLectura: f.modeloLectura,
      cargadoPor: f.cargadoPor,
      creadoEn: f.creadoEn.toISOString(),
      confirmadoPor: f.confirmadoPor,
      confirmadoEn: f.confirmadoEn ? f.confirmadoEn.toISOString() : null,
    };
  });
  const confirmados = formularios.filter((f) => f.estado === "confirmado");
  const periodos = periodosRevision({
    periodicidad: r.periodicidad,
    mesCorte: r.mesCorte,
    formularios350: confirmados.filter((f) => f.formulario === "350").map((f) => ({
      id: f.id, periodo: f.periodo, numero: f.numero, codigoCorreccion: f.codigoCorreccion, numeroAnterior: f.numeroAnterior, fechaPresentacion: f.fechaSello, autoadhesivo: f.autoadhesivo, valores: f.valores,
    })),
    formularios490: confirmados.filter((f) => f.formulario === "490").map((f) => ({
      id: f.id, periodo: f.periodo, numero: f.numero, concepto: f.concepto, numeroPagado: f.numeroPagado, fechaPago: f.fechaSello, autoadhesivo: f.autoadhesivo, valores: f.valores,
    })),
    porConfirmar: formularios.filter((f) => f.estado === "por_confirmar").map((f) => ({ periodo: f.periodo, formulario: f.formulario, concepto: f.concepto })),
    causales: causales.map((c) => ({ periodo: c.periodo, causal: c.causal })),
  });
  return {
    id: r.id,
    clienteId: r.clienteId,
    nombreCliente: r.nombreCliente,
    nitCliente: r.nitCliente,
    anio: r.anio,
    mesCorte: r.mesCorte,
    periodo: r.periodo,
    periodicidad: r.periodicidad,
    estado: r.estado,
    creadoPor: r.creadoPor,
    creadoEn: r.creadoEn.toISOString(),
    formularios,
    causales: causales.map((c) => ({ periodo: c.periodo, causal: c.causal, registradoPor: c.registradoPor, registradoEn: c.registradoEn.toISOString() })),
    periodos,
  };
}

export type RevisionResumen = {
  id: number;
  clienteId: number;
  nombreCliente: string;
  nitCliente: string;
  anio: number;
  mesCorte: number;
  estado: string;
  creadoPor: string | null;
  creadoEn: string;
  /** Formularios del cliente y el año: confirmados y por confirmar. */
  confirmados: number;
  porConfirmar: number;
};

/** Revisiones visibles: todas (alcance global) o las de los clientes de la cartera. */
export async function cargarRevisiones(clientIds: number[] | null): Promise<RevisionResumen[]> {
  const revisiones = await prisma.revisionRetencion.findMany({
    where: clientIds ? { clienteId: { in: clientIds } } : {},
    orderBy: [{ nombreCliente: "asc" }, { anio: "desc" }, { mesCorte: "desc" }],
  });
  if (revisiones.length === 0) return [];
  const conteos = await prisma.formularioDianCargado.groupBy({
    by: ["clienteId", "anio", "estado"],
    where: { clienteId: { in: [...new Set(revisiones.map((r) => r.clienteId))] }, estado: { not: "descartado" } },
    _count: { _all: true },
  });
  const conteo = (clienteId: number, anio: number, estado: string) =>
    conteos.find((c) => c.clienteId === clienteId && c.anio === anio && c.estado === estado)?._count._all ?? 0;
  return revisiones.map((r) => ({
    id: r.id,
    clienteId: r.clienteId,
    nombreCliente: r.nombreCliente,
    nitCliente: r.nitCliente,
    anio: r.anio,
    mesCorte: r.mesCorte,
    estado: r.estado,
    creadoPor: r.creadoPor,
    creadoEn: r.creadoEn.toISOString(),
    confirmados: conteo(r.clienteId, r.anio, "confirmado"),
    porConfirmar: conteo(r.clienteId, r.anio, "por_confirmar"),
  }));
}

export type ClienteRevision = { id: number; nombre: string; nit: string };

/** Clientes para «Nueva revisión» (los de alcance de escritura). */
export async function clientesParaRevision(clientIds: number[] | null): Promise<ClienteRevision[]> {
  const clientes = await prisma.client.findMany({
    where: clientIds ? { id: { in: clientIds } } : {},
    orderBy: { name: "asc" },
    select: { id: true, name: true, nit: true },
  });
  return clientes.map((c) => ({ id: c.id, nombre: c.name, nit: c.nit }));
}
