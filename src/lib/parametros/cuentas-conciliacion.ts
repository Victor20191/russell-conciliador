// Cuentas de 6 dígitos (`cuentas_conciliacion_modulo`) y subgrupos de 4 (`subgrupos_conciliacion_modulo`)
// que concilia cada módulo, administrados en /config/prevalidador. Mismo criterio que el catálogo del
// prevalidador: se cachean en el Data Cache de Next (tag `CUENTAS_CONCILIACION_CACHE_TAG`, invalidado
// por la Server Action) y fallan CERRADO: un error de BD se propaga, nunca se reemplaza la
// configuración por la de fábrica. La de fábrica solo cubre un módulo SIN filas o un cierre ilegible.
//
// Un cambio rige para todos los cargues, salvo el período con la conciliación en firme: ahí manda
// la copia que guardó el cierre (o la de fábrica, en los cierres anteriores a esta configuración).
import "server-only";
import { unstable_cache } from "next/cache";
import prisma from "@/lib/prisma";
import { descriptorModulo, MODULOS_IMPORT, type DescriptorModulo } from "@/lib/modulos/descriptores";
import {
  aplicarCuentasConciliacion,
  aplicarParesDepreciacion,
  aplicarSubgruposConciliacion,
  cuentasConciliacionDe,
  esCategoriaCuentaConciliacion,
  esOrigenCuentaConciliacion,
  leerCuentasConciliacionGuardadas,
  leerParesDepreciacionGuardados,
  leerSubgruposConciliacionGuardados,
  moduloConCuentasConciliacion,
  moduloConParesDepreciacion,
  moduloConSubgruposConciliacion,
  normalizarCuentaConciliacion,
  normalizarParDepreciacion,
  normalizarSubgrupoConciliacion,
  paresDepreciacionDe,
  subgruposConciliacionDeFabrica,
  subgruposDeCuentasRussellCierre,
  type CuentaConciliacion,
  type ParDepreciacion,
} from "@/lib/modulos/cuentas-conciliacion";
import { ESTADO_CIERRE_FIRME } from "@/lib/conciliacion/cuentas-bloqueo";

export const CUENTAS_CONCILIACION_CACHE_TAG = "cuentas-conciliacion-modulo";

/** El cliente y período de un cargue: decide si manda la copia del cierre en firme. */
export type ContextoCuentasConciliacion = { clienteId: number; periodo: string };

async function leerCuentasVigentes(): Promise<Record<string, CuentaConciliacion[]>> {
  const filas = await prisma.cuentaConciliacionModulo.findMany({
    select: { moduloCodigo: true, cuenta: true, origen: true, categoria: true },
    orderBy: [{ moduloCodigo: "asc" }, { cuenta: "asc" }],
  });
  const porModulo: Record<string, CuentaConciliacion[]> = {};
  for (const f of filas) {
    const cuenta = normalizarCuentaConciliacion(f.cuenta);
    if (!cuenta) throw new Error(`La cuenta ${f.cuenta || "vacía"} de ${f.moduloCodigo} no es una cuenta Russell de 6 dígitos.`);
    if (!esCategoriaCuentaConciliacion(f.categoria)) throw new Error(`La cuenta ${cuenta} de ${f.moduloCodigo} tiene una categoría desconocida («${f.categoria}»).`);
    (porModulo[f.moduloCodigo] ??= []).push({ cuenta, origen: esOrigenCuentaConciliacion(f.origen) ? f.origen : null, categoria: f.categoria });
  }
  return porModulo;
}

