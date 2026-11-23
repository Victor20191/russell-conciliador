"use server";

// Movimientos por tercero del ERP adjuntos a un balance de un cliente SIN balance por terceros
// (excepción del cliente, `clientes.balance_por_terceros = false`). Con ellos los impuestos
// (Retención, IVA y RST) pueden cruzar por tercero y restar a la DIAN. Lógica en
// `src/lib/balance/movimientos-tercero.ts`.
import { revalidatePath } from "next/cache";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { getCurrentUser } from "@/lib/dal";
import { logAudit } from "@/lib/audit";
import { authorizePermiso } from "@/lib/rbac";
import { mensajeErrorBD } from "@/lib/errores";
import { fmtDateTime, fmtNum } from "@/lib/format";
import { crearExcelDescuadreMovimientos } from "@/lib/export/movimientos-tercero-descuadre";
import { getUmbralesAlertas } from "@/lib/parametros/umbrales";
import { tomarCandadoTransaccion } from "@/lib/candados";
import { siguienteVersionCargue } from "@/lib/balance/version-cargue";
import { claveTerceroDeCaptura } from "@/lib/balance/staging-tercero";
import { cierresFirmesDeBalance } from "@/lib/conciliacion/verificar-bloqueo";
import { periodoDelArchivo, resolverBaseAmarre } from "@/lib/balance/movimientos-tercero-base-servidor";
import { descartarArchivoBalanceTemporal, leerArchivoBalanceTemporal } from "@/lib/balance/archivo-temporal-servidor";
import { agregarArchivoMovimientos, esArchivoXlsx, vistaPreviaMovimientos, type VistaPreviaMovimientos } from "@/lib/balance/movimientos-tercero-servidor";
import {
  amarrarConBalance,
  cuentasConBaseDiciembre,
  type BaseAmarre,
  type SaldoCierreDiciembre,
  esCapturaDeMovimientos,
  MapeoMovimientosSchema,
  ORIGEN_MOVIMIENTOS_ERP,
  type DescuadreMovimientos,
} from "@/lib/balance/movimientos-tercero";

const LOTE_INSERCION = 20_000;

const BaseSchema = z.object({
  balanceId: z.number().int().positive(),
  archivoLoteId: z.string().uuid(),
});

type Contexto = {
  balance: { id: number; clienteId: number; nombreCliente: string; nit: string | null; periodo: string; periodoInicio: Date; periodoFin: Date; loteId: string };
  capturaExistente: { id: number; origenExtraccion: string | null } | null;
  /** Contra qué se amarra: el saldo inicial del balance (empieza en enero) o el cierre de diciembre. */
  base: BaseAmarre;
  cierreDiciembre: SaldoCierreDiciembre[] | null;
};

/** Verifica el cliente y el balance; devuelve el motivo si no se puede adjuntar. */
async function contextoBalance(balanceId: number): Promise<{ ok: true; contexto: Contexto } | { ok: false; message: string }> {
  const balance = await prisma.balancePruebaEncabezado.findUnique({
    where: { id: balanceId },
    select: { id: true, clienteId: true, nombreCliente: true, nit: true, periodo: true, periodoInicio: true, periodoFin: true, loteId: true },
  });
  if (!balance) return { ok: false, message: "No se encontró el balance." };
  const cliente = await prisma.client.findUnique({ where: { id: balance.clienteId }, select: { balancePorTerceros: true } });
  if (!cliente || cliente.balancePorTerceros) {
    return { ok: false, message: "Solo los clientes con la excepción «sin balance por terceros» adjuntan movimientos por tercero del ERP." };
  }
  if (!balance.loteId) return { ok: false, message: "Este balance es un cargue antiguo sin vínculo para el detalle por tercero. Vuelve a cargarlo." };
  const capturaExistente = await prisma.balanceTerceroEncabezado.findUnique({
    where: { loteId: balance.loteId },
    select: { id: true, origenExtraccion: true },
  });
  if (capturaExistente && !esCapturaDeMovimientos(capturaExistente.origenExtraccion)) {
    return { ok: false, message: "Este balance ya conserva su detalle por tercero; no necesita el archivo de movimientos." };
  }
  // Regla 1: el balance empieza el 1 de enero. Regla 2: si no, el balance cerrado al 31/12 del año anterior.
  const base = await resolverBaseAmarre(balance);
  if (!base.ok) return base;
  return { ok: true, contexto: { balance: { ...balance, loteId: balance.loteId }, capturaExistente, base: base.base, cierreDiciembre: base.cierreDiciembre } };
}

