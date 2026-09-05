"use server";

import { revalidatePath } from "next/cache";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/dal";
import { logAudit } from "@/lib/audit";
import { authorizePermiso } from "@/lib/rbac";
import { mensajeErrorBD } from "@/lib/errores";
import { AjustesCargaSchema, EditarPerfilCargaSchema, type ActionState } from "@/lib/definitions";
import {
  aplanarSpec,
  normalizarCodigoFragmentos,
  specCargaDesdePerfil,
} from "@/lib/balance/extraccion/perfil";
import type { SpecCarga } from "@/lib/balance/extraccion/esquema";
import { TIPO_BALANCE_CARGA } from "@/lib/balance/tipo-balance";

// Gestión de la PERSONALIZACIÓN de carga de balances por cliente:
//   - Perfiles de carga (`perfiles_carga_balance`): la estructura del archivo
//     memorizada por huella del layout — se listan y eliminan aquí (se crean
//     automáticamente en cuanto la lectura queda asociada al cliente).
//   - Preferencias de carga (`ajustes_carga_balance`): defaults del cliente
//     (hoja preferida, convención de crédito, estándar, tercero).
// Gate: `perfiles_carga:administrar` (Administrador y Superadministrador), con
// la doble verificación de alcance por cliente que mantiene el patrón del resto
// de acciones sobre datos de cliente. UI en Configuración › Perfiles de carga:
// es parametrización técnica de la herramienta, no trabajo de auditoría, así que
// no se expone en la ficha del cliente ni en las pantallas de balance.
const PATH = "/config/perfiles-carga";

export type PerfilCargaResumen = {
  id: number;
  huella: string;
  hoja: string;
  origen: string; // ia | manual
  vecesUsado: number;
  ultimoUsoEn: string | null; // ISO
  archivoEjemplo: string | null;
  resumenColumnas: string; // "código C1 · nombre C2 · débitos C5…"
  estructura: SpecCarga;
  actualizadoEn: string; // ISO
};

export type AjustesCargaResumen = {
  hojaPreferida: string | null;
  convencionCredito: string | null;
  estandar: string | null;
  agregarPorTercero: boolean | null;
  imputarSoloHojas: boolean | null;
  observaciones: string | null;
};

export type CorreccionCargaResumen = {
  id: number;
  cuenta: string;
  nombre: string | null;
  resumen: string; // "→ agrupadora · omitir · anidar bajo 110510…"
  vecesAplicada: number;
  ultimoUsoEn: string | null; // ISO
  actualizadoEn: string; // ISO
};

export type PerfilesCargaState = {
  ok: boolean;
  message?: string;
  perfiles: PerfilCargaResumen[];
  ajustes: AjustesCargaResumen | null;
  // Correcciones por CUENTA memorizadas al guardar cambios en el borrador
  // (`correcciones_carga_balance`): se re-aplican solas en cada nueva lectura.
  correcciones: CorreccionCargaResumen[];
};

