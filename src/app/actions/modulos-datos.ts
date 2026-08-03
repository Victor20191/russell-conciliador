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
import { mensajeErrorBD } from "@/lib/errores";
import type { ActionState } from "@/lib/definitions";
import { ingerir, type CeldaCruda } from "@/lib/balance/extraccion/ingesta";
import { calcularHuella, huellasCandidatas } from "@/lib/balance/extraccion/huella";
import { descriptorModulo } from "@/lib/modulos/descriptores";
import { SpecModuloSchema, type SpecModulo } from "@/lib/modulos/extraccion/esquema";
import { sugerirSpec } from "@/lib/modulos/extraccion/sugerir";
import { transformarModulo } from "@/lib/modulos/extraccion/transformar";
import { promoverStaging, type FilaStagingModulo } from "@/lib/modulos/promocion";

const rutaModulo = (codigo: string) => `/modulos/${codigo.toLowerCase()}`;
const fechaISO = (v: FormDataEntryValue | null): Date | null => {
  const s = typeof v === "string" ? v.trim() : "";
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T00:00:00`) : null;
};

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
    const ingesta = await ingerir(await archivo.arrayBuffer(), archivo.name);
    if (ingesta.modo !== "tabular") return { ok: false, message: "Por ahora solo se admiten archivos tabulares (Excel/CSV)." };
    const hojaElegida = String(formData.get("hoja") ?? "").trim();
    const hoja = ingesta.hojas.find((h) => h.nombre === hojaElegida) ?? ingesta.hojas[0];
    if (!hoja) return { ok: false, message: "El archivo no tiene hojas legibles." };

    // Spec de partida: perfil por huella si existe, si no el heurístico.
    const candidatas = huellasCandidatas([hoja]);
    const perfil = candidatas.length
      ? await prisma.perfilCargaModulo.findFirst({ where: { clienteId, moduloCodigo, huella: { in: candidatas.map((c) => c.huella) } } })
      : null;
    const perfilSpec = perfil ? SpecModuloSchema.safeParse(perfil.specJson) : null;
    const spec = perfilSpec?.success ? perfilSpec.data : sugerirSpec(descriptor, hoja);
    const origen: "perfil" | "ia" = perfilSpec?.success ? "perfil" : "ia";

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

    const ingesta = await ingerir(await archivo.arrayBuffer(), archivo.name);
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
      origen = "manual";
    } else {
      const candidatas = huellasCandidatas([hoja]);
      const perfil = candidatas.length
        ? await prisma.perfilCargaModulo.findFirst({ where: { clienteId, moduloCodigo, huella: { in: candidatas.map((c) => c.huella) } } })
        : null;
      const perfilSpec = perfil ? SpecModuloSchema.safeParse(perfil.specJson) : null;
      if (perfilSpec?.success) { spec = perfilSpec.data; origen = "perfil"; }
      else { spec = sugerirSpec(descriptor, hoja); origen = "ia"; }
    }

    const resultado = transformarModulo(descriptor, spec, hoja);
    if (resultado.filas.length === 0) return { ok: false, message: "No se leyeron filas con el mapeo actual. Ajusta las columnas." };

    const loteId = randomUUID();
    const huella = calcularHuella(hoja.nombre, hoja.filas[spec.filaEncabezado - 1] ?? []);
    const user = await getCurrentUser();

    await prisma.$transaction(async (tx) => {
      const LOTE = 1000;
      for (let i = 0; i < resultado.filas.length; i += LOTE) {
        await tx.moduloImportacionStaging.createMany({
          data: resultado.filas.slice(i, i + LOTE).map((f) => ({
            loteId, moduloCodigo, clienteId, hoja: hoja.nombre, filaNum: f.filaNum,
            clasificador: f.clasificador, valor: f.valor, datos: f.datos, tipoFila: f.tipoFila,
          })),
        });
      }
      await tx.moduloImportacionLote.create({
        data: {
          moduloCodigo, loteId, clienteId, archivoNombre: archivo.name,
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
export async function aplicarCambiosBorradorModulo(loteId: string, cambios: { filaNum: number; tipoFila?: string; omitida?: boolean | null }[]): Promise<ActionState> {
  const authz = await authorizePermiso("modulos_datos:crear");
  if (!authz.ok) return { ok: false, message: authz.message };
  const id = String(loteId ?? "").trim();
  if (!id) return { ok: false, message: "Borrador inválido." };
  try {
    const lote = await prisma.moduloImportacionLote.findUnique({ where: { loteId: id }, select: { clienteId: true, moduloCodigo: true } });
    if (!lote?.clienteId) return { ok: false, message: "El borrador ya no existe o no tiene cliente." };
    const scope = await authorizePermiso("modulos_datos:crear", { clientId: lote.clienteId });
    if (!scope.ok) return { ok: false, message: scope.message };
    await prisma.$transaction(
      cambios.filter((c) => Number.isInteger(c.filaNum)).map((c) =>
        prisma.moduloImportacionStaging.updateMany({
          where: { loteId: id, filaNum: c.filaNum },
          data: {
            ...(c.tipoFila === "agrupadora" || c.tipoFila === "movimiento" ? { tipoFila: c.tipoFila, tipoFilaForzado: c.tipoFila } : {}),
            ...(c.omitida !== undefined ? { omitida: c.omitida } : {}),
          },
        }),
      ),
    );
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
  if (!periodo) return { ok: false, message: "Indica el período (p. ej. 2026-03)." };
  const observaciones = String(formData.get("observaciones") ?? "").trim().slice(0, 4000) || null;
  try {
    const lote = await prisma.moduloImportacionLote.findUnique({ where: { loteId }, select: { clienteId: true, moduloCodigo: true, periodoInicial: true, periodoFinal: true } });
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

    const filasBD = await prisma.moduloImportacionStaging.findMany({ where: { loteId }, orderBy: { filaNum: "asc" } });
    if (filasBD.length === 0) return { ok: false, message: "El borrador no tiene filas." };
    const filas: FilaStagingModulo[] = filasBD.map((f) => ({
      filaNum: f.filaNum, clasificador: f.clasificador, valor: Number(f.valor),
      datos: (f.datos ?? {}) as Record<string, unknown>, tipoFila: f.tipoFila, omitida: f.omitida,
    }));
    // Renglones TODO en cero (todas las columnas numéricas en 0) no se llevan al definitivo.
    const columnasNumericas = descriptor.columnas.filter((c) => c.tipo === "numero" || c.tipo === "moneda").map((c) => c.nombre);
    const { detalle, total, filas: nFilas } = promoverStaging(filas, columnasNumericas);
    if (nFilas === 0) return { ok: false, message: "No hay filas imputables para cargar (todas omitidas, agrupadoras o en cero)." };

    const user = await getCurrentUser();
    const encabezadoId = await prisma.$transaction(async (tx) => {
      const previa = await tx.moduloDatoEncabezado.findFirst({
        where: { clienteId: lote.clienteId!, moduloCodigo: lote.moduloCodigo, periodo }, orderBy: { version: "desc" }, select: { version: true },
      });
      const version = (previa?.version ?? 0) + 1;
      const enc = await tx.moduloDatoEncabezado.create({
        data: {
          moduloCodigo: lote.moduloCodigo, loteId, clienteId: lote.clienteId!, nombreCliente: cliente.name,
          periodo, version, esOficial: true, filas: nFilas, total,
          observaciones, verificaciones: verificaciones as Prisma.InputJsonValue,
          cargadoPor: user?.name ?? null, cargadoPorId: user?.id ?? null,
          detalles: { create: detalle.map((d) => ({ filaNum: d.filaNum, clasificador: d.clasificador, valor: d.valor, datos: d.datos as Prisma.InputJsonValue })) },
        },
        select: { id: true },
      });
      // Purga del borrador (staging + lote): ambos deben desaparecer con el commit.
      await tx.moduloImportacionStaging.deleteMany({ where: { loteId } });
      await tx.moduloImportacionLote.deleteMany({ where: { loteId } });
      return enc.id;
    });

    await logAudit({ user: user?.name ?? "Sistema", action: `CARGÓ ${descriptor.label}`, entity: cliente.name, detail: `${periodo} · ${nFilas} filas · total ${total}` });
    revalidatePath(rutaModulo(lote.moduloCodigo));
    return { ok: true, encabezadoId, message: `${descriptor.label} cargado (${nFilas} filas).` };
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
    const lote = await prisma.moduloImportacionLote.findUnique({ where: { loteId: id }, select: { clienteId: true, moduloCodigo: true } });
    if (!lote) return { ok: true, message: "El borrador ya no existía." };
    if (lote.clienteId) {
      const scope = await authorizePermiso("modulos_datos:crear", { clientId: lote.clienteId });
      if (!scope.ok) return { ok: false, message: scope.message };
    }
    await prisma.$transaction([
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
export async function guardarConsolidacionModulo(input: { clienteId: number; moduloCodigo: string; clasificador: string; cuenta4: string }): Promise<ActionState> {
  const moduloCodigo = String(input.moduloCodigo ?? "").trim().toUpperCase();
  if (!descriptorModulo(moduloCodigo)) return { ok: false, message: "Módulo no soportado." };
  const authz = await authorizePermiso("modulos_datos:editar", { clientId: input.clienteId });
  if (!authz.ok) return { ok: false, message: authz.message };
  const clasificador = String(input.clasificador ?? "").trim();
  const cuenta4 = String(input.cuenta4 ?? "").replace(/\D/g, "").slice(0, 4);
  if (!clasificador) return { ok: false, message: "Indica el clasificador." };
  if (cuenta4.length !== 4) return { ok: false, message: "La cuenta debe ser de 4 dígitos." };
  try {
    const user = await getCurrentUser();
    await prisma.consolidacionModuloCliente.upsert({
      where: { clienteId_moduloCodigo_clasificador: { clienteId: input.clienteId, moduloCodigo, clasificador } },
      create: { clienteId: input.clienteId, moduloCodigo, clasificador, cuenta4, actualizadoPor: user?.name ?? null },
      update: { cuenta4, actualizadoPor: user?.name ?? null },
    });
    revalidatePath("/config/modulos-datos");
    return { ok: true, message: "Consolidación guardada." };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("guardarConsolidacionModulo", e) };
  }
}
