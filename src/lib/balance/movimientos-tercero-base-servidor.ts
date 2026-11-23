import "server-only";
// Base del amarre de los terceros agregados (`BaseAmarre` en movimientos-tercero.ts), contra la BD.
//   1. El balance empieza el 1 de enero: su saldo inicial es la apertura del año.
//   2. Si no (p. ej. el mensual del corte): el balance cerrado y vigente del cliente al 31 de
//      diciembre del año anterior da la apertura de cada cuenta.
import prisma from "@/lib/prisma";
import { cargarCandidatosBalanceCruce } from "@/lib/modulos/balance-cruce-servidor";
import { describirBalanceCruce } from "@/lib/modulos/compuerta-cruce";
import { balanceAdmiteMovimientos, type BaseAmarre, type SaldoCierreDiciembre } from "./movimientos-tercero";

const fechaISO = (fecha: Date) => fecha.toISOString().slice(0, 10);

export type BaseAmarreResuelta =
  | { ok: true; base: BaseAmarre; cierreDiciembre: SaldoCierreDiciembre[] | null }
  | { ok: false; message: string };

export async function resolverBaseAmarre(balance: { clienteId: number; periodoInicio: Date; periodoFin: Date }): Promise<BaseAmarreResuelta> {
  if (balanceAdmiteMovimientos(balance.periodoInicio, balance.periodoFin)) {
    return { ok: true, base: { tipo: "inicio_enero" }, cierreDiciembre: null };
  }
  const anioAnterior = balance.periodoFin.getUTCFullYear() - 1;
  const { candidatos, vigentes } = await cargarCandidatosBalanceCruce(balance.clienteId, false);
  // Del más reciente al más antiguo: si hay varias versiones cerradas del 31/12, la más reciente.
  const diciembre = candidatos.find((c) => fechaISO(c.periodoFin) === `${anioAnterior}-12-31` && c.estaCongelado && vigentes.has(c.id));
  if (!diciembre) {
    return {
      ok: false,
      message: `Este balance no empieza el 1 de enero y el cliente no tiene un balance cerrado al 31/12/${anioAnterior}. Para agregar los terceros hace falta uno de los dos: un balance de enero a la fecha de corte, o el balance cerrado al 31/12/${anioAnterior}.`,
    };
  }
  const detalle = await prisma.balancePruebaDetalle.findMany({
    where: { encabezadoId: diciembre.id },
    select: { cuenta8: true, nombreCuenta: true, cuenta6Russell: true, saldoFinal: true },
  });
  return {
    ok: true,
    base: { tipo: "cierre_diciembre", balanceId: diciembre.id, descripcion: describirBalanceCruce(diciembre) },
    cierreDiciembre: detalle.map((d) => ({ cuenta8: d.cuenta8, nombreCuenta: d.nombreCuenta, cuenta6Russell: d.cuenta6Russell, saldoFinal: Number(d.saldoFinal) })),
  };
}

/** «01/01/2026»: el archivo siempre va del 1 de enero del año del corte a la fecha de corte. */
export function periodoDelArchivo(periodoFin: Date): { desde: string; hasta: string } {
  const legible = (iso: string) => iso.split("-").reverse().join("/");
  return { desde: `01/01/${periodoFin.getUTCFullYear()}`, hasta: legible(fechaISO(periodoFin)) };
}
