import "server-only";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { tomarCandadoTransaccion, transaccionSerializable, type TransactionClient } from "@/lib/concurrency";
import { registrarError } from "@/lib/errores";
import { createProcessNotification } from "@/lib/notifications";
import { logAudit } from "@/lib/audit";
import { construirCruceAperturas, seleccionarParesAperturas } from "./cruce-aperturas";

const cabeceraSelect = {
  id: true, clienteId: true, aperturaBalance: true, loteId: true,
  periodoInicio: true, periodoFin: true, archivo: true, version: true,
} as const;
const montosSelect = { cuenta8: true, nombreCuenta: true, saldoInicial: true, debitos: true, creditos: true, saldoFinal: true } as const;
const MontosSchema = z.object({ saldoInicial: z.number().finite(), debitos: z.number().finite(), creditos: z.number().finite(), saldoFinal: z.number().finite() });
const SnapshotSchema = z.object({
  revision: z.literal(1), precision: z.literal(0.01), totalCuentas: z.number().int().nonnegative(),
  terceroId: z.number().int(),
  filas: z.array(z.object({
    cuenta8: z.string(), nombre: z.string(), cuenta: MontosSchema, tercero: MontosSchema, diff: MontosSchema,
    estado: z.enum(["cuadra", "descuadre", "solo_cuenta", "solo_tercero"]), sinDesgloseTercero: z.boolean(),
  })),
});
export type SnapshotCruceAperturas = z.infer<typeof SnapshotSchema>;
export type InformeCruceAperturas = {
  id: number; inconsistente: boolean; actualizadoEn: string; resultado: SnapshotCruceAperturas;
  cuenta: { id: number; archivo: string | null; version: string };
  tercero: { id: number; archivo: string | null; version: string };
};
export type EstadoCrucesAperturas = {
  disponible: boolean; pendiente: boolean; motivo: string | null; pares: InformeCruceAperturas[];
};

async function resolverPares(db: TransactionClient, balanceId: number, clienteId: number) {
  const referencia = await db.balancePruebaEncabezado.findFirst({ where: { id: balanceId, clienteId }, select: cabeceraSelect });
  if (!referencia) return { pares: [], motivo: "El balance ya no existe." };
  if (referencia.aperturaBalance !== "cuenta" && referencia.aperturaBalance !== "tercero") {
    return { pares: [], motivo: "Este cargue antiguo no conserva la apertura declarada; no se le asigna una contraparte automáticamente." };
  }
  const candidatos = await db.balancePruebaEncabezado.findMany({
    where: { clienteId, periodoInicio: referencia.periodoInicio, periodoFin: referencia.periodoFin },
    select: cabeceraSelect,
  });
  const capturas = await db.balanceTerceroEncabezado.findMany({
    where: { clienteId, loteId: { in: candidatos.flatMap((b) => b.loteId ? [b.loteId] : []) } },
    select: { id: true, loteId: true, clienteId: true },
  });
  const pares = seleccionarParesAperturas(balanceId, candidatos, capturas);
  const sinDetalle = referencia.aperturaBalance === "tercero" && !capturas.some((t) => t.loteId === referencia.loteId);
  return { pares, motivo: pares.length ? null : sinDetalle
    ? "Este cargue por terceros no tiene detalle recuperable para comparar."
    : "Sin contraparte independiente del mismo cliente y las mismas fechas inicial y final." };
}

function importesNumericos<T extends { saldoInicial: unknown; debitos: unknown; creditos: unknown; saldoFinal: unknown }>(fila: T) {
  return { ...fila, saldoInicial: Number(fila.saldoInicial), debitos: Number(fila.debitos), creditos: Number(fila.creditos), saldoFinal: Number(fila.saldoFinal) };
}

