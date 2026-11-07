import "server-only";
import prisma from "@/lib/prisma";
import { agruparPorCorte, balancesVigentesDelCorte } from "@/lib/balance/corte";
import {
  avisoEleccionCaida,
  balancesQueSirvenCruce,
  fechaMasReciente,
  opcionBalanceCruce,
  resolverBalanceCruce,
  type EleccionBalanceVista,
  type OpcionesBalanceCruce,
} from "./compuerta-cruce";

// BALANCE DEL CRUCE de un período, contra la BD (7/Nov/2026) — lo comparten los seis módulos y
// Retención en la fuente. Lee los balances del cliente, decide cuáles sirven (cerrados, vigentes de
// su línea, que terminan en la fecha de corte; con terceros donde se exige) y, si sirve más de uno,
// aplica la elección guardada en `eleccion_balance_cruce` o preselecciona el de modificación más
// reciente. La lógica vive en `compuerta-cruce.ts`; aquí solo las consultas.

const SELECT_BALANCE_CRUCE = {
  id: true,
  clienteId: true,
  periodo: true,
  periodoInicio: true,
  periodoFin: true,
  version: true,
  estaCongelado: true,
  loteId: true,
  aperturaBalance: true,
  creadoEn: true,
  ultimaCarga: true,
} as const;

/**
 * Balances del cliente (del corte más reciente al más antiguo, luego por carga e id), las versiones
 * vigentes de cada línea y, con `conTerceros`, qué captura por tercero conserva cada uno.
 */
export async function cargarCandidatosBalanceCruce(clienteId: number, conTerceros: boolean) {
  const balances = await prisma.balancePruebaEncabezado.findMany({
    where: { clienteId },
    select: SELECT_BALANCE_CRUCE,
    orderBy: [{ periodoFin: "desc" }, { creadoEn: "desc" }, { id: "desc" }],
  });
  const vigentes = new Set([...agruparPorCorte(balances).values()].flatMap((delCorte) => balancesVigentesDelCorte(delCorte).map((b) => b.id)));
  const capturaPorLote = new Map<string, number>();
  const lotes = conTerceros ? balances.map((b) => b.loteId).filter((l): l is string => l != null) : [];
  if (lotes.length > 0) {
    const capturas = await prisma.balanceTerceroEncabezado.findMany({
      where: { clienteId, loteId: { in: lotes } },
      select: { id: true, loteId: true },
    });
    for (const c of capturas) if (c.loteId) capturaPorLote.set(c.loteId, c.id);
  }
  const candidatos = balances.map((b) => ({ ...b, conDetalleTercero: b.loteId != null && capturaPorLote.has(b.loteId) }));
  return { candidatos, vigentes, capturaPorLote };
}

export type CandidatoBalanceCruceServidor = Awaited<ReturnType<typeof cargarCandidatosBalanceCruce>>["candidatos"][number];

/**
 * Última modificación de cada balance: su carga, el último cambio de su detalle (la homologación de
 * sus cuentas) o el último ajuste de su prevalidador, lo más reciente.
 */
async function ultimaModificacionDeBalances(
  balances: readonly Pick<CandidatoBalanceCruceServidor, "id" | "creadoEn" | "ultimaCarga">[],
): Promise<Map<number, Date | null>> {
  const ids = balances.map((b) => b.id);
  const [detalle, ajustes] = await Promise.all([
    prisma.balancePruebaDetalle.groupBy({ by: ["encabezadoId"], where: { encabezadoId: { in: ids } }, _max: { editadoEn: true } }),
    prisma.prevalidadorCuentaBalance.groupBy({ by: ["balanceId"], where: { balanceId: { in: ids } }, _max: { actualizadoEn: true } }),
  ]);
  const detallePorId = new Map(detalle.map((d) => [d.encabezadoId, d._max.editadoEn]));
  const ajustePorId = new Map(ajustes.map((a) => [a.balanceId, a._max.actualizadoEn]));
  return new Map(balances.map((b) => [b.id, fechaMasReciente(b.ultimaCarga, b.creadoEn, detallePorId.get(b.id), ajustePorId.get(b.id))]));
}

export type BalanceCruceDelPeriodo<T> = {
  balance: T | null;
  /** null si no hay balance que sirva. */
  eleccion: EleccionBalanceVista | null;
};

/**
 * Balance contra el que se concilia el período (`moduloCodigo` + `periodo`, la llave de las marcas y
 * del cierre): entre los que sirven, el escogido por el usuario o, sin elección, el de modificación
 * más reciente.
 */
export async function resolverBalanceCruceDelPeriodo<T extends CandidatoBalanceCruceServidor>(params: {
  clienteId: number;
  moduloCodigo: string;
  periodo: string;
  candidatos: readonly T[];
  opciones: OpcionesBalanceCruce;
}): Promise<BalanceCruceDelPeriodo<T>> {
  const sirven = balancesQueSirvenCruce(params.candidatos, params.periodo, params.opciones);
  if (sirven.length === 0) return { balance: null, eleccion: null };
  const [guardada, ultima] = await Promise.all([
    prisma.eleccionBalanceCruce.findUnique({
      where: { clienteId_moduloCodigo_periodo: { clienteId: params.clienteId, moduloCodigo: params.moduloCodigo, periodo: params.periodo } },
      select: { balanceEncabezadoId: true, elegidoPor: true, elegidoEn: true },
    }),
    sirven.length > 1 ? ultimaModificacionDeBalances(sirven) : Promise.resolve(new Map<number, Date | null>()),
  ]);
  const resuelto = resolverBalanceCruce(sirven, ultima, guardada ? { balanceId: guardada.balanceEncabezadoId } : null);
  const elegido = resuelto.origen === "elegido" && guardada;
  return {
    balance: resuelto.balance,
    eleccion: resuelto.origen
      ? {
          origen: resuelto.origen,
          opciones: resuelto.opciones.length > 1 ? resuelto.opciones.map((b) => opcionBalanceCruce(b, ultima.get(b.id))) : [],
          elegidoPor: elegido ? guardada.elegidoPor : null,
          elegidoEn: elegido ? guardada.elegidoEn.toISOString() : null,
          aviso: avisoEleccionCaida(resuelto),
        }
      : null,
  };
}

/**
 * Guarda (o cambia) el balance escogido para el período. Lo valida el llamador (tiene que servir y el
 * período tiene que estar abierto), dentro de su transacción.
 */
export async function guardarEleccionBalanceCruce(db: Pick<typeof prisma, "eleccionBalanceCruce">, params: {
  clienteId: number;
  moduloCodigo: string;
  periodo: string;
  balanceId: number;
  usuario: { id: number; name: string } | null;
}): Promise<void> {
  const datos = {
    balanceEncabezadoId: params.balanceId,
    elegidoPor: params.usuario?.name ?? null,
    elegidoPorId: params.usuario?.id ?? null,
    elegidoEn: new Date(),
  };
  await db.eleccionBalanceCruce.upsert({
    where: { clienteId_moduloCodigo_periodo: { clienteId: params.clienteId, moduloCodigo: params.moduloCodigo, periodo: params.periodo } },
    create: { clienteId: params.clienteId, moduloCodigo: params.moduloCodigo, periodo: params.periodo, ...datos },
    update: datos,
  });
}
