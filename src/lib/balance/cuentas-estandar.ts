// Acceso cacheado al PLAN ESTÁNDAR (catálogo global casi inmutable). Lo
// consumen el cargue de balances y las pantallas de lectura (detalle, diff,
// estado de resultado), que antes hacían un `findMany` por request.
//
// Se cachea en el Data Cache de Next (`unstable_cache`) bajo un tag dedicado y
// se invalida con `updateTag(CUENTAS_ESTANDAR_TAG)` desde el CRUD de cuentas
// estándar — mismo patrón que `getMatriz` en `rbac/contexto`. Es GLOBAL (no por
// cartera): el plan es el mismo para todos los clientes.
import "server-only";
import { unstable_cache } from "next/cache";
import prisma from "@/lib/prisma";

export const CUENTAS_ESTANDAR_TAG = "cuentas-estandar";

// Forma "rica": cubre tanto las vistas de lectura (code/name/nature/critical)
// como el cargue (russellAccount/possibleAccounts para el barrido por descripción).
export type CuentaEstandarPlan = {
  code: string;
  name: string;
  nature: string;
  critical: boolean;
  russellAccount: string | null;
  possibleAccounts: string | null;
};

function leerCuentasEstandar(): Promise<CuentaEstandarPlan[]> {
  return prisma.standardAccount.findMany({
    select: { code: true, name: true, nature: true, critical: true, russellAccount: true, possibleAccounts: true },
  });
}

const getCuentasEstandarCached = unstable_cache(leerCuentasEstandar, ["cuentas-estandar"], {
  tags: [CUENTAS_ESTANDAR_TAG],
});

/** Plan estándar completo (cacheado). Invalidar con `updateTag(CUENTAS_ESTANDAR_TAG)`. */
export function getCuentasEstandar(): Promise<CuentaEstandarPlan[]> {
  return getCuentasEstandarCached();
}
