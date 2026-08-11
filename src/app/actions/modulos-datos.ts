"use server";

// Server Actions del MOTOR genérico de importación de módulos (Inventarios piloto).
// Flujo: leer archivo → staging editable (borrador) → promover a oficial (detalle) →
// purga. Todo dirigido por el descriptor del módulo. Sin PUC ni partida doble.
import { revalidatePath } from "next/cache";
import { randomUUID } from "crypto";
import * as z from "zod";
import prisma from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { getCurrentUser } from "@/lib/dal";
import { logAudit } from "@/lib/audit";
import { authorizePermiso } from "@/lib/rbac";
import { mensajeErrorBD, registrarError } from "@/lib/errores";
import type { ActionState } from "@/lib/definitions";
import { ingerir, type CeldaCruda } from "@/lib/balance/extraccion/ingesta";
import { calcularHuella, huellasCandidatas } from "@/lib/balance/extraccion/huella";
import { descriptorModulo } from "@/lib/modulos/descriptores";
import { cuenta4DelModulo, prefijosCuentaModulo } from "@/lib/modulos/cuentas-modulo";
import { SpecModuloSchema, type SpecModulo } from "@/lib/modulos/extraccion/esquema";
import { sugerirSpec } from "@/lib/modulos/extraccion/sugerir";
import { transformarModulo } from "@/lib/modulos/extraccion/transformar";
import { promoverStaging, type FilaStagingModulo } from "@/lib/modulos/promocion";
import { getCatalogoPrevalidador } from "@/lib/parametros/prevalidador";
import { tomarCandadoTransaccion, transaccionSerializable } from "@/lib/concurrency";