async function autorizar(balanceId: number) {
  const general = await authorizePermiso("balance:crear");
  if (!general.ok) return general;
  const referencia = await prisma.balancePruebaEncabezado.findUnique({ where: { id: balanceId }, select: { clienteId: true } });
  if (!referencia) return { ok: false as const, message: "No se encontró el balance." };
  return authorizePermiso("balance:crear", { clientId: referencia.clienteId });
}

async function bloqueoPorCierres(balanceId: number): Promise<string | null> {
  const cierres = await cierresFirmesDeBalance([balanceId]);
  if (cierres.length === 0) return null;
  const modulos = [...new Set(cierres.map((c) => c.moduloCodigo))].join(", ");
  return `Hay conciliaciones en firme contra este balance (${modulos}). Abre esos cierres antes de cambiar los terceros agregados.`;
}

export type VistaPreviaMovimientosState = ActionStateMovimientos & { vista?: VistaPreviaMovimientos };

type ActionStateMovimientos = { ok?: boolean; message?: string };

/** Paso 1: encabezados, muestra y mapeo sugerido del archivo ya subido por partes. */
export async function previsualizarMovimientosTercero(input: { balanceId: number; archivoLoteId: string }): Promise<VistaPreviaMovimientosState> {
  const parsed = BaseSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "La solicitud no es válida." };
  const authz = await autorizar(parsed.data.balanceId);
  if (!authz.ok) return { ok: false, message: authz.message };
  try {
    const ctx = await contextoBalance(parsed.data.balanceId);
    if (!ctx.ok) return ctx;
    const usuario = await getCurrentUser();
    if (!usuario) return { ok: false, message: "Sesión no válida." };
    const archivo = await leerArchivoBalanceTemporal({ loteId: parsed.data.archivoLoteId, usuarioId: usuario.id });
    if (!archivo.ok) return archivo;
    if (!esArchivoXlsx(archivo.archivo.nombre)) {
      return { ok: false, message: "El archivo de movimientos debe ser un Excel .xlsx (expórtalo así desde el ERP)." };
    }
    const vista = await vistaPreviaMovimientos(archivo.archivo.contenido);
    if (!vista || vista.encabezados.length === 0) return { ok: false, message: "No se encontraron encabezados en la primera hoja del archivo." };
    return { ok: true, vista };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("previsualizarMovimientosTercero", e) };
  }
}

export type AdjuntarMovimientosState = ActionStateMovimientos & {
  descuadres?: DescuadreMovimientos[];
  sinCuentaEnBalance?: { cuenta: string; movimiento: number }[];
  montosIlegibles?: number[];
  /** Contra qué se amarró (para el rechazo y el Excel). */
  base?: BaseAmarre;
  resumen?: { cuentas: number; terceros: number; filasUsadas: number; filasSinTercero: number };
};