// La clave lleva versión: una entrada guardada antes de la categoría (1/Oct/2026) no se reutiliza.
const cuentasCacheadas = unstable_cache(leerCuentasVigentes, ["cuentas-conciliacion-vigentes-v2"], {
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

// ===== Subgrupos de 4 dígitos (Inventarios, Activos fijos) =====

type SubgruposPorModulo = {
  /** Los configurados en /config/prevalidador o, si el módulo no tiene filas, los de fábrica. */
  vigentes: Record<string, string[]>;
  /** Los de fábrica: el plan bajo los prefijos de fábrica (respaldo de un cierre ilegible). */
  fabrica: Record<string, string[]>;
};

async function leerSubgruposVigentes(): Promise<SubgruposPorModulo> {
  const [filas, plan] = await Promise.all([
    prisma.subgrupoConciliacionModulo.findMany({
      select: { moduloCodigo: true, subgrupo: true },
      orderBy: [{ moduloCodigo: "asc" }, { subgrupo: "asc" }],
    }),
    prisma.subgrupoEstandar.findMany({ select: { codigo: true }, orderBy: { codigo: "asc" } }),
  ]);
  const configurados: Record<string, string[]> = {};
  for (const f of filas) {
    const subgrupo = normalizarSubgrupoConciliacion(f.subgrupo);
    if (!subgrupo) throw new Error(`El subgrupo ${f.subgrupo || "vacío"} de ${f.moduloCodigo} no es un subgrupo Russell de 4 dígitos.`);
    (configurados[f.moduloCodigo] ??= []).push(subgrupo);
  }
  const vigentes: Record<string, string[]> = {};
  const fabrica: Record<string, string[]> = {};
  for (const descriptor of Object.values(MODULOS_IMPORT)) {
    const deFabrica = subgruposConciliacionDeFabrica(descriptor, plan);
    if (!deFabrica) continue;
    fabrica[descriptor.codigo] = deFabrica;
    vigentes[descriptor.codigo] = configurados[descriptor.codigo] ?? deFabrica;
  }
  return { vigentes, fabrica };
}

// Mismo tag que las cuentas de 6: un cambio en cualquiera de las dos listas invalida ambas.
const subgruposCacheados = unstable_cache(leerSubgruposVigentes, ["subgrupos-conciliacion-vigentes"], {
  tags: [CUENTAS_CONCILIACION_CACHE_TAG],
});

/** Subgrupos vigentes por código de módulo (solo los que concilian a 4 dígitos). */
export async function getSubgruposConciliacion(): Promise<Record<string, string[]>> {
  return (await subgruposCacheados()).vigentes;
}

/**
 * Los subgrupos con que se concilia el módulo: los vigentes o, si el período del cargue tiene la
 * conciliación en firme, los que guardó el cierre. Un cierre anterior a la lista usa los subgrupos
 * que quedaron en firme en él (`cuentas_russell`), nunca las reglas vivas del prevalidador. `null` si
 * el módulo no concilia a 4 dígitos.
 */
export async function subgruposConciliacionModulo(
  descriptor: DescriptorModulo,
  contexto?: ContextoCuentasConciliacion | null,
): Promise<string[] | null> {
  if (!moduloConSubgruposConciliacion(descriptor)) return null;
  const cache = await subgruposCacheados();
  if (contexto) {
    const cierre = await prisma.conciliacionModuloCierre.findUnique({
      where: { clienteId_moduloCodigo_periodo: { clienteId: contexto.clienteId, moduloCodigo: descriptor.codigo, periodo: contexto.periodo } },
      select: { estado: true, subgruposConciliacion: true, cuentasRussell: true },
    });
    if (cierre?.estado === ESTADO_CIERRE_FIRME) {
      return leerSubgruposConciliacionGuardados(cierre.subgruposConciliacion)
        ?? subgruposDeCuentasRussellCierre(cierre.cuentasRussell)
        ?? cache.fabrica[descriptor.codigo]
        ?? [];
    }
  }
  return cache.vigentes[descriptor.codigo] ?? [];
}

/**
 * El descriptor con las cuentas que concilia hoy (o las del cierre en firme del período): las de 6
 * dígitos en Ingresos, Cartera, CxP y Nómina; los subgrupos de 4 en Inventarios y Activos fijos. Todo
 * el que arme la cédula, el cruce por tercero o el Consolidado de un cargue debe pasar por aquí en
 * vez de usar el descriptor estático, que solo trae los valores de fábrica.
 */
export async function resolverDescriptorVigente(
  descriptor: DescriptorModulo,
  contexto?: ContextoCuentasConciliacion | null,
): Promise<DescriptorModulo> {
  const base = moduloConSubgruposConciliacion(descriptor)
    ? aplicarSubgruposConciliacion(descriptor, await subgruposConciliacionModulo(descriptor, contexto))
    : aplicarCuentasConciliacion(descriptor, await cuentasConciliacionModulo(descriptor, contexto));
  // Activos fijos: además, con qué 1592## se junta cada activo en la cédula.
  return moduloConParesDepreciacion(base)
    ? aplicarParesDepreciacion(base, await paresDepreciacionModulo(base, contexto))
    : base;
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
    select: { id: true, moduloCodigo: true, cuenta: true, origen: true, categoria: true, actualizadoPor: true, actualizadoEn: true },
    orderBy: [{ moduloCodigo: "asc" }, { cuenta: "asc" }],
  });
  return filas.map((f) => ({
    id: f.id,
    moduloCodigo: f.moduloCodigo,
    cuenta: f.cuenta,
    origen: esOrigenCuentaConciliacion(f.origen) ? f.origen : null,
    categoria: f.categoria === "visible" ? "visible" : "concilia",
    actualizadoPor: f.actualizadoPor,
    actualizadoEn: f.actualizadoEn.toISOString(),
  }));
}

