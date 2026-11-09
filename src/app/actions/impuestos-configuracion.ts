"use server";

import { revalidatePath } from "next/cache";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/dal";
import { logAudit } from "@/lib/audit";
import { authorizePermiso } from "@/lib/rbac";
import { mensajeErrorBD, mensajeErrorIA } from "@/lib/errores";
import { CalendarioDianSchema, CuentaMapeoDianSchema, RestaTerceroDianSchema, TerceroDianSchema, type ActionState } from "@/lib/definitions";
import { iaDisponible } from "@/lib/anthropic";
import { registrarConsumoIA } from "@/lib/ia/uso";
import { FORMULARIOS_CALENDARIO, validarCalendario, type PropuestaCalendario, type ResultadoLecturaCalendario } from "@/lib/impuestos/calendario";
import { leerCalendarioCompletoConIA } from "@/lib/impuestos/calendario-lectura-servidor";
import { cuentasDeMapeo } from "@/lib/impuestos/mapeo-dian";
import { fechaCalendarioPrisma } from "@/lib/fecha-hora";

// Impuestos · DIAN, configuración global: Mapeos DIAN (350 y 300) y calendario tributario. Todos consultan con
// `impuestos:ver`; editan Gerente, Socio y administradores con `impuestos:configurar`. No es dato
// de un cliente, así que no lleva alcance por cartera (como el plan Russell).
const PERMISO = "impuestos:configurar";
const RUTA_MAPEOS = "/config/mapeos-dian";
const RUTA_CALENDARIO = "/config/calendario-tributario";
/** El PDF del calendario de la DIAN pesa poco más de 1 MB; se acepta holgura. */
const MAX_BYTES_PDF_CALENDARIO = 15 * 1024 * 1024;

const primerError = (issues: { message: string }[]) => issues[0]?.message ?? "Datos inválidos.";

/** Cambia la cuenta Russell de un concepto del 350 o del 300 (vacía = sin cuenta; varias con «+»). */
export async function guardarCuentaMapeoDian(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const authz = await authorizePermiso(PERMISO);
  if (!authz.ok) return { ok: false, message: authz.message };
  const parsed = CuentaMapeoDianSchema.safeParse({
    formulario: formData.get("formulario") ?? "350",
    concepto: formData.get("concepto"),
    cuenta: formData.get("cuenta") ?? "",
  });
  if (!parsed.success) return { ok: false, message: primerError(parsed.error.issues) };
  const { formulario, concepto } = parsed.data;
  const cuenta = parsed.data.cuenta === "" ? null : parsed.data.cuenta;

  try {
    const fila = await prisma.mapeoRenglonDian.findUnique({ where: { formulario_concepto: { formulario, concepto } } });
    if (!fila) return { ok: false, message: "El concepto no existe en el mapeo." };
    if (!fila.enCruce && cuenta) return { ok: false, message: `«${fila.etiqueta}» no entra al cruce contable: no lleva cuenta.` };
    const cuentas = cuentasDeMapeo({ cuentaRussell: cuenta });
    if (cuentas.length > 0) {
      const existen = await prisma.standardAccount.findMany({ where: { code: { in: cuentas } }, select: { code: true } });
      const faltan = cuentas.filter((c) => !existen.some((e) => e.code === c));
      if (faltan.length > 0) {
        return { ok: false, message: `${faltan.length === 1 ? `La cuenta ${faltan[0]} no existe` : `Las cuentas ${faltan.join(", ")} no existen`} en el plan Russell. Créala${faltan.length === 1 ? "" : "s"} primero en Plan Estándar Russell.` };
      }
    }
    if (fila.cuentaRussell === cuenta) return { ok: true, message: "Sin cambios." };

    const user = await getCurrentUser();
    await prisma.mapeoRenglonDian.update({ where: { id: fila.id }, data: { cuentaRussell: cuenta, actualizadoPor: user?.name ?? null } });
    await logAudit({
      user: user?.name ?? "Sistema",
      action: "EDITÓ MAPEO DIAN",
      entity: `Mapeos DIAN · F${formulario} · ${fila.etiqueta}`,
      detail: `Renglones ${[fila.renglonPj, fila.renglonPn].filter((r) => r != null).join(" + ")}: cuenta Russell ${fila.cuentaRussell ?? "sin cuenta"} → ${cuenta ?? "sin cuenta"}`,
    });
    revalidatePath(RUTA_MAPEOS);
    return { ok: true, message: "Cuenta del concepto actualizada." };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("guardarCuentaMapeoDian", e) };
  }
}