/** Paso 2: lee el archivo entero, comprueba el amarre con el balance y guarda la captura. */
export async function adjuntarMovimientosTercero(input: { balanceId: number; archivoLoteId: string; mapeo: unknown; confirmaPeriodo: boolean }): Promise<AdjuntarMovimientosState> {
  // El usuario confirma que el archivo es del mismo período del balance (queda en la auditoría).
  if (input.confirmaPeriodo !== true) {
    return { ok: false, message: "Confirma que el archivo es del mismo período del balance antes de agregar los terceros." };
  }
  const parsed = BaseSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "La solicitud no es válida." };
  const mapeo = MapeoMovimientosSchema.safeParse(input.mapeo);
  if (!mapeo.success) return { ok: false, message: mapeo.error.issues[0]?.message ?? "El mapeo de columnas no es válido." };
  const authz = await autorizar(parsed.data.balanceId);
  if (!authz.ok) return { ok: false, message: authz.message };
  try {
    const ctx = await contextoBalance(parsed.data.balanceId);
    if (!ctx.ok) return ctx;
    const { balance, capturaExistente, base, cierreDiciembre } = ctx.contexto;
    if (capturaExistente) {
      const bloqueo = await bloqueoPorCierres(balance.id);
      if (bloqueo) return { ok: false, message: bloqueo };
    }
    const usuario = await getCurrentUser();
    if (!usuario) return { ok: false, message: "Sesión no válida." };
    const archivo = await leerArchivoBalanceTemporal({ loteId: parsed.data.archivoLoteId, usuarioId: usuario.id });
    if (!archivo.ok) return archivo;
    if (!esArchivoXlsx(archivo.archivo.nombre)) return { ok: false, message: "El archivo de movimientos debe ser un Excel .xlsx." };

    const agregado = await agregarArchivoMovimientos(archivo.archivo.contenido, mapeo.data);
    if (agregado.montosIlegibles.length > 0) {
      return {
        ok: false,
        message: "Hay filas con importes que no se pudieron leer. Revisa las columnas de valores del mapeo.",
        montosIlegibles: agregado.montosIlegibles,
      };
    }
    if (agregado.cuentas.size === 0) {
      return { ok: false, message: "El archivo no trae movimientos de las cuentas que se guardan por tercero (grupos 13, 21, 22, 23, 24 y 28). Revisa la columna de la cuenta." };
    }

    const [detalle, umbrales] = await Promise.all([
      prisma.balancePruebaDetalle.findMany({
        where: { encabezadoId: balance.id },
        select: { cuenta8: true, nombreCuenta: true, cuenta6Russell: true, coincidencia: true, saldoInicial: true, debitos: true, creditos: true, saldoFinal: true },
      }),
      getUmbralesAlertas(),
    ]);
    const cuentasBalance = detalle.map((d) => ({
      cuenta8: d.cuenta8, nombreCuenta: d.nombreCuenta, cuenta6Russell: d.cuenta6Russell,
      coincidencia: d.coincidencia == null ? null : Number(d.coincidencia),
      saldoInicial: Number(d.saldoInicial), debitos: Number(d.debitos), creditos: Number(d.creditos), saldoFinal: Number(d.saldoFinal),
    }));
    const amarre = amarrarConBalance(
      agregado,
      base.tipo === "cierre_diciembre" ? cuentasConBaseDiciembre(cuentasBalance, cierreDiciembre ?? []) : cuentasBalance,
      umbrales.descuadre,
    );
    if (amarre.descuadres.length > 0 || amarre.sinCuentaEnBalance.length > 0) {
      return {
        ok: false,
        message: amarre.descuadres.length > 0
          ? `El movimiento del archivo no amarra con el balance en ${amarre.descuadres.length} cuenta(s). No se guardó nada.`
          : "El archivo trae cuentas con movimiento que no están en el balance. No se guardó nada.",
        descuadres: amarre.descuadres,
        sinCuentaEnBalance: amarre.sinCuentaEnBalance,
        base,
      };
    }

    await prisma.$transaction(async (tx) => {
      await tomarCandadoTransaccion(tx, `balance-tercero-cargue:${balance.clienteId}:${balance.periodo}`);
      // Reemplazo: la captura anterior del mismo balance (también de movimientos) se borra con su detalle.
      await tx.balanceTerceroEncabezado.deleteMany({ where: { loteId: balance.loteId, origenExtraccion: ORIGEN_MOVIMIENTOS_ERP } });
      const previas = await tx.balanceTerceroEncabezado.findMany({ where: { clienteId: balance.clienteId, periodo: balance.periodo }, select: { version: true } });
      const encabezado = await tx.balanceTerceroEncabezado.create({
        data: {
          loteId: balance.loteId,
          clienteId: balance.clienteId,
          nombreCliente: balance.nombreCliente,
          nit: balance.nit,
          periodo: balance.periodo,
          periodoInicio: balance.periodoInicio,
          periodoFin: balance.periodoFin,
          version: siguienteVersionCargue(previas.map((v) => v.version)),
          esOficial: false,
          archivo: archivo.archivo.nombre,
          tamanoArchivo: `${(archivo.archivo.tamano / (1024 * 1024)).toFixed(1)} MB`,
          origenExtraccion: ORIGEN_MOVIMIENTOS_ERP,
          cargadoPor: usuario.name,
          filasTotales: amarre.filas.length,
          ultimaCarga: new Date(),
        },
        select: { id: true },
      });
      for (let i = 0; i < amarre.filas.length; i += LOTE_INSERCION) {
        const tanda = JSON.stringify(amarre.filas.slice(i, i + LOTE_INSERCION).map((f) => ({
          cuenta_2: f.cuenta2, cuenta_4: f.cuenta4, cuenta_6: f.cuenta6, cuenta_8: f.cuenta8,
          nombre_cuenta: f.nombreCuenta, cuenta_6_russell: f.cuenta6Russell, porcentaje_coincidencia: f.coincidencia,
          nit_tercero: f.nitTercero, nombre_tercero: f.nombreTercero,
          identidad_tercero: f.identidadTercero ?? null,
          clave_tercero: claveTerceroDeCaptura(f),
          saldo_inicial: f.saldoInicial, debitos: f.debitos, creditos: f.creditos, saldo_final: f.saldoFinal,
        })));
        await tx.$executeRaw(Prisma.sql`
          INSERT INTO "balance_tercero_detalle" (
            "encabezado_id", "cuenta_2", "cuenta_4", "cuenta_6", "cuenta_8", "nombre_cuenta",
            "cuenta_6_russell", "porcentaje_coincidencia", "nit_tercero", "nombre_tercero",
            "identidad_tercero", "clave_tercero", "saldo_inicial", "debitos", "creditos", "saldo_final"
          )
          SELECT
            ${encabezado.id}, d.cuenta_2, d.cuenta_4, d.cuenta_6, d.cuenta_8, d.nombre_cuenta,
            d.cuenta_6_russell, d.porcentaje_coincidencia, d.nit_tercero, d.nombre_tercero,
            d.identidad_tercero, d.clave_tercero, d.saldo_inicial, d.debitos, d.creditos, d.saldo_final
          FROM jsonb_to_recordset(${tanda}::jsonb) AS d(
            cuenta_2 text, cuenta_4 text, cuenta_6 text, cuenta_8 text, nombre_cuenta text,
            cuenta_6_russell text, porcentaje_coincidencia numeric, nit_tercero text, nombre_tercero text,
            identidad_tercero jsonb, clave_tercero text,
            saldo_inicial numeric, debitos numeric, creditos numeric, saldo_final numeric
          )
        `);
      }
    }, { maxWait: 10_000, timeout: 120_000 });

    await descartarArchivoBalanceTemporal({ loteId: parsed.data.archivoLoteId, usuarioId: usuario.id });
    await logAudit({
      user: usuario.name,
      action: capturaExistente ? "REEMPLAZÓ TERCEROS AGREGADOS" : "AGREGÓ TERCEROS AL BALANCE",
      entity: `Balance #${balance.id}`,
      detail: `${balance.nombreCliente} · ${balance.periodo} · ${archivo.archivo.nombre} · período confirmado: ${periodoDelArchivo(balance.periodoFin).desde} al ${periodoDelArchivo(balance.periodoFin).hasta} · amarrado contra ${base.tipo === "cierre_diciembre" ? `el cierre de diciembre (balance #${base.balanceId}, ${base.descripcion})` : "el saldo inicial del balance"} · ${amarre.cuentasAmarradas} cuentas amarradas · ${fmtNum(amarre.terceros)} renglones cuenta–tercero · ${fmtNum(agregado.filasSinTercero)} movimientos sin tercero`,
      clientId: balance.clienteId,
    });
    revalidatePath(`/balance/${balance.id}`);
    revalidatePath(`/balance/${balance.id}/terceros`);
    revalidatePath("/impuestos", "layout");
    return {
      ok: true,
      message: `Terceros agregados al balance para impuestos: ${amarre.cuentasAmarradas} cuentas amarradas.`,
      resumen: { cuentas: amarre.cuentasAmarradas, terceros: amarre.terceros, filasUsadas: agregado.filasUsadas, filasSinTercero: agregado.filasSinTercero },
    };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("adjuntarMovimientosTercero", e) };
  }
}

