import { procedenciaConfiguracion } from "./procedencia-mapeo";
// Homologación manual del PUC acumulado del cliente (`/config/mapeo`) contra
// los balances YA CARGADOS. Complementa `alcance-homologacion.ts` (que resuelve
// el alcance sobre el ÚNICO encabezado que se está viendo) con la variante que
// decide si, además de memorizar la regla para las próximas cargas, también se
// migra hacia atrás: TODOS los encabezados del cliente que no estén congelados,
// de cualquier período o versión.
//
// Las funciones reciben el cliente de Prisma (`tx` dentro de una transacción, o
// el singleton para el preview de solo lectura) como parámetro: no importan
// `@/lib/prisma` directamente, así que son testeables con un doble simple sin
// mockear módulos. NUNCA tocan montos (`saldo_inicial`/`debitos`/`creditos`/
// `saldo_final`): solo `cuenta_6_russell`/`porcentaje_coincidencia` y los
// contadores de mapeo del encabezado.
//
// El candado (`balance-puc:{clienteId}` / `balance-oficial:{clienteId}:{periodo}`)
// lo toma SIEMPRE el llamador (la Server Action), en el mismo orden que usa la
// carga: estas funciones asumen que ya corren bajo esos candados.

import type { TransactionClient } from "@/lib/concurrency";
import {
  ORIGEN_MANUAL_CUENTA,
  ORIGEN_MANUAL_GRUPO,
  nivelPorCodigo,
} from "./mapeo-cliente-config";
import type { AlcanceHomologacion } from "./alcance-homologacion";

/** Cliente Prisma o transacción: lo único que necesitan estas funciones. */
export type ClienteDB = TransactionClient;

export type NormalizacionAlcanceCliente =
  | {
      ok: true;
      alcance: AlcanceHomologacion;
      codigoMemoria: string;
      origen: string;
      propagaGrupo: boolean;
    }
  | { ok: false; message: string };

/**
 * Traduce (cuentaCliente, alcance elegido) a la granularidad real que se va a
 * escribir en la memoria y a filtrar en el detalle.
 *
 * La memoria utiliza el código de seis dígitos como clave del grupo. El editor
 * identifica ese alcance expresamente; se normaliza también en el servidor
 * para conservar el contrato de resolución en las próximas cargas.
 *
 * El alcance `grupo` exige una cuenta de al menos 6 dígitos: no hay prefijo de
 * grupo que derivar de un código de 4 o 5.
 */
export function normalizarAlcanceHomologacionCliente(
  cuentaCliente: string,
  alcance: AlcanceHomologacion,
): NormalizacionAlcanceCliente {
  const alcanceEfectivo: AlcanceHomologacion =
    alcance === "solo" && cuentaCliente.length === 6 ? "grupo" : alcance;

  if (alcanceEfectivo === "grupo") {
    if (cuentaCliente.length < 6) {
      return {
        ok: false,
        message:
          "El alcance «todas las cuentas del grupo» requiere una cuenta de al menos 6 dígitos.",
      };
    }
    return {
      ok: true,
      alcance: "grupo",
      codigoMemoria: cuentaCliente.slice(0, 6),
      origen: ORIGEN_MANUAL_GRUPO,
      propagaGrupo: true,
    };
  }

  return {
    ok: true,
    alcance: "solo",
    codigoMemoria: cuentaCliente,
    origen: ORIGEN_MANUAL_CUENTA,
    propagaGrupo: false,
  };
}

/**
 * Filtro de `balance_prueba_detalle`/`balance_tercero_detalle` para el alcance
 * ya normalizado. Grupo compara por el prefijo de 6 dígitos (`cuenta_6`, ya
 * segmentado al cargar) — así alcanza también a descendientes de códigos
 * largos—; «solo» compara por el código EXACTO (`cuenta_8`, el código imputable
 * completo, cualquiera sea su longitud), sin afectar hermanas ni descendientes.
 */
export function filtroDetallePorAlcanceCliente(
  alcance: AlcanceHomologacion,
  codigoMemoria: string,
  cuentaCliente: string,
): { cuenta6: string } | { cuenta8: string } {
  return alcance === "grupo" ? { cuenta6: codigoMemoria } : { cuenta8: cuentaCliente };
}

export type ParametrosAlcanceCliente = {
  clienteId: number;
  alcance: AlcanceHomologacion;
  codigoMemoria: string;
  cuentaCliente: string;
};

export type ImpactoHomologacionCliente = {
  balances: number;
  filas: number;
  congelados: number;
  excepciones: number;
};

/**
 * Cuenta el impacto de aplicar la homologación a lo YA CARGADO: cuántos
 * encabezados/filas NO congelados coinciden, cuántos encabezados congelados
 * quedarían siempre excluidos, y cuántas excepciones (`manual_cuenta`) de la
 * memoria quedarían pisadas por una regla de grupo. Es SOLO LECTURA: no muta
 * nada. Puede llamarse con el singleton de Prisma (preview) o con `tx` dentro
 * de la transacción de guardado (para el mensaje final, bajo candado).
 */
