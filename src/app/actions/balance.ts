"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/dal";
import { logAudit } from "@/lib/audit";
import { authorizePermiso } from "@/lib/rbac";
import { clienteDeBalance } from "@/lib/rbac/contexto";
import { parseId } from "@/lib/ids";
import { tomarCandadoTransaccion, transaccionSerializable } from "@/lib/concurrency";
import { createProcessNotification } from "@/lib/notifications";
import { mensajeErrorBD, mensajeErrorIA } from "@/lib/errores";
import { fmt, fmtDate, MESES_LARGOS } from "@/lib/format";
import { ConfirmarBalanceSchema, ImportReadySchema, type ActionState } from "@/lib/definitions";
import { firmarPayloadServidor, validarFirmaPayloadServidor } from "@/lib/server-payload";
import { parseBalanceWorkbook, type ImportBalanceState } from "@/lib/import/balance";
import {
  calcularBalance,
  construirValidacionContable,
  reconstruirBalance,
  aFilasDetalle,
  aplanarBreakdown,
  compararBalances,
  tokenizarPlan,
  limpiarCodigo,
  conForzarHoja,
  type CuentaCruda,
  type CuentaEstandar,
  type ResultadoBalance,
  type ValidacionContable,
} from "@/lib/balance/calcular";
import { getCuentasEstandar } from "@/lib/balance/cuentas-estandar";
import { TIPO_BALANCE_CARGA } from "@/lib/balance/tipo-balance";
import { extraerBalance } from "@/lib/balance/extraccion/extraer";
import { mapearPorIA } from "@/lib/balance/mapeo-ia";
import { construirVistaBorrador } from "@/lib/balance/borrador-vm";
import type { FilaBorrador } from "@/lib/balance/borrador";
import { diagnosticarConIA, type DiagnosticoIA } from "@/lib/balance/diagnostico-ia";
import { iaDisponible, MODELO_EXTRACCION } from "@/lib/anthropic";
import { registrarConsumoIA, type UsoIA } from "@/lib/ia/uso";
import { randomUUID } from "node:crypto";
import { construirCuadre, marcarSubtotalesDuplicados, reclasificarRepetidos } from "@/lib/balance/extraccion/transformar";
import type { FilaCruda, ParamsExtraccion, ResultadoTransform, TipoFila } from "@/lib/balance/extraccion/transformar";
import { CUADRE_NO_APLICA } from "@/lib/balance/extraccion/esquema";
import type { CuadreTotales, Excepcion, ResumenAuditoria } from "@/lib/balance/extraccion/esquema";

const MAX_BYTES = 20 * 1024 * 1024; // 20 MB (admite PDF)
const CONTEXTO_PAYLOAD_BALANCE = "balance:sugerencia:v1";

// Sugerencia que devuelve la LECTURA del archivo (paso 1): cabecera detectada +
// las cuentas leídas. NO se persiste nada; la persona la revisa, completa los
// campos faltantes (cliente, período) y recién entonces confirma la carga.
export type SugerenciaBalance = {
  firma: string;
  loteId: string; // lote de staging (paso 1): el paso 2 relee las filas crudas por aquí
  archivoNombre: string;
  archivoTam: string;
  nitDetectado: string | null;
  nitFuente: ResumenAuditoria["nit"]["fuente"];
  periodoInicial: string | null;
  periodoFinal: string | null;
  estandar: string;
  convencionCredito: string;
  filasLeidas: number;
  filasExcluidas: number;
  filasDescuadre: number;
  cuentasMovimiento: number; // hojas detectadas (cuentas de movimiento real)
  cuentasAgrupadoras: number; // cuentas que son prefijo de otra (no se importan)
  cuentas: number;
  cuadre: CuadreTotales; // cuadre de las hojas contra la fila TOTALES del archivo
  validacion: ValidacionContable; // borrador: A/P/Patrimonio (archivo vs calculado) + ecuación
  importReady: CuentaCruda[];
};
type SugerenciaBalanceSinFirma = Omit<SugerenciaBalance, "firma">;

export type LeerBalanceState = {
  ok?: boolean;
  message?: string;
  errores?: NonNullable<ImportBalanceState["errores"]>;
  excepciones?: Excepcion[];
  sugerencia?: SugerenciaBalance;
};

type MetaEtl = {
  estandar: string;
  convencionCredito: string;
  filasLeidas: number;
  filasExcluidas: number;
  filasDescuadre: number;
};

/**
 * Etiqueta legible del período a partir del rango ISO `desde`/`hasta`. Si ambos
 * caen en el mismo mes → «Abril 2026»; si abarcan varios meses → «Enero 2026 –
 * Abril 2026». Es la clave de versionado por período (clienteId, periodo, version).
 */
function etiquetaPeriodo(inicio: string, fin: string): string {
  const a = /^(\d{4})-(\d{2})/.exec(inicio);
  const b = /^(\d{4})-(\d{2})/.exec(fin);
  if (!a || !b) return `${inicio} – ${fin}`;
  const nombre = (mm: string, yyyy: string) => `${MESES_LARGOS[Number(mm) - 1] ?? mm} ${yyyy}`;
  return a[1] === b[1] && a[2] === b[2] ? nombre(b[2], b[1]) : `${nombre(a[2], a[1])} – ${nombre(b[2], b[1])}`;
}