const DescuadreSchema = z.object({
  cuenta8: z.string().max(40),
  nombreCuenta: z.string().max(300),
  movimientoBalance: z.number().finite(),
  movimientoArchivo: z.number().finite(),
  diferencia: z.number().finite(),
  debitosBalance: z.number().finite(),
  debitosArchivo: z.number().finite(),
  creditosBalance: z.number().finite(),
  creditosArchivo: z.number().finite(),
});
const ExportarDescuadreSchema = z.object({
  balanceId: z.number().int().positive(),
  archivo: z.string().max(260),
  descuadres: z.array(DescuadreSchema).max(20_000),
  sinCuentaEnBalance: z.array(z.object({ cuenta: z.string().max(40), movimiento: z.number().finite() })).max(20_000),
  base: z.object({ tipo: z.enum(["inicio_enero", "cierre_diciembre"]), descripcion: z.string().max(300).optional() }).optional(),
});

/**
 * Excel del descuadre que acaba de salir al leer el archivo (no se guarda en la BD: llega desde la
 * pantalla). Mismo permiso y alcance que agregar los terceros. Devuelve el .xlsx en base64.
 */
export async function exportarDescuadreMovimientos(input: unknown): Promise<ActionStateMovimientos & { nombre?: string; base64?: string }> {
  const parsed = ExportarDescuadreSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "La solicitud no es válida." };
  const authz = await autorizar(parsed.data.balanceId);
  if (!authz.ok) return { ok: false, message: authz.message };
  try {
    const balance = await prisma.balancePruebaEncabezado.findUnique({
      where: { id: parsed.data.balanceId },
      select: { nombreCliente: true, periodo: true, version: true },
    });
    if (!balance) return { ok: false, message: "No se encontró el balance." };
    const buffer = await crearExcelDescuadreMovimientos({
      cliente: balance.nombreCliente,
      periodoBalance: balance.periodo,
      versionBalance: balance.version,
      archivo: parsed.data.archivo,
      generadoEn: fmtDateTime(new Date()),
      base: parsed.data.base?.tipo === "cierre_diciembre"
        ? `saldo final del balance de cierre de diciembre (${parsed.data.base.descripcion ?? "—"})`
        : "saldo inicial del balance",
      conDebitosCreditos: parsed.data.base?.tipo !== "cierre_diciembre",
      descuadres: parsed.data.descuadres,
      sinCuentaEnBalance: parsed.data.sinCuentaEnBalance,
    });
    const nombre = `Descuadre terceros agregados - ${balance.nombreCliente} - ${balance.periodo}.xlsx`.replace(/[\\/:*?"<>|]/g, "-");
    return { ok: true, nombre, base64: buffer.toString("base64") };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("exportarDescuadreMovimientos", e) };
  }
}