export type SubgrupoConciliacionVista = {
  id: number;
  moduloCodigo: string;
  subgrupo: string;
  actualizadoPor: string | null;
  actualizadoEn: string; // ISO
};

/** Subgrupos configurados de un módulo para /config/prevalidador (sin caché, como la del catálogo). */
export async function getSubgruposConciliacionVista(moduloCodigo: string): Promise<SubgrupoConciliacionVista[]> {
  const filas = await prisma.subgrupoConciliacionModulo.findMany({
    where: { moduloCodigo },
    select: { id: true, moduloCodigo: true, subgrupo: true, actualizadoPor: true, actualizadoEn: true },
    orderBy: { subgrupo: "asc" },
  });
  return filas.map((f) => ({ ...f, actualizadoEn: f.actualizadoEn.toISOString() }));
}

// ===== Parejas activo → depreciación (Activos fijos) =====

async function leerParesVigentes(): Promise<Record<string, ParDepreciacion[]>> {
  const filas = await prisma.parDepreciacionModulo.findMany({
    select: { moduloCodigo: true, subgrupo: true, cuenta: true },
    orderBy: [{ moduloCodigo: "asc" }, { subgrupo: "asc" }],
  });
  const porModulo: Record<string, ParDepreciacion[]> = {};
  for (const f of filas) {
    const par = normalizarParDepreciacion(f.subgrupo, f.cuenta);
    if (!par) throw new Error(`La pareja ${f.subgrupo || "vacía"} → ${f.cuenta || "vacía"} de ${f.moduloCodigo} no es 4 → 6 dígitos.`);
    (porModulo[f.moduloCodigo] ??= []).push(par);
  }
  return porModulo;
}

// Mismo tag que las otras dos listas: un cambio en cualquiera invalida todas.
const paresCacheados = unstable_cache(leerParesVigentes, ["pares-depreciacion-vigentes"], {
  tags: [CUENTAS_CONCILIACION_CACHE_TAG],
});

/** Parejas vigentes por código de módulo. Un módulo sin filas usa las de fábrica del descriptor. */
export async function getParesDepreciacion(): Promise<Record<string, ParDepreciacion[]>> {
  return paresCacheados();
}

/**
 * Las parejas con que se arma la cédula: las vigentes o, si el período del cargue tiene la
 * conciliación en firme, las que guardó el cierre. `null` si el módulo no cruza un valor relacionado.
 */
export async function paresDepreciacionModulo(
  descriptor: DescriptorModulo,
  contexto?: ContextoCuentasConciliacion | null,
): Promise<ParDepreciacion[] | null> {
  if (!moduloConParesDepreciacion(descriptor)) return null;
  if (contexto) {
    const cierre = await prisma.conciliacionModuloCierre.findUnique({
      where: { clienteId_moduloCodigo_periodo: { clienteId: contexto.clienteId, moduloCodigo: descriptor.codigo, periodo: contexto.periodo } },
      select: { estado: true, paresDepreciacion: true },
    });
    if (cierre?.estado === ESTADO_CIERRE_FIRME) {
      return leerParesDepreciacionGuardados(cierre.paresDepreciacion) ?? paresDepreciacionDe(descriptor);
    }
  }
  // Sin filas configuradas rigen las de fábrica: nunca se deja el módulo sin parejas.
  const vigentes = (await getParesDepreciacion())[descriptor.codigo];
  return vigentes && vigentes.length > 0 ? vigentes : paresDepreciacionDe(descriptor);
}

export type ParDepreciacionVista = ParDepreciacion & {
  id: number;
  moduloCodigo: string;
  actualizadoPor: string | null;
  actualizadoEn: string; // ISO
};

/** Parejas configuradas de un módulo para /config/prevalidador (sin caché, como el catálogo). */
export async function getParesDepreciacionVista(moduloCodigo: string): Promise<ParDepreciacionVista[]> {
  const filas = await prisma.parDepreciacionModulo.findMany({
    where: { moduloCodigo },
    select: { id: true, moduloCodigo: true, subgrupo: true, cuenta: true, actualizadoPor: true, actualizadoEn: true },
    orderBy: { subgrupo: "asc" },
  });
  return filas.map((f) => ({
    id: f.id,
    moduloCodigo: f.moduloCodigo,
    subgrupo: f.subgrupo,
    cuenta6: f.cuenta,
    actualizadoPor: f.actualizadoPor,
    actualizadoEn: f.actualizadoEn.toISOString(),
  }));
}
