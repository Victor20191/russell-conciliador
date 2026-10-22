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
import type { UsoSubgrupo } from "./subgrupo-en-uso";

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
 * ¿En qué está en uso la cuenta de 4 dígitos `codigo` (un subgrupo del plan)? Balances con
 * subcuentas de ese grupo, la memoria de los módulos y sus filtros de cuentas. Global, como
 * `codigoEstandarTieneBalances`.
 */
export async function usoDeSubgrupo(codigo: string): Promise<UsoSubgrupo> {
  const [balance, memoria, periodo, filtro, par] = await Promise.all([
    prisma.balancePruebaDetalle.findFirst({ where: { cuenta6Russell: { startsWith: codigo } }, select: { id: true } }),
    prisma.consolidacionModuloCliente.findFirst({ where: { cuenta4: codigo }, select: { id: true } }),
    prisma.asignacionPeriodoModulo.findFirst({ where: { cuenta4: codigo }, select: { id: true } }),
    prisma.subgrupoConciliacionModulo.findFirst({ where: { subgrupo: codigo }, select: { id: true } }),
    prisma.parDepreciacionModulo.findFirst({ where: { subgrupo: codigo }, select: { id: true } }),
  ]);
  return { balances: balance != null, memoriaModulos: memoria != null || periodo != null, filtrosModulos: filtro != null || par != null };
}

/**
 * Cuentas de 4 dígitos EN USO (ver `usoDeSubgrupo`). La pantalla del plan bloquea con ellas el
 * campo de código y el borrado.
 */
export async function subgruposEnUso(): Promise<string[]> {
  const [conBalances, memoria, periodo, filtros, pares] = await Promise.all([
    codigosEstandarConBalances(),
    prisma.consolidacionModuloCliente.findMany({ select: { cuenta4: true }, distinct: ["cuenta4"] }),
    prisma.asignacionPeriodoModulo.findMany({ select: { cuenta4: true }, distinct: ["cuenta4"] }),
    prisma.subgrupoConciliacionModulo.findMany({ select: { subgrupo: true }, distinct: ["subgrupo"] }),
    prisma.parDepreciacionModulo.findMany({ select: { subgrupo: true }, distinct: ["subgrupo"] }),
  ]);
  return [
    ...new Set([
      ...conBalances.map((c) => c.slice(0, 4)),
      ...memoria.map((m) => m.cuenta4),
      ...periodo.map((p) => p.cuenta4),
      ...filtros.map((f) => f.subgrupo),
      ...pares.map((p) => p.subgrupo),
    ]),
  ].filter((c) => /^\d{4}$/.test(c));
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
