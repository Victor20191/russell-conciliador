"use server";

// Cuentas Russell de 6 dígitos (`cuentas_conciliacion_modulo`) y subgrupos de 4
// (`subgrupos_conciliacion_modulo`) que concilia cada módulo, administrados en /config/prevalidador
// junto con los prefijos del prevalidador, pero independientes de ellos. Un cambio rige
// de inmediato para todos los cargues (el cruce se recalcula al leer), salvo los períodos con la
// conciliación en firme, que conservan la copia guardada en su cierre.

import { revalidatePath, updateTag } from "next/cache";
import { getCurrentUser } from "@/lib/dal";
import { logAudit } from "@/lib/audit";
import { authorizePermiso } from "@/lib/rbac";
import { mensajeErrorBD } from "@/lib/errores";
import { tomarCandadoTransaccion, transaccionSerializable } from "@/lib/concurrency";
import { CuentaConciliacionSchema, SubgrupoConciliacionSchema, type ActionState } from "@/lib/definitions";
import { descriptorModulo } from "@/lib/modulos/descriptores";
import {
  moduloConCategoria,
  moduloConCuentasConciliacion,
  moduloConOrigenPorCuenta,
  moduloConSubgruposConciliacion,
  subgruposFijosDe,
} from "@/lib/modulos/cuentas-conciliacion";
import { CUENTAS_CONCILIACION_CACHE_TAG } from "@/lib/parametros/cuentas-conciliacion";

const PERMISO = "parametros:administrar";
const PATH_CONFIG = "/config/prevalidador";

class ErrorDominio extends Error {}

const ETIQUETA_ORIGEN = { nacional: "nacional", exterior: "del exterior" } as const;
const ETIQUETA_CATEGORIA = { concilia: "concilia", visible: "solo visible" } as const;

/** Tras un cambio: la caché de la configuración y las pantallas que la leen. */
function invalidar() {
  updateTag(CUENTAS_CONCILIACION_CACHE_TAG);
  revalidatePath(PATH_CONFIG, "layout");
  revalidatePath("/modulos", "layout");
  revalidatePath("/config/conceptos-nomina");
}

/**
 * El módulo tiene que conciliar a 6 dígitos; para el origen, distinguir nacional/exterior, y para una
 * cuenta solo visible, admitir categoría (Nómina).
 */
function validarModulo(moduloCodigo: string, origen: string | null, categoria: "concilia" | "visible"): string {
  const descriptor = descriptorModulo(moduloCodigo);
  if (!descriptor) throw new ErrorDominio("Módulo no soportado.");
  if (!moduloConCuentasConciliacion(descriptor)) {
    throw new ErrorDominio(`${descriptor.label} concilia por subgrupo de 4 dígitos: agrega subgrupos, no cuentas.`);
  }
  if (origen && !moduloConOrigenPorCuenta(descriptor)) {
    throw new ErrorDominio(`${descriptor.label} no distingue cuentas nacionales y del exterior.`);
  }
  if (categoria === "visible" && !moduloConCategoria(descriptor)) {
    throw new ErrorDominio(`${descriptor.label} no tiene cuentas solo visibles: todas sus cuentas concilian.`);
  }
  return descriptor.label;
}

/** Cuentas que CONCILIAN en el módulo (las solo visibles no acotan la cédula). */
const QUE_CONCILIAN = { categoria: "concilia" } as const;