/** Solo se invoca desde mutaciones autorizadas; NUNCA escribe durante el render RSC. */
export async function revisarCrucesAperturas(balanceId: number, clienteId: number) {
  return transaccionSerializable(async (tx) => {
    // Comparte candado con eliminarBalance: no deja informes de archivos borrados.
    await tomarCandadoTransaccion(tx, `balance-eliminar:${clienteId}`);
    const { pares } = await resolverPares(tx, balanceId, clienteId);
    const nuevas: { balanceCuentaId: number; balanceTerceroId: number; cuentas: number }[] = [];
    for (const par of pares) {
      const where = { balanceCuentaId_balanceTerceroId: { balanceCuentaId: par.balanceCuentaId, balanceTerceroId: par.balanceTerceroId } };
      const previo = await tx.balanceCruceApertura.findUnique({ where, select: { inconsistente: true } });
      // Regla del usuario: solo eliminar uno de los ARCHIVOS resuelve este aviso.
      if (previo?.inconsistente) continue;
      const [cuenta, tercero] = await Promise.all([
        tx.balancePruebaDetalle.findMany({ where: { encabezadoId: par.balanceCuentaId }, select: montosSelect }),
        tx.balanceTerceroDetalle.findMany({ where: { encabezadoId: par.terceroId }, select: { ...montosSelect, nitTercero: true, nombreTercero: true } }),
      ]);
      const cruce = construirCruceAperturas(cuenta.map(importesNumericos), tercero.map(importesNumericos));
      const resultado: SnapshotCruceAperturas = {
        revision: 1, precision: 0.01, totalCuentas: cruce.filas.length, terceroId: par.terceroId,
        filas: cruce.filas.filter((f) => f.estado !== "cuadra"),
      };
      await tx.balanceCruceApertura.upsert({
        where,
        create: { balanceCuentaId: par.balanceCuentaId, balanceTerceroId: par.balanceTerceroId, inconsistente: !cruce.cuadra, resultado },
        update: { inconsistente: !cruce.cuadra, resultado },
      });
      if (!cruce.cuadra) nuevas.push({ ...par, cuentas: resultado.filas.length });
    }
    return { comparaciones: pares.length, nuevas };
  }, { timeoutMs: 60_000 });
}

/** Un fallo del control NO revierte una promoción ya confirmada. El panel permite reintentar. */
export async function revisarCrucesAperturasSeguro(balanceId: number, clienteId: number, actor = "Sistema"): Promise<boolean> {
  try {
    const { nuevas } = await revisarCrucesAperturas(balanceId, clienteId);
    for (const par of nuevas) {
      await logAudit({ user: actor, action: "DETECTÓ INCONSISTENCIA ENTRE APERTURAS", entity: `Balances ${par.balanceCuentaId} / ${par.balanceTerceroId}`, clientId: clienteId, detail: `${par.cuentas} cuenta(s) de movimiento con diferencias. Persiste hasta eliminar uno de los archivos.` });
      await createProcessNotification({ actor, text: "detectó inconsistencia entre aperturas de balance", target: `Balances #${par.balanceCuentaId} y #${par.balanceTerceroId} · ${par.cuentas} cuenta(s). Revisar en /balance/${par.balanceCuentaId} o /balance/${par.balanceTerceroId}` });
    }
    return true;
  } catch (error) {
    registrarError("revisarCrucesAperturas", error);
    return false;
  }
}

/** Requiere que el llamador haya verificado balance:ver + alcance del cliente. */
export async function cargarEstadoCrucesAperturas(balanceId: number, clienteId: number): Promise<EstadoCrucesAperturas> {
  try {
    const [esperados, registros] = await Promise.all([
      resolverPares(prisma, balanceId, clienteId),
      prisma.balanceCruceApertura.findMany({
        where: { OR: [{ balanceCuentaId: balanceId }, { balanceTerceroId: balanceId }], balanceCuenta: { clienteId }, balanceTercero: { clienteId } },
        include: { balanceCuenta: { select: { id: true, archivo: true, version: true } }, balanceTercero: { select: { id: true, archivo: true, version: true } } },
        orderBy: [{ inconsistente: "desc" }, { id: "desc" }],
      }),
    ]);
    const pares = registros.map((r) => ({ id: r.id, inconsistente: r.inconsistente, actualizadoEn: r.actualizadoEn.toISOString(), cuenta: r.balanceCuenta, tercero: r.balanceTercero, resultado: SnapshotSchema.parse(r.resultado) }));
    const pendiente = esperados.pares.some((p) => !registros.some((r) => r.balanceCuentaId === p.balanceCuentaId && r.balanceTerceroId === p.balanceTerceroId));
    return { disponible: true, pendiente, motivo: esperados.motivo, pares };
  } catch (error) {
    registrarError("cargarEstadoCrucesAperturas", error);
    return { disponible: false, pendiente: true, motivo: "No fue posible consultar la validación entre archivos. No se puede asegurar que cuadren.", pares: [] };
  }
}
