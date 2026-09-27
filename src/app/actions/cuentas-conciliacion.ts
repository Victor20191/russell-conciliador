"use server";

// Cuentas Russell de 6 dígitos que concilia cada módulo (`cuentas_conciliacion_modulo`),
// administradas en /config/prevalidador junto con los prefijos del prevalidador. Un cambio rige
// de inmediato para todos los cargues (el cruce se recalcula al leer), salvo los períodos con la
// conciliación en firme, que conservan la copia guardada en su cierre.

import { revalidatePath, updateTag } from "next/cache";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/dal";
import { logAudit } from "@/lib/audit";
import { authorizePermiso } from "@/lib/rbac";
import { mensajeErrorBD } from "@/lib/errores";
import { tomarCandadoTransaccion, transaccionSerializable } from "@/lib/concurrency";
import { CuentaConciliacionSchema, OrigenCuentaConciliacionFormSchema, type ActionState } from "@/lib/definitions";
import { descriptorModulo } from "@/lib/modulos/descriptores";
import { moduloConCuentasConciliacion, moduloConOrigenPorCuenta } from "@/lib/modulos/cuentas-conciliacion";
import { CUENTAS_CONCILIACION_CACHE_TAG } from "@/lib/parametros/cuentas-conciliacion";

const PERMISO = "parametros:administrar";
const PATH_CONFIG = "/config/prevalidador";

class ErrorDominio extends Error {}

const ETIQUETA_ORIGEN = { nacional: "nacional", exterior: "del exterior" } as const;

/** Tras un cambio: la caché de la configuración y las pantallas que la leen. */
function invalidar() {
  updateTag(CUENTAS_CONCILIACION_CACHE_TAG);
  revalidatePath(PATH_CONFIG);
  revalidatePath("/modulos", "layout");
  revalidatePath("/config/conceptos-nomina");
}

/** El módulo tiene que conciliar a 6 dígitos y, para el origen, distinguir nacional/exterior. */
function validarModulo(moduloCodigo: string, origen: string | null): string {
  const descriptor = descriptorModulo(moduloCodigo);
  if (!descriptor) throw new ErrorDominio("Módulo no soportado.");
  if (!moduloConCuentasConciliacion(descriptor)) {
    throw new ErrorDominio(`${descriptor.label} concilia por subgrupo de 4 dígitos: su filtro son los prefijos del prevalidador.`);
  }
  if (origen && !moduloConOrigenPorCuenta(descriptor)) {
    throw new ErrorDominio(`${descriptor.label} no distingue cuentas nacionales y del exterior.`);
  }
  return descriptor.label;
}

/** Agrega una cuenta de 6 dígitos a las que concilia el módulo. */
export async function agregarCuentaConciliacion(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const authz = await authorizePermiso(PERMISO);
  if (!authz.ok) return { ok: false, message: authz.message };
  const parsed = CuentaConciliacionSchema.safeParse({
    moduloCodigo: formData.get("moduloCodigo"),
    cuenta: formData.get("cuenta"),
    origen: formData.get("origen"),
  });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  const { moduloCodigo, cuenta, origen } = parsed.data;

  try {
    const etiquetaModulo = validarModulo(moduloCodigo, origen);
    const user = await getCurrentUser();
    const nombre = await transaccionSerializable(async (tx) => {
      await tomarCandadoTransaccion(tx, `cuentas-conciliacion:${moduloCodigo}`);
      const [plan, existente] = await Promise.all([
        tx.standardAccount.findUnique({ where: { code: cuenta }, select: { name: true } }),
        tx.cuentaConciliacionModulo.findUnique({ where: { moduloCodigo_cuenta: { moduloCodigo, cuenta } }, select: { id: true } }),
      ]);
      if (!plan) throw new ErrorDominio(`La cuenta ${cuenta} no existe en el plan estándar Russell.`);
      if (existente) throw new ErrorDominio(`${etiquetaModulo} ya concilia la cuenta ${cuenta}.`);
      await tx.cuentaConciliacionModulo.create({ data: { moduloCodigo, cuenta, origen, actualizadoPor: user?.name ?? null } });
      return plan.name;
    });

    await logAudit({
      user: user?.name ?? "Sistema",
      action: "AGREGÓ CUENTA DE CONCILIACIÓN",
      entity: `${etiquetaModulo} · ${cuenta}`,
      detail: `${nombre}${origen ? ` · cuenta ${ETIQUETA_ORIGEN[origen]}` : ""}`,
    });
    invalidar();
    return { ok: true, message: `Cuenta ${cuenta} agregada a ${etiquetaModulo}.` };
  } catch (e) {
    if (e instanceof ErrorDominio) return { ok: false, message: e.message };
    return { ok: false, message: mensajeErrorBD("agregarCuentaConciliacion", e) };
  }
}

