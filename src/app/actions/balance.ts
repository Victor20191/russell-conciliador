"use server";

import { revalidatePath } from "next/cache";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/dal";
import { logAudit } from "@/lib/audit";
import { authorizePermiso } from "@/lib/rbac";
import { clienteDeBalance } from "@/lib/rbac/contexto";
import { parseId } from "@/lib/ids";
import { createProcessNotification } from "@/lib/notifications";
import { mensajeErrorBD } from "@/lib/errores";
import { fmtDate, MESES_LARGOS } from "@/lib/format";
import { CargarBalanceSchema, type ActionState } from "@/lib/definitions";
import { parseBalanceWorkbook, type ImportBalanceState } from "@/lib/import/balance";
import {
  calcularBalance,
  aplanarBreakdown,
  compararBalances,
  type BreakdownGroup,
  type CuentaCruda,
} from "@/lib/balance/calcular";
import { extraerBalance } from "@/lib/balance/extraccion/extraer";
import { iaDisponible } from "@/lib/anthropic";
import type { ParamsExtraccion, ResultadoTransform } from "@/lib/balance/extraccion/transformar";

const MAX_BYTES = 20 * 1024 * 1024; // 20 MB (admite PDF)

/** Período (mes/año) → rango ISO yyyy-mm-dd (primer y último día del mes). */
function periodoISO(mes: string, anio: number): { inicial: string; final: string } {
  const idx = MESES_LARGOS.indexOf(mes as (typeof MESES_LARGOS)[number]);
  if (idx < 0) return { inicial: `${anio}-01-01`, final: `${anio}-12-31` };
  const mm = String(idx + 1).padStart(2, "0");
  const ultimo = new Date(anio, idx + 1, 0).getDate();
  return { inicial: `${anio}-${mm}-01`, final: `${anio}-${mm}-${String(ultimo).padStart(2, "0")}` };
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
    const balance = await prisma.balance.findUnique({ where: { id } });
    if (!balance) return { ok: false, message: "Balance inexistente." };
    if (balance.isFrozen) return { ok: true, message: "El balance ya estaba congelado." };

    // La versión oficial es única por (cliente, período): se desmarca cualquier otra.
    await prisma.balance.updateMany({
      where: { clientName: balance.clientName, period: balance.period, isOfficial: true },
      data: { isOfficial: false },
    });
    await prisma.balance.update({
      where: { id },
      data: { isOfficial: true, isFrozen: true, status: "Congelado" },
    });

    const user = await getCurrentUser();
    await logAudit({
      user: user?.name ?? "Sistema",
      action: "CONGELÓ BALANCE",
      entity: `${balance.clientName} · ${balance.period}`,
      detail: `Versión ${balance.version} marcada como oficial`,
    });
    await createProcessNotification({
      actor: user?.name,
      text: "congeló el balance oficial de",
      target: `${balance.clientName} · ${balance.period} · ${balance.version}`,
    });
    revalidatePath("/", "layout");
    revalidatePath("/balance");
    revalidatePath(`/balance/${id}`);
    return { ok: true, message: "Balance congelado como oficial." };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("freezeBalance", e) };
  }
}

/**
 * Carga un balance de comprobación desde un Excel (.xlsx) para un cliente y
 * período. Crea una NUEVA versión (v1, v2…) por cada cargue, calcula sumas,
 * mapeo al estándar, validaciones, bitácora de versiones y el comparativo
 * contra la versión anterior. No congela: eso lo hace `freezeBalance`.
 */
