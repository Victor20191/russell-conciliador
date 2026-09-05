"use server";

import { revalidatePath } from "next/cache";
import { authorizePermiso } from "@/lib/rbac";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/dal";
import { revisarCrucesAperturasSeguro } from "@/lib/balance/cruce-aperturas-servidor";

/** Recuperación explícita para cargues anteriores o un control que falló tras confirmar. */
export async function revisarAperturasBalance(balanceId: number): Promise<{ ok: boolean; message: string }> {
  const [crear, editar] = await Promise.all([authorizePermiso("balance:crear"), authorizePermiso("balance:editar")]);
  if (!crear.ok && !editar.ok) return { ok: false, message: "No tienes permiso para revisar los archivos de balance." };
  if (!Number.isSafeInteger(balanceId) || balanceId <= 0) return { ok: false, message: "Balance inválido." };
  const balance = await prisma.balancePruebaEncabezado.findUnique({ where: { id: balanceId }, select: { clienteId: true } });
  if (!balance) return { ok: false, message: "El balance ya no existe." };
  const scope = await authorizePermiso(crear.ok ? "balance:crear" : "balance:editar", { clientId: balance.clienteId });
  if (!scope.ok) return { ok: false, message: scope.message };
  const user = await getCurrentUser();
  const ok = await revisarCrucesAperturasSeguro(balanceId, balance.clienteId, user?.name ?? "Sistema");
  revalidatePath("/balance", "layout");
  return { ok, message: ok ? "Comparación revisada. Las inconsistencias detectadas permanecen hasta eliminar uno de sus archivos." : "No se pudo completar la comparación. El balance se conserva; vuelve a intentarlo." };
}
