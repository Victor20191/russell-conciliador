import "server-only";

/**
 * GUARD server-only de la conciliación en firme (fail-closed).
 *
 * Lee `cuenta_bloqueada_conciliacion` / `conciliacion_modulo_cierre` y expone las
 * comprobaciones que usan las Server Actions del balance y de la homologación. Todas
 * aceptan un cliente de transacción opcional para correr DENTRO del candado de la
 * acción que protegen. La lógica de comparación es pura (`cuentas-bloqueo.ts`).
 */
import prisma from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { getCurrentUser, verifySession } from "@/lib/dal";
import { authorizePermiso, type AuthzResult } from "@/lib/rbac";
import { ROLES_ALCANCE_GLOBAL } from "@/lib/rbac/jerarquia";
import type { TransactionClient } from "@/lib/concurrency";
import {
  cuenta4Russell,
  ESTADO_CIERRE_FIRME,
  esResponsableSeniorOGerente,
  evaluarCambiosBloqueados,
  mensajeConciliacionEnFirme,
  type CuentaBloqueada,
  type FilaDetalleBloqueo,
  type ViolacionBloqueo,
} from "./cuentas-bloqueo";

type Db = TransactionClient | typeof prisma;

export type CierreFirme = {
  id: number;
  moduloCodigo: string;
  periodo: string;
  balancePeriodo: string;
  balanceEncabezadoId: number;
  moduloDatoEncabezadoId: number;
  cerradoPor: string;
  cerradoEn: Date;
  cuentasRussell: string[];
};

export type CuentaBloqueadaConCierre = CuentaBloqueada & { cierre: CierreFirme };

/** Error tipado que lanzan los puntos de enforcement dentro de una transacción. */
export class ErrorConciliacionEnFirme extends Error {
  readonly cierres: CierreFirme[];
  readonly violaciones: ViolacionBloqueo[];
  constructor(cierres: CierreFirme[], violaciones: ViolacionBloqueo[] = []) {
    super(mensajeConciliacionEnFirme(cierres, violaciones));
    this.name = "ErrorConciliacionEnFirme";
    this.cierres = cierres;
    this.violaciones = violaciones;
  }
}

function aCierre(c: {
  id: number;
  moduloCodigo: string;
  periodo: string;
  balancePeriodo: string;
  balanceEncabezadoId: number;
  moduloDatoEncabezadoId: number;
  cerradoPor: string;
  cerradoEn: Date;
  cuentasRussell: unknown;
}): CierreFirme {
  return {
    id: c.id,
    moduloCodigo: c.moduloCodigo,
    periodo: c.periodo,
    balancePeriodo: c.balancePeriodo,
    balanceEncabezadoId: c.balanceEncabezadoId,
    moduloDatoEncabezadoId: c.moduloDatoEncabezadoId,
    cerradoPor: c.cerradoPor,
    cerradoEn: c.cerradoEn,
    cuentasRussell: Array.isArray(c.cuentasRussell) ? c.cuentasRussell.map(String) : [],
  };
}

const SELECT_CIERRE = {
  id: true,
  moduloCodigo: true,
  periodo: true,
  balancePeriodo: true,
  balanceEncabezadoId: true,
  moduloDatoEncabezadoId: true,
  cerradoPor: true,
  cerradoEn: true,
  cuentasRussell: true,
} as const;

/** Cierres EN FIRME de un cliente; con `balancePeriodo` se acota al período del balance. */
export async function cierresFirmes(clienteId: number, balancePeriodo?: string, db: Db = prisma): Promise<CierreFirme[]> {
  const rows = await db.conciliacionModuloCierre.findMany({
    where: { clienteId, estado: ESTADO_CIERRE_FIRME, ...(balancePeriodo ? { balancePeriodo } : {}) },
    select: SELECT_CIERRE,
    orderBy: { id: "asc" },
  });
  return rows.map(aCierre);
}

/** Cierre en firme que referencia un balance concreto (cualquier módulo). */
export async function cierresFirmesDeBalance(balanceIds: number[], db: Db = prisma): Promise<CierreFirme[]> {
  if (balanceIds.length === 0) return [];
  const rows = await db.conciliacionModuloCierre.findMany({
    where: { balanceEncabezadoId: { in: balanceIds }, estado: ESTADO_CIERRE_FIRME },
    select: SELECT_CIERRE,
    orderBy: { id: "asc" },
  });
  return rows.map(aCierre);
}

/**
 * Cuentas bloqueadas de un (cliente, período del balance), con su cierre. Con
 * `filtro` se acota a cuentas exactas o a un prefijo (grupo de 6 díg.).
 */
