"use server";

import { revalidatePath, updateTag } from "next/cache";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/dal";
import { logAudit } from "@/lib/audit";
import { authorizePermiso } from "@/lib/rbac";
import { mensajeErrorBD } from "@/lib/errores";
import { fmt } from "@/lib/format";
import { ActualizarUmbralSchema, type ActionState } from "@/lib/definitions";
import { getUmbralesAlertas, UMBRALES_CACHE_TAG } from "@/lib/parametros/umbrales";
import { getUmbralDef } from "@/lib/balance/umbrales-alertas";
import { idsBalancesAbiertos, recalcularEstadoBalances } from "@/lib/balance/alertas-balance-datos";
import { getCuentasEstandar } from "@/lib/balance/cuentas-estandar";

const PATH = "/config/parametros";
const PERMISO = "parametros:administrar";

// Rutas que muestran alertas calculadas con estos umbrales. Al cambiarlos hay que
// revalidarlas: sus loaders RSC leen `getUmbralesAlertas()` y los agregados se
// RECALCULAN al leer, así que el cambio es retroactivo para todo lo ya cargado.
// Los cruces de los módulos leen la tolerancia de la cédula y los del tercero.
const RUTAS_AFECTADAS = ["/balance", "/balance/borradores", "/modulos"];

/**
 * El umbral de saldos contrarios decide qué balances abiertos quedan «En proceso con alertas»
 * (`alertas-balance-datos.ts`): la columna `estado` que lee el índice se recalcula con el valor
 * nuevo (la caché de umbrales todavía puede traer el anterior en esta misma petición).
 */
async function recalcularEstadosPorUmbral(clave: string, valor: number): Promise<void> {
  if (clave !== "naturaleza") return;
  const [cuentasEstandar, umbrales, ids] = await Promise.all([getCuentasEstandar(), getUmbralesAlertas(), idsBalancesAbiertos(prisma)]);
  await recalcularEstadoBalances(prisma, ids, { cuentasEstandar, umbrales: { ...umbrales, naturaleza: valor } });
}

/**
 * Edita el valor de un umbral de alertas. Upsert por `clave`: al crear la fila
 * congela el valor de fábrica en `predeterminado` (para poder restaurar luego).
 * Invalida la caché de umbrales para que el balance use el nuevo monto de inmediato.
 */
export async function actualizarUmbral(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const authz = await authorizePermiso(PERMISO);
  if (!authz.ok) return { ok: false, message: authz.message };

  const parsed = ActualizarUmbralSchema.safeParse({
    clave: formData.get("clave"),
    valor: formData.get("valor"),
  });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Datos inválidos." };

  const { clave, valor } = parsed.data;
  const def = getUmbralDef(clave);
  if (!def) return { ok: false, message: "Umbral desconocido." };
  if (valor < def.minimo || valor > def.maximo) {
    return { ok: false, message: `El monto debe estar entre ${fmt(def.minimo)} y ${fmt(def.maximo)}.` };
  }

  try {
    const user = await getCurrentUser();
    const previo = await prisma.umbralAlerta.findUnique({ where: { clave }, select: { valor: true } });
    await prisma.umbralAlerta.upsert({
      where: { clave },
      create: { clave, valor, predeterminado: def.defecto, actualizadoPor: user?.name ?? null },
      update: { valor, actualizadoPor: user?.name ?? null },
    });
    await recalcularEstadosPorUmbral(clave, valor);

    await logAudit({
      user: user?.name ?? "Sistema",
      action: "EDITÓ UMBRAL DE ALERTAS",
      entity: `Parámetros · ${def.nombre}`,
      detail: `Cambió «${def.nombre}» de ${fmt(Number(previo?.valor ?? def.defecto))} a ${fmt(valor)}`,
    });
    // `updateTag` es la API de Next 16 para expiración inmediata desde Server
    // Actions (invalida el unstable_cache de getUmbralesAlertas).
    updateTag(UMBRALES_CACHE_TAG);
    revalidatePath(PATH);
    for (const ruta of RUTAS_AFECTADAS) revalidatePath(ruta, "layout");
    return { ok: true, message: "Umbral actualizado." };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("actualizarUmbral", e) };
  }
}

/**
 * Restaura un umbral a su valor predeterminado. Usa el `predeterminado` guardado
 * en BD y, si no hay fila, el de fábrica del catálogo.
 */
export async function restaurarUmbral(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const authz = await authorizePermiso(PERMISO);
  if (!authz.ok) return { ok: false, message: authz.message };

  const clave = String(formData.get("clave") ?? "").trim();
  const def = getUmbralDef(clave);
  if (!def) return { ok: false, message: "Umbral desconocido." };

  try {
    const user = await getCurrentUser();
    const fila = await prisma.umbralAlerta.findUnique({ where: { clave }, select: { predeterminado: true } });
    const bruto = Number(fila?.predeterminado);
    const defecto = Number.isFinite(bruto) && bruto >= 0 ? bruto : def.defecto;
    await prisma.umbralAlerta.upsert({
      where: { clave },
      create: { clave, valor: defecto, predeterminado: def.defecto, actualizadoPor: user?.name ?? null },
      update: { valor: defecto, actualizadoPor: user?.name ?? null },
    });
    await recalcularEstadosPorUmbral(clave, defecto);

    await logAudit({
      user: user?.name ?? "Sistema",
      action: "RESTAURÓ UMBRAL DE ALERTAS",
      entity: `Parámetros · ${def.nombre}`,
      detail: `Restauró «${def.nombre}» al valor predeterminado (${fmt(defecto)})`,
    });
    updateTag(UMBRALES_CACHE_TAG);
    revalidatePath(PATH);
    for (const ruta of RUTAS_AFECTADAS) revalidatePath(ruta, "layout");
    return { ok: true, message: "Umbral restaurado al valor predeterminado." };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("restaurarUmbral", e) };
  }
}