/** Alta o edición de una cuenta de 6 dígitos que concilia un módulo (mismo flujo que los prefijos). */
export async function guardarCuentaConciliacion(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const authz = await authorizePermiso(PERMISO);
  if (!authz.ok) return { ok: false, message: authz.message };
  const parsed = CuentaConciliacionSchema.safeParse({
    id: formData.get("id"),
    moduloCodigo: formData.get("moduloCodigo"),
    cuenta: formData.get("cuenta"),
    origen: formData.get("origen"),
    categoria: formData.get("categoria"),
  });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  const { id, moduloCodigo, cuenta, origen, categoria } = parsed.data;

  try {
    const etiquetaModulo = validarModulo(moduloCodigo, origen, categoria);
    const user = await getCurrentUser();
    const resultado = await transaccionSerializable(async (tx) => {
      const previa = id
        ? await tx.cuentaConciliacionModulo.findUnique({ where: { id }, select: { moduloCodigo: true, cuenta: true, origen: true, categoria: true } })
        : null;
      if (id && !previa) throw new ErrorDominio("Esa cuenta ya no está configurada.");
      // Candado de los módulos que cambian (el de origen y el de destino, en orden fijo).
      for (const m of [...new Set([moduloCodigo, previa?.moduloCodigo].filter((x): x is string => !!x))].sort()) {
        await tomarCandadoTransaccion(tx, `cuentas-conciliacion:${m}`);
      }
      const [plan, duplicada] = await Promise.all([
        tx.standardAccount.findUnique({ where: { code: cuenta }, select: { name: true } }),
        tx.cuentaConciliacionModulo.findUnique({ where: { moduloCodigo_cuenta: { moduloCodigo, cuenta } }, select: { id: true } }),
      ]);
      if (!plan) throw new ErrorDominio(`La cuenta ${cuenta} no existe en el plan estándar Russell.`);
      if (duplicada && duplicada.id !== id) throw new ErrorDominio(`${etiquetaModulo} ya concilia la cuenta ${cuenta}.`);
      // Pasar la cuenta a otro módulo, o volverla solo visible, no puede dejar un módulo sin
      // cuentas que concilien (sin ninguna, la cédula dejaría de acotar).
      if (previa && previa.categoria === "concilia" && (previa.moduloCodigo !== moduloCodigo || categoria !== "concilia")) {
        const restantes = await tx.cuentaConciliacionModulo.count({ where: { moduloCodigo: previa.moduloCodigo, ...QUE_CONCILIAN } });
        if (restantes <= 1) {
          throw new ErrorDominio(previa.moduloCodigo !== moduloCodigo
            ? "El módulo de origen debe conciliar al menos una cuenta: agrégale otra antes de mover esta."
            : "El módulo debe conciliar al menos una cuenta: deja otra que concilie antes de volver esta solo visible.");
        }
      }
      const datos = { moduloCodigo, cuenta, origen, categoria, actualizadoPor: user?.name ?? null };
      if (id) await tx.cuentaConciliacionModulo.update({ where: { id }, data: datos });
      else await tx.cuentaConciliacionModulo.create({ data: datos });
      return { nombre: plan.name, previa };
    });

    const { previa } = resultado;
    const cambios = previa
      ? [
          previa.moduloCodigo !== moduloCodigo ? `módulo ${descriptorModulo(previa.moduloCodigo)?.label ?? previa.moduloCodigo} → ${etiquetaModulo}` : null,
          previa.cuenta !== cuenta ? `cuenta ${previa.cuenta} → ${cuenta}` : null,
          (previa.origen ?? null) !== origen ? `origen ${etiquetaOrigen(previa.origen)} → ${etiquetaOrigen(origen)}` : null,
          previa.categoria !== categoria ? `categoría ${etiquetaCategoria(previa.categoria)} → ${ETIQUETA_CATEGORIA[categoria]}` : null,
        ].filter(Boolean)
      : [];
    await logAudit({
      user: user?.name ?? "Sistema",
      action: id ? "EDITÓ CUENTA DE CONCILIACIÓN" : "AGREGÓ CUENTA DE CONCILIACIÓN",
      entity: `${etiquetaModulo} · ${cuenta}`,
      detail: id
        ? cambios.join(" · ") || "Sin cambios"
        : `${resultado.nombre}${origen ? ` · cuenta ${ETIQUETA_ORIGEN[origen]}` : ""}${categoria === "visible" ? " · solo visible" : ""}`,
    });
    invalidar();
    return { ok: true, message: id ? `Cuenta ${cuenta} actualizada.` : `Cuenta ${cuenta} agregada a ${etiquetaModulo}.` };
  } catch (e) {
    if (e instanceof ErrorDominio) return { ok: false, message: e.message };
    return { ok: false, message: mensajeErrorBD("guardarCuentaConciliacion", e) };
  }
}