export async function calcularImpactoHomologacionCliente(
  db: ClienteDB,
  params: ParametrosAlcanceCliente,
): Promise<ImpactoHomologacionCliente> {
  const filtro = filtroDetallePorAlcanceCliente(params.alcance, params.codigoMemoria, params.cuentaCliente);
  const [balances, filas, congelados, excepciones] = await Promise.all([
    db.balancePruebaEncabezado.count({
      where: { clienteId: params.clienteId, estaCongelado: false, detalles: { some: filtro } },
    }),
    db.balancePruebaDetalle.count({
      where: { ...filtro, encabezado: { clienteId: params.clienteId, estaCongelado: false } },
    }),
    db.balancePruebaEncabezado.count({
      where: { clienteId: params.clienteId, estaCongelado: true, detalles: { some: filtro } },
    }),
    params.alcance === "grupo"
      ? db.clientAccount.count({
          where: {
            clienteId: params.clienteId,
            origenMapeo: ORIGEN_MANUAL_CUENTA,
            code: { startsWith: params.codigoMemoria },
            NOT: { code: params.codigoMemoria },
          },
        })
      : Promise.resolve(0),
  ]);
  return { balances, filas, congelados, excepciones };
}

export type EncabezadoAfectado = { id: number; periodo: string; loteId: string | null };

/**
 * Encabezados NO congelados del cliente que contienen la cuenta/grupo del
 * alcance dado, con su período (para decidir qué candados de período tomar) y
 * su `loteId` (para sincronizar el cargue por tercero ligado).
 */
export async function encabezadosNoCongeladosPorAlcance(
  db: ClienteDB,
  params: ParametrosAlcanceCliente,
): Promise<EncabezadoAfectado[]> {
  const filtro = filtroDetallePorAlcanceCliente(params.alcance, params.codigoMemoria, params.cuentaCliente);
  return db.balancePruebaEncabezado.findMany({
    where: { clienteId: params.clienteId, estaCongelado: false, detalles: { some: filtro } },
    select: { id: true, periodo: true, loteId: true },
  });
}

/** Nombre más reciente registrado en el detalle del cliente para esta cuenta/grupo (o null si no existe). */
export async function nombreRecienteDetalleCliente(
  db: ClienteDB,
  params: ParametrosAlcanceCliente,
): Promise<string | null> {
  const fila = await db.balancePruebaDetalle.findFirst({
    // El nombre de una auxiliar no es el nombre de su grupo. Si la cuenta de
    // seis dígitos no existe como fila propia, el llamador usa el código.
    where: { cuenta8: params.codigoMemoria, encabezado: { clienteId: params.clienteId } },
    orderBy: [{ encabezado: { creadoEn: "desc" } }, { id: "desc" }],
    select: { nombreCuenta: true },
  });
  return fila?.nombreCuenta ?? null;
}

export type ResultadoMigracionHomologacionCliente = {
  filasActualizadas: number;
  filasTerceroActualizadas: number;
  encabezadosActualizados: number;
};

/**
 * Migra la homologación hacia atrás: reescribe `balance_prueba_detalle` (y su
 * `balance_tercero_detalle` ligado por lote) de los encabezados ya confirmados
 * como no congelados (`encabezados`, resuelto por el llamador BAJO los
 * candados correspondientes), y recalcula sus contadores de mapeo. NUNCA toca
 * los montos. Eficiente: `updateMany` por lote de encabezados (nunca una
 * sentencia por fila) y 2 consultas agregadas (`groupBy`) para los contadores,
 * sin importar cuántas filas tenga cada balance.
 */