/** Cambia qué cuenta es la nacional o la del exterior (Cartera y CxP). */
export async function cambiarOrigenCuentaConciliacion(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const authz = await authorizePermiso(PERMISO);
  if (!authz.ok) return { ok: false, message: authz.message };
  const parsed = OrigenCuentaConciliacionFormSchema.safeParse({ id: formData.get("id"), origen: formData.get("origen") });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  const { id, origen } = parsed.data;

  try {
    const fila = await prisma.cuentaConciliacionModulo.findUnique({ where: { id }, select: { moduloCodigo: true, cuenta: true, origen: true } });
    if (!fila) return { ok: false, message: "Esa cuenta ya no está configurada." };
    const etiquetaModulo = validarModulo(fila.moduloCodigo, origen);
    if ((fila.origen ?? null) === origen) return { ok: true, message: "Sin cambios." };
    const user = await getCurrentUser();
    await prisma.cuentaConciliacionModulo.update({ where: { id }, data: { origen, actualizadoPor: user?.name ?? null } });

    await logAudit({
      user: user?.name ?? "Sistema",
      action: "CAMBIÓ ORIGEN DE CUENTA DE CONCILIACIÓN",
      entity: `${etiquetaModulo} · ${fila.cuenta}`,
      detail: `${fila.origen ? ETIQUETA_ORIGEN[fila.origen as keyof typeof ETIQUETA_ORIGEN] ?? fila.origen : "sin origen"} → ${origen ? ETIQUETA_ORIGEN[origen] : "sin origen"}`,
    });
    invalidar();
    return { ok: true, message: `Origen de la cuenta ${fila.cuenta} actualizado.` };
  } catch (e) {
    if (e instanceof ErrorDominio) return { ok: false, message: e.message };
    return { ok: false, message: mensajeErrorBD("cambiarOrigenCuentaConciliacion", e) };
  }
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
      const actual = await tx.cuentaConciliacionModulo.findUnique({ where: { id }, select: { moduloCodigo: true, cuenta: true } });
      if (!actual) throw new ErrorDominio("Esa cuenta ya no está configurada.");
      await tomarCandadoTransaccion(tx, `cuentas-conciliacion:${actual.moduloCodigo}`);
      // Sin ninguna cuenta la cédula dejaría de acotar y conciliaría todas las de sus prefijos.
      const restantes = await tx.cuentaConciliacionModulo.count({ where: { moduloCodigo: actual.moduloCodigo } });
      if (restantes <= 1) throw new ErrorDominio("El módulo debe conciliar al menos una cuenta: agrega otra antes de quitar esta.");
      await tx.cuentaConciliacionModulo.delete({ where: { id } });
      return actual;
    });
    const etiquetaModulo = descriptorModulo(fila.moduloCodigo)?.label ?? fila.moduloCodigo;

    await logAudit({
      user: user?.name ?? "Sistema",
      action: "QUITÓ CUENTA DE CONCILIACIÓN",
      entity: `${etiquetaModulo} · ${fila.cuenta}`,
      detail: "Deja de conciliarse en los cargues abiertos; los períodos en firme conservan sus cuentas.",
    });
    invalidar();
    return { ok: true, message: `Cuenta ${fila.cuenta} retirada de ${etiquetaModulo}.` };
  } catch (e) {
    if (e instanceof ErrorDominio) return { ok: false, message: e.message };
    return { ok: false, message: mensajeErrorBD("quitarCuentaConciliacion", e) };
  }
}