export async function cuentasBloqueadas(
  clienteId: number,
  balancePeriodo: string,
  filtro?: { cuentas?: string[]; prefijo?: string },
  db: Db = prisma,
): Promise<CuentaBloqueadaConCierre[]> {
  if (filtro?.cuentas && filtro.cuentas.length === 0 && !filtro.prefijo) return [];
  const rows = await db.cuentaBloqueadaConciliacion.findMany({
    where: {
      clienteId,
      periodo: balancePeriodo,
      cierre: { estado: ESTADO_CIERRE_FIRME },
      ...(filtro?.cuentas ? { cuenta: { in: filtro.cuentas } } : {}),
      ...(filtro?.prefijo ? { cuenta: { startsWith: filtro.prefijo } } : {}),
    },
    select: {
      cuenta: true,
      cuenta6Russell: true,
      saldoInicial: true,
      debitos: true,
      creditos: true,
      saldoFinal: true,
      cierre: { select: SELECT_CIERRE },
    },
    orderBy: { cuenta: "asc" },
  });
  return rows.map((r) => ({
    cuenta8: r.cuenta,
    cuenta6Russell: r.cuenta6Russell,
    saldoInicial: Number(r.saldoInicial),
    debitos: Number(r.debitos),
    creditos: Number(r.creditos),
    saldoFinal: Number(r.saldoFinal),
    cierre: aCierre(r.cierre),
  }));
}

/** Cuentas bloqueadas de un cliente en CUALQUIER período (memoria de homologación, que no distingue período). */
export async function cuentasBloqueadasCliente(
  clienteId: number,
  filtro: { cuentas?: string[]; prefijo?: string },
  db: Db = prisma,
): Promise<CuentaBloqueadaConCierre[]> {
  if (!filtro.cuentas?.length && !filtro.prefijo) return [];
  const rows = await db.cuentaBloqueadaConciliacion.findMany({
    where: {
      clienteId,
      cierre: { estado: ESTADO_CIERRE_FIRME },
      ...(filtro.cuentas ? { cuenta: { in: filtro.cuentas } } : {}),
      ...(filtro.prefijo ? { cuenta: { startsWith: filtro.prefijo } } : {}),
    },
    select: {
      cuenta: true,
      cuenta6Russell: true,
      saldoInicial: true,
      debitos: true,
      creditos: true,
      saldoFinal: true,
      cierre: { select: SELECT_CIERRE },
    },
    orderBy: { cuenta: "asc" },
  });
  return rows.map((r) => ({
    cuenta8: r.cuenta,
    cuenta6Russell: r.cuenta6Russell,
    saldoInicial: Number(r.saldoInicial),
    debitos: Number(r.debitos),
    creditos: Number(r.creditos),
    saldoFinal: Number(r.saldoFinal),
    cierre: aCierre(r.cierre),
  }));
}

function cierresUnicos(filas: readonly CuentaBloqueadaConCierre[]): CierreFirme[] {
  const m = new Map<number, CierreFirme>();
  for (const f of filas) m.set(f.cierre.id, f.cierre);
  return [...m.values()];
}

/**
 * Enforcement para una VERSIÓN NUEVA del balance: si el período tiene cuentas en firme
 * y el cargue las altera (importes, homologación, ausencia) o mete cuentas nuevas al
 * módulo cerrado, lanza `ErrorConciliacionEnFirme`. Sin cierres → no-op.
 */
export async function exigirCargueCompatibleConCierres(
  clienteId: number,
  balancePeriodo: string,
  filasNuevas: readonly FilaDetalleBloqueo[],
  db: Db = prisma,
): Promise<void> {
  const cierres = await cierresFirmes(clienteId, balancePeriodo, db);
  if (cierres.length === 0) return;
  const bloqueadas = await cuentasBloqueadas(clienteId, balancePeriodo, undefined, db);
  const cerradas = new Set(cierres.flatMap((c) => c.cuentasRussell));
  const violaciones = evaluarCambiosBloqueados(bloqueadas, filasNuevas, cerradas);
  if (violaciones.length > 0) throw new ErrorConciliacionEnFirme(cierres, violaciones);
}

/**
 * Enforcement para editar la homologación de una cuenta del balance (asignar, dejar
 * pendiente, eliminar la fila). `alcance` grupo → cualquier cuenta del prefijo de 6.
 * Además, homologar HACIA una cuenta Russell de un módulo cerrado del período mete una
 * cuenta nueva en la conciliación (regla 3). Devuelve el mensaje o null.
 */