export async function migrarHomologacionClienteEnTransaccion(
  tx: ClienteDB,
  params: {
    codigo: string;
    alcance: AlcanceHomologacion;
    codigoMemoria: string;
    cuentaCliente: string;
    encabezados: EncabezadoAfectado[];
  },
): Promise<ResultadoMigracionHomologacionCliente> {
  const { encabezados } = params;
  if (encabezados.length === 0) {
    return { filasActualizadas: 0, filasTerceroActualizadas: 0, encabezadosActualizados: 0 };
  }
  const filtro = filtroDetallePorAlcanceCliente(params.alcance, params.codigoMemoria, params.cuentaCliente);
  const ids = encabezados.map((e) => e.id);

  const actualizado = await tx.balancePruebaDetalle.updateMany({
    where: { encabezadoId: { in: ids }, ...filtro },
    data: { cuenta6Russell: params.codigo, coincidencia: 100 },
  });

  // Sincroniza el cargue por tercero LIGADO (mismo lote) de cada encabezado
  // migrado: mismas cuentas, misma homologación — el cruce por tercero de los
  // módulos no debe descuadrar frente al balance oficial.
  let filasTerceroActualizadas = 0;
  const lotes = encabezados.map((e) => e.loteId).filter((l): l is string => l != null);
  if (lotes.length > 0) {
    const terceros = await tx.balanceTerceroEncabezado.findMany({
      where: { loteId: { in: lotes } },
      select: { id: true },
    });
    if (terceros.length > 0) {
      const rTercero = await tx.balanceTerceroDetalle.updateMany({
        where: { encabezadoId: { in: terceros.map((t) => t.id) }, ...filtro },
        data: { cuenta6Russell: params.codigo, coincidencia: 100 },
      });
      filasTerceroActualizadas = rTercero.count;
    }
  }

  // Contadores de mapeo por encabezado: 2 consultas agregadas (no una por
  // fila), y una actualización por encabezado (no por fila) porque cada uno
  // tiene un total/mapeadas propio que `updateMany` no puede variar por fila.
  const [totales, mapeadas] = await Promise.all([
    tx.balancePruebaDetalle.groupBy({
      by: ["encabezadoId"],
      where: { encabezadoId: { in: ids } },
      _count: { _all: true },
    }),
    tx.balancePruebaDetalle.groupBy({
      by: ["encabezadoId"],
      where: { encabezadoId: { in: ids }, cuenta6Russell: { not: null } },
      _count: { _all: true },
    }),
  ]);
  const mapaTotal = new Map(totales.map((t) => [t.encabezadoId, t._count._all]));
  const mapaMapeadas = new Map(mapeadas.map((m) => [m.encabezadoId, m._count._all]));
  await Promise.all(
    ids.map((id) => {
      const total = mapaTotal.get(id) ?? 0;
      const mapeadasN = mapaMapeadas.get(id) ?? 0;
      return tx.balancePruebaEncabezado.update({
        where: { id },
        data: {
          mapeadas: mapeadasN,
          sinMapear: total - mapeadasN,
          completitud: total > 0 ? Math.round((mapeadasN / total) * 100) : 100,
        },
      });
    }),
  );

  return { filasActualizadas: actualizado.count, filasTerceroActualizadas, encabezadosActualizados: ids.length };
}

export type ResultadoMemoriaHomologacionCliente = { excepcionesAfectadas: number };

/**
 * Escribe la memoria (`cuentas_cliente`) SIEMPRE, para que la próxima carga la
 * respete, sin importar si además se migró lo ya cargado. Con alcance grupo
 * propaga a las imputables del grupo y pisa sus excepciones (`manual_cuenta`)
 * como una regla de grupo existente — una decisión de grupo manda sobre los
 * ajustes cuenta a cuenta —, y crea/actualiza la fila canónica de 6 dígitos.
 */
export async function escribirMemoriaHomologacionCliente(
  tx: ClienteDB,
  params: {
    clienteId: number;
    clientName: string;
    nit: string | null;
    codigoMemoria: string;
    codigo: string;
    origen: string;
    propagaGrupo: boolean;
    actualizadoPor: string | null;
    nombre: string;
  },
): Promise<ResultadoMemoriaHomologacionCliente> {
  const ahora = new Date();
  await tx.clientAccount.upsert({
    where: { clienteId_code: { clienteId: params.clienteId, code: params.codigoMemoria } },
    create: {
      clientName: params.clientName,
      clienteId: params.clienteId,
      nit: params.nit,
      code: params.codigoMemoria,
      level: nivelPorCodigo(params.codigoMemoria),
      name: params.nombre,
      cuenta6Russell: params.codigo,
      coincidencia: 100,
      origenMapeo: params.origen,
      actualizadoPor: params.actualizadoPor,
      actualizadoEn: ahora,
      procedenciaMapeo: procedenciaConfiguracion(),
    },
    update: {
      nit: params.nit,
      cuenta6Russell: params.codigo,
      coincidencia: 100,
      origenMapeo: params.origen,
      actualizadoPor: params.actualizadoPor,
      actualizadoEn: ahora,
      procedenciaMapeo: procedenciaConfiguracion(),
    },
  });

  if (!params.propagaGrupo) return { excepcionesAfectadas: 0 };

  const excepcionesAfectadas = await tx.clientAccount.count({
    where: {
      clienteId: params.clienteId,
      origenMapeo: ORIGEN_MANUAL_CUENTA,
      code: { startsWith: params.codigoMemoria },
      NOT: { code: params.codigoMemoria },
    },
  });
  await tx.clientAccount.updateMany({
    where: {
      clienteId: params.clienteId,
      code: { startsWith: params.codigoMemoria },
      NOT: { code: params.codigoMemoria },
    },
    data: {
      cuenta6Russell: params.codigo,
      coincidencia: 100,
      origenMapeo: ORIGEN_MANUAL_GRUPO,
      actualizadoPor: params.actualizadoPor,
      actualizadoEn: ahora,
      procedenciaMapeo: procedenciaConfiguracion(),
    },
  });
  return { excepcionesAfectadas };
}