/** Decide si en una cuenta Russell se resta (tacha) el saldo de los terceros DIAN. */
export async function cambiarRestaTerceroDian(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const authz = await authorizePermiso(PERMISO);
  if (!authz.ok) return { ok: false, message: authz.message };
  const parsed = RestaTerceroDianSchema.safeParse({ cuenta: formData.get("cuenta"), restar: formData.get("restar") });
  if (!parsed.success) return { ok: false, message: primerError(parsed.error.issues) };
  const { cuenta } = parsed.data;
  const restar = parsed.data.restar === "1";

  try {
    // Una fila puede llevar varias cuentas («420505+421005»): se busca la cuenta dentro de cada una.
    const filas = await prisma.mapeoRenglonDian.findMany({ where: { cuentaRussell: { contains: cuenta } }, select: { cuentaRussell: true } });
    if (!filas.some((f) => cuentasDeMapeo(f).includes(cuenta))) return { ok: false, message: `La cuenta ${cuenta} no está en Mapeos DIAN.` };
    const user = await getCurrentUser();
    await prisma.cuentaRussellDian.upsert({
      where: { cuentaRussell: cuenta },
      create: { cuentaRussell: cuenta, restarTerceroDian: restar, actualizadoPor: user?.name ?? null },
      update: { restarTerceroDian: restar, actualizadoPor: user?.name ?? null },
    });
    await logAudit({
      user: user?.name ?? "Sistema",
      action: "EDITÓ MAPEO DIAN",
      entity: `Mapeos DIAN · cuenta ${cuenta}`,
      detail: restar ? "Resta el saldo de los terceros DIAN" : "No resta el saldo de los terceros DIAN",
    });
    revalidatePath(RUTA_MAPEOS);
    return { ok: true, message: restar ? "La cuenta resta el tercero DIAN." : "La cuenta ya no resta el tercero DIAN." };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("cambiarRestaTerceroDian", e) };
  }
}

/** Agrega un NIT a la lista de la DIAN (núcleo de 9 dígitos). */
export async function agregarTerceroDian(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const authz = await authorizePermiso(PERMISO);
  if (!authz.ok) return { ok: false, message: authz.message };
  const parsed = TerceroDianSchema.safeParse({ nit: formData.get("nit"), etiqueta: formData.get("etiqueta") });
  if (!parsed.success) return { ok: false, message: primerError(parsed.error.issues) };
  const { nit, etiqueta } = parsed.data;

  try {
    const existe = await prisma.terceroDian.findUnique({ where: { nit }, select: { id: true } });
    if (existe) return { ok: false, message: `El NIT ${nit} ya está en la lista.` };
    const user = await getCurrentUser();
    await prisma.terceroDian.create({ data: { nit, etiqueta, creadoPor: user?.name ?? null } });
    await logAudit({ user: user?.name ?? "Sistema", action: "AGREGÓ NIT DE LA DIAN", entity: `Mapeos DIAN · NIT ${nit}`, detail: etiqueta });
    revalidatePath(RUTA_MAPEOS);
    return { ok: true, message: "NIT agregado." };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("agregarTerceroDian", e) };
  }
}

/** Quita un NIT de la lista de la DIAN. Siempre queda al menos uno. */
export async function quitarTerceroDian(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const authz = await authorizePermiso(PERMISO);
  if (!authz.ok) return { ok: false, message: authz.message };
  const id = Number(formData.get("id"));
  if (!Number.isSafeInteger(id) || id <= 0) return { ok: false, message: "NIT inválido." };

  try {
    const [tercero, total] = await Promise.all([prisma.terceroDian.findUnique({ where: { id } }), prisma.terceroDian.count()]);
    if (!tercero) return { ok: false, message: "El NIT ya no está en la lista." };
    if (total <= 1) return { ok: false, message: "La lista necesita al menos un NIT de la DIAN." };
    const user = await getCurrentUser();
    await prisma.terceroDian.delete({ where: { id } });
    await logAudit({ user: user?.name ?? "Sistema", action: "QUITÓ NIT DE LA DIAN", entity: `Mapeos DIAN · NIT ${tercero.nit}`, detail: tercero.etiqueta });
    revalidatePath(RUTA_MAPEOS);
    return { ok: true, message: "NIT quitado." };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("quitarTerceroDian", e) };
  }
}

/**
 * «Importar desde el PDF de la DIAN»: Claude lee del mismo PDF las cuatro secciones (Retención en la
 * fuente e IVA bimestral, cuatrimestral y anual) y devuelve una PROPUESTA por formulario (no se
 * guarda nada). Cada grilla se valida en código y el usuario la revisa antes de guardarla.
 */