export async function bloqueoHomologacionBalance(
  p: {
    clienteId: number;
    balancePeriodo: string;
    cuenta8: string;
    cuenta6: string;
    alcanceGrupo: boolean;
    /** Estándar destino (null = quitar/pendiente/eliminar). */
    codigoDestino: string | null;
  },
  db: Db = prisma,
): Promise<{ message: string; cierres: CierreFirme[] } | null> {
  const bloqueadas = await cuentasBloqueadas(
    p.clienteId,
    p.balancePeriodo,
    p.alcanceGrupo ? { prefijo: p.cuenta6 } : { cuentas: [p.cuenta8] },
    db,
  );
  if (bloqueadas.length > 0) {
    const cierres = cierresUnicos(bloqueadas);
    return {
      cierres,
      message: mensajeConciliacionEnFirme(
        cierres,
        bloqueadas.slice(0, 3).map((b) => ({ cuenta8: b.cuenta8, motivo: "homologacion", detalle: `${b.cuenta8} está conciliada` })),
      ),
    };
  }
  const destino4 = cuenta4Russell(p.codigoDestino);
  if (destino4) {
    const cierres = (await cierresFirmes(p.clienteId, p.balancePeriodo, db)).filter((c) => c.cuentasRussell.includes(destino4));
    if (cierres.length > 0) {
      return {
        cierres,
        message: mensajeConciliacionEnFirme(cierres, [
          { cuenta8: p.cuenta8, motivo: "nueva_en_modulo", detalle: `${p.cuenta8} entraría al módulo conciliado (homologada a ${p.codigoDestino})` },
        ]),
      };
    }
  }
  return null;
}

/**
 * Enforcement para la MEMORIA de homologación (/config/mapeo), que no distingue
 * período: bloquea si la cuenta o su grupo están en firme en cualquier período del
 * cliente. Devuelve el mensaje o null.
 */
export async function bloqueoMemoriaHomologacion(
  p: { clienteId: number; codigo: string; alcanceGrupo: boolean },
  db: Db = prisma,
): Promise<{ message: string; cierres: CierreFirme[] } | null> {
  const bloqueadas = await cuentasBloqueadasCliente(
    p.clienteId,
    p.alcanceGrupo || p.codigo.length <= 6 ? { prefijo: p.codigo } : { cuentas: [p.codigo] },
    db,
  );
  if (bloqueadas.length === 0) return null;
  const cierres = cierresUnicos(bloqueadas);
  return {
    cierres,
    message: mensajeConciliacionEnFirme(
      cierres,
      bloqueadas.slice(0, 3).map((b) => ({ cuenta8: b.cuenta8, motivo: "homologacion", detalle: `${b.cuenta8} está conciliada en ${b.cierre.balancePeriodo}` })),
    ),
  };
}

/** Evento de auditoría de un intento de manipulación bloqueado (best-effort). */
export async function registrarIntentoBloqueado(p: {
  clienteId: number;
  entidad: string;
  operacion: string;
  cierres: readonly CierreFirme[];
  detalle?: string;
  usuario?: string | null;
}): Promise<void> {
  const user = p.usuario ?? (await getCurrentUser())?.name ?? "Sistema";
  await logAudit({
    user,
    action: "CONCILIACIÓN EN FIRME · INTENTO BLOQUEADO",
    entity: p.entidad,
    detail: `${p.operacion} · ${p.cierres.map((c) => `${c.moduloCodigo} ${c.periodo} (cargue #${c.moduloDatoEncabezadoId})`).join(", ")}${p.detalle ? ` · ${p.detalle}` : ""}`,
    clientId: p.clienteId,
  });
}

/**
 * Autoriza cerrar/desbloquear la conciliación: permiso de rol + alcance de LECTURA
 * sobre el cliente + ser senior o gerente ASIGNADO (los roles de alcance global
 * —Superadministrador— pasan sin asignación).
 */
export async function autorizarCierreConciliacion(
  permiso: "conciliaciones:cerrar" | "conciliaciones:desbloquear",
  clienteId: number,
): Promise<AuthzResult> {
  const authz = await authorizePermiso(permiso, { clientId: clienteId, modo: "lectura" });
  if (!authz.ok) return authz;
  const session = await verifySession();
  if (ROLES_ALCANCE_GLOBAL.has(session.role)) return authz;
  const asignaciones = await prisma.clientAssignment.findMany({
    where: { clientId: clienteId, userId: session.userId, role: { in: ["senior", "gerente"] } },
    select: { role: true, userId: true, active: true, validFrom: true, validUntil: true },
  });
  if (!esResponsableSeniorOGerente(asignaciones, session.userId)) {
    return { ok: false, message: "Solo el senior o gerente asignado al cliente puede hacer esto." };
  }
  return authz;
}
