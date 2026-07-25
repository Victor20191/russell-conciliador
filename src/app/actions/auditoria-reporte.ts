"use server";

import { createHash } from "node:crypto";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/dal";
import { logAudit } from "@/lib/audit";
import { authorizePermiso } from "@/lib/rbac";
import { completarTextoGemini, mensajeErrorGemini } from "@/lib/gemini";
import {
  evaluarAdopcion,
  type CambioNovedadContexto,
} from "@/lib/auditoria/reporte-ejecutivo/adopcion";
import {
  calcularResumenUso,
  conteosPorFamiliaCanon,
  type EventoAuditoria,
} from "@/lib/auditoria/reporte-ejecutivo/metricas";
import {
  construirSeccionGraficosHtml,
  inyectarGraficosEnHtml,
} from "@/lib/auditoria/reporte-ejecutivo/graficos";
import {
  MODELO_REPORTE_EJECUTIVO_USO,
  TEMPERATURA_REPORTE_EJECUTIVO_USO,
  VERSION_PROMPT_REPORTE_EJECUTIVO_USO,
  type ReporteEjecutivoUso,
} from "@/lib/auditoria/reporte-ejecutivo/reportes";
import {
  ReporteEjecutivoUsoScopeSchema,
  type ReporteEjecutivoUsoScope,
} from "@/lib/definitions";

const PERMISO = "auditoria:reporte_ejecutivo";
const MAX_CAMBIOS_PROMPT = 80;
const MAX_CACHE_MEMORIA = 20;
/** Tope de filas de bitácora leídas para el resumen factual (agregación en memoria). */
const MAX_EVENTOS_AUDITORIA = 25_000;

export type GenerarReporteEjecutivoResult =
  | {
      ok: true;
      report: ReporteEjecutivoUso;
      model: string;
      generatedAt: string;
      totalAcciones: number;
      totalUsuarios: number;
      totalNovedades: number;
      porcentajeAdopcion: number | null;
      desdeCache: boolean;
    }
  | { ok: false; message: string };

type ReporteCacheado = {
  report: ReporteEjecutivoUso;
  generatedAt: string;
  totalAcciones: number;
  totalUsuarios: number;
  totalNovedades: number;
};

const cacheMemoria = new Map<string, ReporteCacheado>();

function recortarTexto(texto: string | null | undefined, max: number): string | null {
  if (!texto) return null;
  const limpio = texto.trim();
  if (limpio.length <= max) return limpio;
  return `${limpio.slice(0, max - 1).trim()}…`;
}