function etiquetaOrigen(origen: string | null | undefined): string {
  return origen === "nacional" || origen === "exterior" ? ETIQUETA_ORIGEN[origen] : "sin origen";
}

function etiquetaCategoria(categoria: string | null | undefined): string {
  return categoria === "visible" ? ETIQUETA_CATEGORIA.visible : ETIQUETA_CATEGORIA.concilia;
}

/** Quita una cuenta del módulo. Un módulo a 6 dígitos conserva al menos una. */
export async function quitarCuentaConciliacion(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const authz = await authorizePermiso(PERMISO);
  if (!authz.ok) return { ok: false, message: authz.message };
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id) || id <= 0) return { ok: false, message: "Cuenta inválida." };

  try {
    const user = await getCurrentUser();
    const fila = await transaccionSerializable(async (tx) => {
      const actual = await tx.cuentaConciliacionModulo.findUnique({ where: { id }, select: { moduloCodigo: true, cuenta: true, categoria: true } });
      if (!actual) throw new ErrorDominio("Esa cuenta ya no está configurada.");
      await tomarCandadoTransaccion(tx, `cuentas-conciliacion:${actual.moduloCodigo}`);
      // Sin ninguna cuenta que concilie la cédula dejaría de acotar y conciliaría todas las de sus
      // prefijos. Una solo visible se quita sin esa condición.
      if (actual.categoria === "concilia") {
        const restantes = await tx.cuentaConciliacionModulo.count({ where: { moduloCodigo: actual.moduloCodigo, ...QUE_CONCILIAN } });
        if (restantes <= 1) throw new ErrorDominio("El módulo debe conciliar al menos una cuenta: agrega otra antes de quitar esta.");
      }
      await tx.cuentaConciliacionModulo.delete({ where: { id } });
      return actual;
    });
    const etiquetaModulo = descriptorModulo(fila.moduloCodigo)?.label ?? fila.moduloCodigo;

    await logAudit({
      user: user?.name ?? "Sistema",
      action: "QUITÓ CUENTA DE CONCILIACIÓN",
      entity: `${etiquetaModulo} · ${fila.cuenta}`,
      detail: fila.categoria === "visible"
        ? "Deja de mostrarse en los cargues abiertos (era solo visible)."
        : "Deja de conciliarse en los cargues abiertos; los períodos en firme conservan sus cuentas.",
    });
    invalidar();
    return { ok: true, message: `Cuenta ${fila.cuenta} retirada de ${etiquetaModulo}.` };
  } catch (e) {
    if (e instanceof ErrorDominio) return { ok: false, message: e.message };
    return { ok: false, message: mensajeErrorBD("quitarCuentaConciliacion", e) };
  }
}

// ===== Subgrupos de 4 dígitos (Inventarios, Activos fijos) =====
// Las cuentas PROPIAS de un módulo con cédula a 4: deciden qué entra al cruce contable, sin tocar las
// reglas del prevalidador (que solo validan el balance). La 1592 de Activos fijos es fija en código.

/** El módulo tiene que conciliar a 4 dígitos; devuelve su descriptor. */
function validarModuloSubgrupos(moduloCodigo: string) {
  const descriptor = descriptorModulo(moduloCodigo);
  if (!descriptor) throw new ErrorDominio("Módulo no soportado.");
  if (!moduloConSubgruposConciliacion(descriptor)) {
    throw new ErrorDominio(`${descriptor.label} concilia por cuenta de 6 dígitos: agrega cuentas, no subgrupos.`);
  }
  return descriptor;
}

