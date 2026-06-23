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
import { CargarBalanceSchema, ConfirmarBalanceSchema, type ActionState } from "@/lib/definitions";
import { parseBalanceWorkbook, type ImportBalanceState } from "@/lib/import/balance";
import {
  calcularBalance,
  reconstruirBalance,
  aFilasDetalle,
  aplanarBreakdown,
  compararBalances,
  type CuentaCruda,
  type CuentaEstandar,
  type ResultadoBalance,
} from "@/lib/balance/calcular";
import { extraerBalance } from "@/lib/balance/extraccion/extraer";
import { mapearPorIA } from "@/lib/balance/mapeo-ia";
import { iaDisponible } from "@/lib/anthropic";
import type { ParamsExtraccion, ResultadoTransform } from "@/lib/balance/extraccion/transformar";
import type { Excepcion, ResumenAuditoria } from "@/lib/balance/extraccion/esquema";

const MAX_BYTES = 20 * 1024 * 1024; // 20 MB (admite PDF)

// Sugerencia que devuelve la LECTURA del archivo (paso 1): cabecera detectada +
// las cuentas leídas. NO se persiste nada; la persona la revisa, completa los
// campos faltantes (cliente, período) y recién entonces confirma la carga.
export type SugerenciaBalance = {
  archivoNombre: string;
  archivoTam: string;
  nitDetectado: string | null;
  nitFuente: ResumenAuditoria["nit"]["fuente"];
  periodoInicial: string | null;
  periodoFinal: string | null;
  centro: string | null;
  estandar: string;
  convencionCredito: string;
  filasLeidas: number;
  filasExcluidas: number;
  filasDescuadre: number;
  cuentas: number;
  importReady: CuentaCruda[];
};

export type LeerBalanceState = {
  ok?: boolean;
  message?: string;
  errores?: NonNullable<ImportBalanceState["errores"]>;
  excepciones?: Excepcion[];
  sugerencia?: SugerenciaBalance;
};

type MetaEtl = {
  centro: string | null;
  estandar: string;
  convencionCredito: string;
  filasLeidas: number;
  filasExcluidas: number;
  filasDescuadre: number;
};