/** Letra Excel (A, B, …, AA) de un índice 1-based. */
function letraColumna(n: number): string {
  let s = "";
  let x = n;
  while (x > 0) {
    const r = (x - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    x = Math.floor((x - 1) / 26);
  }
  return s;
}

/** Convierte una fila Prisma del perfil al contrato editable/persistible. */
function estructuraDesdePerfil(p: {
  hoja: string;
  filaEncabezado: number;
  primeraFilaDatos: number;
  colCodigo: number;
  colCodigoFragmentos: unknown;
  colNombre: number;
  colSaldoInicial: number;
  colDebitos: number;
  colCreditos: number;
  colSaldoFinal: number;
  colSaldoFinalDebito: number;
  colSaldoFinalCredito: number;
  colTercero: number;
  colNombreTercero?: number;
  colTipoDocumentoTercero?: number;
  colDvTercero?: number;
  signoCredito: string;
  reglaDetalleTipo: string;
  reglaDetalleColumna: number | null;
  reglaDetalleValor: string | null;
  agregarPorTercero: boolean;
}): SpecCarga {
  return specCargaDesdePerfil({
    hoja: p.hoja,
    filaEncabezado: p.filaEncabezado,
    primeraFilaDatos: p.primeraFilaDatos,
    colCodigo: p.colCodigo,
    colCodigoFragmentos: normalizarCodigoFragmentos(p.colCodigoFragmentos),
    colNombre: p.colNombre,
    colSaldoInicial: p.colSaldoInicial,
    colDebitos: p.colDebitos,
    colCreditos: p.colCreditos,
    colSaldoFinal: p.colSaldoFinal,
    colSaldoFinalDebito: p.colSaldoFinalDebito,
    colSaldoFinalCredito: p.colSaldoFinalCredito,
    colTercero: p.colTercero,
    colNombreTercero: p.colNombreTercero, colTipoDocumentoTercero: p.colTipoDocumentoTercero, colDvTercero: p.colDvTercero,
    signoCredito: p.signoCredito === "magnitud" ? "magnitud" : "firmado",
    reglaDetalleTipo:
      p.reglaDetalleTipo === "columna"
        ? "columna"
        : p.reglaDetalleTipo === "movimiento"
          ? "movimiento"
          : "prefijo",
    reglaDetalleColumna: p.reglaDetalleColumna,
    reglaDetalleValor: p.reglaDetalleValor,
    agregarPorTercero: p.agregarPorTercero,
  });
}

function resumenColumnas(spec: SpecCarga): string {
  const partes: string[] = [];
  const col = (label: string, n: number) => {
    if (n > 0) partes.push(`${label} ${letraColumna(n)}`);
  };
  if (spec.columnas.codigoFragmentos.length > 0) {
    partes.push(`código ${spec.columnas.codigoFragmentos.map(letraColumna).join("+")}`);
  } else {
    col("código", spec.columnas.codigo);
  }
  col("nombre", spec.columnas.nombre);
  col("saldo inicial", spec.columnas.saldoInicial);
  col("débitos", spec.columnas.debitos);
  col("créditos", spec.columnas.creditos);
  col("saldo final", spec.columnas.saldoFinal);
  col("saldo final D", spec.columnas.saldoFinalDebito);
  col("saldo final C", spec.columnas.saldoFinalCredito);
  col("tercero", spec.columnas.tercero);
  col("nombre tercero", spec.columnas.nombreTercero ?? 0);
  col("tipo documento tercero", spec.columnas.tipoDocumentoTercero ?? 0);
  col("DV tercero", spec.columnas.dvTercero ?? 0);
  return partes.join(" · ");
}

/**
 * Lista los perfiles de carga y las preferencias del cliente (lectura lazy desde
 * el modal de la ficha, para no engordar el loader de la página).
 */
export async function listarPerfilesCarga(clienteId: number): Promise<PerfilesCargaState> {
  const vacio: PerfilesCargaState = { ok: false, perfiles: [], ajustes: null, correcciones: [] };
  const authz = await authorizePermiso("perfiles_carga:administrar");
  if (!authz.ok) return { ...vacio, message: authz.message };
  const scope = await authorizePermiso("perfiles_carga:administrar", { clientId: clienteId, modo: "lectura" });
  if (!scope.ok) return { ...vacio, message: scope.message };
  try {
    const [filas, ajustes, filasCorrecciones] = await Promise.all([
      prisma.perfilCargaBalance.findMany({
        where: { clienteId },
        // Creación y edición comparten `actualizadoEn` (@updatedAt); el más
        // reciente va primero para que el admin vea de inmediato lo que tocó.
        orderBy: [{ actualizadoEn: "desc" }, { creadoEn: "desc" }],
      }),
      prisma.ajustesCargaBalance.findUnique({
        where: { clienteId },
        select: { hojaPreferida: true, convencionCredito: true, estandar: true, agregarPorTercero: true, imputarSoloHojas: true, observaciones: true },
      }),
      prisma.correccionCargaBalance.findMany({
        where: { clienteId },
        orderBy: [{ actualizadoEn: "desc" }, { cuenta: "asc" }],
      }),
    ]);
    const perfiles: PerfilCargaResumen[] = filas.map((p) => {
      const estructura = estructuraDesdePerfil(p);
      return {
        id: p.id,
        huella: p.huella,
        hoja: p.hoja,
        origen: p.origen,
        vecesUsado: p.vecesUsado,
        ultimoUsoEn: p.ultimoUsoEn?.toISOString() ?? null,
        archivoEjemplo: p.archivoEjemplo,
        resumenColumnas: resumenColumnas(estructura),
        estructura,
        actualizadoEn: p.actualizadoEn.toISOString(),
      };
    });
    const correcciones: CorreccionCargaResumen[] = filasCorrecciones.map((c) => {
      const partes: string[] = [];
      if (c.tipoFilaForzado === "agrupadora") partes.push("→ agrupadora");
      if (c.tipoFilaForzado === "movimiento") partes.push("→ movimiento");
      if (c.desacoplada === true) partes.push("desacoplar");
      if (c.desacoplada === false) partes.push("reacoplar");
      if (c.omitida === true) partes.push("omitir");
      if (c.omitida === false) partes.push("incluir (rescatada)");
      if (c.padreCodigo) partes.push(`anidar bajo ${c.padreCodigo}`);
      return {
        id: c.id,
        cuenta: c.cuenta,
        nombre: c.nombre,
        resumen: partes.join(" · ") || "—",
        vecesAplicada: c.vecesAplicada,
        ultimoUsoEn: c.ultimoUsoEn?.toISOString() ?? null,
        actualizadoEn: c.actualizadoEn.toISOString(),
      };
    });
    return { ok: true, perfiles, ajustes, correcciones };
  } catch (e) {
    return { ...vacio, message: mensajeErrorBD("listarPerfilesCarga", e) };
  }
}

export type EditarPerfilCargaInput = {
  id: number;
  actualizadoEn: string;
  estructura: SpecCarga;
};

/**
 * Actualiza directamente el MappingSpec persistible de UN perfil.
 *
 * El `actualizadoEn` recibido funciona como control de concurrencia: si otra
 * persona cambió el perfil mientras estaba abierto, no se pisan sus ajustes.
 */
export async function actualizarPerfilCarga(input: EditarPerfilCargaInput): Promise<ActionState> {
  const authz = await authorizePermiso("perfiles_carga:administrar");
  if (!authz.ok) return { ok: false, message: authz.message };

  const parsed = EditarPerfilCargaSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "La estructura del perfil no es válida.",
    };
  }

  const { id, actualizadoEn } = parsed.data;
  const estructura: SpecCarga = {
    ...parsed.data.estructura,
    hoja: parsed.data.estructura.hoja.trim(),
    columnas: {
      ...parsed.data.estructura.columnas,
      codigoFragmentos: [...new Set(parsed.data.estructura.columnas.codigoFragmentos)],
    },
    reglaDetalle:
      parsed.data.estructura.reglaDetalle.tipo === "columna"
        ? {
            tipo: "columna",
            columna: parsed.data.estructura.reglaDetalle.columna,
            valor: parsed.data.estructura.reglaDetalle.valor?.trim() ?? "",
          }
        : {
            tipo: parsed.data.estructura.reglaDetalle.tipo,
            columna: null,
            valor: null,
          },
  };

  try {
    const perfil = await prisma.perfilCargaBalance.findUnique({
      where: { id },
      select: {
        clienteId: true,
        huella: true,
        hoja: true,
        actualizadoEn: true,
      },
    });
    if (!perfil) return { ok: false, message: "El perfil ya no existe." };

    const scope = await authorizePermiso("perfiles_carga:administrar", { clientId: perfil.clienteId });
    if (!scope.ok) return { ok: false, message: scope.message };

    const versionEsperada = new Date(actualizadoEn);
    if (perfil.actualizadoEn.getTime() !== versionEsperada.getTime()) {
      return {
        ok: false,
        message: "Este perfil cambió mientras lo estabas revisando. Ciérralo y vuelve a abrirlo para ver la versión más reciente.",
      };
    }

    const actualizado = await prisma.perfilCargaBalance.updateMany({
      where: {
        id,
        clienteId: perfil.clienteId,
        actualizadoEn: versionEsperada,
      },
      data: {
        ...aplanarSpec(estructura),
        // Una edición humana blinda el perfil frente a futuras detecciones
        // automáticas: las cargas solo registrarán su uso, no pisarán su mapa.
        origen: "manual",
      },
    });
    if (actualizado.count !== 1) {
      return {
        ok: false,
        message: "Este perfil cambió mientras lo estabas guardando. Vuelve a abrirlo antes de intentar de nuevo.",
      };
    }

    const user = await getCurrentUser();
    await logAudit({
      user: user?.name ?? "Sistema",
      action: "EDITÓ PERFIL de carga de balance",
      entity: `cliente ${perfil.clienteId}`,
      detail: [
        `huella ${perfil.huella}`,
        `hoja «${perfil.hoja}» → «${estructura.hoja}»`,
        `filas ${estructura.filaEncabezado}/${estructura.primeraFilaDatos}`,
        resumenColumnas(estructura) || "sin columnas opcionales",
        `detalle ${estructura.reglaDetalle.tipo}`,
        `crédito ${estructura.signoCredito}`,
        `agrega terceros ${estructura.agregarPorTercero ? "sí" : "no"}`,
      ].join(" · "),
      clientId: perfil.clienteId,
    });
    revalidatePath(PATH);
    return {
      ok: true,
      message: "Perfil actualizado. Las próximas cargas de este formato usarán esta estructura.",
    };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("actualizarPerfilCarga", e) };
  }
}