export async function leerCalendarioPdf(_prev: ResultadoLecturaCalendario, formData: FormData): Promise<ResultadoLecturaCalendario> {
  const authz = await authorizePermiso(PERMISO);
  if (!authz.ok) return { ok: false, message: authz.message };
  const anio = Number(formData.get("anio"));
  if (!Number.isInteger(anio) || anio < 2020 || anio > 2100) return { ok: false, message: "Año inválido." };
  const archivo = formData.get("archivo");
  if (!(archivo instanceof File) || archivo.size === 0) return { ok: false, message: "Elige el PDF del calendario de la DIAN." };
  if (archivo.size > MAX_BYTES_PDF_CALENDARIO) return { ok: false, message: "El PDF supera 15 MB." };
  const bytes = Buffer.from(await archivo.arrayBuffer());
  if (bytes.subarray(0, 5).toString("latin1") !== "%PDF-") return { ok: false, message: "El archivo no es un PDF." };
  if (!(await iaDisponible())) return { ok: false, message: "La lectura con IA no está disponible. Escribe el calendario a mano o revisa la conexión de Anthropic." };

  try {
    const user = await getCurrentUser();
    const { lecturas, fallidos, usos } = await leerCalendarioCompletoConIA(bytes.toString("base64"), anio);
    await registrarConsumoIA(usos, { usuarioId: user?.id ?? null, usuarioNombre: user?.name ?? null, archivoNombre: archivo.name, modulo: "impuestos" });
    if (lecturas.length === 0) return { ok: false, message: mensajeErrorIA("leerCalendarioPdf", fallidos[0]?.error) };
    const propuestas: PropuestaCalendario[] = lecturas.map(({ formulario, anioLeido, filas }) => {
      const { errores, avisos } = validarCalendario(anio, formulario, filas);
      if (anioLeido !== anio) avisos.unshift(`El documento parece ser del año ${anioLeido}, no de ${anio}.`);
      return { anio, formulario, filas, errores, avisos };
    });
    const conErrores = propuestas.filter((p) => p.errores.length > 0).length;
    const sinLeer = fallidos.map((f) => FORMULARIOS_CALENDARIO[f.formulario].etiqueta);
    return {
      ok: true,
      message: [
        conErrores ? "Revisa las propuestas: hay fechas por completar o corregir." : "Propuestas listas para revisar.",
        ...(sinLeer.length ? [`No se pudo leer: ${sinLeer.join(", ")}. Vuelve a importar o escríbelo a mano.`] : []),
      ].join(" "),
      propuestas,
    };
  } catch (e) {
    return { ok: false, message: mensajeErrorIA("leerCalendarioPdf", e) };
  }
}

/** Guarda la grilla completa de un año (reemplaza la anterior). Solo sin errores de validación. */
export async function guardarCalendarioDian(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const authz = await authorizePermiso(PERMISO);
  if (!authz.ok) return { ok: false, message: authz.message };
  const parsed = CalendarioDianSchema.safeParse({ anio: formData.get("anio"), formulario: formData.get("formulario"), filas: formData.get("filas") });
  if (!parsed.success) return { ok: false, message: primerError(parsed.error.issues) };
  const { anio, formulario, filas } = parsed.data;
  const origen = formData.get("origen") === "pdf" ? "importado del PDF de la DIAN" : "escrito a mano";
  const { errores, avisos } = validarCalendario(anio, formulario, filas);
  if (errores.length) return { ok: false, message: errores.slice(0, 3).join(" ") + (errores.length > 3 ? ` (y ${errores.length - 3} más)` : "") };

  try {
    const user = await getCurrentUser();
    const previas = await prisma.$transaction(async (tx) => {
      const borradas = await tx.vencimientoDian.deleteMany({ where: { anio, formulario } });
      await tx.vencimientoDian.createMany({
        data: filas.map((f) => ({
          anio,
          formulario,
          periodo: f.periodo,
          ultimoDigito: f.ultimoDigito,
          fecha: fechaCalendarioPrisma(f.fecha),
          actualizadoPor: user?.name ?? null,
        })),
      });
      return borradas.count;
    });
    await logAudit({
      user: user?.name ?? "Sistema",
      action: "GUARDÓ CALENDARIO TRIBUTARIO",
      entity: `Calendario tributario · ${FORMULARIOS_CALENDARIO[formulario].etiqueta} ${anio}`,
      detail: `${filas.length} fechas ${origen}${previas ? ` · reemplazó ${previas}` : ""}${avisos.length ? ` · ${avisos.length} aviso(s)` : ""}`,
    });
    revalidatePath(RUTA_CALENDARIO);
    return { ok: true, message: "Calendario guardado." };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("guardarCalendarioDian", e) };
  }
}
