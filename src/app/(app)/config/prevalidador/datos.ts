import "server-only";
import prisma from "@/lib/prisma";
import { PREVALIDADOR_MODULOS_ORDEN } from "@/lib/balance/prevalidador/catalogo";
import { descriptorModulo } from "@/lib/modulos/descriptores";
import {
  moduloConCategoria,
  moduloConCuentasConciliacion,
  moduloConOrigenPorCuenta,
  moduloConSubgruposConciliacion,
  subgruposFijosDe,
} from "@/lib/modulos/cuentas-conciliacion";

/** Módulo del prevalidador por el segmento de la ruta (`cxp` → `CXP`), o `null` si no es uno de los seis. */
export function moduloDeRuta(segmento: string | null | undefined): string | null {
  const codigo = String(segmento ?? "").trim().toUpperCase();
  return PREVALIDADOR_MODULOS_ORDEN.includes(codigo) ? codigo : null;
}

/** Lo que la página de un módulo necesita de su descriptor (tiene funciones: no viaja al cliente tal cual). */
export function configuracionModulo(codigo: string) {
  const descriptor = descriptorModulo(codigo);
  const cedula = descriptor?.cedula;
  return {
    /** Concilia contra una lista de cuentas de 6 dígitos (Ingresos, Cartera, CxP, Nómina). */
    conCuentas6: moduloConCuentasConciliacion(descriptor),
    /** Concilia contra una lista de subgrupos de 4 dígitos (Inventarios, Activos fijos). */
    conSubgrupos4: moduloConSubgruposConciliacion(descriptor),
    /** Subgrupos fijos en código que siempre concilian (la 1592 de Activos fijos). */
    subgruposFijos: subgruposFijosDe(descriptor),
    /** Sus cuentas deciden el origen nacional/exterior del saldo (Cartera y CxP). */
    conOrigen: moduloConOrigenPorCuenta(descriptor),
    /** Distingue cuentas que concilian de cuentas solo visibles (Nómina). */
    conCategoria: moduloConCategoria(descriptor),
    conCrucePorTercero: descriptor?.crucePorTercero.habilitado === true,
    /** Activos fijos: subgrupos abiertos a 6 dígitos y pares activo → depreciación (fijos en código). */
    subgruposAbiertos: (cedula?.subgruposAbiertos ?? []).map((s) => s.subgrupo),
    paresRelacionados: (cedula?.valorRelacionado?.pares ?? []).map((p) => ({ subgrupo: p.subgrupo, cuenta6: p.cuenta6 })),
  };
}

/** Subgrupos de 4 dígitos del plan estándar Russell (buscador y nombres). */
export async function cargarPlan4(): Promise<{ codigo: string; nombre: string }[]> {
  const plan = await prisma.subgrupoEstandar.findMany({ select: { codigo: true, nombre: true }, orderBy: { codigo: "asc" } });
  return plan.filter((s) => /^\d{4}$/.test(s.codigo));
}

/** Cuentas de 6 dígitos del plan estándar Russell (buscador y nombres). */
export async function cargarPlan6(): Promise<{ codigo: string; nombre: string }[]> {
  const plan = await prisma.standardAccount.findMany({ select: { code: true, name: true }, orderBy: { code: "asc" } });
  return plan.filter((c) => /^\d{6}$/.test(c.code)).map((c) => ({ codigo: c.code, nombre: c.name }));
}