/** Elimina UNA corrección memorizada (deja de re-aplicarse en las próximas cargas). */
export async function eliminarCorreccionCarga(id: number): Promise<ActionState> {
  const authz = await authorizePermiso("perfiles_carga:administrar");
  if (!authz.ok) return { ok: false, message: authz.message };
  const correccionId = Number(id);
  if (!Number.isInteger(correccionId) || correccionId <= 0) return { ok: false, message: "Corrección inválida." };
  try {
    const correccion = await prisma.correccionCargaBalance.findUnique({
      where: { id: correccionId },
      select: { clienteId: true, cuenta: true, nombre: true },
    });
    if (!correccion) return { ok: false, message: "La corrección ya no existe." };
    const scope = await authorizePermiso("perfiles_carga:administrar", { clientId: correccion.clienteId });
    if (!scope.ok) return { ok: false, message: scope.message };
    await prisma.correccionCargaBalance.delete({ where: { id: correccionId } });
    const user = await getCurrentUser();
    await logAudit({
      user: user?.name ?? "Sistema",
      action: "ELIMINÓ CORRECCIÓN de carga de balance",
      entity: `cliente ${correccion.clienteId}`,
      detail: `cuenta ${correccion.cuenta}${correccion.nombre ? ` — ${correccion.nombre}` : ""}`,
      clientId: correccion.clienteId,
    });
    revalidatePath(PATH);
    return { ok: true, message: "Corrección eliminada." };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("eliminarCorreccionCarga", e) };
  }
}

