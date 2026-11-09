import "server-only";
import prisma from "@/lib/prisma";
import { fechaCalendarioISO } from "@/lib/fecha-hora";
import { CUENTAS_SIN_RESTA_DIAN_FABRICA, cuentasDeMapeo, type FilaMapeoDian, type TerceroDian } from "./mapeo-dian";
import { impuestoPorDeclaracion } from "./impuestos-dian";
import { CLAVES_CALENDARIO, type VencimientoDian } from "./calendario";

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
  /**
   * Se lee por tercero en el cruce (retenciones, IVA generado y descontable, 135517). Las cuentas de
   * ingresos del 300 se leen por cuenta: no tienen tercero DIAN que restar.
   */
  porTercero: boolean;
};

export type MapeoDianVista = {
  formulario: string;
  filas: (FilaMapeoDian & {
    /** Nombre de la cuenta cuando la fila tiene una sola; con varias, ver `cuentasRussell`. */
    nombreCuenta: string | null;
    cuentasRussell: { cuenta: string; nombre: string | null }[];
    actualizadoPor: string | null;
    actualizadoEn: string | null;
  })[];
  cuentas: CuentaMapeoVista[];
  terceros: (TerceroDian & { id: number; creadoPor: string | null; creadoEn: string })[];
};

export async function cargarMapeoDian(formulario = "350"): Promise<MapeoDianVista> {
  const [filas, configuracion, terceros] = await Promise.all([
    prisma.mapeoRenglonDian.findMany({ where: { formulario }, orderBy: [{ orden: "asc" }, { id: "asc" }] }),
    prisma.cuentaRussellDian.findMany(),
    prisma.terceroDian.findMany({ orderBy: { nit: "asc" } }),
  ]);
  const cuentas = [...new Set(filas.flatMap((f) => cuentasDeMapeo(f)))].sort();
  const plan = await prisma.standardAccount.findMany({ where: { code: { in: cuentas } }, select: { code: true, name: true } });
  const nombre = new Map(plan.map((c) => [c.code, c.name]));
  const restar = new Map(configuracion.map((c) => [c.cuentaRussell, c.restarTerceroDian]));
  // Qué secciones del mapeo se leen por tercero, según el impuesto del formulario.
  const impuesto = impuestoPorDeclaracion(formulario);
  const seccionPorTercero = (seccion: string) => impuesto?.cruce.grupos.find((g) => g.secciones.includes(seccion))?.porTercero ?? true;
  return {
    formulario,
    filas: filas.map((f) => {
      const propias = cuentasDeMapeo(f);
      return {
        concepto: f.concepto,
        etiqueta: f.etiqueta,
        seccion: f.seccion,
        renglonPj: f.renglonPj,
        renglonPn: f.renglonPn,
        cuentaRussell: f.cuentaRussell,
        signo: f.signo === "-" ? "-" : "+",
        enCruce: f.enCruce,
        orden: f.orden,
        nombreCuenta: propias.length === 1 ? (nombre.get(propias[0]) ?? null) : null,
        cuentasRussell: propias.map((cuenta) => ({ cuenta, nombre: nombre.get(cuenta) ?? null })),
        actualizadoPor: f.actualizadoPor,
        actualizadoEn: f.actualizadoPor ? f.actualizadoEn.toISOString() : null,
      };
    }),
    cuentas: cuentas.map((cuenta) => {
      const deLaCuenta = filas.filter((f) => cuentasDeMapeo(f).includes(cuenta));
      return {
        cuenta,
        nombre: nombre.get(cuenta) ?? null,
        conceptos: deLaCuenta.map((f) => f.etiqueta),
        restarTerceroDian: restar.get(cuenta) ?? !CUENTAS_SIN_RESTA_DIAN_FABRICA.includes(cuenta),
        porTercero: deLaCuenta.some((f) => seccionPorTercero(f.seccion)),
      };
    }),
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

/**
 * Los calendarios de todos los formularios de un año (la pantalla los muestra en chips) y los años
 * que tienen alguno cargado.
 */
export async function cargarCalendariosDian(anio: number): Promise<{ anios: number[]; calendarios: CalendarioVista[] }> {
  const [anios, filas] = await Promise.all([
    prisma.vencimientoDian.findMany({ distinct: ["anio"], select: { anio: true }, orderBy: { anio: "desc" } }),
    prisma.vencimientoDian.findMany({ where: { anio }, orderBy: [{ periodo: "asc" }, { ultimoDigito: "asc" }] }),
  ]);
  return {
    anios: anios.map((a) => a.anio),
    calendarios: CLAVES_CALENDARIO.map((formulario) => {
      const delFormulario = filas.filter((f) => f.formulario === formulario);
      const ultima = delFormulario.reduce<(typeof filas)[number] | null>((max, f) => (!max || f.actualizadoEn > max.actualizadoEn ? f : max), null);
      return {
        anio,
        formulario,
        filas: delFormulario.map((f) => ({ periodo: f.periodo, ultimoDigito: f.ultimoDigito, fecha: fechaCalendarioISO(f.fecha) })),
        actualizadoPor: ultima?.actualizadoPor ?? null,
        actualizadoEn: ultima ? ultima.actualizadoEn.toISOString() : null,
      };
    }),
  };
}