/** Período (mes/año) → rango ISO yyyy-mm-dd (primer y último día del mes). */
function periodoISO(mes: string, anio: number): { inicial: string; final: string } {
  const idx = MESES_LARGOS.indexOf(mes as (typeof MESES_LARGOS)[number]);
  if (idx < 0) return { inicial: `${anio}-01-01`, final: `${anio}-12-31` };
  const mm = String(idx + 1).padStart(2, "0");
  const ultimo = new Date(anio, idx + 1, 0).getDate();
  return { inicial: `${anio}-${mm}-01`, final: `${anio}-${mm}-${String(ultimo).padStart(2, "0")}` };
}

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
    const balance = await prisma.balancePruebaEncabezado.findUnique({ where: { id } });
    if (!balance) return { ok: false, message: "Balance inexistente." };
    if (balance.estaCongelado) return { ok: true, message: "El balance ya estaba congelado." };

    const user = await getCurrentUser();
    // La versión oficial es única por (cliente, período): se desmarca cualquier otra.
    await prisma.balancePruebaEncabezado.updateMany({
      where: { clienteId: balance.clienteId, periodo: balance.periodo, esOficial: true },
      data: { esOficial: false },
    });
    await prisma.balancePruebaEncabezado.update({
      where: { id },
      data: {
        esOficial: true,
        estaCongelado: true,
        estado: "Congelado",
        congeladoPor: user?.name ?? "Sistema",
        congeladoEn: new Date(),
      },
    });

    await logAudit({
      user: user?.name ?? "Sistema",
      action: "CONGELÓ BALANCE",
      entity: `${balance.nombreCliente} · ${balance.periodo}`,
      detail: `Versión ${balance.version} marcada como oficial`,
    });
    await createProcessNotification({
      actor: user?.name,
      text: "congeló el balance oficial de",
      target: `${balance.nombreCliente} · ${balance.periodo} · ${balance.version}`,
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
      select: { cuenta6: true, encabezado: { select: { id: true, clienteId: true } } },
    });
    if (!fila) return { ok: false, message: "La cuenta del balance ya no existe." };

    // Alcance de escritura sobre el cliente del balance (cartera).
    const alcance = await authorizePermiso("balance:crear", { clientId: fila.encabezado.clienteId });
    if (!alcance.ok) return { ok: false, message: alcance.message };

    // La cuenta estándar debe existir (es de 6 dígitos = nivel 6 del plan).
    const std = await prisma.standardAccount.findUnique({ where: { code: codigo }, select: { code: true } });
    if (!std) return { ok: false, message: "La cuenta estándar seleccionada no existe." };

    const encId = fila.encabezado.id;
    // El mapeo es a nivel de cuenta de 6 dígitos: se aplica a TODAS las cuentas
    // del cliente con el mismo prefijo (cuenta_6) en este balance.
    const afectadas = await prisma.balancePruebaDetalle.updateMany({
      where: { encabezadoId: encId, cuenta6: fila.cuenta6 },
      data: { cuenta6Russell: std.code, coincidencia: 100 },
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

    const user = await getCurrentUser();
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
 * de agregados, comparativo de cambios y bitácora. Fuente ÚNICA de la escritura:
 * la comparten `cargarBalance` (flujo directo) y `confirmarCargaBalance` (flujo
 * leer→confirmar). No congela: eso lo hace `freezeBalance`.
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
  rolLabel: string;
  meta: MetaEtl;
}): Promise<{ id: number; version: string; calc: ResultadoBalance }> {
  // Barrido 1 (exacto) + 2 (descripción), deterministas.
  let calc = calcularBalance(p.importReady, p.cuentasEstandar);

  // Barrido 3 (IA): las cuentas que quedaron sin mapeo se homologan con Claude.
  // Best-effort: si la IA falla o no está configurada, se queda con lo determinista.
  if (iaDisponible()) {
    const pendientes = calc.breakdown.flatMap((g) => g.items).filter((it) => !it.mapped).map((it) => ({ code: it.code, name: it.name }));
    if (pendientes.length > 0) {
      try {
        const plan = p.cuentasEstandar.map((s) => ({ code: s.code, name: s.name ?? "", russell: s.russellAccount ?? "", posibles: s.possibleAccounts ?? "" }));
        const override = await mapearPorIA(pendientes, plan);
        if (override.size > 0) calc = calcularBalance(p.importReady, p.cuentasEstandar, override);
      } catch {
        /* la IA es opcional: si falla, no rompe el cargue */
      }
    }
  }

  // Versionado: un ENCABEZADO nuevo por cargue, correlativo por (cliente,
  // período); @@unique([clienteId, periodo, version]) lo respalda.
  const previas = await prisma.balancePruebaEncabezado.findMany({
    where: { clienteId: p.clientId, periodo: p.period },
    orderBy: { creadoEn: "asc" },
    select: { id: true },
  });
  const version = `v${previas.length + 1}`;
  const alertas = calc.validations.filter((v) => v.status === "warn").length;
  const status = alertas > 0 ? "Con alertas" : previas.length > 0 ? "Última" : "Única";
  const complete = calc.totalRows > 0 ? Math.round((calc.mapped / calc.totalRows) * 100) : 100;
  const ahora = sello();
  const nota = alertas > 0 ? `${alertas} validación(es) con alerta` : "Sin alertas";

  // Comparativo contra la versión previa (solo el conteo de cambios; el diff
  // completo se recalcula al abrir la pantalla de diff).
  let cambios = calc.totalRows;
  const previaId = previas[previas.length - 1]?.id;
  if (previaId) {
    const filasPrev = await prisma.balancePruebaDetalle.findMany({
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

  const creado = await prisma.balancePruebaEncabezado.create({
    data: {
      clienteId: p.clientId, nombreCliente: p.clienteName, nit: p.clienteNit,
      periodo: p.period, periodoInicio: new Date(p.periodos.inicial), periodoFin: new Date(p.periodos.final),
      centroOperativo: p.meta.centro,
      version, esOficial: false, estaCongelado: false, estado: status, completitud: complete,
      archivo: p.archivoNombre, tamanoArchivo: p.archivoTam,
      cargadoPor: p.uploadedBy, rolCarga: p.rolLabel, cuadrado: calc.balanced, nota,
      sumaActivo: calc.sums.activo, filasTotales: calc.totalRows,
      mapeadas: calc.mapped, sinMapear: calc.unmapped, criticas: calc.critical, cambios,
      estandar: p.meta.estandar, convencionCredito: p.meta.convencionCredito,
      filasLeidas: p.meta.filasLeidas, filasExcluidas: p.meta.filasExcluidas, filasDescuadre: p.meta.filasDescuadre,
      ultimaCarga: ahora,
      detalles: {
        create: aFilasDetalle(calc.breakdown).map((f) => ({
          cuenta2: f.cuenta2, cuenta4: f.cuenta4, cuenta6: f.cuenta6, cuenta8: f.cuenta8,
          nombreCuenta: f.nombreCuenta, cuenta6Russell: f.cuenta6Russell, coincidencia: f.coincidencia,
          saldoInicial: f.saldoInicial, debitos: f.debitos, creditos: f.creditos, saldoFinal: f.saldoFinal,
        })),
      },
    },
    select: { id: true },
  });

  await logAudit({
    user: p.uploadedBy,
    action: "CARGÓ BALANCE",
    entity: `${p.clienteName} · ${p.period}`,
    detail: `${version} · ${calc.totalRows} cuentas · ${calc.mapped} mapeadas · ${calc.balanced ? "cuadrado" : "descuadra"}`,
  });
  await createProcessNotification({
    actor: p.uploadedBy,
    text: "cargó el balance de",
    target: `${p.clienteName} · ${p.period} · ${version}`,
  });
  revalidatePath("/", "layout");
  revalidatePath("/balance");

  return { id: creado.id, version, calc };
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

  const estandarRaw = String(formData.get("estandar") ?? "AUTO");
  const estandarContable = (["NIIF", "PCGA", "AUTO"].includes(estandarRaw) ? estandarRaw : "AUTO") as ParamsExtraccion["estandar"];

  const archivo = formData.get("archivo");
  if (!(archivo instanceof File) || archivo.size === 0) {
    return { ok: false, message: "Adjunta el archivo del balance (Excel, CSV, JSON o PDF)." };
  }
  if (archivo.size > MAX_BYTES) return { ok: false, message: "El archivo supera 20 MB." };

  try {
    // Lectura sin parámetros de cliente/período: la IA detecta todo del archivo
    // como sugerencia. Si no hay API key, cae al parser de plantilla limpia.
    const params: ParamsExtraccion = { nit: null, periodoInicial: null, periodoFinal: null, centro: null, estandar: estandarContable };
    const datosArchivo = await archivo.arrayBuffer();
    let extr: ResultadoTransform;
    if (iaDisponible()) {
      extr = await extraerBalance(datosArchivo, archivo.name, params);
    } else {
      const { filas, errores } = await parseBalanceWorkbook(datosArchivo);
      if (errores.length > 0) {
        return { ok: false, message: `${errores.length} problema(s) en el archivo. Nada se leyó.`, errores };
      }
      const importReady: CuentaCruda[] = filas.map((f) => ({ code: f.code, name: f.name, prevBalance: f.prevBalance, balance: f.balance }));
      extr = {
        importReady,
        excepciones: [],
        cabecera: {
          nit: { valor: null, fuente: "NINGUNO" }, periodoInicial: { valor: null, fuente: "NINGUNO" },
          periodoFinal: { valor: null, fuente: "NINGUNO" }, centro: { valor: null, fuente: "NINGUNO" }, estandar: estandarContable,
        },
        resumen: {
          filasLeidas: importReady.length, filasExcluidas: 0, filasImportables: importReady.length, filasDescuadre: 0,
          nit: { valor: null, fuente: "NINGUNO" }, periodoInicial: { valor: null, fuente: "NINGUNO" },
          periodoFinal: { valor: null, fuente: "NINGUNO" }, centro: { valor: null, fuente: "NINGUNO" },
          estandar: estandarContable, convencionCredito: "firmado",
        },
      };
    }

    if (extr.importReady.length === 0) {
      return { ok: false, message: "No se leyó ninguna cuenta del archivo. Revisa las excepciones.", excepciones: extr.excepciones };
    }

    return {
      ok: true,
      excepciones: extr.excepciones,
      sugerencia: {
        archivoNombre: archivo.name,
        archivoTam: tamArchivo(archivo.size),
        nitDetectado: extr.cabecera.nit.valor,
        nitFuente: extr.cabecera.nit.fuente,
        periodoInicial: extr.cabecera.periodoInicial.valor,
        periodoFinal: extr.cabecera.periodoFinal.valor,
        centro: extr.cabecera.centro.valor,
        estandar: extr.cabecera.estandar,
        convencionCredito: extr.resumen.convencionCredito,
        filasLeidas: extr.resumen.filasLeidas,
        filasExcluidas: extr.resumen.filasExcluidas,
        filasDescuadre: extr.resumen.filasDescuadre,
        cuentas: extr.importReady.length,
        importReady: extr.importReady,
      },
    };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("leerBalance", e) };
  }
}

/**
 * CONFIRMACIÓN (paso final). Recibe el cliente/período confirmados por la persona
 * + las cuentas ya leídas (sugerencia serializada en `payload`) y escribe el
 * cargue. Recalcula los agregados en el servidor desde las cuentas (no confía en
 * números del cliente para las sumas).
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
    centroOperativo: formData.get("centroOperativo"),
    estandar: formData.get("estandar"),
  });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }
  const { clientId, periodoInicio, periodoFin, centroOperativo, estandar } = parsed.data;

  const scope = await authorizePermiso("balance:crear", { clientId });
  if (!scope.ok) return { ok: false, message: scope.message };

  let sug: SugerenciaBalance;
  try {
    sug = JSON.parse(String(formData.get("payload") ?? "")) as SugerenciaBalance;
  } catch {
    return { ok: false, message: "La lectura del archivo no es válida. Vuelve a leer el archivo." };
  }
  if (!Array.isArray(sug?.importReady) || sug.importReady.length === 0) {
    return { ok: false, message: "No hay cuentas leídas para cargar. Vuelve a leer el archivo." };
  }

  try {
    const cliente = await prisma.client.findUnique({
      where: { id: clientId },
      select: { name: true, nit: true, erpId: true },
    });
    if (!cliente) return { ok: false, message: "El cliente seleccionado ya no existe." };
    if (cliente.erpId == null) {
      return { ok: false, message: "El cliente no tiene un ERP asignado. Asígnalo en Configuración › Clientes antes de cargar el balance." };
    }

    const period = etiquetaPeriodo(periodoInicio, periodoFin);
    const periodos = { inicial: periodoInicio, final: periodoFin };
    const centro = centroOperativo.trim() || null; // opcional: vacío → sin centro
    const cuentasEstandar = await prisma.standardAccount.findMany({ select: { code: true, nature: true, critical: true, name: true, russellAccount: true, possibleAccounts: true } });
    const user = await getCurrentUser();

    const { id, version, calc } = await persistirCargue({
      clientId, clienteName: cliente.name, clienteNit: cliente.nit,
      period, periodos, importReady: sug.importReady, cuentasEstandar,
      archivoNombre: sug.archivoNombre ?? "—",
      archivoTam: sug.archivoTam ?? "—",
      uploadedBy: user?.name ?? "—", rolLabel: etiquetaRol(authz.role),
      meta: {
        centro, estandar, convencionCredito: sug.convencionCredito,
        filasLeidas: sug.filasLeidas, filasExcluidas: sug.filasExcluidas, filasDescuadre: sug.filasDescuadre,
      },
    });

    const auditoria: ResumenAuditoria = {
      filasLeidas: sug.filasLeidas, filasExcluidas: sug.filasExcluidas, filasImportables: sug.cuentas, filasDescuadre: sug.filasDescuadre,
      nit: { valor: sug.nitDetectado, fuente: sug.nitFuente },
      periodoInicial: { valor: periodoInicio, fuente: "FUENTE" },
      periodoFinal: { valor: periodoFin, fuente: "FUENTE" },
      centro: { valor: centro, fuente: centro ? "FUENTE" : "NINGUNO" },
      estandar: (["NIIF", "PCGA", "AUTO", "DESCONOCIDO"].includes(estandar) ? estandar : "DESCONOCIDO") as ResumenAuditoria["estandar"],
      convencionCredito: (sug.convencionCredito === "magnitud" ? "magnitud" : "firmado"),
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
    return { ok: false, message: mensajeErrorBD("confirmarCargaBalance", e) };
  }
}

/**
 * Carga directa (flujo legado, en un solo paso). Se conserva como respaldo; la
 * UI usa `leerBalance` + `confirmarCargaBalance`. No congela: eso lo hace
 * `freezeBalance`.
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

    // Cálculo y escritura (helper compartido).
    const cuentasEstandar = await prisma.standardAccount.findMany({ select: { code: true, nature: true, critical: true, name: true, russellAccount: true, possibleAccounts: true } });
    const user = await getCurrentUser();
    const { id, version, calc } = await persistirCargue({
      clientId, clienteName: cliente.name, clienteNit: cliente.nit,
      period, periodos, importReady: extr.importReady, cuentasEstandar,
      archivoNombre: archivo.name, archivoTam: tamArchivo(archivo.size),
      uploadedBy: user?.name ?? "—", rolLabel: etiquetaRol(authz.role),
      meta: {
        centro: extr.cabecera.centro.valor, estandar: extr.cabecera.estandar, convencionCredito: extr.resumen.convencionCredito,
        filasLeidas: extr.resumen.filasLeidas, filasExcluidas: extr.resumen.filasExcluidas, filasDescuadre: extr.resumen.filasDescuadre,
      },
    });

    return {
      ok: true,
      excepciones: extr.excepciones,
      resumen: {
        id, cliente: cliente.name, period, version,
        cuentas: calc.totalRows, mapped: calc.mapped, unmapped: calc.unmapped, balanced: calc.balanced,
        auditoria: extr.resumen,
      },
    };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("cargarBalance", e) };
  }
}