/** Elimina TODAS las correcciones memorizadas del cliente. */
export async function limpiarCorreccionesCarga(clienteId: number): Promise<ActionState> {
  const authz = await authorizePermiso("perfiles_carga:administrar");
  if (!authz.ok) return { ok: false, message: authz.message };
  const cid = Number(clienteId);
  if (!Number.isInteger(cid) || cid <= 0) return { ok: false, message: "Cliente inválido." };
  const scope = await authorizePermiso("perfiles_carga:administrar", { clientId: cid });
  if (!scope.ok) return { ok: false, message: scope.message };
  try {
    const del = await prisma.correccionCargaBalance.deleteMany({ where: { clienteId: cid } });
    const user = await getCurrentUser();
    await logAudit({
      user: user?.name ?? "Sistema",
      action: "LIMPIÓ CORRECCIONES de carga de balance",
      entity: `cliente ${cid}`,
      detail: `${del.count} corrección(es)`,
      clientId: cid,
    });
    revalidatePath(PATH);
    return { ok: true, message: `${del.count} corrección(es) eliminadas.` };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("limpiarCorreccionesCarga", e) };
  }
}

/**
 * Borra TODA la memoria de carga del cliente de una sola vez: formatos por huella,
 * correcciones por cuenta y preferencias. Deja al cliente como si nunca se le
 * hubiera cargado un balance — la próxima carga vuelve a detectar la estructura
 * con IA y no re-aplica ningún ajuste. No toca los lotes ni los balances ya
 * cargados: solo la memoria que condiciona las lecturas futuras.
 */
export async function limpiarMemoriaCargaCliente(clienteId: number): Promise<ActionState> {
  const authz = await authorizePermiso("perfiles_carga:administrar");
  if (!authz.ok) return { ok: false, message: authz.message };
  const cid = Number(clienteId);
  if (!Number.isInteger(cid) || cid <= 0) return { ok: false, message: "Cliente inválido." };
  const scope = await authorizePermiso("perfiles_carga:administrar", { clientId: cid });
  if (!scope.ok) return { ok: false, message: scope.message };
  try {
    const cliente = await prisma.client.findUnique({ where: { id: cid }, select: { name: true } });
    if (!cliente) return { ok: false, message: "El cliente seleccionado ya no existe." };
    const [perfiles, correcciones, ajustes] = await prisma.$transaction([
      prisma.perfilCargaBalance.deleteMany({ where: { clienteId: cid } }),
      prisma.correccionCargaBalance.deleteMany({ where: { clienteId: cid } }),
      prisma.ajustesCargaBalance.deleteMany({ where: { clienteId: cid } }),
    ]);
    const partes = [
      `${perfiles.count} formato(s)`,
      `${correcciones.count} corrección(es)`,
      ajustes.count > 0 ? "preferencias" : null,
    ].filter(Boolean).join(" · ");
    const user = await getCurrentUser();
    await logAudit({
      user: user?.name ?? "Sistema",
      action: "BORRÓ LA MEMORIA de carga de balance",
      entity: cliente.name,
      detail: partes,
      clientId: cid,
    });
    revalidatePath(PATH);
    return {
      ok: true,
      message: ajustes.count > 0
        ? `Memoria borrada: ${perfiles.count} formato(s), ${correcciones.count} corrección(es) y las preferencias.`
        : `Memoria borrada: ${perfiles.count} formato(s) y ${correcciones.count} corrección(es).`,
    };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("limpiarMemoriaCargaCliente", e) };
  }
}