/** Agrega un subgrupo del plan estándar a los que concilia un módulo a 4 dígitos. */
export async function agregarSubgrupoConciliacion(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const authz = await authorizePermiso(PERMISO);
  if (!authz.ok) return { ok: false, message: authz.message };
  const parsed = SubgrupoConciliacionSchema.safeParse({
    moduloCodigo: formData.get("moduloCodigo"),
    subgrupo: formData.get("subgrupo"),
  });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  const { moduloCodigo, subgrupo } = parsed.data;

  try {
    const descriptor = validarModuloSubgrupos(moduloCodigo);
    if (subgruposFijosDe(descriptor).includes(subgrupo)) {
      throw new ErrorDominio(`${subgrupo} es fijo en ${descriptor.label}: siempre concilia (a 6 dígitos, con la depreciación relacionada).`);
    }
    const user = await getCurrentUser();
    const nombre = await transaccionSerializable(async (tx) => {
      await tomarCandadoTransaccion(tx, `cuentas-conciliacion:${moduloCodigo}`);
      const [plan, duplicado] = await Promise.all([
        tx.subgrupoEstandar.findUnique({ where: { codigo: subgrupo }, select: { nombre: true } }),
        tx.subgrupoConciliacionModulo.findUnique({ where: { moduloCodigo_subgrupo: { moduloCodigo, subgrupo } }, select: { id: true } }),
      ]);
      if (!plan) throw new ErrorDominio(`El subgrupo ${subgrupo} no existe en el plan estándar Russell.`);
      if (duplicado) throw new ErrorDominio(`${descriptor.label} ya concilia el subgrupo ${subgrupo}.`);
      await tx.subgrupoConciliacionModulo.create({ data: { moduloCodigo, subgrupo, actualizadoPor: user?.name ?? null } });
      return plan.nombre;
    });

    await logAudit({
      user: user?.name ?? "Sistema",
      action: "AGREGÓ SUBGRUPO DE CONCILIACIÓN",
      entity: `${descriptor.label} · ${subgrupo}`,
      detail: `${nombre}. Entra al cruce contable de los cargues abiertos; los períodos en firme conservan sus subgrupos.`,
    });
    invalidar();
    return { ok: true, message: `Subgrupo ${subgrupo} agregado a ${descriptor.label}.` };
  } catch (e) {
    if (e instanceof ErrorDominio) return { ok: false, message: e.message };
    return { ok: false, message: mensajeErrorBD("agregarSubgrupoConciliacion", e) };
  }
}

/** Quita un subgrupo de los que concilia un módulo. El módulo conserva al menos uno. */
export async function quitarSubgrupoConciliacion(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const authz = await authorizePermiso(PERMISO);
  if (!authz.ok) return { ok: false, message: authz.message };
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id) || id <= 0) return { ok: false, message: "Subgrupo inválido." };

  try {
    const user = await getCurrentUser();
    const fila = await transaccionSerializable(async (tx) => {
      const actual = await tx.subgrupoConciliacionModulo.findUnique({ where: { id }, select: { moduloCodigo: true, subgrupo: true } });
      if (!actual) throw new ErrorDominio("Ese subgrupo ya no está configurado.");
      await tomarCandadoTransaccion(tx, `cuentas-conciliacion:${actual.moduloCodigo}`);
      // Sin ningún subgrupo la cédula volvería a los de fábrica: el módulo conserva al menos uno.
      const restantes = await tx.subgrupoConciliacionModulo.count({ where: { moduloCodigo: actual.moduloCodigo } });
      if (restantes <= 1) throw new ErrorDominio("El módulo debe conciliar al menos un subgrupo: agrega otro antes de quitar este.");
      await tx.subgrupoConciliacionModulo.delete({ where: { id } });
      return actual;
    });
    const etiquetaModulo = descriptorModulo(fila.moduloCodigo)?.label ?? fila.moduloCodigo;

    await logAudit({
      user: user?.name ?? "Sistema",
      action: "QUITÓ SUBGRUPO DE CONCILIACIÓN",
      entity: `${etiquetaModulo} · ${fila.subgrupo}`,
      detail: "Deja de conciliarse en los cargues abiertos; los períodos en firme conservan sus subgrupos.",
    });
    invalidar();
    return { ok: true, message: `Subgrupo ${fila.subgrupo} retirado de ${etiquetaModulo}.` };
  } catch (e) {
    if (e instanceof ErrorDominio) return { ok: false, message: e.message };
    return { ok: false, message: mensajeErrorBD("quitarSubgrupoConciliacion", e) };
  }
}
