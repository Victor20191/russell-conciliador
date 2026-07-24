"use server";

import { createHash } from "node:crypto";
import * as z from "zod";
import { revalidatePath, updateTag } from "next/cache";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/dal";
import { logAudit } from "@/lib/audit";
import { authorizePermiso } from "@/lib/rbac";
import { mensajeErrorBD } from "@/lib/errores";
import { VERSION_APP_CACHE_TAG } from "@/lib/version-app-servidor";
import { completarTextoGemini, mensajeErrorGemini } from "@/lib/gemini";
import {
  MODELO_REPORTE_NOVEDADES,
  TEMPERATURA_REPORTE_NOVEDADES,
  VERSION_PROMPT_REPORTE_NOVEDADES,
  type ReporteNovedades,
  type UsoOpenRouterReporte,
} from "@/lib/novedades/reportes";
import {
  VersionCreateSchema,
  VersionUpdateSchema,
  VersionDeleteSchema,
  ChangeCreateSchema,
  ChangeUpdateSchema,
  ChangeDeleteSchema,
  ReporteNovedadesScopeSchema,
  type ReporteNovedadesScope,
  type ActionState,
} from "@/lib/definitions";

// CRUD del módulo de NOVEDADES (changelog + control de versiones). Admin-only:
// el gate es `novedades:administrar`. Una VERSIÓN (encabezado) agrupa varios
// CAMBIOS (detalle). Cada movimiento queda en el registro GLOBAL de auditoría
// (/auditoria) vía logAudit (no necesita bitácora dedicada). Patrón de Server
// Action idéntico a src/app/actions/standard-accounts.ts.
const PATH = "/novedades";
const PERMISO = "novedades:administrar";
const PERMISO_VER = "novedades:ver";
const MAX_CAMBIOS_PROMPT = 80;
const MAX_CACHE_MEMORIA = 20;

/** Invalida el badge de versión del cascarón (layout) y la página de novedades. */
function revalidarVersionApp() {
  updateTag(VERSION_APP_CACHE_TAG);
  revalidatePath(PATH);
  // El layout de la app lee getVersionApp(): fuerza re-render del shell.
  revalidatePath("/", "layout");
}

type ReporteCacheado = {
  report: ReporteNovedades;
  generatedAt: string;
  totalVersions: number;
  totalChanges: number;
};

type ConteoReporte = {
  nombre: string;
  total: number;
};

type ResumenFactualReporte = {
  totalVersiones: number;
  totalCambios: number;
  cambiosIncluidos: number;
  modulosDocumentados: string[];
  rutasDocumentadas: string[];
  cambiosPorTipo: ConteoReporte[];
  cambiosPorEstadoFuncionalidad: ConteoReporte[];
};

const cacheReportesMemoria = new Map<string, ReporteCacheado>();

export type GenerarReporteNovedadesResult =
  | {
      ok: true;
      report: ReporteNovedades;
      model: string;
      generatedAt: string;
      usage?: UsoOpenRouterReporte;
      totalVersions: number;
      totalChanges: number;
    }
  | { ok: false; message: string };

type VersionReporteContexto = {
  numero: string;
  titulo: string;
  resumen: string | null;
  estado: string;
  publicadoEn: string | null;
  cambios: Array<{
    tipo: string;
    titulo: string;
    descripcion: string;
    modulo: string | null;
    ruta: string | null;
    comoOperar: string | null;
    ejemplo: string | null;
    estadoFuncionalidad: string;
  }>;
};

function recortarTexto(texto: string | null | undefined, max: number): string | null {
  if (!texto) return null;
  const limpio = texto.trim();
  if (limpio.length <= max) return limpio;
  return `${limpio.slice(0, max - 1).trim()}…`;
}