/** Quita los movimientos por tercero de un balance (si ningún cierre en firme lo usa). */
export async function quitarMovimientosTercero(input: { balanceId: number }): Promise<ActionStateMovimientos> {
  const parsed = z.object({ balanceId: z.number().int().positive() }).safeParse(input);
  if (!parsed.success) return { ok: false, message: "La solicitud no es válida." };
  const authz = await autorizar(parsed.data.balanceId);
  if (!authz.ok) return { ok: false, message: authz.message };
  try {
    const balance = await prisma.balancePruebaEncabezado.findUnique({
      where: { id: parsed.data.balanceId },
      select: { id: true, clienteId: true, nombreCliente: true, periodo: true, loteId: true },
    });
    if (!balance?.loteId) return { ok: false, message: "Este balance no tiene terceros agregados." };
    const bloqueo = await bloqueoPorCierres(balance.id);
    if (bloqueo) return { ok: false, message: bloqueo };
    const borrados = await prisma.balanceTerceroEncabezado.deleteMany({ where: { loteId: balance.loteId, origenExtraccion: ORIGEN_MOVIMIENTOS_ERP } });
    if (borrados.count === 0) return { ok: false, message: "Este balance no tiene terceros agregados." };
    const usuario = await getCurrentUser();
    await logAudit({
      user: usuario?.name ?? "Sistema",
      action: "QUITÓ TERCEROS AGREGADOS",
      entity: `Balance #${balance.id}`,
      detail: `${balance.nombreCliente} · ${balance.periodo}`,
      clientId: balance.clienteId,
    });
    revalidatePath(`/balance/${balance.id}`);
    revalidatePath(`/balance/${balance.id}/terceros`);
    revalidatePath("/impuestos", "layout");
    return { ok: true, message: "Se quitaron los terceros agregados del balance." };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("quitarMovimientosTercero", e) };
  }
}