function crearHuella(payload: unknown): string {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

function crearSeed(huella: string): number {
  return Number.parseInt(huella.slice(0, 8), 16) & 0x7fffffff;
}

function leerCacheMemoria(huella: string): ReporteCacheado | null {
  return cacheMemoria.get(huella) ?? null;
}

function guardarCacheMemoria(huella: string, cacheado: ReporteCacheado): void {
  if (cacheMemoria.size >= MAX_CACHE_MEMORIA) {
    const primero = cacheMemoria.keys().next().value;
    if (primero) cacheMemoria.delete(primero);
  }
  cacheMemoria.set(huella, cacheado);
}

function esCacheNoDisponible(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : "";
  return /P2021|P2022|reportes_ejecutivos_uso_ia|does not exist|no existe/i.test(msg);
}

async function leerCachePersistente(huella: string): Promise<ReporteCacheado | null> {
  try {
    const row = await prisma.reporteEjecutivoUsoIA.findUnique({
      where: { huellaContexto: huella },
      select: {
        titulo: true,
        html: true,
        totalAcciones: true,
        totalUsuarios: true,
        totalNovedades: true,
        actualizadoEn: true,
      },
    });
    if (!row) return null;
    return {
      report: { titulo: row.titulo, html: row.html },
      generatedAt: row.actualizadoEn.toISOString(),
      totalAcciones: row.totalAcciones,
      totalUsuarios: row.totalUsuarios,
      totalNovedades: row.totalNovedades,
    };
  } catch (e) {
    if (esCacheNoDisponible(e)) return null;
    throw e;
  }
}

async function guardarCachePersistente(params: {
  huella: string;
  report: ReporteEjecutivoUso;
  periodoDesde: Date;
  periodoHasta: Date;
  totalAcciones: number;
  totalUsuarios: number;
  totalNovedades: number;
  userId: number | null;
}): Promise<ReporteCacheado | null> {
  try {
    const creado = await prisma.reporteEjecutivoUsoIA.create({
      data: {
        huellaContexto: params.huella,
        modelo: MODELO_REPORTE_EJECUTIVO_USO,
        titulo: params.report.titulo,
        html: params.report.html,
        periodoDesde: params.periodoDesde,
        periodoHasta: params.periodoHasta,
        totalAcciones: params.totalAcciones,
        totalUsuarios: params.totalUsuarios,
        totalNovedades: params.totalNovedades,
        creadoPorId: params.userId,
      },
      select: {
        titulo: true,
        html: true,
        totalAcciones: true,
        totalUsuarios: true,
        totalNovedades: true,
        creadoEn: true,
      },
    });
    return {
      report: { titulo: creado.titulo, html: creado.html },
      generatedAt: creado.creadoEn.toISOString(),
      totalAcciones: creado.totalAcciones,
      totalUsuarios: creado.totalUsuarios,
      totalNovedades: creado.totalNovedades,
    };
  } catch (e) {
    if (esCacheNoDisponible(e)) return null;
    const existente = await leerCachePersistente(params.huella);
    if (existente) return existente;
    throw e;
  }
}

/** Normaliza ISO o YYYY-MM-DD a inicio/fin de día UTC del rango inclusive. */
function parseRango(desdeRaw: string, hastaRaw: string): { desde: Date; hasta: Date } | null {
  const d = Date.parse(desdeRaw);
  const h = Date.parse(hastaRaw);
  if (!Number.isFinite(d) || !Number.isFinite(h) || d > h) return null;

  const desde = new Date(d);
  const hasta = new Date(h);

  // Si el usuario mandó solo fecha (YYYY-MM-DD), expandir al día completo.
  if (/^\d{4}-\d{2}-\d{2}$/.test(desdeRaw.trim())) {
    desde.setUTCHours(0, 0, 0, 0);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(hastaRaw.trim())) {
    hasta.setUTCHours(23, 59, 59, 999);
  }

  // Tope de rango: 366 días para no saturar la agregación.
  const ms = hasta.getTime() - desde.getTime();
  if (ms > 366 * 86400000) return null;

  return { desde, hasta };
}

type VersionContexto = {
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

function crearContextoNovedades(
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
): { contexto: VersionContexto[]; totalChanges: number; includedChanges: number; planos: CambioNovedadContexto[] } {
  let includedChanges = 0;
  let totalChanges = 0;
  const planos: CambioNovedadContexto[] = [];

  const contexto: VersionContexto[] = versiones.map((version) => {
    totalChanges += version.changes.length;
    const cambios = version.changes
      .filter(() => {
        if (includedChanges >= MAX_CAMBIOS_PROMPT) return false;
        includedChanges += 1;
        return true;
      })
      .map((change) => {
        const item = {
          tipo: change.type,
          titulo: recortarTexto(change.title, 180) ?? "",
          descripcion: recortarTexto(change.description, 700) ?? "",
          modulo: recortarTexto(change.moduleKey, 80),
          ruta: recortarTexto(change.route, 120),
          comoOperar: recortarTexto(change.howTo, 450),
          ejemplo: recortarTexto(change.example, 450),
          estadoFuncionalidad: change.featureStatus,
        };
        planos.push({
          versionNumero: version.number,
          versionTitulo: version.title,
          tipo: item.tipo,
          titulo: item.titulo,
          descripcion: item.descripcion,
          modulo: item.modulo,
          ruta: item.ruta,
          comoOperar: item.comoOperar,
          ejemplo: item.ejemplo,
          estadoFuncionalidad: item.estadoFuncionalidad,
        });
        return item;
      });

    return {
      numero: version.number,
      titulo: recortarTexto(version.title, 180) ?? "",
      resumen: recortarTexto(version.summary, 500),
      estado: version.status,
      publicadoEn: version.releasedAt ? version.releasedAt.toISOString() : null,
      cambios,
    };
  });

  return { contexto, totalChanges, includedChanges, planos };
}

function construirPromptReporte(params: {
  uso: ReturnType<typeof calcularResumenUso>;
  adopcion: ReturnType<typeof evaluarAdopcion>;
  novedades: VersionContexto[];
  graficosHtml: string;
}): string {
  return [
    "Genera un REPORTE de uso, adopción y novedades de la plataforma Russell Diagnóstico, listo para PDF/HTML, para enviarlo al cliente (la firma de revisoría).",
    "",
    "TONO Y ESTRUCTURA editorial: registro de cambios / newsletter de producto (claro, humano, profesional), adaptado a software de revisoría fiscal. No copies marcas ni estilos de terceros.",
    "",
    "Tono editorial:",
    "- Cercano, claro y profesional (como la UI de Russell Diagnóstico: sobrio, institucional, sin marketing vacío).",
    "- Prioriza: qué se liberó, por qué importa al trabajo del revisor, cómo se usa, y qué pasó con el uso real en el período.",
    "- Frases cortas y concretas. Español de Colombia.",
    "",
    "Entrega exclusivamente un documento HTML completo y válido. Debe empezar con <!DOCTYPE html> y contener <html>, <head>, <style> y <body>.",
    "No incluyas Markdown, cercas de código, explicación fuera del HTML, scripts, enlaces externos, imágenes externas ni recursos remotos.",
    "",
    "ESTRUCTURA OBLIGATORIA del documento (orden fijo):",
    "",
    "1) CABECERA / PORTADA",
    "   - Eyebrow en mayúsculas: «RUSSELL DIAGNÓSTICO» (azul institucional).",
    "   - Título principal atractivo y legible (1–2 temas fuertes del período), en tipografía serif.",
    "   - Subtítulo con el período exacto de la base factual de uso.",
    "   - Lista con viñetas de 3 a 6 highlights (novedades + hallazgos de uso/adopción). Solo hechos del JSON.",
    "   - PROHIBIDO: botones, CTAs, «Ver detalle», «Leer más», pills decorativas no informativas, o cualquier control que parezca clicable y no haga nada.",
    "",
    "2) INTRO NARRATIVA",
    "   - Un párrafo de apertura con contexto del período y volumen de uso si hay datos.",
    "   - Transición breve hacia el detalle.",
    "",
    "3) LO QUE LIBERAMOS (novedades principales)",
    "   - Cada cambio relevante (nueva o mejora con contexto) es una sección H2 con el título del cambio.",
    "   - En prosa: qué es, cómo se usa (integra comoOperar/ejemplo si existen), por qué importa, dónde encontrarlo (módulo/ruta si vienen), y estado de adopción del período si aplica.",
    "   - ~90–180 palabras por sección principal si hay contexto; si no, sé breve.",
    "",
    "4) CORRECCIONES Y MEJORAS MENORES",
    "   - Sección «Correcciones y mejoras» con viñetas (correccion/seguridad o items breves).",
    "",
    "5) CÓMO SE USÓ LA PLATAFORMA",
    "   - KPIs exactos (acciones, usuarios, clientes) en tarjetas alineadas al sistema visual.",
    "   - Crónica breve de uso; no dump de logs.",
    "   - INMEDIATAMENTE después de la crónica, inserta SIN MODIFICAR el bloque HTML de gráficos proporcionado abajo (incluye id=\"rd-graficos-uso\"). No reescribas las barras ni inventes otros gráficos; el bloque ya trae los conteos exactos.",
    "",
    "6) ADOPCIÓN DE NOVEDADES EN UN VISTAZO",
    "   - Resumen usadas / sin evidencia / no medibles y % solo si viene en la base factual.",
    "   - Lista o tabla de items con estado (además del gráfico de adopción ya incluido en el bloque de gráficos).",
    "",
    "7) CIERRE",
    "   - 2–4 recomendaciones prudentes basadas solo en los datos.",
    "   - Cierre breve y profesional.",
    "   - Footer de texto: «Reporte de uso, adopción y novedades — Russell Diagnóstico».",
    "",
    "IDENTIDAD VISUAL OBLIGATORIA (sistema Russell Diagnóstico / app):",
    "Usa EXACTAMENTE estos colores en el CSS (hex):",
    "- navy-900 #091628, navy-800 #0b1f3a, navy-700 #142b4a, navy-600 #1e3a5f",
    "- blue-500 #2f6fa7, blue-100 #e5eef7, blue-50 #f2f7fc",
    "- ink-900 #0e1721, ink-800 #1a2330, ink-700 #2a3441, ink-600 #475160, ink-500 #566273, ink-400 #626e7e",
    "- ink-200 #dce0e7, ink-150 #e7eaef, ink-100 #eff1f4, ink-50 #f7f8fa, paper #fbfbfc",
    "- ok-700 #2f6b3f, ok-100 #e5f0e8; warn-700 #8a5a11, warn-100 #faefd7; err-700 #9a2a22, err-100 #f8e1de",
    "Tipografía:",
    "- Títulos (h1/h2): Georgia, 'Times New Roman', serif (equivalente font-serif de la app).",
    "- Cuerpo: 'Helvetica Neue', Helvetica, Arial, sans-serif (equivalente font-sans).",
    "- Datos/números tabulares: ui-monospace, Menlo, monospace cuando aporte.",
    "Layout:",
    "- Fondo general ink-50 o paper; tarjetas blancas con borde ink-150 y radio ~8–10px.",
    "- Texto principal ink-800; secundario ink-500/600; títulos ink-900.",
    "- Acento de marca: navy-700 / blue-500 (NO morado genérico de IA, NO violetas de otras marcas).",
    "- Chips/badges discretos (fondo blue-100 o ink-100, texto navy-700 o ink-700), como en la app.",
    "- Tablas limpias con encabezado ink-50/ink-100 y bordes ink-150.",
    "- Márgenes generosos, secciones con break-inside: avoid, @media print para carta.",
    "- CSS 100% autocontenido en <style>. Sin fuentes externas, sin iconos SVG decorativos innecesarios, sin emojis.",
    "- Los gráficos de barras ya vienen con estilos inline: no los alteres.",
    "",
    "PROHIBIDO en el HTML (elementos no funcionales):",
    "- Botones, <button>, enlaces de apariencia de botón, CTAs decorativos.",
    "- Controles clicables que no hagan nada (p. ej. «Ver detalle del período», «Leer el reporte completo»).",
    "- Scripts, iframes, formularios, inputs, canvas, SVG de gráficos inventados.",
    "- Enlaces externos, imágenes externas, recursos remotos.",
    "- Decoración de marketing vacía que no aporte información.",
    "",
    "Reglas factuales obligatorias:",
    "- Usa ÚNICAMENTE números, fechas, usuarios, acciones, módulos, rutas y textos de las bases factuales JSON.",
    "- No inventes porcentajes de ahorro, costos, tiempos, promesas de producto ni métricas no presentes.",
    "- El porcentaje de adopción solo si viene en la base (null → «No calculable» o no lo menciones como cifra).",
    "- Distingue dato factual de interpretación prudente.",
    "- No menciones hashes, ramas, código, APIs, Prisma, tokens, pipelines, Server Actions ni arquitectura.",
    "- No digas que recibiste un JSON ni que eres una IA.",
    "- Si un dato no está, escribe «No documentado» o omítelo.",
    "- No inventes funcionalidades: solo las del contexto de novedades.",
    "",
    "Base factual de USO:",
    JSON.stringify(params.uso),
    "",
    "Base factual de ADOPCIÓN:",
    JSON.stringify({
      totalCambios: params.adopcion.totalCambios,
      evaluables: params.adopcion.evaluables,
      usadas: params.adopcion.usadas,
      sinEvidencia: params.adopcion.sinEvidencia,
      noMedibles: params.adopcion.noMedibles,
      porcentajeAdopcion: params.adopcion.porcentajeAdopcion,
      porEstado: params.adopcion.porEstado,
      items: params.adopcion.items,
    }),
    "",
    "Contexto de NOVEDADES liberadas:",
    JSON.stringify(params.novedades),
    "",
    "BLOQUE HTML DE GRÁFICOS (insertar tal cual en la sección 5, sin alterar números ni estructura):",
    params.graficosHtml,
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

function extraerDocumentoHtml(texto: string): string {
  const limpio = limpiarCercasCodigo(texto);
  const doctypeIndex = limpio.search(/<!doctype/i);
  const htmlIndex = limpio.search(/<html[\s>]/i);
  const inicio = [doctypeIndex, htmlIndex].filter((index) => index >= 0).sort((a, b) => a - b)[0];
  return inicio === undefined ? limpio : limpio.slice(inicio).trim();
}

/**
 * Limpia HTML del modelo: scripts y controles no funcionales (botones/CTA
 * decorativos del estilo newsletter que no navegan a nada).
 */
function sanitizarHtmlReporte(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, "")
    .replace(/<object[\s\S]*?<\/object>/gi, "")
    .replace(/<embed[\s\S]*?>/gi, "")
    .replace(/<form[\s\S]*?<\/form>/gi, "")
    .replace(/<button\b[\s\S]*?<\/button>/gi, "")
    // CTA decorativos típicos generados por el modelo (enlace o span "botón").
    .replace(
      /<(a|div|span|p)\b[^>]*(?:class|style)=["'][^"']*(?:btn|button|cta|call-to-action)[^"']*["'][^>]*>[\s\S]*?<\/\1>/gi,
      "",
    )
    .replace(
      /<(a|div|span)\b[^>]*>\s*(?:Ver detalle(?: del período)?|Leer(?: el)? reporte(?: completo)?|Leer más|Ver más|Continuar)\s*<\/\1>/gi,
      "",
    )
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/javascript:/gi, "");
}

function extraerTituloHtml(html: string): string {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1];
  const crudo = (title ?? h1 ?? "Reporte ejecutivo de uso y adopción")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return crudo.slice(0, 180) || "Reporte ejecutivo de uso y adopción";
}

function envolverHtmlBasico(cuerpo: string): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8" />
<title>Reporte ejecutivo de uso y adopción</title>
<style>
  body { font-family: Georgia, 'Times New Roman', serif; color: #1a2332; margin: 32px; line-height: 1.5; }
  h1 { font-size: 22px; }
</style>
</head>
<body>
${cuerpo}
</body>
</html>`;
}

function normalizarReporteHtml(texto: string): ReporteEjecutivoUso {
  let html = sanitizarHtmlReporte(extraerDocumentoHtml(texto));
  if (!/<html[\s>]/i.test(html)) html = envolverHtmlBasico(html);
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
    titulo: extraerTituloHtml(html) || "Reporte ejecutivo de uso y adopción",
    html,
  };
}

/**
 * Genera el reporte ejecutivo de uso y adopción (HTML) con IA a partir de
 * la bitácora de auditoría y las novedades publicadas. Admin-only.
 */
export async function generarReporteEjecutivoUso(
  opciones: ReporteEjecutivoUsoScope,
): Promise<GenerarReporteEjecutivoResult> {
  const authz = await authorizePermiso(PERMISO);
  if (!authz.ok) return { ok: false, message: authz.message };

  const parsed = ReporteEjecutivoUsoScopeSchema.safeParse(opciones);
  if (!parsed.success) {
    return { ok: false, message: "El alcance del reporte no es válido. Revisa las fechas y las versiones." };
  }

  const rango = parseRango(parsed.data.desde, parsed.data.hasta);
  if (!rango) {
    return {
      ok: false,
      message: "El rango de fechas no es válido o supera 366 días. Ajusta el período e inténtalo de nuevo.",
    };
  }

  const versionIds = parsed.data.versionIds?.length
    ? Array.from(new Set(parsed.data.versionIds)).sort((a, b) => a - b)
    : null;

  try {
    const [eventosRaw, versiones, clientes] = await Promise.all([
      prisma.auditEntry.findMany({
        where: {
          createdAt: { gte: rango.desde, lte: rango.hasta },
        },
        orderBy: { createdAt: "desc" },
        take: MAX_EVENTOS_AUDITORIA,
        select: {
          user: true,
          action: true,
          entity: true,
          detail: true,
          clientId: true,
          createdAt: true,
        },
      }),
      prisma.platformVersion.findMany({
        where: versionIds
          ? { id: { in: versionIds } }
          : { status: "publicada" },
        orderBy: [{ order: "desc" }, { id: "desc" }],
        include: { changes: { orderBy: [{ order: "asc" }, { id: "asc" }] } },
      }),
      prisma.client.findMany({
        select: { id: true, name: true },
      }),
    ]);

    if (versionIds && versiones.length === 0) {
      return { ok: false, message: "No se encontraron las versiones seleccionadas." };
    }

    const eventos: EventoAuditoria[] = eventosRaw.map((e) => ({
      user: e.user,
      action: e.action,
      entity: e.entity,
      detail: e.detail,
      clientId: e.clientId,
      createdAt: e.createdAt,
    }));

    const nombresClientes = new Map(clientes.map((c) => [c.id, c.name]));
    const uso = calcularResumenUso({
      eventos,
      periodoDesde: rango.desde,
      periodoHasta: rango.hasta,
      nombresClientes,
    });

    const { contexto: novedades, totalChanges, includedChanges, planos } =
      crearContextoNovedades(versiones);

    const conteos = conteosPorFamiliaCanon(eventos);
    const adopcion = evaluarAdopcion({ cambios: planos, conteosPorFamilia: conteos });
    const graficosHtml = construirSeccionGraficosHtml({ uso, adopcion });

    const huella = crearHuella({
      versionPrompt: VERSION_PROMPT_REPORTE_EJECUTIVO_USO,
      modelo: MODELO_REPORTE_EJECUTIVO_USO,
      temperatura: TEMPERATURA_REPORTE_EJECUTIVO_USO,
      desde: rango.desde.toISOString(),
      hasta: rango.hasta.toISOString(),
      versionIds: versionIds ?? "publicadas",
      uso,
      adopcion: {
        totalCambios: adopcion.totalCambios,
        evaluables: adopcion.evaluables,
        usadas: adopcion.usadas,
        sinEvidencia: adopcion.sinEvidencia,
        noMedibles: adopcion.noMedibles,
        porcentajeAdopcion: adopcion.porcentajeAdopcion,
        items: adopcion.items,
      },
      novedades,
      includedChanges,
      totalChanges,
      graficos: true,
    });

    const cacheLocal = leerCacheMemoria(huella);
    if (cacheLocal) {
      return {
        ok: true,
        report: cacheLocal.report,
        model: MODELO_REPORTE_EJECUTIVO_USO,
        generatedAt: cacheLocal.generatedAt,
        totalAcciones: cacheLocal.totalAcciones,
        totalUsuarios: cacheLocal.totalUsuarios,
        totalNovedades: cacheLocal.totalNovedades,
        porcentajeAdopcion: adopcion.porcentajeAdopcion,
        desdeCache: true,
      };
    }

    const cacheDb = await leerCachePersistente(huella);
    if (cacheDb) {
      guardarCacheMemoria(huella, cacheDb);
      return {
        ok: true,
        report: cacheDb.report,
        model: MODELO_REPORTE_EJECUTIVO_USO,
        generatedAt: cacheDb.generatedAt,
        totalAcciones: cacheDb.totalAcciones,
        totalUsuarios: cacheDb.totalUsuarios,
        totalNovedades: cacheDb.totalNovedades,
        porcentajeAdopcion: adopcion.porcentajeAdopcion,
        desdeCache: true,
      };
    }

    const generatedAt = new Date().toISOString();
    const prompt = construirPromptReporte({ uso, adopcion, novedades, graficosHtml });
    const seed = crearSeed(huella);
    const system =
      "Eres un redactor de reportes de adopción y registro de cambios para Russell Diagnóstico. Escribes para socios y gerentes de revisoría fiscal en Colombia. Tono claro y profesional alineado a la UI institucional de la app (navy, ink, serif en títulos). Precisión estricta: no inventas datos. Debes incluir el bloque HTML de gráficos de barras exactamente como se te entrega. No generas botones, CTAs ni controles no funcionales. No imitas marcas de terceros.";

    let completion: Awaited<ReturnType<typeof completarTextoGemini>>;
    try {
      completion = await completarTextoGemini({
        model: MODELO_REPORTE_EJECUTIVO_USO,
        maxTokens: 56_000,
        temperature: TEMPERATURA_REPORTE_EJECUTIVO_USO,
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
        model: MODELO_REPORTE_EJECUTIVO_USO,
        maxTokens: 40_000,
        temperature: TEMPERATURA_REPORTE_EJECUTIVO_USO,
        topP: 1,
        seed,
        timeoutMs: 240_000,
        system,
        prompt,
      });
    }

    const report = normalizarReporteHtml(completion.text);
    if (!report.titulo.trim()) {
      report.titulo = "Reporte ejecutivo de uso y adopción";
    }
    // Garantiza gráficos factuales aunque el modelo omita o altere el bloque.
    report.html = inyectarGraficosEnHtml(report.html, graficosHtml);

    const user = await getCurrentUser();
    await logAudit({
      user: user?.name ?? "Sistema",
      action: "GENERÓ REPORTE IA",
      entity: "Uso y adopción",
      detail: `Generó reporte ejecutivo con ${MODELO_REPORTE_EJECUTIVO_USO} (${uso.totalAcciones} acciones, ${uso.totalUsuarios} usuarios, ${includedChanges}/${totalChanges} novedades, ${
        versionIds ? `${versiones.length} versiones` : "versiones publicadas"
      }).`,
    });

    const cacheado = await guardarCachePersistente({
      huella,
      report,
      periodoDesde: rango.desde,
      periodoHasta: rango.hasta,
      totalAcciones: uso.totalAcciones,
      totalUsuarios: uso.totalUsuarios,
      totalNovedades: adopcion.totalCambios,
      userId: user?.id ?? null,
    });

    const final = cacheado ?? {
      report,
      generatedAt,
      totalAcciones: uso.totalAcciones,
      totalUsuarios: uso.totalUsuarios,
      totalNovedades: adopcion.totalCambios,
    };
    guardarCacheMemoria(huella, final);

    return {
      ok: true,
      report: final.report,
      model: MODELO_REPORTE_EJECUTIVO_USO,
      generatedAt: final.generatedAt,
      totalAcciones: final.totalAcciones,
      totalUsuarios: final.totalUsuarios,
      totalNovedades: final.totalNovedades,
      porcentajeAdopcion: adopcion.porcentajeAdopcion,
      desdeCache: false,
    };
  } catch (e) {
    return { ok: false, message: mensajeErrorGemini("generarReporteEjecutivoUso", e) };
  }
}

/**
 * Resumen factual ligero (sin IA) para la página de previsualización de KPIs.
 */
export async function obtenerResumenUsoAdopcion(opciones: {
  desde: string;
  hasta: string;
}): Promise<
  | {
      ok: true;
      uso: ReturnType<typeof calcularResumenUso>;
      adopcion: ReturnType<typeof evaluarAdopcion>;
      totalVersionesPublicadas: number;
    }
  | { ok: false; message: string }
> {
  const authz = await authorizePermiso(PERMISO);
  if (!authz.ok) return { ok: false, message: authz.message };

  const rango = parseRango(opciones.desde, opciones.hasta);
  if (!rango) {
    return { ok: false, message: "El rango de fechas no es válido o supera 366 días." };
  }

  try {
    const [eventosRaw, versiones, clientes] = await Promise.all([
      prisma.auditEntry.findMany({
        where: { createdAt: { gte: rango.desde, lte: rango.hasta } },
        orderBy: { createdAt: "desc" },
        take: MAX_EVENTOS_AUDITORIA,
        select: {
          user: true,
          action: true,
          entity: true,
          detail: true,
          clientId: true,
          createdAt: true,
        },
      }),
      prisma.platformVersion.findMany({
        where: { status: "publicada" },
        orderBy: [{ order: "desc" }, { id: "desc" }],
        include: { changes: { orderBy: [{ order: "asc" }, { id: "asc" }] } },
      }),
      prisma.client.findMany({ select: { id: true, name: true } }),
    ]);

    const eventos: EventoAuditoria[] = eventosRaw.map((e) => ({
      user: e.user,
      action: e.action,
      entity: e.entity,
      detail: e.detail,
      clientId: e.clientId,
      createdAt: e.createdAt,
    }));

    const nombresClientes = new Map(clientes.map((c) => [c.id, c.name]));
    const uso = calcularResumenUso({
      eventos,
      periodoDesde: rango.desde,
      periodoHasta: rango.hasta,
      nombresClientes,
    });
    const { planos } = crearContextoNovedades(versiones);
    const adopcion = evaluarAdopcion({
      cambios: planos,
      conteosPorFamilia: conteosPorFamiliaCanon(eventos),
    });

    return {
      ok: true,
      uso,
      adopcion,
      totalVersionesPublicadas: versiones.length,
    };
  } catch {
    return { ok: false, message: "No se pudo cargar el resumen de uso y adopción." };
  }
}