function crearContextoReporte(
  versiones: Array<{
    number: string;
    title: string;
    summary: string | null;
    status: string;
    releasedAt: Date | null;
    changes: Array<{
      type: string;
      title: string;
      description: string;
      moduleKey: string | null;
      route: string | null;
      howTo: string | null;
      example: string | null;
      featureStatus: string;
    }>;
  }>,
): { contexto: VersionReporteContexto[]; totalChanges: number; includedChanges: number } {
  let includedChanges = 0;
  let totalChanges = 0;

  const contexto: VersionReporteContexto[] = versiones.map((version) => {
    totalChanges += version.changes.length;
    const cambios = version.changes
      .filter(() => {
        if (includedChanges >= MAX_CAMBIOS_PROMPT) return false;
        includedChanges += 1;
        return true;
      })
      .map((change) => ({
        tipo: change.type,
        titulo: recortarTexto(change.title, 180) ?? "",
        descripcion: recortarTexto(change.description, 700) ?? "",
        modulo: recortarTexto(change.moduleKey, 80),
        ruta: recortarTexto(change.route, 120),
        comoOperar: recortarTexto(change.howTo, 450),
        ejemplo: recortarTexto(change.example, 450),
        estadoFuncionalidad: change.featureStatus,
      }));

    return {
      numero: version.number,
      titulo: recortarTexto(version.title, 180) ?? "",
      resumen: recortarTexto(version.summary, 500),
      estado: version.status,
      publicadoEn: version.releasedAt ? version.releasedAt.toISOString() : null,
      cambios,
    };
  });

  return { contexto, totalChanges, includedChanges };
}

function ordenarUnicos(valores: Array<string | null | undefined>): string[] {
  return Array.from(new Set(valores.map((valor) => valor?.trim()).filter((valor): valor is string => Boolean(valor))))
    .sort((a, b) => a.localeCompare(b, "es"));
}

