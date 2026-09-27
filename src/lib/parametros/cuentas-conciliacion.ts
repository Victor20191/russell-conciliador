// Cuentas de 6 dígitos que concilia cada módulo (`cuentas_conciliacion_modulo`), administradas en
// /config/prevalidador. Mismo criterio que el catálogo del prevalidador: se cachea en el Data
// Cache de Next (tag `CUENTAS_CONCILIACION_CACHE_TAG`, invalidado por la Server Action) y falla
// CERRADO: un error de BD se propaga, nunca se reemplaza la configuración por la de fábrica.
//
// Un cambio rige para todos los cargues, salvo el período con la conciliación en firme: ahí manda
// la copia que guardó el cierre (o la de fábrica, en los cierres anteriores a esta configuración).
import "server-only";
import { unstable_cache } from "next/cache";
import prisma from "@/lib/prisma";
import { descriptorModulo, type DescriptorModulo } from "@/lib/modulos/descriptores";
import {
  aplicarCuentasConciliacion,
  cuentasConciliacionDe,
  esOrigenCuentaConciliacion,
  leerCuentasConciliacionGuardadas,
  moduloConCuentasConciliacion,
  normalizarCuentaConciliacion,
  type CuentaConciliacion,
} from "@/lib/modulos/cuentas-conciliacion";
import { ESTADO_CIERRE_FIRME } from "@/lib/conciliacion/cuentas-bloqueo";

export const CUENTAS_CONCILIACION_CACHE_TAG = "cuentas-conciliacion-modulo";

/** El cliente y período de un cargue: decide si manda la copia del cierre en firme. */
export type ContextoCuentasConciliacion = { clienteId: number; periodo: string };

async function leerCuentasVigentes(): Promise<Record<string, CuentaConciliacion[]>> {
  const filas = await prisma.cuentaConciliacionModulo.findMany({
    select: { moduloCodigo: true, cuenta: true, origen: true },
    orderBy: [{ moduloCodigo: "asc" }, { cuenta: "asc" }],
  });
  const porModulo: Record<string, CuentaConciliacion[]> = {};
  for (const f of filas) {
    const cuenta = normalizarCuentaConciliacion(f.cuenta);
    if (!cuenta) throw new Error(`La cuenta ${f.cuenta || "vacía"} de ${f.moduloCodigo} no es una cuenta Russell de 6 dígitos.`);
    (porModulo[f.moduloCodigo] ??= []).push({ cuenta, origen: esOrigenCuentaConciliacion(f.origen) ? f.origen : null });
  }
  return porModulo;
}

const cuentasCacheadas = unstable_cache(leerCuentasVigentes, ["cuentas-conciliacion-vigentes"], {
  tags: [CUENTAS_CONCILIACION_CACHE_TAG],
});

/** Cuentas vigentes por código de módulo. Un módulo sin filas concilia todas las de sus prefijos. */
export async function getCuentasConciliacion(): Promise<Record<string, CuentaConciliacion[]>> {
  return cuentasCacheadas();
}

/**
 * Las cuentas con que se concilia el módulo: las vigentes o, si el período del cargue tiene la
 * conciliación en firme, las que guardó el cierre. `null` si el módulo no concilia a 6 dígitos.
 */
export async function cuentasConciliacionModulo(
  descriptor: DescriptorModulo,
  contexto?: ContextoCuentasConciliacion | null,
): Promise<CuentaConciliacion[] | null> {
  if (!moduloConCuentasConciliacion(descriptor)) return null;
  if (contexto) {
    const cierre = await prisma.conciliacionModuloCierre.findUnique({
      where: { clienteId_moduloCodigo_periodo: { clienteId: contexto.clienteId, moduloCodigo: descriptor.codigo, periodo: contexto.periodo } },
      select: { estado: true, cuentasConciliacion: true },
    });
    if (cierre?.estado === ESTADO_CIERRE_FIRME) {
      return leerCuentasConciliacionGuardadas(cierre.cuentasConciliacion) ?? cuentasConciliacionDe(descriptor);
    }
  }
  return (await getCuentasConciliacion())[descriptor.codigo] ?? [];
}

/**
 * El descriptor con las cuentas que concilia hoy (o las del cierre en firme del período). Todo el
 * que arme la cédula, el cruce por tercero o el Consolidado de un cargue debe pasar por aquí en
 * vez de usar el descriptor estático, que solo trae los valores de fábrica.
 */
export async function resolverDescriptorVigente(
  descriptor: DescriptorModulo,
  contexto?: ContextoCuentasConciliacion | null,
): Promise<DescriptorModulo> {
  return aplicarCuentasConciliacion(descriptor, await cuentasConciliacionModulo(descriptor, contexto));
}

/** Atajo por código de módulo; `null` si el módulo no está registrado. */
export async function descriptorVigente(
  codigo: string,
  contexto?: ContextoCuentasConciliacion | null,
): Promise<DescriptorModulo | null> {
  const descriptor = descriptorModulo(codigo);
  return descriptor ? resolverDescriptorVigente(descriptor, contexto) : null;
}

export type CuentaConciliacionVista = CuentaConciliacion & {
  id: number;
  moduloCodigo: string;
  actualizadoPor: string | null;
  actualizadoEn: string; // ISO
};

/** Vista completa para /config/prevalidador (sin caché, como la del catálogo). */
export async function getCuentasConciliacionVista(): Promise<CuentaConciliacionVista[]> {
  const filas = await prisma.cuentaConciliacionModulo.findMany({
    select: { id: true, moduloCodigo: true, cuenta: true, origen: true, actualizadoPor: true, actualizadoEn: true },
    orderBy: [{ moduloCodigo: "asc" }, { cuenta: "asc" }],
  });
  return filas.map((f) => ({
    id: f.id,
    moduloCodigo: f.moduloCodigo,
    cuenta: f.cuenta,
    origen: esOrigenCuentaConciliacion(f.origen) ? f.origen : null,
    actualizadoPor: f.actualizadoPor,
    actualizadoEn: f.actualizadoEn.toISOString(),
  }));
}