/** Elimina un perfil de carga (la próxima carga con ese layout volverá a usar IA). */
export async function eliminarPerfilCarga(id: number): Promise<ActionState> {
  const authz = await authorizePermiso("perfiles_carga:administrar");
  if (!authz.ok) return { ok: false, message: authz.message };
  const perfilId = Number(id);
  if (!Number.isInteger(perfilId) || perfilId <= 0) return { ok: false, message: "Perfil inválido." };
  try {
    const perfil = await prisma.perfilCargaBalance.findUnique({
      where: { id: perfilId },
      select: { clienteId: true, huella: true, hoja: true, archivoEjemplo: true },
    });
    if (!perfil) return { ok: false, message: "El perfil ya no existe." };
    const scope = await authorizePermiso("perfiles_carga:administrar", { clientId: perfil.clienteId });
    if (!scope.ok) return { ok: false, message: scope.message };
    await prisma.perfilCargaBalance.delete({ where: { id: perfilId } });
    const user = await getCurrentUser();
    await logAudit({
      user: user?.name ?? "Sistema",
      action: "ELIMINÓ PERFIL de carga de balance",
      entity: `cliente ${perfil.clienteId}`,
      detail: `huella ${perfil.huella} · hoja «${perfil.hoja}»${perfil.archivoEjemplo ? ` · ${perfil.archivoEjemplo}` : ""}`,
      clientId: perfil.clienteId,
    });
    revalidatePath(PATH);
    return { ok: true, message: "Perfil eliminado." };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("eliminarPerfilCarga", e) };
  }
}

/** Guarda (upsert) las preferencias de carga del cliente. */
export async function guardarAjustesCarga(_prev: ActionState | undefined, formData: FormData): Promise<ActionState> {
  const authz = await authorizePermiso("perfiles_carga:administrar");
  if (!authz.ok) return { ok: false, message: authz.message };
  const parsed = AjustesCargaSchema.safeParse({
    clienteId: formData.get("clienteId"),
    hojaPreferida: formData.get("hojaPreferida"),
    convencionCredito: formData.get("convencionCredito"),
    agregarPorTercero: formData.get("agregarPorTercero"),
    imputarSoloHojas: formData.get("imputarSoloHojas"),
    observaciones: formData.get("observaciones"),
  });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  const { clienteId, hojaPreferida, convencionCredito, agregarPorTercero, imputarSoloHojas, observaciones } = parsed.data;
  const scope = await authorizePermiso("perfiles_carga:administrar", { clientId: clienteId });
  if (!scope.ok) return { ok: false, message: scope.message };
  try {
    const cliente = await prisma.client.findUnique({ where: { id: clienteId }, select: { name: true } });
    if (!cliente) return { ok: false, message: "El cliente seleccionado ya no existe." };
    const user = await getCurrentUser();
    const datos = {
      hojaPreferida,
      convencionCredito,
      estandar: TIPO_BALANCE_CARGA,
      agregarPorTercero,
      imputarSoloHojas,
      observaciones,
      actualizadoPor: user?.name ?? null,
    };
    await prisma.ajustesCargaBalance.upsert({
      where: { clienteId },
      create: { clienteId, ...datos },
      update: datos,
    });
    await logAudit({
      user: user?.name ?? "Sistema",
      action: "GUARDÓ PREFERENCIAS de carga de balance",
      entity: cliente.name,
      detail: [
        hojaPreferida ? `hoja «${hojaPreferida}»` : null,
        convencionCredito ? `crédito ${convencionCredito}` : null,
        `estándar ${TIPO_BALANCE_CARGA}`,
        agregarPorTercero != null ? `tercero ${agregarPorTercero ? "sí" : "no"}` : null,
        imputarSoloHojas != null ? `solo hojas ${imputarSoloHojas ? "sí" : "no"}` : null,
        observaciones ? "con notas" : null,
      ].filter(Boolean).join(" · ") || "todo en auto",
      clientId: clienteId,
    });
    revalidatePath(PATH);
    return { ok: true, message: "Preferencias guardadas." };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("guardarAjustesCarga", e) };
  }
}