function contarValores(valores: Array<string | null | undefined>): ConteoReporte[] {
  const conteo = new Map<string, number>();
  for (const valor of valores) {
    const limpio = valor?.trim();
    if (!limpio) continue;
    conteo.set(limpio, (conteo.get(limpio) ?? 0) + 1);
  }
  return Array.from(conteo.entries())
    .map(([nombre, total]) => ({ nombre, total }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

function crearResumenFactual(params: {
  contexto: VersionReporteContexto[];
  totalVersions: number;
  totalChanges: number;
  includedChanges: number;
}): ResumenFactualReporte {
  const cambios = params.contexto.flatMap((version) => version.cambios);
  return {
    totalVersiones: params.totalVersions,
    totalCambios: params.totalChanges,
    cambiosIncluidos: params.includedChanges,
    modulosDocumentados: ordenarUnicos(cambios.map((cambio) => cambio.modulo)),
    rutasDocumentadas: ordenarUnicos(cambios.map((cambio) => cambio.ruta)),
    cambiosPorTipo: contarValores(cambios.map((cambio) => cambio.tipo)),
    cambiosPorEstadoFuncionalidad: contarValores(cambios.map((cambio) => cambio.estadoFuncionalidad)),
  };
}

function crearHuellaReporte(payload: unknown): string {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

function crearSeedReporte(huella: string): number {
  return Number.parseInt(huella.slice(0, 8), 16) & 0x7fffffff;
}

function leerCacheMemoria(huella: string): ReporteCacheado | null {
  return cacheReportesMemoria.get(huella) ?? null;
}

function guardarCacheMemoria(huella: string, cacheado: ReporteCacheado): void {
  if (cacheReportesMemoria.size >= MAX_CACHE_MEMORIA) {
    const primero = cacheReportesMemoria.keys().next().value;
    if (primero) cacheReportesMemoria.delete(primero);
  }
  cacheReportesMemoria.set(huella, cacheado);
}

function esCachePersistenteNoDisponible(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : "";
  return /P2021|P2022|reportes_novedades_ia|does not exist|no existe/i.test(msg);
}

async function leerCachePersistente(huella: string): Promise<ReporteCacheado | null> {
  try {
    const cacheado = await prisma.reporteNovedadesIA.findUnique({
      where: { huellaContexto: huella },
      select: {
        titulo: true,
        html: true,
        totalVersiones: true,
        totalCambios: true,
        actualizadoEn: true,
      },
    });

    if (!cacheado) return null;
    return {
      report: { titulo: cacheado.titulo, html: cacheado.html },
      generatedAt: cacheado.actualizadoEn.toISOString(),
      totalVersions: cacheado.totalVersiones,
      totalChanges: cacheado.totalCambios,
    };
  } catch (e) {
    if (esCachePersistenteNoDisponible(e)) return null;
    throw e;
  }
}

async function guardarCachePersistente(params: {
  huella: string;
  report: ReporteNovedades;
  totalVersions: number;
  totalChanges: number;
  includedChanges: number;
  userId: number | null;
}): Promise<ReporteCacheado | null> {
  try {
    const creado = await prisma.reporteNovedadesIA.create({
      data: {
        huellaContexto: params.huella,
        modelo: MODELO_REPORTE_NOVEDADES,
        titulo: params.report.titulo,
        html: params.report.html,
        totalVersiones: params.totalVersions,
        totalCambios: params.totalChanges,
        cambiosIncluidos: params.includedChanges,
        creadoPorId: params.userId,
      },
      select: {
        titulo: true,
        html: true,
        totalVersiones: true,
        totalCambios: true,
        creadoEn: true,
      },
    });

    return {
      report: { titulo: creado.titulo, html: creado.html },
      generatedAt: creado.creadoEn.toISOString(),
      totalVersions: creado.totalVersiones,
      totalChanges: creado.totalCambios,
    };
  } catch (e) {
    if (esCachePersistenteNoDisponible(e)) return null;
    const existente = await leerCachePersistente(params.huella);
    if (existente) return existente;
    throw e;
  }
}

function construirPromptReporte(params: {
  contexto: VersionReporteContexto[];
  resumenFactual: ResumenFactualReporte;
}): string {
  return [
    "Genera un reporte funcional detallado, listo para PDF, para la plataforma Russell Diagnóstico a partir del changelog de Novedades.",
    "",
    "Entrega exclusivamente un documento HTML completo y válido. Debe empezar con <!DOCTYPE html> y contener <html>, <head>, <style> y <body>.",
    "No incluyas Markdown, cercas de código, explicación fuera del HTML, scripts, enlaces externos, imágenes externas ni recursos remotos.",
    "",
    "Estructura visual obligatoria, inspirada en una presentación ejecutiva lista para imprimir:",
    "- Portada compacta: título, subtítulo, período de la actualización y una frase de valor.",
    "- Resumen Ejecutivo: 4 estadísticas exactas en tarjetas y 3 a 5 pilares estratégicos basados en el texto documentado.",
    "- Secciones por módulo o área funcional, cada una con subtítulo, descripción, beneficios y pasos de uso.",
    "- En cada funcionalidad conserva la misma estructura interna y desarrolla: qué es, qué situación resuelve, cómo se usa, cómo cambia el trabajo del usuario, impacto operativo y evidencia funcional.",
    "- Para cada cambio documentado escribe una explicación funcional ampliada de 1 a 2 párrafos breves o bloques equivalentes. Reserva 3 párrafos solo para cambios centrales con contexto suficiente.",
    "- Mantén cada bloque funcional entre 90 y 180 palabras cuando haya contexto suficiente; si el contexto es mínimo, redacta menos sin rellenar.",
    "- Cuando exista descripción, pasos o ejemplo, intégralos en una lectura funcional más completa sin copiar mecánicamente el texto original.",
    "- Línea de evolución o implementación escrita en lenguaje funcional, no técnico.",
    "- Beneficios tangibles, impacto general y próximos pasos sugeridos.",
    "- Footer discreto: Reporte generado desde Novedades - Russell Diagnóstico.",
    "",
    "Reglas de diseño del HTML:",
    "- Usa CSS autocontenido dentro de <style>.",
    "- Optimiza para PDF en tamaño carta: márgenes limpios, secciones con break-inside: avoid y @media print.",
    "- Usa tarjetas, tablas visuales simples o barras CSS solo con los conteos exactos de la base factual.",
    "- Mantén un estilo sobrio, ejecutivo y funcional, compatible con la identidad Russell.",
    "",
    "Reglas editoriales obligatorias:",
    "- Escribe en español de Colombia, con tono ejecutivo y claro para usuarios no técnicos.",
    "- Usa únicamente las funcionalidades, rutas y módulos del JSON de contexto. No inventes módulos ni rutas.",
    "- Usa únicamente los números de la base factual exacta. No inventes porcentajes, ahorros, costos, tiempos, fechas, cantidades, niveles de avance ni métricas.",
    "- Puedes interpretar la intención funcional, el problema operativo y el beneficio esperado solo cuando se desprendan directamente del título, descripción, cómo operar, ejemplo, módulo o ruta documentados.",
    "- Distingue claramente interpretación funcional de dato factual: no presentes inferencias como mediciones, decisiones oficiales o compromisos del producto.",
    "- Si una funcionalidad tiene poco contexto, amplía con explicación de uso y alcance usando lenguaje prudente, pero no agregues capacidades no documentadas.",
    "- No incluyas hashes de commit, nombres de ramas, nombres de archivos, tablas, columnas, migraciones, funciones, clases, librerías, código, APIs internas, tokens, costos técnicos ni detalles de arquitectura.",
    "- Si el contexto trae datos técnicos, conviértelos a una explicación funcional o descártalos si no aportan al usuario del PDF.",
    "- Puedes mencionar una ruta interna solo como ubicación de uso, por ejemplo: Configuración > Clientes o /config/clientes.",
    "- No uses expresiones como implementación técnica, arquitectura, modelo de datos, pipeline, Prisma, cache, endpoint, Server Action, componente, migración, commit o repositorio.",
    "- Si un dato no está en el contexto, escribe No documentado en Novedades o elimina ese detalle.",
    "- Enfócate en qué cambió, cómo se usa, qué problema resuelve, impacto operativo y beneficios para el proceso de auditoría/diagnóstico.",
    "- No menciones que recibiste un JSON ni que estás generando una respuesta con IA.",
    "- Mantén el orden de versiones y cambios entregado en el contexto.",
    "- Mantén la misma estructura visual para que regeneraciones con el mismo contexto sean consistentes.",
    "- No cambies la estructura general del reporte: solo aumenta la profundidad de las explicaciones dentro de cada bloque funcional.",
    "",
    "Base factual exacta:",
    JSON.stringify(params.resumenFactual),
    "",
    "Contexto JSON:",
    JSON.stringify(params.contexto),
  ].join("\n");
}

function esSaturacionProveedor(e: unknown): boolean {
  const status = e && typeof e === "object" && "status" in e ? (e as { status?: unknown }).status : undefined;
  const msg = e instanceof Error ? e.message : "";
  return (
    status === 429 ||
    status === 502 ||
    status === 503 ||
    /ResourceExhausted|request limit reached|rate limit|quota|overloaded|unavailable|temporarily/i.test(msg)
  );
}

function esperar(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function limpiarCercasCodigo(texto: string): string {
  return texto
    .trim()
    .replace(/^```(?:html)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function escapeHtml(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function extraerDocumentoHtml(texto: string): string {
  const limpio = limpiarCercasCodigo(texto);
  const doctypeIndex = limpio.search(/<!doctype/i);
  const htmlIndex = limpio.search(/<html[\s>]/i);
  const inicio = [doctypeIndex, htmlIndex].filter((index) => index >= 0).sort((a, b) => a - b)[0];
  return inicio === undefined ? limpio : limpio.slice(inicio).trim();
}

function sanitizarHtmlReporte(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, "")
    .replace(/<object[\s\S]*?<\/object>/gi, "")
    .replace(/<embed[\s\S]*?>/gi, "")
    .replace(/<link[\s\S]*?>/gi, "")
    .replace(/\s+on[a-z]+\s*=\s*"[^"]*"/gi, "")
    .replace(/\s+on[a-z]+\s*=\s*'[^']*'/gi, "")
    .replace(/\s+on[a-z]+\s*=\s*[^\s>]+/gi, "")
    .replace(/javascript:/gi, "");
}

function extraerTituloHtml(html: string): string {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1];
  const texto = (title ?? h1 ?? "Reporte detallado de funcionalidades")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return texto || "Reporte detallado de funcionalidades";
}

function envolverHtmlBasico(contenido: string): string {
  const body = /<[^>]+>/.test(contenido)
    ? contenido
    : `<main><h1>Reporte detallado de funcionalidades</h1><pre>${escapeHtml(contenido)}</pre></main>`;

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Reporte detallado de funcionalidades</title>
<style>
body{margin:0;background:#f5f7fb;color:#202634;font-family:Arial,Helvetica,sans-serif;line-height:1.55}
main{max-width:1080px;margin:28px auto;background:#fff;border:1px solid #dbe3ec;border-radius:8px;padding:28px}
pre{white-space:pre-wrap;font-family:inherit}
@media print{body{background:#fff}main{border:0;margin:0;max-width:none}.section,article{break-inside:avoid}}
</style>
</head>
<body>${body}</body>
</html>`;
}

function normalizarReporteHtml(texto: string): ReporteNovedades {
  const extraido = extraerDocumentoHtml(texto);
  if (!extraido.trim()) throw new Error("Gemini no devolvió HTML válido.");

  let html = sanitizarHtmlReporte(extraido);
  if (!/<html[\s>]/i.test(html)) html = envolverHtmlBasico(html);
  if (!/<\/body>/i.test(html) || !/<\/html>/i.test(html)) {
    throw new Error("Gemini devolvió HTML incompleto.");
  }
  if (!/^<!doctype/i.test(html.trim())) html = `<!DOCTYPE html>\n${html}`;

  if (!/<body[\s>]/i.test(html)) {
    html = /<\/head>/i.test(html)
      ? html.replace(/<\/head>/i, "</head>\n<body>")
      : html.replace(/<html([^>]*)>/i, "<html$1>\n<body>");
  }
  if (!/<\/body>/i.test(html)) {
    html = /<\/html>/i.test(html) ? html.replace(/<\/html>/i, "</body>\n</html>") : `${html}\n</body>`;
  }
  if (!/<\/html>/i.test(html)) html += "\n</html>";

  return {
    titulo: extraerTituloHtml(html),
    html,
  };
}

export async function generarReporteFuncionalNovedades(
  opciones?: ReporteNovedadesScope,
): Promise<GenerarReporteNovedadesResult> {
  const authz = await authorizePermiso(PERMISO_VER);
  if (!authz.ok) return { ok: false, message: authz.message };

  const parsed = ReporteNovedadesScopeSchema.safeParse(opciones ?? {});
  if (!parsed.success) {
    return { ok: false, message: "El alcance del reporte no es válido." };
  }
  // Normaliza (dedup + orden) para que la huella del caché sea estable: el mismo
  // conjunto de versiones —en cualquier orden— reutiliza el reporte cacheado.
  // Sin selección → null → todas las versiones (comportamiento por defecto).
  const versionIds = parsed.data.versionIds?.length
    ? Array.from(new Set(parsed.data.versionIds)).sort((a, b) => a - b)
    : null;

  try {
    const versiones = await prisma.platformVersion.findMany({
      where: versionIds ? { id: { in: versionIds } } : undefined,
      orderBy: [{ order: "desc" }, { id: "desc" }],
      include: { changes: { orderBy: [{ order: "asc" }, { id: "asc" }] } },
    });

    if (versiones.length === 0) {
      return {
        ok: false,
        message: versionIds
          ? "No se encontraron las versiones seleccionadas."
          : "Aún no hay versiones documentadas para generar un reporte.",
      };
    }

    const { contexto, totalChanges, includedChanges } = crearContextoReporte(versiones);
    if (totalChanges === 0) {
      return {
        ok: false,
        message: versionIds
          ? "Las versiones seleccionadas no tienen cambios documentados."
          : "No hay cambios documentados para generar un reporte funcional.",
      };
    }

    const resumenFactual = crearResumenFactual({
      contexto,
      totalVersions: versiones.length,
      totalChanges,
      includedChanges,
    });
    const huellaReporte = crearHuellaReporte({
      versionPrompt: VERSION_PROMPT_REPORTE_NOVEDADES,
      modelo: MODELO_REPORTE_NOVEDADES,
      temperatura: TEMPERATURA_REPORTE_NOVEDADES,
      alcance: versionIds ?? "todas",
      resumenFactual,
      contexto,
    });
    const cacheMemoria = leerCacheMemoria(huellaReporte);
    if (cacheMemoria) {
      return {
        ok: true,
        report: cacheMemoria.report,
        model: MODELO_REPORTE_NOVEDADES,
        generatedAt: cacheMemoria.generatedAt,
        totalVersions: cacheMemoria.totalVersions,
        totalChanges: cacheMemoria.totalChanges,
      };
    }

    const cachePersistente = await leerCachePersistente(huellaReporte);
    if (cachePersistente) {
      guardarCacheMemoria(huellaReporte, cachePersistente);
      return {
        ok: true,
        report: cachePersistente.report,
        model: MODELO_REPORTE_NOVEDADES,
        generatedAt: cachePersistente.generatedAt,
        totalVersions: cachePersistente.totalVersions,
        totalChanges: cachePersistente.totalChanges,
      };
    }

    const generatedAt = new Date().toISOString();
    const prompt = construirPromptReporte({ contexto, resumenFactual });
    const seed = crearSeedReporte(huellaReporte);
    const system =
      "Eres un consultor funcional senior. Redactas reportes ejecutivos de software contable y de auditoría con precisión estricta: no agregas datos, números, fechas, rutas ni funcionalidades que no estén en el contexto.";

    let completion: Awaited<ReturnType<typeof completarTextoGemini>>;
    try {
      completion = await completarTextoGemini({
        model: MODELO_REPORTE_NOVEDADES,
        maxTokens: 56_000,
        temperature: TEMPERATURA_REPORTE_NOVEDADES,
        topP: 1,
        seed,
        timeoutMs: 300_000,
        system,
        prompt,
      });
    } catch (e) {
      if (!esSaturacionProveedor(e)) throw e;
      await esperar(1500);
      completion = await completarTextoGemini({
        model: MODELO_REPORTE_NOVEDADES,
        maxTokens: 40_000,
        temperature: TEMPERATURA_REPORTE_NOVEDADES,
        topP: 1,
        seed,
        timeoutMs: 240_000,
        system,
        prompt,
      });
    }

    const report = normalizarReporteHtml(completion.text);

    const user = await getCurrentUser();
    await logAudit({
      user: user?.name ?? "Sistema",
      action: "GENERÓ REPORTE IA",
      entity: "Novedades",
      detail: `Generó reporte funcional con ${MODELO_REPORTE_NOVEDADES} (${includedChanges}/${totalChanges} cambios enviados, ${
        versionIds ? `${versiones.length} versiones seleccionadas` : "todas las versiones"
      }).`,
    });
    const cacheado = await guardarCachePersistente({
      huella: huellaReporte,
      report,
      totalVersions: versiones.length,
      totalChanges,
      includedChanges,
      userId: user?.id ?? null,
    });
    const reporteFinal = cacheado ?? {
      report,
      generatedAt,
      totalVersions: versiones.length,
      totalChanges,
    };
    guardarCacheMemoria(huellaReporte, reporteFinal);

    return {
      ok: true,
      report: reporteFinal.report,
      model: MODELO_REPORTE_NOVEDADES,
      generatedAt: reporteFinal.generatedAt,
      usage: completion.usage,
      totalVersions: reporteFinal.totalVersions,
      totalChanges: reporteFinal.totalChanges,
    };
  } catch (e) {
    return { ok: false, message: mensajeErrorGemini("generarReporteFuncionalNovedades", e) };
  }
}

/** Lee del FormData los campos de una versión para validarlos con Zod. */
function leerVersion(formData: FormData) {
  return {
    number: formData.get("number"),
    title: formData.get("title"),
    summary: formData.get("summary"),
    status: formData.get("status"),
    order: formData.get("order"),
  };
}

/** Lee del FormData los campos de un cambio para validarlos con Zod. */
function leerCambio(formData: FormData) {
  return {
    versionId: formData.get("versionId"),
    type: formData.get("type"),
    title: formData.get("title"),
    description: formData.get("description"),
    moduleKey: formData.get("moduleKey"),
    route: formData.get("route"),
    howTo: formData.get("howTo"),
    example: formData.get("example"),
    featureStatus: formData.get("featureStatus"),
    order: formData.get("order"),
  };
}

// ============================================================
// ===== Versiones (encabezado / control de versiones) =====
// ============================================================

export async function createVersion(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  const authz = await authorizePermiso(PERMISO);
  if (!authz.ok) return { ok: false, message: authz.message };

  const parsed = VersionCreateSchema.safeParse(leerVersion(formData));
  if (!parsed.success) return { ok: false, errors: z.flattenError(parsed.error).fieldErrors };

  try {
    const dup = await prisma.platformVersion.findUnique({
      where: { number: parsed.data.number },
      select: { id: true },
    });
    if (dup) return { ok: false, message: `Ya existe una versión con el número ${parsed.data.number}.` };

    const user = await getCurrentUser();
    const { number, title, summary, status, order } = parsed.data;
    const created = await prisma.platformVersion.create({
      data: {
        number,
        title,
        summary,
        status,
        order,
        // Al publicar, sella la fecha de lanzamiento; en borrador queda sin fecha.
        releasedAt: status === "publicada" ? new Date() : null,
        createdById: user?.id ?? null,
      },
    });

    await logAudit({
      user: user?.name ?? "Sistema",
      action: "CREÓ VERSIÓN",
      entity: `Novedades · v${created.number}`,
      detail: `Creó la versión ${created.number} · ${created.title}`,
    });
    revalidarVersionApp();
    return { ok: true, message: "Versión creada." };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("createVersion", e) };
  }
}

export async function updateVersion(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  const authz = await authorizePermiso(PERMISO);
  if (!authz.ok) return { ok: false, message: authz.message };

  const parsed = VersionUpdateSchema.safeParse({ id: formData.get("id"), ...leerVersion(formData) });
  if (!parsed.success) return { ok: false, errors: z.flattenError(parsed.error).fieldErrors };

  try {
    const before = await prisma.platformVersion.findUnique({ where: { id: parsed.data.id } });
    if (!before) return { ok: false, message: "La versión no existe." };

    if (parsed.data.number !== before.number) {
      const dup = await prisma.platformVersion.findFirst({
        where: { number: parsed.data.number, NOT: { id: parsed.data.id } },
        select: { id: true },
      });
      if (dup) return { ok: false, message: `Ya existe otra versión con el número ${parsed.data.number}.` };
    }

    const { id, number, title, summary, status, order } = parsed.data;
    // Conserva la fecha si ya estaba publicada; la sella al publicar por 1ª vez;
    // la limpia si vuelve a borrador.
    const releasedAt = status === "publicada" ? before.releasedAt ?? new Date() : null;
    const after = await prisma.platformVersion.update({
      where: { id },
      data: { number, title, summary, status, order, releasedAt },
    });

    const user = await getCurrentUser();
    await logAudit({
      user: user?.name ?? "Sistema",
      action: "EDITÓ VERSIÓN",
      entity: `Novedades · v${after.number}`,
      detail: `Editó la versión ${after.number} · ${after.title}`,
    });
    revalidarVersionApp();
    return { ok: true, message: "Versión actualizada." };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("updateVersion", e) };
  }
}

export async function deleteVersion(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  const authz = await authorizePermiso(PERMISO);
  if (!authz.ok) return { ok: false, message: authz.message };

  const parsed = VersionDeleteSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return { ok: false, errors: z.flattenError(parsed.error).fieldErrors };

  try {
    const before = await prisma.platformVersion.findUnique({
      where: { id: parsed.data.id },
      include: { _count: { select: { changes: true } } },
    });
    if (!before) return { ok: false, message: "La versión no existe." };

    // FK ON DELETE CASCADE: borrar la versión arrastra todos sus cambios.
    await prisma.platformVersion.delete({ where: { id: parsed.data.id } });

    const user = await getCurrentUser();
    await logAudit({
      user: user?.name ?? "Sistema",
      action: "ELIMINÓ VERSIÓN",
      entity: `Novedades · v${before.number}`,
      detail: `Eliminó la versión ${before.number} · ${before.title} (${before._count.changes} cambios)`,
    });
    revalidarVersionApp();
    return { ok: true, message: "Versión eliminada." };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("deleteVersion", e) };
  }
}

// ============================================================
// ===== Cambios (detalle de una versión) =====
// ============================================================

export async function createChange(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  const authz = await authorizePermiso(PERMISO);
  if (!authz.ok) return { ok: false, message: authz.message };

  const parsed = ChangeCreateSchema.safeParse(leerCambio(formData));
  if (!parsed.success) return { ok: false, errors: z.flattenError(parsed.error).fieldErrors };

  try {
    const version = await prisma.platformVersion.findUnique({
      where: { id: parsed.data.versionId },
      select: { id: true, number: true },
    });
    if (!version) return { ok: false, message: "La versión indicada no existe." };

    const created = await prisma.versionChange.create({ data: parsed.data });

    const user = await getCurrentUser();
    await logAudit({
      user: user?.name ?? "Sistema",
      action: "CREÓ CAMBIO",
      entity: `Novedades · v${version.number}`,
      detail: `Agregó el cambio "${created.title}" a la versión ${version.number}`,
    });
    revalidatePath(PATH);
    return { ok: true, message: "Cambio agregado." };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("createChange", e) };
  }
}

export async function updateChange(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  const authz = await authorizePermiso(PERMISO);
  if (!authz.ok) return { ok: false, message: authz.message };

  const parsed = ChangeUpdateSchema.safeParse({ id: formData.get("id"), ...leerCambio(formData) });
  if (!parsed.success) return { ok: false, errors: z.flattenError(parsed.error).fieldErrors };

  try {
    const before = await prisma.versionChange.findUnique({
      where: { id: parsed.data.id },
      select: { id: true },
    });
    if (!before) return { ok: false, message: "El cambio no existe." };

    const version = await prisma.platformVersion.findUnique({
      where: { id: parsed.data.versionId },
      select: { id: true, number: true },
    });
    if (!version) return { ok: false, message: "La versión indicada no existe." };

    const { id, ...data } = parsed.data;
    const after = await prisma.versionChange.update({ where: { id }, data });

    const user = await getCurrentUser();
    await logAudit({
      user: user?.name ?? "Sistema",
      action: "EDITÓ CAMBIO",
      entity: `Novedades · v${version.number}`,
      detail: `Editó el cambio "${after.title}" (versión ${version.number})`,
    });
    revalidatePath(PATH);
    return { ok: true, message: "Cambio actualizado." };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("updateChange", e) };
  }
}

export async function deleteChange(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  const authz = await authorizePermiso(PERMISO);
  if (!authz.ok) return { ok: false, message: authz.message };

  const parsed = ChangeDeleteSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return { ok: false, errors: z.flattenError(parsed.error).fieldErrors };

  try {
    const before = await prisma.versionChange.findUnique({
      where: { id: parsed.data.id },
      select: { id: true, title: true, versionId: true },
    });
    if (!before) return { ok: false, message: "El cambio no existe." };

    await prisma.versionChange.delete({ where: { id: parsed.data.id } });

    const user = await getCurrentUser();
    const version = await prisma.platformVersion.findUnique({
      where: { id: before.versionId },
      select: { number: true },
    });
    await logAudit({
      user: user?.name ?? "Sistema",
      action: "ELIMINÓ CAMBIO",
      entity: `Novedades · v${version?.number ?? "?"}`,
      detail: `Eliminó el cambio "${before.title}"`,
    });
    revalidatePath(PATH);
    return { ok: true, message: "Cambio eliminado." };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("deleteChange", e) };
  }
}