const rutaModulo = (codigo: string) => `/modulos/${codigo.toLowerCase()}`;
const LOTE_STAGING_MODULO = 2_000;
const TIMEOUT_TRANSACCION_MODULO_MS = 15 * 60 * 1000;
const tamArchivo = (bytes: number): string => {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
};
const fechaISO = (v: FormDataEntryValue | null): Date | null => {
  const s = typeof v === "string" ? v.trim() : "";
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T00:00:00`) : null;
};

function mensajeErrorLecturaArchivoModulo(contexto: string, e: unknown): string {
  registrarError(contexto, e);
  const mensaje = e instanceof Error ? e.message.trim() : "";
  if (/^(No se pudo leer|El formato|Formato de archivo)/i.test(mensaje)) return mensaje;
  return "No se pudo leer el archivo. Si es un Excel, ábrelo, guárdalo nuevamente como .xlsx e intenta otra vez.";
}

// Datos para el editor de mapeo: encabezado + filas de muestra (alineadas por columna)
// de la MISMA grilla del servidor, para etiquetar los selectores y previsualizar el mapeo.
export type CeldaMuestra = string | number | null;
export type AnalisisModulo = {
  ok: boolean;
  message?: string;
  hoja?: string;
  hojas?: string[];
  totalFilas?: number;
  ancho?: number;
  encabezado?: CeldaMuestra[];
  muestraFilas?: CeldaMuestra[][];
  spec?: SpecModulo;
  origen?: "perfil" | "ia";
};

async function specPerfilModulo(
  clienteId: number,
  moduloCodigo: string,
  candidatas: { huella: string }[],
): Promise<SpecModulo | null> {
  if (candidatas.length === 0) return null;
  const perfiles = await prisma.perfilCargaModulo.findMany({
    where: { clienteId, moduloCodigo, huella: { in: candidatas.map((c) => c.huella) } },
    select: { huella: true, specJson: true },
  });
  const porHuella = new Map(perfiles.map((perfil) => [perfil.huella, perfil.specJson]));
  for (const candidata of candidatas) {
    const perfil = porHuella.get(candidata.huella);
    if (perfil == null) continue;
    const parsed = SpecModuloSchema.safeParse(perfil);
    if (parsed.success) return parsed.data;
  }
  return null;
}

const mismoSpecModulo = (a: SpecModulo, b: SpecModulo): boolean =>
  JSON.stringify(a) === JSON.stringify(b);

// ============================================================
// ANALIZAR: lee el archivo (SIN escribir) y devuelve la grilla del servidor + spec
// sugerido para que el modal edite el mapeo de columnas sobre la MISMA grilla que
// luego usará el transform (cero riesgo de desalineación de índices).
// ============================================================
export async function analizarArchivoModulo(formData: FormData): Promise<AnalisisModulo> {
  const moduloCodigo = String(formData.get("moduloCodigo") ?? "").trim().toUpperCase();
  const descriptor = descriptorModulo(moduloCodigo);
  if (!descriptor) return { ok: false, message: "Módulo no soportado." };
  const authz = await authorizePermiso("modulos_datos:crear");
  if (!authz.ok) return { ok: false, message: authz.message };
  const clienteId = Number(formData.get("clienteId"));
  if (!Number.isInteger(clienteId) || clienteId <= 0) return { ok: false, message: "Selecciona el cliente." };
  const scope = await authorizePermiso("modulos_datos:crear", { clientId: clienteId });
  if (!scope.ok) return { ok: false, message: scope.message };
  const archivo = formData.get("archivo");
  if (!(archivo instanceof File) || archivo.size === 0) return { ok: false, message: "Adjunta el archivo del módulo." };

  try {
    let ingesta: Awaited<ReturnType<typeof ingerir>>;
    try {
      ingesta = await ingerir(await archivo.arrayBuffer(), archivo.name);
    } catch (e) {
      return { ok: false, message: mensajeErrorLecturaArchivoModulo("analizarArchivoModulo.ingerir", e) };
    }
    if (ingesta.modo !== "tabular") return { ok: false, message: "Por ahora solo se admiten archivos tabulares (Excel/CSV)." };
    const hojaElegida = String(formData.get("hoja") ?? "").trim();
    const hoja = ingesta.hojas.find((h) => h.nombre === hojaElegida) ?? ingesta.hojas[0];
    if (!hoja) return { ok: false, message: "El archivo no tiene hojas legibles." };

    // Spec de partida: perfil por huella si existe, si no el heurístico.
    const candidatas = huellasCandidatas([hoja]);
    const perfilSpec = await specPerfilModulo(clienteId, moduloCodigo, candidatas);
    const spec = perfilSpec ?? sugerirSpec(descriptor, hoja);
    const origen: "perfil" | "ia" = perfilSpec ? "perfil" : "ia";

    // Encabezado + primeras filas de datos (todas las columnas) para el editor y el preview.
    const ancho = hoja.filas.reduce((m, f) => Math.max(m, f?.length ?? 0), 0);
    const aCelda = (v: CeldaCruda): CeldaMuestra => (v == null ? null : typeof v === "number" ? v : typeof v === "boolean" ? (v ? 1 : 0) : String(v).replace(/\s+/g, " ").trim() || null);
    const rellena = (fila: CeldaCruda[] | undefined): CeldaMuestra[] => Array.from({ length: ancho }, (_, c) => aCelda(fila?.[c] ?? null));
    const encabezado = rellena(hoja.filas[spec.filaEncabezado - 1]);
    const muestraFilas = hoja.filas.slice(spec.primeraFilaDatos - 1, spec.primeraFilaDatos - 1 + 12).map(rellena);

    return { ok: true, hoja: hoja.nombre, hojas: ingesta.hojas.map((h) => h.nombre), totalFilas: hoja.filas.length, ancho, encabezado, muestraFilas, spec, origen };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("analizarArchivoModulo", e) };
  }
}

// ============================================================
// LEER: archivo → staging (borrador). Cliente OBLIGATORIO (los módulos no detectan NIT).
// ============================================================
export async function leerDatosModulo(_prev: ActionState | undefined, formData: FormData): Promise<ActionState & { loteId?: string }> {
  const moduloCodigo = String(formData.get("moduloCodigo") ?? "").trim().toUpperCase();
  const descriptor = descriptorModulo(moduloCodigo);
  if (!descriptor) return { ok: false, message: "Módulo no soportado." };

  const authz = await authorizePermiso("modulos_datos:crear");
  if (!authz.ok) return { ok: false, message: authz.message };
  const clienteId = Number(formData.get("clienteId"));
  if (!Number.isInteger(clienteId) || clienteId <= 0) return { ok: false, message: "Selecciona el cliente." };
  const scope = await authorizePermiso("modulos_datos:crear", { clientId: clienteId });
  if (!scope.ok) return { ok: false, message: scope.message };

  const archivo = formData.get("archivo");
  if (!(archivo instanceof File) || archivo.size === 0) return { ok: false, message: "Adjunta el archivo del módulo." };

  try {
    const cliente = await prisma.client.findUnique({ where: { id: clienteId }, select: { name: true } });
    if (!cliente) return { ok: false, message: "El cliente seleccionado ya no existe." };

    let ingesta: Awaited<ReturnType<typeof ingerir>>;
    try {
      ingesta = await ingerir(await archivo.arrayBuffer(), archivo.name);
    } catch (e) {
      return { ok: false, message: mensajeErrorLecturaArchivoModulo("leerDatosModulo.ingerir", e) };
    }
    if (ingesta.modo !== "tabular") return { ok: false, message: "Por ahora solo se admiten archivos tabulares (Excel/CSV) para módulos." };
    const hojaElegida = String(formData.get("hoja") ?? "").trim();
    const hoja = ingesta.hojas.find((h) => h.nombre === hojaElegida) ?? ingesta.hojas[0];
    if (!hoja) return { ok: false, message: "El archivo no tiene hojas legibles." };

    // Spec: (1) editado a mano → manual · (2) perfil por huella → perfil · (3) heurístico → auto.
    const specEditadoRaw = formData.get("specJson");
    let spec: SpecModulo;
    let origen: "manual" | "perfil" | "ia";
    if (typeof specEditadoRaw === "string" && specEditadoRaw.trim()) {
      const parsed = SpecModuloSchema.safeParse(JSON.parse(specEditadoRaw));
      if (!parsed.success) return { ok: false, message: "El mapeo de columnas no es válido." };
      spec = parsed.data;
      // El origen es metadata de auditoría: se recompone contra fuentes del
      // servidor y nunca se acepta una etiqueta arbitraria enviada por el navegador.
      const perfilSpec = await specPerfilModulo(clienteId, moduloCodigo, huellasCandidatas([hoja]));
      if (perfilSpec && mismoSpecModulo(spec, perfilSpec)) origen = "perfil";
      else if (mismoSpecModulo(spec, sugerirSpec(descriptor, hoja))) origen = "ia";
      else origen = "manual";
    } else {
      const candidatas = huellasCandidatas([hoja]);
      const perfilSpec = await specPerfilModulo(clienteId, moduloCodigo, candidatas);
      if (perfilSpec) { spec = perfilSpec; origen = "perfil"; }
      else { spec = sugerirSpec(descriptor, hoja); origen = "ia"; }
    }

    const resultado = transformarModulo(descriptor, spec, hoja);
    if (resultado.filas.length === 0) return { ok: false, message: "No se leyeron filas con el mapeo actual. Ajusta las columnas." };

    const loteId = randomUUID();
    const huella = calcularHuella(hoja.nombre, hoja.filas[spec.filaEncabezado - 1] ?? []);
    const user = await getCurrentUser();

    await prisma.$transaction(async (tx) => {
      for (let i = 0; i < resultado.filas.length; i += LOTE_STAGING_MODULO) {
        await tx.moduloImportacionStaging.createMany({
          data: resultado.filas.slice(i, i + LOTE_STAGING_MODULO).map((f) => ({
            loteId, moduloCodigo, clienteId, hoja: hoja.nombre, filaNum: f.filaNum,
            clasificador: f.clasificador, valor: f.valor, datos: f.datos, tipoFila: f.tipoFila,
          })),
        });
      }
      await tx.moduloImportacionLote.create({
        data: {
          moduloCodigo, loteId, clienteId, archivoNombre: archivo.name, archivoTam: tamArchivo(archivo.size),
          periodoInicial: fechaISO(formData.get("periodoInicio")), periodoFinal: fechaISO(formData.get("periodoFin")),
          filasLeidas: resultado.filasLeidas, filasExcluidas: resultado.filasExcluidas,
          huella, origenExtraccion: origen, specJson: spec,
          cargadoPor: user?.name ?? null, cargadoPorId: user?.id ?? null,
        },
      });
      // Perfil del layout por cliente+módulo: se guarda/actualiza para las próximas cargas.
      if (huella) {
        await tx.perfilCargaModulo.upsert({
          where: { clienteId_moduloCodigo_huella: { clienteId, moduloCodigo, huella } },
          create: { clienteId, moduloCodigo, huella, specJson: spec, origen, vecesUsado: 1, ultimoUsoEn: new Date(), archivoEjemplo: archivo.name, creadoPor: user?.name ?? null, creadoPorId: user?.id ?? null },
          update: { specJson: spec, vecesUsado: { increment: 1 }, ultimoUsoEn: new Date(), archivoEjemplo: archivo.name, ...(origen === "manual" ? { origen: "manual" } : {}) },
        });
      }
    }, {
      maxWait: 5_000,
      timeout: TIMEOUT_TRANSACCION_MODULO_MS,
    });

    await logAudit({ user: user?.name ?? "Sistema", action: `LEYÓ archivo de ${descriptor.label}`, entity: cliente.name, detail: `${resultado.filas.length} filas · ${archivo.name}` });
    revalidatePath(rutaModulo(moduloCodigo));
    return { ok: true, loteId, message: "Archivo leído. Revisa el borrador." };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("leerDatosModulo", e) };
  }
}

// ============================================================
// EDITAR el borrador: marcar agrupador / omitir por fila (se guarda en el staging).
// ============================================================
export async function aplicarCambiosBorradorModulo(
  loteId: string,
  cambios: { filaNum: number; tipoFila?: string; omitida?: boolean | null }[],
  periodo?: string,
): Promise<ActionState> {
  const authz = await authorizePermiso("modulos_datos:crear");
  if (!authz.ok) return { ok: false, message: authz.message };
  const id = String(loteId ?? "").trim();
  if (!id) return { ok: false, message: "Borrador inválido." };
  try {
    const lote = await prisma.moduloImportacionLote.findUnique({ where: { loteId: id }, select: { clienteId: true, moduloCodigo: true } });
    if (!lote?.clienteId) return { ok: false, message: "El borrador ya no existe o no tiene cliente." };
    const scope = await authorizePermiso("modulos_datos:crear", { clientId: lote.clienteId });
    if (!scope.ok) return { ok: false, message: scope.message };
    const periodoNormalizado = periodo?.trim() ?? "";
    if (periodo !== undefined && !/^\d{4}-\d{2}$/.test(periodoNormalizado)) {
      return { ok: false, message: "Indica el período en formato AAAA-MM." };
    }
    await prisma.$transaction([
      ...cambios.filter((c) => Number.isInteger(c.filaNum)).map((c) =>
        prisma.moduloImportacionStaging.updateMany({
          where: { loteId: id, filaNum: c.filaNum },
          data: {
            ...(c.tipoFila === "agrupadora" || c.tipoFila === "movimiento" ? { tipoFila: c.tipoFila, tipoFilaForzado: c.tipoFila } : {}),
            ...(c.omitida !== undefined ? { omitida: c.omitida } : {}),
          },
        }),
      ),
      ...(periodo !== undefined
        ? [prisma.moduloImportacionLote.update({
            where: { loteId: id },
            data: {
              periodoInicial: new Date(`${periodoNormalizado}-01T00:00:00`),
              periodoFinal: new Date(`${periodoNormalizado}-01T00:00:00`),
            },
          })]
        : []),
    ]);
    revalidatePath(`${rutaModulo(lote.moduloCodigo)}/borradores/${id}`);
    return { ok: true, message: "Cambios guardados." };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("aplicarCambiosBorradorModulo", e) };
  }
}

// ============================================================
// PROMOVER el borrador a oficial (staging → detalle) + purga.
// ============================================================
export async function cargarBorradorModulo(_prev: ActionState | undefined, formData: FormData): Promise<ActionState & { encabezadoId?: number }> {
  const authz = await authorizePermiso("modulos_datos:crear");
  if (!authz.ok) return { ok: false, message: authz.message };
  const loteId = String(formData.get("loteId") ?? "").trim();
  if (!loteId) return { ok: false, message: "Borrador inválido." };
  const periodo = String(formData.get("periodo") ?? "").trim();
  if (!/^\d{4}-\d{2}$/.test(periodo)) return { ok: false, message: "Indica el período (p. ej. 2026-03)." };
  const observaciones = String(formData.get("observaciones") ?? "").trim().slice(0, 4000) || null;
  try {
    // Reintento idempotente: si el navegador perdió la respuesta después del
    // commit, el lote ya no existe pero su encabezado conserva el mismo UUID.
    const yaPromovido = await prisma.moduloDatoEncabezado.findUnique({
      where: { loteId },
      select: { id: true, clienteId: true, version: true },
    });
    if (yaPromovido) {
      const scope = await authorizePermiso("modulos_datos:crear", { clientId: yaPromovido.clienteId });
      if (!scope.ok) return { ok: false, message: scope.message };
      return { ok: true, encabezadoId: yaPromovido.id, message: `La versión v${yaPromovido.version} ya había sido cargada.` };
    }

    const lote = await prisma.moduloImportacionLote.findUnique({
      where: { loteId },
      select: { clienteId: true, moduloCodigo: true },
    });
    if (!lote?.clienteId) return { ok: false, message: "El borrador ya no existe o no tiene cliente." };
    const scope = await authorizePermiso("modulos_datos:crear", { clientId: lote.clienteId });
    if (!scope.ok) return { ok: false, message: scope.message };
    const descriptor = descriptorModulo(lote.moduloCodigo);
    if (!descriptor) return { ok: false, message: "Módulo no soportado." };

    // Checklist de verificación (novedades): TODAS las preguntas del descriptor deben venir
    // respondidas (si | no | na). Se guarda id → { respuesta, nota }.
    const verifSchema = z.record(z.string(), z.object({ respuesta: z.enum(["si", "no", "na"]), nota: z.string().max(1000).optional() }));
    let verificaciones: Record<string, { respuesta: "si" | "no" | "na"; nota?: string }> = {};
    const verifRaw = formData.get("verificaciones");
    if (typeof verifRaw === "string" && verifRaw.trim()) {
      const parsed = verifSchema.safeParse(JSON.parse(verifRaw));
      if (!parsed.success) return { ok: false, message: "Respuestas de verificación inválidas." };
      verificaciones = parsed.data;
    }
    const faltan = (descriptor.verificaciones ?? []).filter((v) => !verificaciones[v.id]);
    if (faltan.length) return { ok: false, message: "Responde todas las verificaciones antes de cargar." };

    const cliente = await prisma.client.findUnique({ where: { id: lote.clienteId }, select: { name: true } });
    if (!cliente) return { ok: false, message: "El cliente ya no existe." };
    const user = await getCurrentUser();

    const resultado = await transaccionSerializable(async (tx) => {
      await tomarCandadoTransaccion(tx, `modulo-promocion:${loteId}`);

      const existente = await tx.moduloDatoEncabezado.findUnique({
        where: { loteId },
        select: { id: true, version: true, filas: true, total: true },
      });
      if (existente) return { encabezadoId: existente.id, version: existente.version, filas: existente.filas, total: Number(existente.total), reutilizado: true };

      await tomarCandadoTransaccion(tx, `modulo-borrador:${loteId}`);
      const loteActual = await tx.moduloImportacionLote.findUnique({
        where: { loteId },
        select: {
          id: true,
          clienteId: true,
          moduloCodigo: true,
          archivoNombre: true,
          archivoTam: true,
          origenExtraccion: true,
        },
      });
      if (!loteActual || loteActual.clienteId == null || loteActual.clienteId !== lote.clienteId || loteActual.moduloCodigo !== lote.moduloCodigo) {
        throw new Error("El borrador cambió durante la carga o ya no existe; no se creó ninguna versión.");
      }

      const filasBD = await tx.moduloImportacionStaging.findMany({ where: { loteId }, orderBy: { filaNum: "asc" } });
      if (filasBD.length === 0) throw new Error("El borrador no tiene filas.");
      const filas: FilaStagingModulo[] = filasBD.map((f) => ({
        filaNum: f.filaNum,
        clasificador: f.clasificador,
        valor: Number(f.valor),
        datos: (f.datos ?? {}) as Record<string, unknown>,
        tipoFila: f.tipoFila,
        omitida: f.omitida,
      }));
      const columnasNumericas = descriptor.columnas
        .filter((c) => c.tipo === "numero" || c.tipo === "moneda")
        .map((c) => c.nombre);
      const promocion = promoverStaging(filas, columnasNumericas);
      if (promocion.filas === 0) {
        throw new Error("No hay filas imputables para cargar (todas omitidas, agrupadoras o en cero).");
      }

      // Serializa el consecutivo y el cambio de versión vigente para este grupo.
      await tomarCandadoTransaccion(tx, `modulo-cargue:${loteActual.clienteId}:${loteActual.moduloCodigo}:${periodo}`);
      const previa = await tx.moduloDatoEncabezado.findFirst({
        where: { clienteId: loteActual.clienteId, moduloCodigo: loteActual.moduloCodigo, periodo },
        orderBy: [{ version: "desc" }, { id: "desc" }],
        select: { version: true },
      });
      const version = (previa?.version ?? 0) + 1;

      // Cada confirmación es una fotografía independiente. Ningún detalle se
      // anexa a una versión anterior: las anteriores quedan como historial.
      await tx.moduloDatoEncabezado.updateMany({
        where: { clienteId: loteActual.clienteId, moduloCodigo: loteActual.moduloCodigo, periodo, esOficial: true },
        data: { esOficial: false },
      });
      const ahora = new Date();
      const enc = await tx.moduloDatoEncabezado.create({
        data: {
          moduloCodigo: loteActual.moduloCodigo,
          loteId,
          clienteId: loteActual.clienteId,
          nombreCliente: cliente.name,
          periodo,
          version,
          esOficial: true,
          filas: promocion.filas,
          total: promocion.total,
          archivoNombre: loteActual.archivoNombre,
          archivoTam: loteActual.archivoTam,
          origenExtraccion: loteActual.origenExtraccion,
          observaciones,
          verificaciones: verificaciones as Prisma.InputJsonValue,
          cargadoPor: user?.name ?? null,
          cargadoPorId: user?.id ?? null,
          ultimaCarga: ahora,
          detalles: {
            create: promocion.detalle.map((d) => ({
              filaNum: d.filaNum,
              clasificador: d.clasificador,
              valor: d.valor,
              datos: d.datos as Prisma.InputJsonValue,
            })),
          },
        },
        select: { id: true },
      });

      await tx.comment.updateMany({
        where: { entityType: "modulos_borrador", entityId: loteActual.id },
        data: { entityType: "modulos_datos", entityId: enc.id },
      });
      const stagingEliminado = await tx.moduloImportacionStaging.deleteMany({ where: { loteId } });
      if (stagingEliminado.count === 0) throw new Error("No se pudo consumir el detalle del borrador; la promoción fue revertida.");
      const loteEliminado = await tx.moduloImportacionLote.deleteMany({ where: { loteId } });
      if (loteEliminado.count !== 1) throw new Error("No se pudo consumir el encabezado del borrador; la promoción fue revertida.");

      return { encabezadoId: enc.id, version, filas: promocion.filas, total: promocion.total, reutilizado: false };
    }, { timeoutMs: TIMEOUT_TRANSACCION_MODULO_MS });

    const mensaje = `Nueva versión v${resultado.version} cargada (${resultado.filas} filas).`;
    if (!resultado.reutilizado) {
      await logAudit({
        user: user?.name ?? "Sistema",
        action: `CARGÓ ${descriptor.label}`,
        entity: cliente.name,
        detail: `${periodo} · v${resultado.version} · ${resultado.filas} filas · total ${resultado.total}`,
        clientId: lote.clienteId,
      });
    }
    revalidatePath(rutaModulo(lote.moduloCodigo));
    return { ok: true, encabezadoId: resultado.encabezadoId, message: mensaje };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("cargarBorradorModulo", e) };
  }
}

// ============================================================
// DESCARTAR el borrador (staging + lote).
// ============================================================
export async function descartarBorradorModulo(loteId: string): Promise<ActionState> {
  const authz = await authorizePermiso("modulos_datos:crear");
  if (!authz.ok) return { ok: false, message: authz.message };
  const id = String(loteId ?? "").trim();
  if (!id) return { ok: false, message: "Borrador inválido." };
  try {
    const lote = await prisma.moduloImportacionLote.findUnique({ where: { loteId: id }, select: { id: true, clienteId: true, moduloCodigo: true } });
    if (!lote) return { ok: true, message: "El borrador ya no existía." };
    if (lote.clienteId) {
      const scope = await authorizePermiso("modulos_datos:crear", { clientId: lote.clienteId });
      if (!scope.ok) return { ok: false, message: scope.message };
    }
    await prisma.$transaction([
      prisma.comment.deleteMany({ where: { entityType: "modulos_borrador", entityId: lote.id } }),
      prisma.moduloImportacionStaging.deleteMany({ where: { loteId: id } }),
      prisma.moduloImportacionLote.deleteMany({ where: { loteId: id } }),
    ]);
    revalidatePath(rutaModulo(lote.moduloCodigo));
    return { ok: true, message: "Borrador descartado." };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("descartarBorradorModulo", e) };
  }
}

// ============================================================
// CONSOLIDACIÓN por cliente: clasificador → cuenta de 4 díg (upsert / borrar).
// ============================================================
function normalizarCuenta4(v: string): string {
  return String(v ?? "").replace(/\D/g, "").slice(0, 4);
}


// Normaliza + deduplica un conjunto de cuentas de 4 díg de un clasificador.
function normalizarCuentas4(cuentas: string[]): string[] {
  return [...new Set((cuentas ?? []).map(normalizarCuenta4).filter((c) => c.length === 4))];
}

// Valida que TODAS las cuentas del conjunto sean de 4 díg y del módulo (una vez).
async function validarCuentas4Modulo(moduloCodigo: string, cuentas: string[]): Promise<ActionState | null> {
  const invalidaLargo = cuentas.find((c) => c.length !== 4);
  if (invalidaLargo) return { ok: false, message: "Cada cuenta debe ser de 4 dígitos." };
  const prefijos = prefijosCuentaModulo(moduloCodigo, await getCatalogoPrevalidador());
  const fuera = cuentas.find((c) => !cuenta4DelModulo(c, prefijos));
  if (fuera) {
    const listado = prefijos.length ? prefijos.join(", ") : "—";
    return { ok: false, message: `La cuenta ${fuera} no pertenece al módulo ${moduloCodigo}. Usa una cuenta de estos prefijos: ${listado}.` };
  }
  return null;
}

// Reemplaza el CONJUNTO de cuentas de un clasificador dentro de una transacción (tx):
// borra las que ya tenía y crea las nuevas. Conjunto vacío = deja el clasificador sin cuenta.
function reemplazarCuentasTx(tx: Prisma.TransactionClient, clienteId: number, moduloCodigo: string, clasificador: string, cuentas: string[], actor: string | null) {
  return [
    tx.consolidacionModuloCliente.deleteMany({ where: { clienteId, moduloCodigo, clasificador } }),
    ...(cuentas.length
      ? [tx.consolidacionModuloCliente.createMany({ data: cuentas.map((cuenta4) => ({ clienteId, moduloCodigo, clasificador, cuenta4, actualizadoPor: actor })) })]
      : []),
  ];
}

// Bitácora de la consolidación: una sola pulsación puede reescribir decenas de
// clasificadores (asignación masiva), así que queda registrado el alcance.
async function auditarConsolidacion(clienteId: number, moduloCodigo: string, filas: { cuentas4: string[] }[]) {
  const [user, cliente] = await Promise.all([
    getCurrentUser(),
    prisma.client.findUnique({ where: { id: clienteId }, select: { name: true } }),
  ]);
  const cuentas = filas.reduce((n, f) => n + f.cuentas4.length, 0);
  await logAudit({
    user: user?.name ?? "Sistema",
    action: "ACTUALIZÓ consolidación de módulo",
    entity: cliente?.name ?? `Cliente ${clienteId}`,
    detail: `${moduloCodigo} · ${filas.length} clasificador(es) · ${cuentas} cuenta(s)`,
    clientId: clienteId,
  });
}

/** Guarda el conjunto de cuentas (1..N) de UN clasificador (reemplaza lo anterior). */
export async function guardarConsolidacionModulo(input: { clienteId: number; moduloCodigo: string; clasificador: string; cuentas4: string[] }): Promise<ActionState> {
  const moduloCodigo = String(input.moduloCodigo ?? "").trim().toUpperCase();
  if (!descriptorModulo(moduloCodigo)) return { ok: false, message: "Módulo no soportado." };
  const authz = await authorizePermiso("modulos_datos:editar", { clientId: input.clienteId });
  if (!authz.ok) return { ok: false, message: authz.message };
  const clasificador = String(input.clasificador ?? "").trim();
  if (!clasificador) return { ok: false, message: "Indica el clasificador." };
  const cuentas4 = normalizarCuentas4(input.cuentas4);
  const invalida = await validarCuentas4Modulo(moduloCodigo, cuentas4);
  if (invalida) return invalida;
  try {
    const user = await getCurrentUser();
    await prisma.$transaction(reemplazarCuentasTx(prisma, input.clienteId, moduloCodigo, clasificador, cuentas4, user?.name ?? null));
    await auditarConsolidacion(input.clienteId, moduloCodigo, [{ cuentas4 }]);
    revalidatePath(rutaModulo(moduloCodigo));
    return { ok: true, message: "Consolidación guardada." };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("guardarConsolidacionModulo", e) };
  }
}

/** Guarda de una vez el conjunto de cuentas de varios clasificadores (reemplaza cada uno). */
export async function guardarConsolidacionModuloLote(input: {
  clienteId: number;
  moduloCodigo: string;
  filas: { clasificador: string; cuentas4: string[] }[];
}): Promise<ActionState> {
  const moduloCodigo = String(input.moduloCodigo ?? "").trim().toUpperCase();
  if (!descriptorModulo(moduloCodigo)) return { ok: false, message: "Módulo no soportado." };
  const authz = await authorizePermiso("modulos_datos:editar", { clientId: input.clienteId });
  if (!authz.ok) return { ok: false, message: authz.message };

  const filas = (input.filas ?? [])
    .map((f) => ({ clasificador: String(f.clasificador ?? "").trim(), cuentas4: normalizarCuentas4(f.cuentas4) }))
    .filter((f) => f.clasificador);
  if (filas.length === 0) return { ok: false, message: "No hay cambios para guardar." };

  const invalida = await validarCuentas4Modulo(moduloCodigo, filas.flatMap((f) => f.cuentas4));
  if (invalida) return invalida;

  try {
    const user = await getCurrentUser();
    const actor = user?.name ?? null;
    await prisma.$transaction(filas.flatMap((f) => reemplazarCuentasTx(prisma, input.clienteId, moduloCodigo, f.clasificador, f.cuentas4, actor)));
    await auditarConsolidacion(input.clienteId, moduloCodigo, filas);
    revalidatePath(rutaModulo(moduloCodigo));
    return { ok: true, message: filas.length === 1 ? "Consolidación guardada." : `${filas.length} consolidaciones guardadas.` };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("guardarConsolidacionModuloLote", e) };
  }
}
