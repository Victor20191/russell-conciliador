import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import prisma from "@/lib/prisma";
import {
  esBaseCalculo,
  normalizarPrefijo,
  ordenModulo,
  PREVALIDADOR_MODULOS_ORDEN,
  type FilaCatalogoPrevalidador,
  type OverridePrevalidador,
} from "./catalogo";
import { construirPrevalidador, type FilaPrevalidador, type PrevalidadorVM } from "./calcular";
import { crearHuellaPrevalidador } from "./huella";

type DbPrevalidador = Pick<
  Prisma.TransactionClient,
  "balancePruebaEncabezado" | "prevalidadorCuenta" | "prevalidadorCuentaBalance" | "prevalidadorRevisionBalance"
>;

export type RevisionPrevalidadorVM = {
  estado: "pendiente" | "aprobada" | "revocada" | "desactualizada";
  vigente: boolean;
  justificacion: string | null;
  actor: string | null;
  creadoEn: string | null;
  huella: string | null;
  instantaneaDisponible: boolean;
};

function decimalANumeroSeguro(valor: { toString(): string }, campo: string): number {
  const numero = Number(valor.toString());
  if (!Number.isFinite(numero) || !Number.isSafeInteger(Math.round(numero * 100))) {
    throw new Error(`El monto de ${campo} excede la precisión segura del prevalidador.`);
  }
  return numero;
}

function estadoRevision(
  revision: { estado: string; justificacion: string; actor: string; creadoEn: Date; huella: string; instantanea: Prisma.JsonValue | null } | null,
  huellaActual: string,
): RevisionPrevalidadorVM {
  if (!revision) {
    return { estado: "pendiente", vigente: false, justificacion: null, actor: null, creadoEn: null, huella: null, instantaneaDisponible: false };
  }
  const base = {
    justificacion: revision.justificacion,
    actor: revision.actor,
    creadoEn: revision.creadoEn.toISOString(),
    huella: revision.huella,
    instantaneaDisponible: revision.instantanea != null,
  };
  if (revision.estado !== "aprobada") return { estado: "revocada", vigente: false, ...base };
  if (revision.huella !== huellaActual || revision.instantanea == null) {
    return { estado: "desactualizada", vigente: false, ...base };
  }
  return { estado: "aprobada", vigente: true, ...base };
}

/**
 * Cargador estricto y único del prevalidador. No usa caché ni catálogo de fábrica:
 * una lectura incompleta nunca puede autorizar una aprobación, exportación o
 * conciliación. Admite un cliente transaccional para revalidar la huella y crear la
 * conciliación dentro de la misma transacción serializable.
 */
export async function cargarContextoPrevalidadorBalance(
  balanceId: number,
  db: DbPrevalidador = prisma,
): Promise<{
  balance: {
    id: number;
    clienteId: number;
    nombreCliente: string;
    periodo: string;
    periodoInicio: Date;
    periodoFin: Date;
    version: string;
    esOficial: boolean;
    estaCongelado: boolean;
  };
  filas: FilaPrevalidador[];
  catalogo: FilaCatalogoPrevalidador[];
  overrides: OverridePrevalidador[];
  prevalidador: PrevalidadorVM;
  huella: string;
  revision: RevisionPrevalidadorVM;
}> {
  const [balance, filasCatalogo, filasOverride, ultimaRevision] = await Promise.all([
    db.balancePruebaEncabezado.findUnique({
      where: { id: balanceId },
      select: {
        id: true,
        clienteId: true,
        nombreCliente: true,
        periodo: true,
        periodoInicio: true,
        periodoFin: true,
        version: true,
        esOficial: true,
        estaCongelado: true,
        detalles: {
          select: {
            cuenta8: true,
            nombreCuenta: true,
            cuenta6Russell: true,
            debitos: true,
            creditos: true,
            saldoFinal: true,
          },
        },
      },
    }),
    db.prevalidadorCuenta.findMany({
      where: { activa: true },
      select: {
        id: true,
        cuentaRussell: true,
        etiqueta: true,
        baseCalculo: true,
        orden: true,
        activa: true,
        module: { select: { code: true, name: true } },
      },
      orderBy: [{ orden: "asc" }, { cuentaRussell: "asc" }],
    }),
    db.prevalidadorCuentaBalance.findMany({
      where: { balanceId },
      select: { catalogoId: true, cuentaCliente: true },
      orderBy: { catalogoId: "asc" },
    }),
    db.prevalidadorRevisionBalance.findFirst({
      where: { balanceId },
      select: { estado: true, justificacion: true, actor: true, creadoEn: true, huella: true, instantanea: true },
      orderBy: [{ creadoEn: "desc" }, { id: "desc" }],
    }),
  ]);

  if (!balance) throw new Error("El balance no existe.");

  const catalogo: FilaCatalogoPrevalidador[] = filasCatalogo.map((fila) => {
    const cuentaRussell = normalizarPrefijo(fila.cuentaRussell);
    if (!esBaseCalculo(fila.baseCalculo)) throw new Error(`La cuenta ${cuentaRussell} tiene una base de cálculo inválida.`);
    if (!PREVALIDADOR_MODULOS_ORDEN.includes(fila.module.code)) {
      throw new Error(`El módulo ${fila.module.code} no pertenece al alcance aprobado del prevalidador.`);
    }
    if (cuentaRussell.length !== 2 && cuentaRussell.length !== 4) {
      throw new Error(`La cuenta ${cuentaRussell} no tiene nivel 2 o 4.`);
    }
    return {
      id: fila.id,
      moduloCodigo: fila.module.code,
      moduloNombre: fila.module.name,
      moduloOrden: ordenModulo(fila.module.code),
      cuentaRussell,
      etiqueta: fila.etiqueta,
      baseCalculo: fila.baseCalculo,
      orden: fila.orden,
      activa: fila.activa,
    };
  });
  const overrides = filasOverride.map((fila) => ({
    catalogoId: fila.catalogoId,
    cuentaCliente: normalizarPrefijo(fila.cuentaCliente),
  }));
  const filas: FilaPrevalidador[] = balance.detalles.map((fila) => ({
    cuenta8: fila.cuenta8,
    nombreCuenta: fila.nombreCuenta,
    cuenta6Russell: fila.cuenta6Russell,
    debitos: decimalANumeroSeguro(fila.debitos, `${fila.cuenta8} · débitos`),
    creditos: decimalANumeroSeguro(fila.creditos, `${fila.cuenta8} · créditos`),
    saldoFinal: decimalANumeroSeguro(fila.saldoFinal, `${fila.cuenta8} · saldo final`),
  }));
  const prevalidador = construirPrevalidador(filas, catalogo, overrides);
  const huella = crearHuellaPrevalidador({
    balance,
    filas: balance.detalles,
    catalogo,
    overrides,
    prevalidador,
  });

  return {
    balance: {
      id: balance.id,
      clienteId: balance.clienteId,
      nombreCliente: balance.nombreCliente,
      periodo: balance.periodo,
      periodoInicio: balance.periodoInicio,
      periodoFin: balance.periodoFin,
      version: balance.version,
      esOficial: balance.esOficial,
      estaCongelado: balance.estaCongelado,
    },
    filas,
    catalogo,
    overrides,
    prevalidador,
    huella,
    revision: estadoRevision(ultimaRevision, huella),
  };
}
