"use server";

// Balances por fecha de corte (18/Oct/2026): acciones sobre el corte de un balance.

import { revalidatePath } from "next/cache";
import { authorizePermiso } from "@/lib/rbac";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/dal";
import { recalcularComparacionesDelCorteSeguro } from "@/lib/balance/comparacion-corte-servidor";

/**
 * Recalcula a pedido la comparación de saldos finales del corte de un balance: para un corte
 * «sin comparar» (cargues anteriores a esta regla) o un control que falló después de cargar.
 */
export async function revisarComparacionCorte(balanceId: number): Promise<{ ok: boolean; message: string }> {
  const [crear, editar] = await Promise.all([authorizePermiso("balance:crear"), authorizePermiso("balance:editar")]);
  if (!crear.ok && !editar.ok) return { ok: false, message: "No tienes permiso para revisar los balances del corte." };
  if (!Number.isSafeInteger(balanceId) || balanceId <= 0) return { ok: false, message: "Balance inválido." };
  const balance = await prisma.balancePruebaEncabezado.findUnique({ where: { id: balanceId }, select: { clienteId: true, periodoFin: true } });
  if (!balance) return { ok: false, message: "El balance ya no existe." };
  const scope = await authorizePermiso(crear.ok ? "balance:crear" : "balance:editar", { clientId: balance.clienteId });
  if (!scope.ok) return { ok: false, message: scope.message };
  const user = await getCurrentUser();
  const ok = await recalcularComparacionesDelCorteSeguro(balance.clienteId, balance.periodoFin, user?.name ?? "Sistema");
  revalidatePath("/balance", "layout");
  return {
    ok,
    message: ok
      ? "Comparación revisada. Las diferencias de saldo final se resuelven eliminando uno de los balances."
      : "No se pudo completar la comparación. Los balances se conservan; vuelve a intentarlo.",
  };
}
