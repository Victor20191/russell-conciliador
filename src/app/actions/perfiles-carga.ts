"use server";

import { revalidatePath } from "next/cache";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/dal";
import { logAudit } from "@/lib/audit";
import { authorizePermiso } from "@/lib/rbac";
import { mensajeErrorBD } from "@/lib/errores";
import { AjustesCargaSchema, type ActionState } from "@/lib/definitions";
import { normalizarCodigoFragmentos } from "@/lib/balance/extraccion/perfil";
import { TIPO_BALANCE_CARGA } from "@/lib/balance/tipo-balance";

// Gestión de la PERSONALIZACIÓN de carga de balances por cliente:
//   - Perfiles de carga (`perfiles_carga_balance`): la estructura del archivo
//     memorizada por huella del layout — se listan y eliminan aquí (se crean
//     automáticamente en cuanto la lectura queda asociada al cliente).
//   - Preferencias de carga (`ajustes_carga_balance`): defaults del cliente
//     (hoja preferida, convención de crédito, estándar, tercero).
// Gate: `balance:crear` (Staff y Admin) con alcance por cliente — misma política
// que la memoria de mapeo (`mapeo-cliente.ts`). UI en Configuración › Clientes.
const PATH = "/config/clientes";

export type PerfilCargaResumen = {
  id: number;
  huella: string;
  hoja: string;
  origen: string; // ia | manual
  vecesUsado: number;
  ultimoUsoEn: string | null; // ISO
  archivoEjemplo: string | null;
  resumenColumnas: string; // "código C1 · nombre C2 · débitos C5…"
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

/**
 * Lista los perfiles de carga y las preferencias del cliente (lectura lazy desde
 * el modal de la ficha, para no engordar el loader de la página).
 */
export async function listarPerfilesCarga(clienteId: number): Promise<PerfilesCargaState> {
  const vacio: PerfilesCargaState = { ok: false, perfiles: [], ajustes: null, correcciones: [] };
  const authz = await authorizePermiso("balance:crear");
  if (!authz.ok) return { ...vacio, message: authz.message };
  const scope = await authorizePermiso("balance:crear", { clientId: clienteId, modo: "lectura" });
  if (!scope.ok) return { ...vacio, message: scope.message };
  try {
    const [filas, ajustes, filasCorrecciones] = await Promise.all([
      prisma.perfilCargaBalance.findMany({
        where: { clienteId },
        orderBy: [{ ultimoUsoEn: { sort: "desc", nulls: "last" } }, { actualizadoEn: "desc" }],
      }),
      prisma.ajustesCargaBalance.findUnique({
        where: { clienteId },
        select: { hojaPreferida: true, convencionCredito: true, estandar: true, agregarPorTercero: true, imputarSoloHojas: true, observaciones: true },
      }),
      prisma.correccionCargaBalance.findMany({
        where: { clienteId },
        orderBy: { cuenta: "asc" },
      }),
    ]);
    const perfiles: PerfilCargaResumen[] = filas.map((p) => {
      const partes: string[] = [];
      const col = (label: string, n: number) => { if (n > 0) partes.push(`${label} ${letraColumna(n)}`); };
      const fragmentos = normalizarCodigoFragmentos(p.colCodigoFragmentos);
      if (fragmentos.length > 0) partes.push(`código ${fragmentos.map(letraColumna).join("+")}`);
      else col("código", p.colCodigo);
      col("nombre", p.colNombre);
      col("saldo inicial", p.colSaldoInicial);
      col("débitos", p.colDebitos);
      col("créditos", p.colCreditos);
      col("saldo final", p.colSaldoFinal);
      col("saldo final D", p.colSaldoFinalDebito);
      col("saldo final C", p.colSaldoFinalCredito);
      col("tercero", p.colTercero);
      return {
        id: p.id,
        huella: p.huella,
        hoja: p.hoja,
        origen: p.origen,
        vecesUsado: p.vecesUsado,
        ultimoUsoEn: p.ultimoUsoEn?.toISOString() ?? null,
        archivoEjemplo: p.archivoEjemplo,
        resumenColumnas: partes.join(" · "),
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

/** Elimina UNA corrección memorizada (deja de re-aplicarse en las próximas cargas). */
export async function eliminarCorreccionCarga(id: number): Promise<ActionState> {
  const authz = await authorizePermiso("balance:crear");
  if (!authz.ok) return { ok: false, message: authz.message };
  const correccionId = Number(id);
  if (!Number.isInteger(correccionId) || correccionId <= 0) return { ok: false, message: "Corrección inválida." };
  try {
    const correccion = await prisma.correccionCargaBalance.findUnique({
      where: { id: correccionId },
      select: { clienteId: true, cuenta: true, nombre: true },
    });
    if (!correccion) return { ok: false, message: "La corrección ya no existe." };
    const scope = await authorizePermiso("balance:crear", { clientId: correccion.clienteId });
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
  const authz = await authorizePermiso("balance:crear");
  if (!authz.ok) return { ok: false, message: authz.message };
  const cid = Number(clienteId);
  if (!Number.isInteger(cid) || cid <= 0) return { ok: false, message: "Cliente inválido." };
  const scope = await authorizePermiso("balance:crear", { clientId: cid });
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

/** Elimina un perfil de carga (la próxima carga con ese layout volverá a usar IA). */
export async function eliminarPerfilCarga(id: number): Promise<ActionState> {
  const authz = await authorizePermiso("balance:crear");
  if (!authz.ok) return { ok: false, message: authz.message };
  const perfilId = Number(id);
  if (!Number.isInteger(perfilId) || perfilId <= 0) return { ok: false, message: "Perfil inválido." };
  try {
    const perfil = await prisma.perfilCargaBalance.findUnique({
      where: { id: perfilId },
      select: { clienteId: true, huella: true, hoja: true, archivoEjemplo: true },
    });
    if (!perfil) return { ok: false, message: "El perfil ya no existe." };
    const scope = await authorizePermiso("balance:crear", { clientId: perfil.clienteId });
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
  const authz = await authorizePermiso("balance:crear");
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
  const scope = await authorizePermiso("balance:crear", { clientId: clienteId });
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