export async function cargarBalance(
  _prev: ImportBalanceState,
  formData: FormData,
): Promise<ImportBalanceState> {
  // Primer gate: sesión + permiso de rol (Staff es el único operativo).
  const authz = await authorizePermiso("balance:crear");
  if (!authz.ok) return { ok: false, message: authz.message };

  // Validación de los campos del formulario (cliente + período).
  const parsed = CargarBalanceSchema.safeParse({
    clientId: formData.get("clientId"),
    mes: formData.get("mes"),
    anio: formData.get("anio"),
  });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }
  const { clientId, mes, anio, estandar: estandarContable } = parsed.data;

  // Segundo gate: ALCANCE de escritura sobre el cliente seleccionado (cartera).
  const scope = await authorizePermiso("balance:crear", { clientId });
  if (!scope.ok) return { ok: false, message: scope.message };

  const archivo = formData.get("archivo");
  if (!(archivo instanceof File) || archivo.size === 0) {
    return { ok: false, message: "Adjunta el archivo del balance (Excel, CSV, JSON o PDF)." };
  }
  if (archivo.size > MAX_BYTES) return { ok: false, message: "El archivo supera 20 MB." };

  try {
    const cliente = await prisma.client.findUnique({
      where: { id: clientId },
      select: { name: true, nit: true, erpId: true },
    });
    if (!cliente) return { ok: false, message: "El cliente seleccionado ya no existe." };
    // GATE de operación: cargar el balance exige que el cliente tenga un ERP
    // asignado. Sin ERP se BLOQUEA con alerta.
    if (cliente.erpId == null) {
      return {
        ok: false,
        message:
          "El cliente no tiene un ERP asignado. Asígnalo en Configuración › Clientes antes de cargar el balance.",
      };
    }
    const period = `${mes} ${anio}`;
    const periodos = periodoISO(mes, anio);
    const params: ParamsExtraccion = {
      nit: cliente.nit,
      periodoInicial: periodos.inicial,
      periodoFinal: periodos.final,
      centro: null,
      estandar: estandarContable,
    };

    // Extracción: con IA (multi-formato) o, sin API key, con el parser de
    // plantilla limpia (solo .xlsx) como respaldo.
    const datosArchivo = await archivo.arrayBuffer();
    let extr: ResultadoTransform;
    if (iaDisponible()) {
      extr = await extraerBalance(datosArchivo, archivo.name, params);
    } else {
      const { filas, errores } = await parseBalanceWorkbook(datosArchivo);
      if (errores.length > 0) {
        return { ok: false, message: `${errores.length} problema(s) en el archivo. Nada se cargó.`, errores };
      }
      const importReady: CuentaCruda[] = filas.map((f) => ({ code: f.code, name: f.name, prevBalance: f.prevBalance, balance: f.balance }));
      const cab = {
        nit: { valor: cliente.nit, fuente: "PARAMETRO" as const },
        periodoInicial: { valor: periodos.inicial, fuente: "PARAMETRO" as const },
        periodoFinal: { valor: periodos.final, fuente: "PARAMETRO" as const },
        centro: { valor: null, fuente: "NINGUNO" as const },
        estandar: estandarContable,
      };
      extr = {
        importReady,
        excepciones: [],
        cabecera: cab,
        resumen: {
          filasLeidas: importReady.length, filasExcluidas: 0, filasImportables: importReady.length, filasDescuadre: 0,
          nit: cab.nit, periodoInicial: cab.periodoInicial, periodoFinal: cab.periodoFinal, centro: cab.centro,
          estandar: estandarContable, convencionCredito: "firmado",
        },
      };
    }

    if (extr.importReady.length === 0) {
      return {
        ok: false,
        message: "No se importó ninguna cuenta del archivo. Revisa las excepciones.",
        excepciones: extr.excepciones,
      };
    }

    // Cálculo de agregados contra el plan de cuentas estándar.
    const cuentasEstandar = await prisma.standardAccount.findMany({
      select: { code: true, nature: true, critical: true },
    });
    const calc = calcularBalance(extr.importReady, cuentasEstandar);

    // Versionado: una fila nueva por cargue. La versión es correlativa por
    // (cliente, período); @@unique([clientName, period, version]) lo respalda.
    const previas = await prisma.balance.findMany({
      where: { clientName: cliente.name, period },
      orderBy: { createdAt: "asc" },
    });
    const version = `v${previas.length + 1}`;
    const alertas = calc.validations.filter((v) => v.status === "warn").length;
    const status = alertas > 0 ? "Con alertas" : previas.length > 0 ? "Última" : "Única";
    const complete = calc.totalRows > 0 ? Math.round((calc.mapped / calc.totalRows) * 100) : 100;

    const user = await getCurrentUser();
    const uploadedBy = user?.name ?? "—";
    const rolLabel = etiquetaRol(authz.role);
    const ahora = sello();
    const nota = alertas > 0 ? `${alertas} validación(es) con alerta` : "Sin alertas";

    // Comparativo contra la versión previa más reciente (si existe).
    const previa = previas[previas.length - 1];
    const diff = previa?.breakdown
      ? compararBalances(
          aplanarBreakdown(previa.breakdown as unknown as BreakdownGroup[]),
          aplanarBreakdown(calc.breakdown),
        )
      : null;
    const cambios = diff ? diff.summary.added + diff.summary.changed + diff.summary.removed : calc.totalRows;

    // Bitácora de versiones (más reciente primero), reconstruyendo las previas.
    const nuevaEntrada = {
      v: version, date: ahora, uploadedBy, role: rolLabel, file: archivo.name,
      size: tamArchivo(archivo.size), rows: calc.totalRows, sumA: calc.sums.activo,
      balanced: calc.balanced, note: nota, changes: cambios,
    };
    const historialPrevio = [...previas].reverse().map((p) => {
      const m = (p.meta ?? {}) as Record<string, unknown>;
      const s = (p.sums ?? {}) as Record<string, unknown>;
      return {
        v: p.version, date: p.lastUpload ?? "—",
        uploadedBy: (m.uploadedBy as string) ?? "—", role: (m.uploadedRole as string) ?? "—",
        file: (m.file as string) ?? "—", size: (m.fileSize as string) ?? "—",
        rows: (m.rows as number) ?? 0, sumA: (s.activo as number) ?? 0,
        balanced: (m.balanced as boolean) ?? true, note: (m.note as string) ?? "", changes: 0,
      };
    });
    const versionHistory = [nuevaEntrada, ...historialPrevio];

    const meta = {
      rows: calc.totalRows, mapped: calc.mapped, unmapped: calc.unmapped, critical: calc.critical,
      file: archivo.name, fileSize: tamArchivo(archivo.size),
      frozenBy: "", frozenAt: "", uploadedBy, uploadedRole: rolLabel, uploadedAt: ahora,
      balanced: calc.balanced, note: nota,
      // Metadatos del ETL (cabecera + auditoría del cargue).
      nit: extr.cabecera.nit.valor, nitFuente: extr.cabecera.nit.fuente,
      periodoInicial: extr.cabecera.periodoInicial.valor, periodoFinal: extr.cabecera.periodoFinal.valor,
      centro: extr.cabecera.centro.valor, estandar: extr.cabecera.estandar,
      convencionCredito: extr.resumen.convencionCredito,
      filasLeidas: extr.resumen.filasLeidas, filasExcluidas: extr.resumen.filasExcluidas, filasDescuadre: extr.resumen.filasDescuadre,
    };

    const creado = await prisma.balance.create({
      data: {
        clientName: cliente.name, clientNit: cliente.nit, period, version,
        isOfficial: false, isFrozen: false, status, complete, lastUpload: ahora,
        sums: calc.sums, validations: calc.validations, breakdown: calc.breakdown,
        meta, versionHistory, ...(diff ? { diff } : {}),
      },
    });

    await logAudit({
      user: uploadedBy,
      action: "CARGÓ BALANCE",
      entity: `${cliente.name} · ${period}`,
      detail: `${version} · ${calc.totalRows} cuentas · ${calc.mapped} mapeadas · ${calc.balanced ? "cuadrado" : "descuadra"} · ${extr.excepciones.length} excepción(es)`,
    });
    await createProcessNotification({
      actor: uploadedBy,
      text: "cargó el balance de",
      target: `${cliente.name} · ${period} · ${version}`,
    });
    revalidatePath("/", "layout");
    revalidatePath("/balance");

    return {
      ok: true,
      excepciones: extr.excepciones,
      resumen: {
        id: creado.id, cliente: cliente.name, period, version,
        cuentas: calc.totalRows, mapped: calc.mapped, unmapped: calc.unmapped, balanced: calc.balanced,
        auditoria: extr.resumen,
      },
    };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("cargarBalance", e) };
  }
}
