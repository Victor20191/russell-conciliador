// ============================================================
// Asociación entre el PLAN ESTÁNDAR y los balances de los clientes.
//
// En el modelo normalizado, cada cuenta del balance vive en una fila de
// `balance_prueba_detalle` y su vínculo con el plan estándar es la columna
// `cuenta_6_russell` (= código de la cuenta estándar). Saber si una cuenta
// estándar "tiene balances asociados" es ahora una consulta Prisma directa
// (antes requería SQL crudo sobre el JSON `desglose`).
//
// La comprobación es GLOBAL (todos los clientes, sin filtrar por cartera):
// editar o borrar una cuenta estándar afecta a toda la plataforma.
// ============================================================
import prisma from "@/lib/prisma";

/**
 * ¿Existe al menos un balance (de cualquier cliente) cuyo detalle mapea a la
 * cuenta estándar `code`? Bloquea el cambio de código o el borrado de una
 * cuenta estándar que ya está en uso.
 */
export async function codigoEstandarTieneBalances(code: string): Promise<boolean> {
  const fila = await prisma.balancePruebaDetalle.findFirst({
    where: { cuenta6Russell: code },
    select: { id: true },
  });
  return fila != null;
}

/**
 * Lista de códigos de cuenta estándar que YA tienen balances asociados (en
 * cualquier cliente). La consume la pantalla de mapeo para bloquear en la UI el
 * campo de código (y el borrado) de esas cuentas.
 */
export async function codigosEstandarConBalances(): Promise<string[]> {
  const filas = await prisma.balancePruebaDetalle.findMany({
    where: { cuenta6Russell: { not: null } },
    select: { cuenta6Russell: true },
    distinct: ["cuenta6Russell"],
  });
  return filas.map((f) => f.cuenta6Russell).filter((c): c is string => c != null);
}
