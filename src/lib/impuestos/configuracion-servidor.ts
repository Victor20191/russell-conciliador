import "server-only";
import prisma from "@/lib/prisma";
import { fechaCalendarioISO } from "@/lib/fecha-hora";
import { CUENTAS_SIN_RESTA_DIAN_FABRICA, type FilaMapeoDian, type TerceroDian } from "./mapeo-dian";
import type { VencimientoDian } from "./calendario";

/**
 * Lecturas de la configuración de Impuestos · DIAN (Mapeos DIAN y calendario tributario).
 * Sin caché: son tablas pequeñas y la pantalla tiene que mostrar lo último que se guardó.
 */

export type CuentaMapeoVista = {
  cuenta: string;
  /** Nombre en el plan Russell; null si la cuenta todavía no existe en el plan. */
  nombre: string | null;
  conceptos: string[];
  restarTerceroDian: boolean;
};

export type MapeoDianVista = {
  filas: (FilaMapeoDian & { nombreCuenta: string | null; actualizadoPor: string | null; actualizadoEn: string | null })[];
  cuentas: CuentaMapeoVista[];
  terceros: (TerceroDian & { id: number; creadoPor: string | null; creadoEn: string })[];
};

export async function cargarMapeoDian(formulario = "350"): Promise<MapeoDianVista> {
  const [filas, configuracion, terceros] = await Promise.all([
    prisma.mapeoRenglonDian.findMany({ where: { formulario }, orderBy: [{ orden: "asc" }, { id: "asc" }] }),
    prisma.cuentaRussellDian.findMany(),
    prisma.terceroDian.findMany({ orderBy: { nit: "asc" } }),
  ]);
  const cuentas = [...new Set(filas.map((f) => f.cuentaRussell).filter((c): c is string => c != null))].sort();
  const plan = await prisma.standardAccount.findMany({ where: { code: { in: cuentas } }, select: { code: true, name: true } });
  const nombre = new Map(plan.map((c) => [c.code, c.name]));
  const restar = new Map(configuracion.map((c) => [c.cuentaRussell, c.restarTerceroDian]));
  return {
    filas: filas.map((f) => ({
      concepto: f.concepto,
      etiqueta: f.etiqueta,
      seccion: f.seccion,
      renglonPj: f.renglonPj,
      renglonPn: f.renglonPn,
      cuentaRussell: f.cuentaRussell,
      signo: f.signo === "-" ? "-" : "+",
      enCruce: f.enCruce,
      orden: f.orden,
      nombreCuenta: f.cuentaRussell ? (nombre.get(f.cuentaRussell) ?? null) : null,
      actualizadoPor: f.actualizadoPor,
      actualizadoEn: f.actualizadoPor ? f.actualizadoEn.toISOString() : null,
    })),
    cuentas: cuentas.map((cuenta) => ({
      cuenta,
      nombre: nombre.get(cuenta) ?? null,
      conceptos: filas.filter((f) => f.cuentaRussell === cuenta).map((f) => f.etiqueta),
      restarTerceroDian: restar.get(cuenta) ?? !CUENTAS_SIN_RESTA_DIAN_FABRICA.includes(cuenta),
    })),
    terceros: terceros.map((t) => ({ id: t.id, nit: t.nit, etiqueta: t.etiqueta, creadoPor: t.creadoPor, creadoEn: t.creadoEn.toISOString() })),
  };
}

export type CalendarioVista = {
  anio: number;
  formulario: string;
  filas: VencimientoDian[];
  actualizadoPor: string | null;
  actualizadoEn: string | null;
};

/** Años con calendario cargado (para el selector) y el calendario del año pedido. */
export async function cargarCalendarioDian(anio: number, formulario: string): Promise<{ anios: number[]; calendario: CalendarioVista }> {
  const [anios, filas] = await Promise.all([
    prisma.vencimientoDian.findMany({ where: { formulario }, distinct: ["anio"], select: { anio: true }, orderBy: { anio: "desc" } }),
    prisma.vencimientoDian.findMany({ where: { anio, formulario }, orderBy: [{ periodo: "asc" }, { ultimoDigito: "asc" }] }),
  ]);
  const ultima = filas.reduce<(typeof filas)[number] | null>((max, f) => (!max || f.actualizadoEn > max.actualizadoEn ? f : max), null);
  return {
    anios: anios.map((a) => a.anio),
    calendario: {
      anio,
      formulario,
      filas: filas.map((f) => ({ periodo: f.periodo, ultimoDigito: f.ultimoDigito, fecha: fechaCalendarioISO(f.fecha) })),
      actualizadoPor: ultima?.actualizadoPor ?? null,
      actualizadoEn: ultima ? ultima.actualizadoEn.toISOString() : null,
    },
  };
}