/** Sello de fecha-hora para mostrar (p. ej. "06/Ene/2026 09:14"). */
function sello(): string {
  const d = new Date();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${fmtDate(d)} ${hh}:${mm}`;
}

/** Tamaño de archivo legible (KB/MB) en es-CO. */
function tamArchivo(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** Etiqueta legible del rol que carga (para la bitácora de versiones). */
function etiquetaRol(code: string): string {
  const map: Record<string, string> = {
    staff: "Staff",
    senior: "Auditor senior",
    gerente: "Gerente",
    socio: "Socio",
    admin: "Administrador",
    superadmin: "Superadministrador",
  };
  return map[code] ?? code;
}

/** Mensaje de bloqueo cuando las hojas (movimiento) no cuadran contra TOTALES. */
function mensajeCuadre(c: CuadreTotales): string {
  const partes: string[] = [];
  if (Math.abs(c.diferenciaDebitos) > c.toleranciaDebitos) {
    partes.push(`débitos: hojas ${fmt(c.sumaDebitos)} vs TOTALES ${fmt(c.totalDebitos)} (Δ ${fmt(c.diferenciaDebitos)})`);
  }
  if (Math.abs(c.diferenciaCreditos) > c.toleranciaCreditos) {
    partes.push(`créditos: hojas ${fmt(c.sumaCreditos)} vs TOTALES ${fmt(c.totalCreditos)} (Δ ${fmt(c.diferenciaCreditos)})`);
  }
  return `El balance no cuadra contra la fila TOTALES del archivo — ${partes.join("; ")}. Revisa la jerarquía de cuentas (padres/auxiliares) y vuelve a leer el archivo.`;
}

function firmarSugerenciaBalance(sugerencia: SugerenciaBalanceSinFirma): SugerenciaBalance {
  return {
    ...sugerencia,
    firma: firmarPayloadServidor(sugerencia, CONTEXTO_PAYLOAD_BALANCE),
  };
}

function sugerenciaSinFirma(sugerencia: SugerenciaBalance): SugerenciaBalanceSinFirma {
  const { firma, ...payload } = sugerencia;
  void firma;
  return payload;
}

// Paso 2 — «análisis por cuentas»: agrega las filas de MOVIMIENTO del staging por
// código de cuenta (suma terceros/auxiliares del mismo código) → `CuentaCruda[]`
// listo para `persistirCargue`. Los Decimal de Prisma se convierten a number.
type FilaStaging = { codigo: string; nombre: string; saldoInicial: unknown; debitos: unknown; creditos: unknown; saldoFinal: unknown };
function agregarStagingPorCuenta(filas: FilaStaging[]): CuentaCruda[] {
  const m = new Map<string, CuentaCruda>();
  for (const f of filas) {
    const si = Number(f.saldoInicial), db = Number(f.debitos), cr = Number(f.creditos), sf = Number(f.saldoFinal);
    const prev = m.get(f.codigo);
    if (!prev) m.set(f.codigo, { code: f.codigo, name: f.nombre, prevBalance: si, balance: sf, debitos: db, creditos: cr });
    else {
      prev.prevBalance += si;
      prev.balance += sf;
      prev.debitos = (prev.debitos ?? 0) + db;
      prev.creditos = (prev.creditos ?? 0) + cr;
    }
  }
  return [...m.values()];
}

// Promueve un LOTE de staging a balance OFICIAL. Núcleo compartido por el flujo
// del modal (`confirmarCargaBalance`, con payload firmado) y por el de la página
// de borrador (`cargarBorrador`, con el encabezado persistido). Relee el staging,
// hace el análisis por cuentas, persiste y PURGA el lote (staging + encabezado).
type MetaPromocion = {
  loteId: string;
  clientId: number;
  periodoInicio: string;
  periodoFin: string;
  rolLabel: string;
  archivoNombre: string;
  archivoTam: string;
  nitDetectado: string | null;
  nitFuente: ResumenAuditoria["nit"]["fuente"];
  convencionCredito: string;
  filasLeidas: number;
  filasExcluidas: number;
  filasDescuadre: number;
  cuentasMovimiento: number;
  cuentas: number;
  cuentasAgrupadoras: number;
  cuadreArchivo: { totalDebitos: number; totalCreditos: number } | null; // solo el modal lo trae
  importReadyFallback: CuentaCruda[]; // por si el staging ya no está (modal firmado)
};
async function promoverStagingAOficial(p: MetaPromocion, contexto: string): Promise<ImportBalanceState> {
  // Análisis por cuentas sobre el staging del lote (MOVIMIENTO agregado por código).
  let importReadyFinal: CuentaCruda[];
  try {
    // Lee TODAS las filas del lote (no solo `movimiento`) para poder reclasificar
    // los códigos repetidos (encabezado+movimiento) que en staging quedaron como
    // agrupadora — así los lotes viejos también recuperan ese saldo.
    const staged = await prisma.balanceImportacionStaging.findMany({
      where: { loteId: p.loteId },
      orderBy: { filaNum: "asc" },
      select: { filaNum: true, codigo: true, nombre: true, tipoFila: true, saldoInicial: true, debitos: true, creditos: true, saldoFinal: true },
    });
    const rows = staged.map((f) => ({
      filaNum: f.filaNum, codigo: f.codigo, nombre: f.nombre, tipoFila: f.tipoFila as TipoFila,
      saldoInicial: Number(f.saldoInicial), debitos: Number(f.debitos), creditos: Number(f.creditos), saldoFinal: Number(f.saldoFinal),
    }));
    reclasificarRepetidos(rows); // código repetido → movimiento
    const mov = rows.filter((f) => f.tipoFila === "movimiento");
    // Excluye subtotales DUPLICADOS (6 díg con detalle 8 díg idéntico) para no doblar.
    const dup = marcarSubtotalesDuplicados(mov);
    const movNetas = mov.filter((f) => !dup.has(f));
    importReadyFinal = movNetas.length > 0 ? agregarStagingPorCuenta(movNetas) : p.importReadyFallback;
  } catch {
    importReadyFinal = p.importReadyFallback;
  }
  if (importReadyFinal.length === 0) importReadyFinal = p.importReadyFallback;
  if (importReadyFinal.length === 0) return { ok: false, message: "El borrador ya no tiene cuentas para cargar. Vuelve a leer el archivo." };
  // Respeta como hojas los imputables de nivel alto (código repetido/desacople) que
  // el filtro por prefijo de `calcularBalance`/`persistirCargue` descartaría.
  importReadyFinal = conForzarHoja(importReadyFinal);

  // Cuadre contra la fila TOTALES del archivo (solo el flujo del modal lo trae). Σ
  // firmada: las reversas restan del lado correcto. No bloquea; marca descuadre.
  let cuadreTotales: CuadreTotales | null = null;
  if (p.cuadreArchivo) {
    const sumaDebitos = importReadyFinal.reduce((s, r) => s + (r.debitos ?? 0), 0);
    const sumaCreditos = importReadyFinal.reduce((s, r) => s + (r.creditos ?? 0), 0);
    cuadreTotales = construirCuadre({ detectado: true, debitos: p.cuadreArchivo.totalDebitos, creditos: p.cuadreArchivo.totalCreditos }, sumaDebitos, sumaCreditos);
  }

  try {
    const cliente = await prisma.client.findUnique({ where: { id: p.clientId }, select: { name: true, nit: true, erpId: true } });
    if (!cliente) return { ok: false, message: "El cliente seleccionado ya no existe." };
    if (cliente.erpId == null) {
      return { ok: false, message: "El cliente no tiene un ERP asignado. Asígnalo en Configuración › Clientes antes de cargar el balance." };
    }

    const period = etiquetaPeriodo(p.periodoInicio, p.periodoFin);
    const periodos = { inicial: p.periodoInicio, final: p.periodoFin };
    const cuentasEstandar = await getCuentasEstandar();
    const user = await getCurrentUser();

    const { id, version, calc } = await persistirCargue({
      clientId: p.clientId, clienteName: cliente.name, clienteNit: cliente.nit,
      period, periodos, importReady: importReadyFinal, cuentasEstandar,
      archivoNombre: p.archivoNombre, archivoTam: p.archivoTam,
      uploadedBy: user?.name ?? "—", uploadedById: user?.id ?? null, rolLabel: p.rolLabel,
      cuadreTotales,
      meta: {
        estandar: TIPO_BALANCE_CARGA, convencionCredito: p.convencionCredito,
        filasLeidas: p.filasLeidas, filasExcluidas: p.filasExcluidas, filasDescuadre: p.filasDescuadre,
      },
    });

    // Promovido → PURGA el lote (staging + encabezado). Best-effort.
    try {
      await prisma.balanceImportacionStaging.deleteMany({ where: { loteId: p.loteId } });
      await prisma.balanceImportacionLote.deleteMany({ where: { loteId: p.loteId } });
    } catch {
      /* best-effort */
    }

    const auditoria: ResumenAuditoria = {
      filasLeidas: p.filasLeidas, filasExcluidas: p.filasExcluidas, filasImportables: p.cuentas, filasDescuadre: p.filasDescuadre,
      cuentasMovimiento: p.cuentasMovimiento, cuentasAgrupadoras: p.cuentasAgrupadoras,
      nit: { valor: p.nitDetectado, fuente: p.nitFuente },
      periodoInicial: { valor: p.periodoInicio, fuente: "FUENTE" },
      periodoFinal: { valor: p.periodoFin, fuente: "FUENTE" },
      estandar: TIPO_BALANCE_CARGA,
      convencionCredito: p.convencionCredito === "magnitud" ? "magnitud" : "firmado",
    };

    return {
      ok: true,
      resumen: {
        id, cliente: cliente.name, period, version,
        cuentas: calc.totalRows, mapped: calc.mapped, unmapped: calc.unmapped, balanced: calc.balanced,
        auditoria,
      },
    };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD(contexto, e) };
  }
}

export async function freezeBalance(formData: FormData): Promise<ActionState> {
  // Primer gate: sesión + permiso de rol (antes de tocar la BD).
  const authz = await authorizePermiso("balance:editar");
  if (!authz.ok) return { ok: false, message: authz.message };
  const id = parseId(formData.get("id"));
  if (!id) return { ok: false, message: "Balance inexistente." };
  // Segundo gate: ALCANCE de escritura sobre el cliente del balance (cartera).
  const alcance = await authorizePermiso("balance:editar", { clientId: await clienteDeBalance(id) });
  if (!alcance.ok) return { ok: false, message: alcance.message };

  try {
    const user = await getCurrentUser();
    const resultado = await transaccionSerializable(async (tx) => {
      const referencia = await tx.balancePruebaEncabezado.findUnique({ where: { id } });
      if (!referencia) return { ok: false as const, message: "Balance inexistente." };

      await tomarCandadoTransaccion(tx, `balance-oficial:${referencia.clienteId}:${referencia.periodo}`);

      const balance = await tx.balancePruebaEncabezado.findUnique({ where: { id } });
      if (!balance) return { ok: false as const, message: "Balance inexistente." };
      if (balance.estaCongelado) {
        return {
          ok: true as const,
          message: "El balance ya estaba congelado.",
          balance,
          congelado: false,
        };
      }

      // La versión oficial es única por (cliente, período): se desmarca cualquier otra.
      await tx.balancePruebaEncabezado.updateMany({
        where: { clienteId: balance.clienteId, periodo: balance.periodo, esOficial: true },
        data: { esOficial: false },
      });
      await tx.balancePruebaEncabezado.update({
        where: { id },
        data: {
          esOficial: true,
          estaCongelado: true,
          estado: "Congelado",
          congeladoPor: user?.name ?? "Sistema",
          congeladoEn: new Date(),
        },
      });

      return {
        ok: true as const,
        message: "Balance congelado como oficial.",
        balance,
        congelado: true,
      };
    });

    if (!resultado.ok) return resultado;
    if (!resultado.congelado) return { ok: true, message: resultado.message };

    await logAudit({
      user: user?.name ?? "Sistema",
      action: "CONGELÓ BALANCE",
      entity: `${resultado.balance.nombreCliente} · ${resultado.balance.periodo}`,
      detail: `Versión ${resultado.balance.version} marcada como oficial`,
    });
    await createProcessNotification({
      actor: user?.name,
      text: "congeló el balance oficial de",
      target: `${resultado.balance.nombreCliente} · ${resultado.balance.periodo} · ${resultado.balance.version}`,
    });
    revalidatePath("/", "layout");
    revalidatePath("/balance");
    revalidatePath(`/balance/${id}`);
    return { ok: true, message: resultado.message };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("freezeBalance", e) };
  }
}

/**
 * Asigna manualmente una cuenta del cliente (fila de `balance_prueba_detalle`) a
 * una cuenta del plan estándar Russell. El estándar es de nivel 6 (máxima
 * profundidad del plan), así que `cuenta_6_russell` siempre apunta a ese nivel.
 * Coincidencia = 100 (asignación manual). Recalcula los contadores de mapeo del
 * encabezado.
 */
export async function asignarCuentaEstandar(formData: FormData): Promise<ActionState> {
  // Mapear una línea del balance al plan estándar lo hacen quienes trabajan el
  // balance: Staff y Admin (permiso `balance:crear`, scoped por cliente).
  const authz = await authorizePermiso("balance:crear");
  if (!authz.ok) return { ok: false, message: authz.message };

  const detalleId = parseId(formData.get("detalleId"));
  const codigo = String(formData.get("codigo") ?? "").trim();
  if (!detalleId) return { ok: false, message: "Cuenta del balance inexistente." };
  if (!codigo) return { ok: false, message: "Selecciona una cuenta estándar." };

  try {
    const fila = await prisma.balancePruebaDetalle.findUnique({
      where: { id: detalleId },
      select: { cuenta6: true, nombreCuenta: true, encabezado: { select: { id: true, clienteId: true, nombreCliente: true, nit: true } } },
    });
    if (!fila) return { ok: false, message: "La cuenta del balance ya no existe." };

    // Alcance de escritura sobre el cliente del balance (cartera).
    const alcance = await authorizePermiso("balance:crear", { clientId: fila.encabezado.clienteId });
    if (!alcance.ok) return { ok: false, message: alcance.message };

    // La cuenta estándar debe existir (es de 6 dígitos = nivel 6 del plan).
    const std = await prisma.standardAccount.findUnique({ where: { code: codigo }, select: { code: true, name: true } });
    if (!std) return { ok: false, message: "La cuenta estándar seleccionada no existe." };

    const encId = fila.encabezado.id;
    // El mapeo es a nivel de cuenta de 6 dígitos: se aplica a TODAS las cuentas
    // del cliente con el mismo prefijo (cuenta_6) en este balance.
    const afectadas = await prisma.balancePruebaDetalle.updateMany({
      where: { encabezadoId: encId, cuenta6: fila.cuenta6 },
      data: { cuenta6Russell: std.code, coincidencia: 100 },
    });

    // Memoria del cliente (cuentas_cliente): guarda esta asignación como `manual`
    // para reusarla en próximos períodos (y que NO la pise el mapeo automático).
    // No toca el mapeo de conciliación (russellOption) de la fila si ya existe.
    const user = await getCurrentUser();
    const ahora = new Date();
    // Marca el grupo de 6 díg como mapeo MANUAL del cliente (memoria entre períodos).
    await prisma.clientAccount.upsert({
      where: { clienteId_code: { clienteId: fila.encabezado.clienteId, code: fila.cuenta6 } },
      create: { clientName: fila.encabezado.nombreCliente, clienteId: fila.encabezado.clienteId, nit: fila.encabezado.nit, code: fila.cuenta6, level: 6, name: std.name ?? fila.cuenta6, cuenta6Russell: std.code, coincidencia: 100, origenMapeo: "manual", actualizadoPor: user?.name ?? null, actualizadoEn: ahora },
      update: { nit: fila.encabezado.nit, cuenta6Russell: std.code, coincidencia: 100, origenMapeo: "manual", actualizadoPor: user?.name ?? null, actualizadoEn: ahora },
    });
    // Propaga el estándar a las cuentas IMPUTABLES del mismo grupo (display consistente).
    await prisma.clientAccount.updateMany({
      where: { clienteId: fila.encabezado.clienteId, code: { startsWith: fila.cuenta6 }, NOT: { code: fila.cuenta6 } },
      data: { cuenta6Russell: std.code, coincidencia: 100, actualizadoPor: user?.name ?? null, actualizadoEn: ahora },
    });

    // Recalcula contadores de mapeo del encabezado.
    const [total, mapeadas] = await Promise.all([
      prisma.balancePruebaDetalle.count({ where: { encabezadoId: encId } }),
      prisma.balancePruebaDetalle.count({ where: { encabezadoId: encId, cuenta6Russell: { not: null } } }),
    ]);
    await prisma.balancePruebaEncabezado.update({
      where: { id: encId },
      data: { mapeadas, sinMapear: total - mapeadas, completitud: total > 0 ? Math.round((mapeadas / total) * 100) : 100 },
    });

    await logAudit({ user: user?.name ?? "Sistema", action: "ASIGNÓ CUENTA ESTÁNDAR", entity: fila.cuenta6, detail: `${fila.cuenta6} (${afectadas.count} cuenta(s)) → ${std.code}` });
    revalidatePath(`/balance/${encId}`);
    return { ok: true, message: `${afectadas.count} cuenta(s) ${fila.cuenta6}* mapeada(s) a ${std.code}.` };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("asignarCuentaEstandar", e) };
  }
}

/**
 * Escribe un cargue (encabezado + detalle) a partir de las cuentas ya extraídas
 * (`importReady`). Maneja versionado correlativo por (cliente, período), cálculo
 * de agregados, comparativo de cambios y bitácora. Única ruta de persistencia,
 * invocada solo por `confirmarCargaBalance`. No congela: eso lo hace `freezeBalance`.
 */
async function persistirCargue(p: {
  clientId: number;
  clienteName: string;
  clienteNit: string;
  period: string;
  periodos: { inicial: string; final: string };
  importReady: CuentaCruda[];
  cuentasEstandar: CuentaEstandar[];
  archivoNombre: string;
  archivoTam: string;
  uploadedBy: string;
  uploadedById?: number | null;
  rolLabel: string;
  meta: MetaEtl;
  // Cuadre contra el gran total del archivo (TOTALES). Si no cuadra NO bloquea el
  // cargue: se sube igual y queda marcado como descuadrado (novedad/alerta).
  cuadreTotales?: CuadreTotales | null;
}): Promise<{ id: number; version: string; calc: ResultadoBalance }> {
  // Plan pre-tokenizado una vez y compartido entre la pasada determinista y la
  // pasada con override de IA (evita re-tokenizar el plan dos veces por cargue).
  const planTok = tokenizarPlan(p.cuentasEstandar);

  // Configuración de mapeo GUARDADA del cliente (memoria entre períodos, en
  // cuentas_cliente): tiene PRIORIDAD sobre la cascada; lo `manual` no se recalcula.
  const configRows = await prisma.clientAccount.findMany({
    where: { clienteId: p.clientId, cuenta6Russell: { not: null } },
    select: { code: true, cuenta6Russell: true, coincidencia: true, origenMapeo: true },
  });
  // El mapeo es por cuenta de 6 díg: derivamos el mapa cuenta_6 → estándar desde
  // CUALQUIER fila del cliente (grupo o imputable; todas comparten el estándar),
  // dando prioridad a las filas `manual`. `manualCodes` son los códigos exactos
  // marcados a mano (no se recalculan).
  const configCliente = new Map<string, { std: string; coincidencia: number | null }>();
  for (const r of configRows) {
    const c6 = r.code.slice(0, 6);
    if (!configCliente.has(c6) || r.origenMapeo === "manual") {
      configCliente.set(c6, { std: r.cuenta6Russell as string, coincidencia: r.coincidencia != null ? Number(r.coincidencia) : null });
    }
  }
  const manualCodes = new Set(configRows.filter((r) => r.origenMapeo === "manual").map((r) => r.code));

  // Barrido 0 (config guardada) + 1 (exacto) + 2 (descripción), deterministas.
  let calc = calcularBalance(p.importReady, p.cuentasEstandar, undefined, planTok, configCliente);

  // Barrido 3 (IA): las cuentas que quedaron sin mapeo se homologan con Claude.
  // Best-effort: si la IA falla o no está configurada, se queda con lo determinista.
  if (iaDisponible()) {
    const pendientes = calc.breakdown.flatMap((g) => g.items).filter((it) => !it.mapped).map((it) => ({ code: it.code, name: it.name }));
    if (pendientes.length > 0) {
      const usos: UsoIA[] = [];
      try {
        const plan = p.cuentasEstandar.map((s) => ({ code: s.code, name: s.name ?? "", russell: s.russellAccount ?? "", posibles: s.possibleAccounts ?? "" }));
        const override = await mapearPorIA(pendientes, plan, usos);
        if (override.size > 0) calc = calcularBalance(p.importReady, p.cuentasEstandar, override, planTok, configCliente);
      } catch {
        /* la IA es opcional: si falla, no rompe el cargue */
      }
      // Registra el consumo de tokens del mapeo (best-effort, no rompe el cargue).
      await registrarConsumoIA(usos, {
        clienteId: p.clientId,
        usuarioId: p.uploadedById ?? null,
        usuarioNombre: p.uploadedBy,
        archivoNombre: p.archivoNombre,
      });
    }
  }

  // Registra/actualiza el PUC del cliente en cuentas_cliente: una fila por cuenta
  // IMPUTABLE (cuenta 8, con su NOMBRE real) + una por grupo de 6 díg, cada una con
  // su mapeo al plan estándar. Es la memoria entre períodos y el PUC real del
  // cliente. NO pisa filas marcadas como `manual`. Best-effort: no rompe el cargue.
  const filasDet = aFilasDetalle(calc.breakdown);
  try {
    const stdName = new Map(p.cuentasEstandar.map((s) => [s.code, s.name ?? s.code]));
    const nivelPorCodigo = (code: string) => (code.length >= 8 ? 8 : code.length === 6 ? 6 : code.length === 4 ? 4 : 2);
    // Una fila por código: imputables (nombre real) y grupos de 6 díg (nombre del estándar).
    const rows = new Map<string, { code: string; level: number; name: string; std: string | null; coincidencia: number | null }>();
    for (const f of filasDet) {
      const coinc = f.coincidencia != null ? Number(f.coincidencia) : null;
      rows.set(f.cuenta8, { code: f.cuenta8, level: nivelPorCodigo(f.cuenta8), name: f.nombreCuenta || f.cuenta8, std: f.cuenta6Russell, coincidencia: coinc });
      if (f.cuenta6 !== f.cuenta8 && !rows.has(f.cuenta6)) {
        const gname = f.cuenta6Russell ? (stdName.get(f.cuenta6Russell) ?? f.cuenta6) : f.cuenta6;
        rows.set(f.cuenta6, { code: f.cuenta6, level: 6, name: gname, std: f.cuenta6Russell, coincidencia: coinc });
      }
    }
    const ahoraDate = new Date();
    // Escritura del PUC en LOTES de concurrencia ACOTADA: disparar los ~750
    // upserts a la vez saturaba el pool (máx. ~10) contra una BD remota y la
    // mayoría fallaba por timeout de conexión, dejando la memoria PUC incompleta.
    // El CONJUNTO de upserts y los datos de cada uno son IDÉNTICOS; solo se acota
    // cuántos viajan en paralelo (≤ pool → nunca encola de más). Sigue siendo
    // best-effort y NO alimenta el resultado del balance (no se lee su salida).
    const aEscribir = [...rows.values()].filter((r) => !manualCodes.has(r.code));
    const LOTE_PUC = Math.max(1, (parseInt(process.env.DB_POOL_MAX ?? "10", 10) || 10) - 2);
    for (let i = 0; i < aEscribir.length; i += LOTE_PUC) {
      await Promise.all(
        aEscribir.slice(i, i + LOTE_PUC).map((r) =>
          prisma.clientAccount.upsert({
            where: { clienteId_code: { clienteId: p.clientId, code: r.code } },
            create: { clientName: p.clienteName, clienteId: p.clientId, nit: p.clienteNit, code: r.code, level: r.level, name: r.name, cuenta6Russell: r.std, coincidencia: r.coincidencia, origenMapeo: "automatico", actualizadoPor: p.uploadedBy, actualizadoEn: ahoraDate },
            update: { clientName: p.clienteName, nit: p.clienteNit, level: r.level, name: r.name, cuenta6Russell: r.std, coincidencia: r.coincidencia, origenMapeo: "automatico", actualizadoPor: p.uploadedBy, actualizadoEn: ahoraDate },
          }),
        ),
      );
    }
  } catch {
    /* el registro del PUC es best-effort: no rompe el cargue */
  }

  // Novedad de DESCUADRE contra el gran total del archivo (TOTALES): NO bloquea
  // el cargue —se sube todo igual— pero queda como alerta y el balance no-cuadrado.
  const descuadreTotales = !!p.cuadreTotales?.detectado && !p.cuadreTotales.cuadra;
  if (descuadreTotales) {
    calc.validations.push({ id: "cuadre-totales", rule: "Cuadre contra TOTALES del archivo", status: "warn", detail: mensajeCuadre(p.cuadreTotales!), count: 1 });
  }

  const alertas = calc.validations.filter((v) => v.status === "warn").length;
  const complete = calc.totalRows > 0 ? Math.round((calc.mapped / calc.totalRows) * 100) : 100;
  const ahora = sello();
  const nota = alertas > 0 ? `${alertas} validación(es) con alerta` : "Sin alertas";

  const creado = await transaccionSerializable(async (tx) => {
    await tomarCandadoTransaccion(tx, `balance-cargue:${p.clientId}:${p.period}`);

    // Versionado correlativo por (cliente, período). El candado evita que dos
    // cargues simultáneos calculen la misma versión antes de insertar.
    const previas = await tx.balancePruebaEncabezado.findMany({
      where: { clienteId: p.clientId, periodo: p.period },
      orderBy: { creadoEn: "asc" },
      select: { id: true },
    });
    const version = `v${previas.length + 1}`;
    const status = alertas > 0 ? "Con alertas" : previas.length > 0 ? "Última" : "Única";

    // Comparativo contra la versión previa (solo el conteo de cambios; el diff
    // completo se recalcula al abrir la pantalla de diff).
    let cambios = calc.totalRows;
    const previaId = previas[previas.length - 1]?.id;
    if (previaId) {
      const filasPrev = await tx.balancePruebaDetalle.findMany({
        where: { encabezadoId: previaId },
        select: { cuenta8: true, nombreCuenta: true, cuenta6Russell: true, saldoInicial: true, debitos: true, creditos: true, saldoFinal: true },
      });
      const calcPrev = reconstruirBalance(
        filasPrev.map((f) => ({
          cuenta8: f.cuenta8, nombreCuenta: f.nombreCuenta, cuenta6Russell: f.cuenta6Russell,
          saldoInicial: Number(f.saldoInicial), debitos: Number(f.debitos), creditos: Number(f.creditos), saldoFinal: Number(f.saldoFinal),
        })),
        p.cuentasEstandar,
      );
      const diff = compararBalances(aplanarBreakdown(calcPrev.breakdown), aplanarBreakdown(calc.breakdown));
      cambios = diff.summary.added + diff.summary.changed + diff.summary.removed;
    }

    const balance = await tx.balancePruebaEncabezado.create({
      data: {
        clienteId: p.clientId, nombreCliente: p.clienteName, nit: p.clienteNit,
        periodo: p.period, periodoInicio: new Date(p.periodos.inicial), periodoFin: new Date(p.periodos.final),
        version, esOficial: false, estaCongelado: false, estado: status, completitud: complete,
        archivo: p.archivoNombre, tamanoArchivo: p.archivoTam,
        cargadoPor: p.uploadedBy, rolCarga: p.rolLabel, cuadrado: calc.balanced && calc.movimientosCuadran && !descuadreTotales, nota,
        sumaActivo: calc.sums.activo, filasTotales: calc.totalRows,
        mapeadas: calc.mapped, sinMapear: calc.unmapped, criticas: calc.critical, cambios,
        estandar: p.meta.estandar, convencionCredito: p.meta.convencionCredito,
        filasLeidas: p.meta.filasLeidas, filasExcluidas: p.meta.filasExcluidas, filasDescuadre: p.meta.filasDescuadre,
        ultimaCarga: ahora,
        detalles: {
          create: filasDet.map((f) => ({
            cuenta2: f.cuenta2, cuenta4: f.cuenta4, cuenta6: f.cuenta6, cuenta8: f.cuenta8,
            nombreCuenta: f.nombreCuenta, cuenta6Russell: f.cuenta6Russell, coincidencia: f.coincidencia,
            saldoInicial: f.saldoInicial, debitos: f.debitos, creditos: f.creditos, saldoFinal: f.saldoFinal,
          })),
        },
      },
      select: { id: true },
    });

    return { id: balance.id, version };
  });

  await logAudit({
    user: p.uploadedBy,
    action: "CARGÓ BALANCE",
    entity: `${p.clienteName} · ${p.period}`,
    detail: `${creado.version} · ${calc.totalRows} cuentas · ${calc.mapped} mapeadas · ${calc.balanced && calc.movimientosCuadran && !descuadreTotales ? "cuadrado" : "descuadra"}`,
  });
  await createProcessNotification({
    actor: p.uploadedBy,
    text: "cargó el balance de",
    target: `${p.clienteName} · ${p.period} · ${creado.version}`,
  });
  revalidatePath("/", "layout");
  revalidatePath("/balance");

  return { id: creado.id, version: creado.version, calc };
}

/**
 * LECTURA (paso 1). Extrae las cuentas del archivo SIN escribir nada y devuelve
 * una sugerencia (NIT/período/centro detectados + cuentas + excepciones) para
 * que la persona la revise y complete antes de confirmar. No exige cliente.
 */
export async function leerBalance(
  _prev: LeerBalanceState,
  formData: FormData,
): Promise<LeerBalanceState> {
  const authz = await authorizePermiso("balance:crear");
  if (!authz.ok) return { ok: false, message: authz.message };

  const archivo = formData.get("archivo");
  if (!(archivo instanceof File) || archivo.size === 0) {
    return { ok: false, message: "Adjunta el archivo del balance (Excel, CSV, JSON o PDF)." };
  }
  if (archivo.size > MAX_BYTES) return { ok: false, message: "El archivo supera 20 MB." };

  try {
    // Lectura sin parámetros de cliente/período: la IA detecta todo del archivo
    // como sugerencia. El tipo de balance es regla fija de negocio.
    // Si no hay API key, cae al parser de plantilla limpia.
    const params: ParamsExtraccion = { nit: null, periodoInicial: null, periodoFinal: null, estandar: TIPO_BALANCE_CARGA };
    // Hoja elegida por el usuario en Excel multi-hoja (la IA no la asume). Vacío
    // → null: archivos de una sola hoja / CSV / PDF siguen el flujo normal.
    const hoja = String(formData.get("hoja") ?? "").trim() || null;
    const datosArchivo = await archivo.arrayBuffer();
    const usos: UsoIA[] = [];
    let extr: ResultadoTransform;
    if (iaDisponible()) {
      extr = await extraerBalance(datosArchivo, archivo.name, params, hoja, usos);
    } else {
      const { filas, errores } = await parseBalanceWorkbook(datosArchivo);
      if (errores.length > 0) {
        return { ok: false, message: `${errores.length} problema(s) en el archivo. Nada se leyó.`, errores };
      }
      const importReady: CuentaCruda[] = filas.map((f) => ({ code: f.code, name: f.name, prevBalance: f.prevBalance, balance: f.balance }));
      const filasCrudas: FilaCruda[] = filas.map((f, i) => ({
        hoja: null, filaNum: i + 1, codigoCrudo: f.code, codigo: /^\d+$/.test(f.code) ? f.code : "",
        nombre: f.name, nivel: /^\d+$/.test(f.code) ? f.code.length : null, tipoFila: "movimiento",
        saldoInicial: f.prevBalance, debitos: 0, creditos: 0, saldoFinal: f.balance,
      }));
      extr = {
        importReady,
        filasCrudas,
        excepciones: [],
        cabecera: {
          nit: { valor: null, fuente: "NINGUNO" }, periodoInicial: { valor: null, fuente: "NINGUNO" },
          periodoFinal: { valor: null, fuente: "NINGUNO" }, estandar: TIPO_BALANCE_CARGA,
        },
        resumen: {
          filasLeidas: importReady.length, filasExcluidas: 0, filasImportables: importReady.length, filasDescuadre: 0,
          cuentasMovimiento: importReady.length, cuentasAgrupadoras: 0,
          nit: { valor: null, fuente: "NINGUNO" }, periodoInicial: { valor: null, fuente: "NINGUNO" },
          periodoFinal: { valor: null, fuente: "NINGUNO" },
          estandar: TIPO_BALANCE_CARGA, convencionCredito: "firmado",
        },
        // El parser de plantilla limpia no expone una fila TOTALES: sin cuadre.
        cuadre: CUADRE_NO_APLICA,
      };
    }

    const usuario = await getCurrentUser();

    // Registra el consumo de tokens de la lectura/extracción (best-effort). Se
    // hace aquí —aunque no haya cuentas útiles— porque la IA ya consumió tokens.
    // El cliente aún no está confirmado en este paso (clienteId: null).
    if (usos.length > 0) {
      await registrarConsumoIA(usos, {
        clienteId: null,
        usuarioId: usuario?.id ?? null,
        usuarioNombre: usuario?.name ?? null,
        archivoNombre: archivo.name,
        nitDetectado: extr.cabecera.nit.valor,
      });
    }

    if (extr.importReady.length === 0) {
      return { ok: false, message: "No se leyó ninguna cuenta del archivo. Revisa las excepciones.", excepciones: extr.excepciones };
    }

    // Validación contable del BORRADOR: totales A/P/Patrimonio CALCULADOS del
    // detalle (calcularBalance no necesita el plan estándar para las sumas: son por
    // clase) contra los que TRAE el archivo (filas clase 1/2/3), + la ecuación
    // A = P + Patrimonio + Resultado. Todo con margen ±$1000.
    const calcBorrador = calcularBalance(extr.importReady, []);
    // Total del archivo por clase = SUMA de todas las filas totalizadoras de esa
    // clase (código "1"/"2"/"3"). En balances MULTI-SUCURSAL el ERP repite el total
    // de ACTIVO/PASIVO/PATRIMONIO por sucursal; sumarlas da el consolidado, que es
    // lo que el detalle (agregado por código entre sucursales) debe reflejar.
    const totalFilaArchivo = (clase: string) => {
      const filas = extr.filasCrudas.filter((f) => f.codigo === clase);
      return filas.length > 0 ? filas.reduce((s, f) => s + f.saldoFinal, 0) : null;
    };
    const validacion = construirValidacionContable(calcBorrador, {
      activo: totalFilaArchivo("1"),
      pasivo: totalFilaArchivo("2"),
      patrimonio: totalFilaArchivo("3"),
    });

    // PASO 1 — BORRADOR persistente: staging crudo (todas las filas, sin descartar)
    // + encabezado de lote con la metadata para listarlo. Persiste hasta que se
    // CARGA (promueve a oficial) o se DESCARTA — sin purga automática.
    const loteId = randomUUID();
    const LOTE_STAGING = 1000;
    for (let i = 0; i < extr.filasCrudas.length; i += LOTE_STAGING) {
      await prisma.balanceImportacionStaging.createMany({
        data: extr.filasCrudas.slice(i, i + LOTE_STAGING).map((f) => ({
          loteId, clienteId: null, hoja: f.hoja, filaNum: f.filaNum, codigoCrudo: f.codigoCrudo,
          codigo: f.codigo, nombre: f.nombre, nivel: f.nivel, tipoFila: f.tipoFila,
          saldoInicial: f.saldoInicial, debitos: f.debitos, creditos: f.creditos, saldoFinal: f.saldoFinal,
        })),
      });
    }
    await prisma.balanceImportacionLote.create({
      data: {
        loteId, clienteId: null,
        archivoNombre: archivo.name, archivoTam: tamArchivo(archivo.size),
        nitDetectado: extr.cabecera.nit.valor,
        periodoInicial: extr.cabecera.periodoInicial.valor, periodoFinal: extr.cabecera.periodoFinal.valor,
        estandar: extr.cabecera.estandar, convencionCredito: extr.resumen.convencionCredito,
        cuentasMovimiento: extr.resumen.cuentasMovimiento, filasLeidas: extr.resumen.filasLeidas, filasExcluidas: extr.resumen.filasExcluidas,
        partidaDobleDiff: calcBorrador.diffMov, ecuacionDiff: calcBorrador.diffCuadre,
        cuadrado: calcBorrador.balanced && calcBorrador.movimientosCuadran,
        cargadoPor: usuario?.name ?? null, cargadoPorId: usuario?.id ?? null,
      },
    });

    const sugerenciaBase: SugerenciaBalanceSinFirma = {
      loteId,
      validacion,
      archivoNombre: archivo.name,
      archivoTam: tamArchivo(archivo.size),
      nitDetectado: extr.cabecera.nit.valor,
      nitFuente: extr.cabecera.nit.fuente,
      periodoInicial: extr.cabecera.periodoInicial.valor,
      periodoFinal: extr.cabecera.periodoFinal.valor,
      estandar: extr.cabecera.estandar,
      convencionCredito: extr.resumen.convencionCredito,
      filasLeidas: extr.resumen.filasLeidas,
      filasExcluidas: extr.resumen.filasExcluidas,
      filasDescuadre: extr.resumen.filasDescuadre,
      cuentasMovimiento: extr.resumen.cuentasMovimiento,
      cuentasAgrupadoras: extr.resumen.cuentasAgrupadoras,
      cuentas: extr.importReady.length,
      cuadre: extr.cuadre,
      importReady: extr.importReady,
    };

    return {
      ok: true,
      excepciones: extr.excepciones,
      sugerencia: firmarSugerenciaBalance(sugerenciaBase),
    };
  } catch (e) {
    return { ok: false, message: mensajeErrorIA("leerBalance", e) };
  }
}

/**
 * AUDITORÍA RÁPIDA pre-carga (determinista, sin IA): dado el cliente elegido y las
 * cuentas leídas, evidencia (a) **posibles omisiones** —cuentas imputables del
 * ÚLTIMO balance del cliente que NO vienen en este archivo— y (b) cuentas que se
 * **cargarán sin mapeo** al estándar. No escribe nada ni bloquea; es para que la
 * persona revise antes de confirmar.
 */
export type AuditoriaCarga = {
  ok: boolean;
  message?: string;
  hayPrevio: boolean;
  omisiones: { code: string; name: string }[];
  sinMapeo: { code: string; name: string }[];
};

export async function auditarCargaBalance(clienteId: number, importReady: CuentaCruda[]): Promise<AuditoriaCarga> {
  const vacio: AuditoriaCarga = { ok: false, hayPrevio: false, omisiones: [], sinMapeo: [] };
  const authz = await authorizePermiso("balance:crear");
  if (!authz.ok) return { ...vacio, message: authz.message };
  const scope = await authorizePermiso("balance:crear", { clientId: clienteId });
  if (!scope.ok) return { ...vacio, message: scope.message };
  const parsed = ImportReadySchema.safeParse(importReady);
  if (!parsed.success) return { ...vacio, message: "Cuentas leídas inválidas." };
  const cuentas = parsed.data;
  try {
    // Mismo criterio de normalización que la carga (quita sufijos INAC/A/AS), para
    // que la comparación sea consistente: `236550INAC` ≡ `236550`.
    const enArchivo = new Set(cuentas.map((c) => limpiarCodigo(c.code)));

    // (a) Omisiones: imputables del último balance del cliente ausentes en el archivo.
    const previo = await prisma.balancePruebaEncabezado.findFirst({
      where: { clienteId }, orderBy: { creadoEn: "desc" }, select: { id: true },
    });
    let omisiones: { code: string; name: string }[] = [];
    if (previo) {
      const det = await prisma.balancePruebaDetalle.findMany({ where: { encabezadoId: previo.id }, select: { cuenta8: true, nombreCuenta: true } });
      omisiones = det.filter((d) => !enArchivo.has(limpiarCodigo(d.cuenta8))).map((d) => ({ code: d.cuenta8, name: d.nombreCuenta }));
    }

    // (b) Sin mapeo: cascada determinista (config guardada + exacto + descripción), SIN IA.
    const cuentasEstandar = await getCuentasEstandar();
    const configRows = await prisma.clientAccount.findMany({
      where: { clienteId, cuenta6Russell: { not: null } },
      select: { code: true, cuenta6Russell: true, coincidencia: true, origenMapeo: true },
    });
    const configCliente = new Map<string, { std: string; coincidencia: number | null }>();
    for (const r of configRows) {
      const c6 = r.code.slice(0, 6);
      if (!configCliente.has(c6) || r.origenMapeo === "manual") configCliente.set(c6, { std: r.cuenta6Russell as string, coincidencia: r.coincidencia != null ? Number(r.coincidencia) : null });
    }
    const calc = calcularBalance(cuentas, cuentasEstandar, undefined, undefined, configCliente);
    const sinMapeo = calc.breakdown.flatMap((g) => g.items).filter((it) => !it.mapped).map((it) => ({ code: it.code, name: it.name }));

    return { ok: true, hayPrevio: !!previo, omisiones, sinMapeo };
  } catch (e) {
    return { ...vacio, message: mensajeErrorBD("auditarCargaBalance", e) };
  }
}

/**
 * CONFIRMACIÓN (paso final). Recibe el cliente/período confirmados por la persona
 * + las cuentas ya leídas (sugerencia serializada en `payload`) y escribe el
 * cargue. Recalcula en el servidor los agregados Y el cuadre contra TOTALES desde
 * las cuentas (no confía en las sumas ni en el veredicto de cuadre del cliente; sí
 * toma del payload los totales del archivo, no reconstruibles sin reabrirlo).
 */
export async function confirmarCargaBalance(
  _prev: ImportBalanceState,
  formData: FormData,
): Promise<ImportBalanceState> {
  const authz = await authorizePermiso("balance:crear");
  if (!authz.ok) return { ok: false, message: authz.message };

  const parsed = ConfirmarBalanceSchema.safeParse({
    clientId: formData.get("clientId"),
    periodoInicio: formData.get("periodoInicio"),
    periodoFin: formData.get("periodoFin"),
  });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }
  const { clientId, periodoInicio, periodoFin } = parsed.data;

  const scope = await authorizePermiso("balance:crear", { clientId });
  if (!scope.ok) return { ok: false, message: scope.message };

  let sug: SugerenciaBalance;
  try {
    sug = JSON.parse(String(formData.get("payload") ?? "")) as SugerenciaBalance;
  } catch {
    return { ok: false, message: "La lectura del archivo no es válida. Vuelve a leer el archivo." };
  }
  if (
    !sug ||
    !validarFirmaPayloadServidor(
      sugerenciaSinFirma(sug),
      sug.firma,
      CONTEXTO_PAYLOAD_BALANCE,
    )
  ) {
    return {
      ok: false,
      message: "La lectura del archivo fue alterada o expiró. Vuelve a leer el archivo.",
    };
  }
  // Las cuentas viajan en el payload del cliente: se validan con Zod (tipos y
  // montos numéricos) antes de persistir. Las sumas/cuadre se recalculan en el
  // servidor; esto blinda contra payloads malformados (montos no numéricos, etc.).
  const cuentasParsed = ImportReadySchema.safeParse(sug?.importReady);
  if (!cuentasParsed.success) {
    return { ok: false, message: "No hay cuentas leídas válidas para cargar. Vuelve a leer el archivo." };
  }

  // PASO 2 — promoción a oficial (relee el staging del lote, análisis por cuentas,
  // persiste y purga). Núcleo compartido con `cargarBorrador`. La firma HMAC ata el
  // `loteId`; el `importReady` firmado es el respaldo si el staging ya no está.
  return await promoverStagingAOficial(
    {
      loteId: sug.loteId, clientId, periodoInicio, periodoFin, rolLabel: etiquetaRol(authz.role),
      archivoNombre: sug.archivoNombre ?? "—", archivoTam: sug.archivoTam ?? "—",
      nitDetectado: sug.nitDetectado, nitFuente: sug.nitFuente, convencionCredito: sug.convencionCredito,
      filasLeidas: sug.filasLeidas, filasExcluidas: sug.filasExcluidas, filasDescuadre: sug.filasDescuadre,
      cuentasMovimiento: sug.cuentasMovimiento ?? sug.cuentas, cuentas: sug.cuentas, cuentasAgrupadoras: sug.cuentasAgrupadoras ?? 0,
      cuadreArchivo: sug.cuadre?.detectado ? { totalDebitos: sug.cuadre.totalDebitos, totalCreditos: sug.cuadre.totalCreditos } : null,
      importReadyFallback: cuentasParsed.data,
    },
    "confirmarCargaBalance",
  );
}

/**
 * Carga (promueve a oficial) un BORRADOR persistido desde su página, eligiendo
 * cliente y período. Relee el staging del lote por `loteId` (fuente de verdad) y
 * reutiliza el mismo núcleo de promoción que el modal. No usa payload firmado: el
 * `loteId` viene del encabezado persistido y la autorización protege la escritura.
 */
export async function cargarBorrador(_prev: ImportBalanceState, formData: FormData): Promise<ImportBalanceState> {
  const authz = await authorizePermiso("balance:crear");
  if (!authz.ok) return { ok: false, message: authz.message };

  const parsed = ConfirmarBalanceSchema.safeParse({
    clientId: formData.get("clientId"),
    periodoInicio: formData.get("periodoInicio"),
    periodoFin: formData.get("periodoFin"),
  });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  const { clientId, periodoInicio, periodoFin } = parsed.data;
  const loteId = String(formData.get("loteId") ?? "").trim();
  if (!loteId) return { ok: false, message: "Borrador inválido. Vuelve a la lista de borradores." };

  const scope = await authorizePermiso("balance:crear", { clientId });
  if (!scope.ok) return { ok: false, message: scope.message };

  // El encabezado (si existe) enriquece la metadata; el staging es lo que se
  // promueve. Un borrador «huérfano» (sin encabezado) también se puede cargar.
  const lote = await prisma.balanceImportacionLote.findUnique({ where: { loteId } });
  const movEnStaging = await prisma.balanceImportacionStaging.count({ where: { loteId, tipoFila: "movimiento" } });
  if (!lote && movEnStaging === 0) return { ok: false, message: "El borrador ya no existe (fue cargado o descartado)." };

  const res = await promoverStagingAOficial(
    {
      loteId, clientId, periodoInicio, periodoFin, rolLabel: etiquetaRol(authz.role),
      archivoNombre: lote?.archivoNombre ?? "—", archivoTam: lote?.archivoTam ?? "—",
      nitDetectado: lote?.nitDetectado ?? null, nitFuente: lote?.nitDetectado ? "FUENTE" : "NINGUNO",
      convencionCredito: lote?.convencionCredito ?? "firmado",
      filasLeidas: lote?.filasLeidas ?? 0, filasExcluidas: lote?.filasExcluidas ?? 0, filasDescuadre: 0,
      cuentasMovimiento: lote?.cuentasMovimiento ?? movEnStaging, cuentas: lote?.cuentasMovimiento ?? movEnStaging, cuentasAgrupadoras: 0,
      cuadreArchivo: null,
      importReadyFallback: [],
    },
    "cargarBorrador",
  );
  // Éxito: redirige EN EL SERVIDOR al balance oficial. El borrador ya se purgó, así
  // que re-renderizar su página daría 404; el redirect del servidor evita esa carrera
  // (la confirmación se muestra con FlashToast en el destino). `redirect()` lanza una
  // excepción especial: va FUERA de cualquier try/catch.
  if (res.ok && res.resumen?.id) redirect(`/balance/${res.resumen.id}?cargado=1`);
  return res; // solo el caso de error llega aquí
}

/** Descarta (elimina) un borrador: borra su staging + encabezado. */
export async function descartarBorrador(loteId: string): Promise<ActionState> {
  const authz = await authorizePermiso("balance:crear");
  if (!authz.ok) return { ok: false, message: authz.message };
  const id = String(loteId ?? "").trim();
  if (!id) return { ok: false, message: "Borrador inválido." };
  try {
    await prisma.balanceImportacionStaging.deleteMany({ where: { loteId: id } });
    await prisma.balanceImportacionLote.deleteMany({ where: { loteId: id } });
    const user = await getCurrentUser();
    await logAudit({ user: user?.name ?? "—", action: "DESCARTÓ BORRADOR de balance", entity: id, detail: "" });
    revalidatePath("/balance/borradores");
    return { ok: true, message: "Borrador descartado." };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("descartarBorrador", e) };
  }
}

// ---------------------- Diagnóstico asistido por IA ----------------------

export type DiagnosticoBorradorState = { ok: boolean; message?: string; diagnostico?: DiagnosticoIA | null };

/**
 * Segundo análisis del descuadre CON IA, bajo demanda. Corre DESPUÉS de las
 * validaciones deterministas: recomputa los hallazgos desde el staging (misma
 * vista que la página) y le manda a Claude SOLO esos hallazgos + la estructura de
 * agrupadoras — no el archivo crudo. Registra el consumo (best-effort).
 */
export async function diagnosticarBorradorIA(loteId: string): Promise<DiagnosticoBorradorState> {
  const authz = await authorizePermiso("balance:crear");
  if (!authz.ok) return { ok: false, message: authz.message };
  if (!iaDisponible()) return { ok: false, message: "La IA no está disponible (falta ANTHROPIC_API_KEY)." };
  const id = String(loteId ?? "").trim();
  if (!id) return { ok: false, message: "Borrador inválido." };
  try {
    const [lote, filasStaging] = await Promise.all([
      prisma.balanceImportacionLote.findUnique({ where: { loteId: id } }),
      prisma.balanceImportacionStaging.findMany({ where: { loteId: id }, orderBy: { filaNum: "asc" } }),
    ]);
    if (filasStaging.length === 0) return { ok: false, message: "El borrador ya no existe." };

    const filas: FilaBorrador[] = filasStaging.map((f) => ({
      filaNum: f.filaNum, codigo: f.codigo, codigoCrudo: f.codigoCrudo, nombre: f.nombre, nivel: f.nivel,
      tipoFila: f.tipoFila as FilaBorrador["tipoFila"],
      saldoInicial: Number(f.saldoInicial), debitos: Number(f.debitos), creditos: Number(f.creditos), saldoFinal: Number(f.saldoFinal),
    }));
    const { hallazgos, agrupadoras } = construirVistaBorrador(filas);
    if (hallazgos.length === 0) return { ok: true, diagnostico: null, message: "El borrador cuadra: no hay descuadre que diagnosticar." };

    const usos: UsoIA[] = [];
    const diagnostico = await diagnosticarConIA(hallazgos, agrupadoras, MODELO_EXTRACCION, usos);

    const user = await getCurrentUser();
    await registrarConsumoIA(usos, {
      clienteId: lote?.clienteId ?? null,
      usuarioId: user?.id ?? null,
      usuarioNombre: user?.name ?? null,
      archivoNombre: lote?.archivoNombre ?? null,
      nitDetectado: lote?.nitDetectado ?? null,
      modulo: "balance",
    });
    await logAudit({ user: user?.name ?? "—", action: "DIAGNÓSTICO IA de balance borrador", entity: id, detail: `${hallazgos.length} hallazgo(s)` });
    return { ok: true, diagnostico };
  } catch (e) {
    return { ok: false, message: mensajeErrorIA("diagnosticarBorradorIA", e) };
  }
}

/**
 * Reclasifica manualmente una cuenta del borrador entre AGRUPADORA ↔ MOVIMIENTO
 * (corrección tras el diagnóstico). Aplica a TODAS las filas del lote con ese
 * código que hoy tienen el tipo ACTUAL (para corregir la cuenta en todas las
 * sucursales sin tocar una fila del mismo código pero del otro tipo — p. ej. un
 * encabezado repetido). Persiste en el staging; la página recalcula al revalidar.
 */
export async function reclasificarFilaBorrador(loteId: string, codigo: string, tipoFila: "agrupadora" | "movimiento"): Promise<ActionState> {
  const authz = await authorizePermiso("balance:crear");
  if (!authz.ok) return { ok: false, message: authz.message };
  const id = String(loteId ?? "").trim();
  const cod = String(codigo ?? "").trim();
  if (!id || !/^\d+$/.test(cod)) return { ok: false, message: "Cuenta inválida." };
  if (tipoFila !== "agrupadora" && tipoFila !== "movimiento") return { ok: false, message: "Tipo inválido." };
  const tipoActual = tipoFila === "movimiento" ? "agrupadora" : "movimiento";
  try {
    const res = await prisma.balanceImportacionStaging.updateMany({
      where: { loteId: id, codigo: cod, tipoFila: tipoActual },
      data: { tipoFila },
    });
    if (res.count === 0) return { ok: false, message: "No hay filas de esa cuenta para reclasificar." };
    const user = await getCurrentUser();
    await logAudit({ user: user?.name ?? "—", action: "RECLASIFICÓ cuenta de balance borrador", entity: id, detail: `${cod}: ${tipoActual} → ${tipoFila} (${res.count} fila/s)` });
    revalidatePath(`/balance/borradores/${id}`);
    return { ok: true, message: `Cuenta ${cod} → ${tipoFila} (${res.count} fila${res.count === 1 ? "" : "s"}).` };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("reclasificarFilaBorrador", e) };
  }
}

/**
 * Corrige "lados invertidos": intercambia débito ↔ crédito de una cuenta del
 * borrador. Solo toca las filas de ese código cuyo control HOY no cuadra con el
 * saldo pero SÍ cuadra al intercambiar (así no daña sucursales correctas). El
 * saldo NO se toca (ya es el correcto; la ecuación cuadra).
 */
export async function invertirLadosFilaBorrador(loteId: string, codigo: string): Promise<ActionState> {
  const authz = await authorizePermiso("balance:crear");
  if (!authz.ok) return { ok: false, message: authz.message };
  const id = String(loteId ?? "").trim();
  const cod = String(codigo ?? "").trim();
  if (!id || !/^\d+$/.test(cod)) return { ok: false, message: "Cuenta inválida." };
  try {
    const rows = await prisma.balanceImportacionStaging.findMany({
      where: { loteId: id, codigo: cod },
      select: { id: true, saldoInicial: true, debitos: true, creditos: true, saldoFinal: true },
    });
    const controlOk = (si: number, db: number, cr: number, s: number) => Math.abs(si + db - cr - s) <= 1;
    const aInvertir = rows.filter((r) => {
      const si = Number(r.saldoInicial), db = Number(r.debitos), cr = Number(r.creditos), s = Number(r.saldoFinal);
      return !controlOk(si, db, cr, s) && controlOk(si, cr, db, s);
    });
    if (aInvertir.length === 0) return { ok: false, message: "Esa cuenta no tiene filas con débito/crédito invertidos." };
    await prisma.$transaction(aInvertir.map((r) => prisma.balanceImportacionStaging.update({ where: { id: r.id }, data: { debitos: r.creditos, creditos: r.debitos } })));
    const user = await getCurrentUser();
    await logAudit({ user: user?.name ?? "—", action: "INVIRTIÓ débito/crédito en balance borrador", entity: id, detail: `${cod} (${aInvertir.length} fila/s)` });
    revalidatePath(`/balance/borradores/${id}`);
    return { ok: true, message: `Débito/crédito corregidos en ${cod} (${aInvertir.length} fila${aInvertir.length === 1 ? "" : "s"}).` };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("invertirLadosFilaBorrador", e) };
  }
}
