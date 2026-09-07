"use server";

import { randomUUID } from "node:crypto";
import { setTimeout as esperarAbortable } from "node:timers/promises";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/dal";
import { logAudit } from "@/lib/audit";
import { mensajeErrorBD } from "@/lib/errores";
import { authorizeReporteEjecutivo } from "@/lib/rbac/reporte-ejecutivo";
import { completarTextoOpenCode, mensajeErrorOpenCode } from "@/lib/opencode";
import {
  evaluarAdopcion,
  type CambioNovedadContexto,
} from "@/lib/auditoria/reporte-ejecutivo/adopcion";
import {
  calcularResumenUso,
  clasificarFamilia,
  conteosPorFamiliaCanon,
  type EventoAuditoria,
} from "@/lib/auditoria/reporte-ejecutivo/metricas";
import {
  filtrarCambiosPublicados,
  filtrarEventosPublicados,
  filtrarNavegacionesPublicadas,
  type FiltroPublicacion,
} from "@/lib/auditoria/reporte-ejecutivo/alcance";
import { modulosPublicadosParaTodos } from "@/lib/rbac/publicacion";
import { MODULOS_PLATAFORMA_KEYS } from "@/lib/rbac/modulos-plataforma";
import { construirDocumentoConsistente, construirPromptLecturaConsistente, parsearLecturaConsistente } from "@/lib/auditoria/reporte-ejecutivo/documento";
import { claveAlcanceReporte, leerInstantanea, guardarInstantanea } from "@/lib/auditoria/reporte-ejecutivo/instantaneas";
import {
  MODELO_REPORTE_EJECUTIVO_USO,
  MAX_TOKENS_REPORTE_EJECUTIVO_USO,
  MAX_TOKENS_REPORTE_EJECUTIVO_USO_REINTENTO,
  TEMPERATURA_REPORTE_EJECUTIVO_USO,
  type ReporteEjecutivoUso,
} from "@/lib/auditoria/reporte-ejecutivo/reportes";
import {
  normalizarTerminologiaVisibleReporte,
  type NovedadReporteEjecutivoContexto,
} from "@/lib/auditoria/reporte-ejecutivo/prompt";
import {
  RegistroEnvioReporteSchema,
  ReporteEjecutivoUsoScopeSchema,
  type RegistroEnvioReporte,
  type ReporteEjecutivoUsoScope,
} from "@/lib/definitions";
import type { EnvioReportePrevio } from "@/lib/auditoria/reporte-ejecutivo/envios";
import { revalidatePath } from "next/cache";

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
      /** Versiones de Novedades realmente incluidas: es lo que se registra al marcar el envío. */
      versionIdsIncluidos: number[];
    }
  | { ok: false; message: string };

function recortarTexto(texto: string | null | undefined, max: number): string | null {
  if (!texto) return null;
  const limpio = texto.trim();
  if (limpio.length <= max) return limpio;
  return `${limpio.slice(0, max - 1).trim()}…`;
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
  filtro: FiltroPublicacion,
): {
  contexto: NovedadReporteEjecutivoContexto[];
  totalChanges: number;
  includedChanges: number;
  excluidosEnDesarrollo: number;
  excluidosNoPublicados: number;
  planos: CambioNovedadContexto[];
} {
  let includedChanges = 0;
  let totalChanges = 0;
  let excluidosEnDesarrollo = 0;
  let excluidosNoPublicados = 0;
  const planos: CambioNovedadContexto[] = [];

  const contexto: NovedadReporteEjecutivoContexto[] = versiones.map((version) => {
    // Alcance del reporte: solo funcionalidades disponibles y de módulos
    // publicados para todos los usuarios.
    const publicables = filtrarCambiosPublicados({
      cambios: version.changes.map((c) => ({
        ...c,
        modulo: c.moduleKey,
        estadoFuncionalidad: c.featureStatus,
      })),
      filtro,
      clavesConocidas: MODULOS_PLATAFORMA_KEYS,
    });
    excluidosEnDesarrollo += publicables.enDesarrollo;
    excluidosNoPublicados += publicables.moduloNoPublicado + publicables.sinModulo;
    totalChanges += publicables.cambios.length;
    const cambios = publicables.cambios
      .filter(() => {
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

  return {
    // Las versiones que quedaron sin avances publicables no se le cuentan al cliente.
    contexto: contexto.filter((v) => v.cambios.length > 0),
    totalChanges,
    includedChanges,
    excluidosEnDesarrollo,
    excluidosNoPublicados,
    planos,
  };
}

/**
 * Causas por las que vale la pena repetir la llamada con menos salida: el
 * proveedor está saturado, o tardó tanto que venció el timeout (el modelo se
 * alarga razonando y un tope de salida menor lo acota).
 */
function esSaturacionProveedor(e: unknown): boolean {
  const status = e && typeof e === "object" && "status" in e ? (e as { status?: unknown }).status : undefined;
  const msg = e instanceof Error ? e.message : "";
  return (
    status === 429 ||
    status === 502 ||
    status === 503 ||
    status === 408 ||
    /ResourceExhausted|request limit reached|rate limit|quota|overloaded|unavailable|temporarily|tardó demasiado/i.test(
      msg,
    )
  );
}

async function esperar(ms: number, signal?: AbortSignal): Promise<void> {
  await esperarAbortable(ms, undefined, { signal });
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
  const crudo = (title ?? h1 ?? "Reporte de uso y avances")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return crudo.slice(0, 180) || "Reporte de uso y avances";
}

function envolverHtmlBasico(cuerpo: string): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8" />
<title>Reporte de uso y avances</title>
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
  let html = normalizarTerminologiaVisibleReporte(
    sanitizarHtmlReporte(extraerDocumentoHtml(texto)),
  );
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
    titulo: extraerTituloHtml(html) || "Reporte de uso y avances",
    html,
  };
}

/**
 * Genera el reporte ejecutivo de uso y adopción (HTML) con IA a partir de
 * la bitácora de auditoría y las novedades publicadas. Solo Superadministrador.
 */
export async function generarReporteEjecutivoUso(
  opciones: ReporteEjecutivoUsoScope,
  signal?: AbortSignal,
): Promise<GenerarReporteEjecutivoResult> {
  const authz = await authorizeReporteEjecutivo();
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
    signal?.throwIfAborted();
    const clave = claveAlcanceReporte(rango.desde, rango.hasta, versionIds);
    const anterior = await leerInstantanea(clave);
    signal?.throwIfAborted();
    if (anterior && !parsed.data.actualizar) {
      return { ok: true, ...anterior, desdeCache: true };
    }
    const corte = new Date(Math.min(Date.now(), rango.hasta.getTime()));
    const [[eventosRaw, conexionesRaw, navegacionesRaw, versiones, clientes, usuarios], modulosPublicados] = await Promise.all([
      prisma.$transaction(async (tx) => Promise.all([
      tx.auditEntry.findMany({
        where: {
          createdAt: { gte: rango.desde, lte: corte },
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: MAX_EVENTOS_AUDITORIA + 1,
        select: {
          user: true,
          action: true,
          entity: true,
          detail: true,
          clientId: true,
          createdAt: true,
        },
      }),
      tx.accessLog.groupBy({
        by: ["userName"],
        where: {
          kind: "ingreso",
          createdAt: { gte: rango.desde, lte: corte },
        },
        _count: { userName: true },
        orderBy: { userName: "asc" },
      }),
      tx.accessLog.groupBy({
        by: ["path"],
        where: {
          kind: "navegacion",
          createdAt: { gte: rango.desde, lte: corte },
        },
        _count: { path: true },
        orderBy: { path: "asc" },
      }),
      tx.platformVersion.findMany({
        where: versionIds
          ? { id: { in: versionIds }, status: "publicada" }
          : { status: "publicada" },
        orderBy: [{ order: "desc" }, { id: "desc" }],
        include: { changes: { orderBy: [{ order: "asc" }, { id: "asc" }] } },
      }),
      tx.client.findMany({
        select: { id: true, name: true },
      }),
      tx.user.findMany({ select: { name: true, email: true } }),
      ]), { isolationLevel: "RepeatableRead" }),
      modulosPublicadosParaTodos(),
    ]);

    signal?.throwIfAborted();
    if (eventosRaw.length > MAX_EVENTOS_AUDITORIA) {
      return { ok: false, message: "El período supera el límite de movimientos del reporte. Reduce el rango para obtener cifras completas." };
    }
    if (versionIds && versiones.length !== versionIds.length) {
      return { ok: false, message: "Una o más versiones seleccionadas no están publicadas. Revisa el alcance." };
    }

    // Ids realmente usados (aunque el alcance haya sido «todas las publicadas»):
    // es lo que se guarda al marcar el reporte como enviado.
    const versionIdsIncluidos = versiones.map((v) => v.id);

    const eventosCrudos: EventoAuditoria[] = eventosRaw.map((e) => ({
      user: e.user,
      action: e.action,
      entity: e.entity,
      detail: e.detail,
      clientId: e.clientId,
      createdAt: e.createdAt,
    }));

    // Alcance: la bitácora de módulos aún no publicados no se le reporta al cliente.
    const filtro: FiltroPublicacion = { modulosPublicados };
    const alcanceUso = filtrarEventosPublicados({
      eventos: eventosCrudos,
      clasificar: (e) => clasificarFamilia(e.action, e.entity, e.detail),
      filtro,
    });
    const eventos = alcanceUso.eventos;
    const alcanceNavegaciones = filtrarNavegacionesPublicadas({
      navegaciones: navegacionesRaw.map((navegacion) => ({
        ruta: navegacion.path,
        total: navegacion._count.path,
      })),
      filtro,
    });

    const nombresClientes = new Map(clientes.map((c) => [c.id, c.name]));
    const correosUsuarios = new Map(usuarios.map((u) => [u.name, u.email]));
    const uso = calcularResumenUso({
      eventos,
      conexiones: conexionesRaw.map((conexion) => ({
        usuario: conexion.userName,
        total: conexion._count.userName,
      })),
      navegaciones: alcanceNavegaciones.navegaciones,
      periodoDesde: rango.desde,
      periodoHasta: rango.hasta,
      nombresClientes,
      correosUsuarios,
    });

    const {
      contexto: novedades,
      totalChanges,
      includedChanges,
      excluidosEnDesarrollo,
      excluidosNoPublicados,
      planos,
    } = crearContextoNovedades(versiones, filtro);

    const conteos = conteosPorFamiliaCanon(eventos);
    const adopcion = evaluarAdopcion({ cambios: planos, conteosPorFamilia: conteos });
    const prompt = construirPromptLecturaConsistente({ uso, adopcion, novedades });
    const system = "Selecciona únicamente interpretaciones prudentes permitidas. No calcules cifras ni generes HTML.";

    signal?.throwIfAborted();
    const sessionId = randomUUID();
    let completion: Awaited<ReturnType<typeof completarTextoOpenCode>>;
    try {
      completion = await completarTextoOpenCode({
        sessionId,
        signal,
        model: MODELO_REPORTE_EJECUTIVO_USO,
        maxTokens: MAX_TOKENS_REPORTE_EJECUTIVO_USO,
        temperature: TEMPERATURA_REPORTE_EJECUTIVO_USO,
        topP: 1,
        timeoutMs: 200_000,
        system,
        prompt,
      });
    } catch (e) {
      signal?.throwIfAborted();
      if (!esSaturacionProveedor(e)) throw e;
      await esperar(1500, signal);
      completion = await completarTextoOpenCode({
        sessionId,
        signal,
        model: MODELO_REPORTE_EJECUTIVO_USO,
        maxTokens: MAX_TOKENS_REPORTE_EJECUTIVO_USO_REINTENTO,
        temperature: TEMPERATURA_REPORTE_EJECUTIVO_USO,
        topP: 1,
        timeoutMs: 150_000,
        system,
        prompt,
      });
    }

    signal?.throwIfAborted();
    const report = normalizarReporteHtml(construirDocumentoConsistente({
      uso, adopcion, novedades, lecturaIA: parsearLecturaConsistente(completion.text),
      corte: corte.toISOString(),
    }).html);

    const user = await getCurrentUser();
    signal?.throwIfAborted();


    signal?.throwIfAborted();
    const final = await guardarInstantanea({
      clave, anteriorId: anterior?.id ?? null, report,
      modelo: MODELO_REPORTE_EJECUTIVO_USO,
      desde: rango.desde, hasta: rango.hasta,
      totalAcciones: uso.totalAcciones, totalUsuarios: uso.totalUsuarios,
      totalNovedades: adopcion.totalCambios, porcentajeAdopcion: adopcion.porcentajeAdopcion,
      versionIdsIncluidos, corte: corte.toISOString(),
      fuente: { uso, adopcion, novedades }, userId: user?.id ?? null,
    });
    signal?.throwIfAborted();
    await logAudit({
      user: user?.name ?? "Sistema",
      action: "GENERÓ REPORTE IA",
      entity: "Uso y adopción",
      detail: `Generó reporte para gerencia con ${MODELO_REPORTE_EJECUTIVO_USO} (${uso.totalAcciones} acciones, ${uso.totalUsuarios} usuarios, ${includedChanges}/${totalChanges} novedades, ${
        versionIds ? `${versiones.length} versiones` : "versiones publicadas"
      }). Registró ${uso.totalNavegaciones} navegaciones separadas de las operaciones. Alcance solo publicado: excluyó ${alcanceUso.descartados} acciones de módulos no publicados y ${alcanceNavegaciones.descartadas} navegaciones fuera de familias operativas publicadas, ${excluidosEnDesarrollo} novedades en desarrollo y ${excluidosNoPublicados} de módulos no publicados.`,
    });
    return { ok: true, ...final, desdeCache: false };
  } catch (e) {
    if (signal?.aborted) return { ok: false, message: "Generación cancelada." };
    return { ok: false, message: mensajeErrorOpenCode("generarReporteEjecutivoUso", e) };
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
  const authz = await authorizeReporteEjecutivo();
  if (!authz.ok) return { ok: false, message: authz.message };

  const rango = parseRango(opciones.desde, opciones.hasta);
  if (!rango) {
    return { ok: false, message: "El rango de fechas no es válido o supera 366 días." };
  }

  try {
    const [eventosRaw, conexionesRaw, navegacionesRaw, versiones, clientes, usuarios, modulosPublicados] = await Promise.all([
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
      prisma.accessLog.groupBy({
        by: ["userName"],
        where: {
          kind: "ingreso",
          createdAt: { gte: rango.desde, lte: rango.hasta },
        },
        _count: { userName: true },
        orderBy: { userName: "asc" },
      }),
      prisma.accessLog.groupBy({
        by: ["path"],
        where: {
          kind: "navegacion",
          createdAt: { gte: rango.desde, lte: rango.hasta },
        },
        _count: { path: true },
        orderBy: { path: "asc" },
      }),
      prisma.platformVersion.findMany({
        where: { status: "publicada" },
        orderBy: [{ order: "desc" }, { id: "desc" }],
        include: { changes: { orderBy: [{ order: "asc" }, { id: "asc" }] } },
      }),
      prisma.client.findMany({ select: { id: true, name: true } }),
      prisma.user.findMany({ select: { name: true, email: true } }),
      modulosPublicadosParaTodos(),
    ]);

    const filtro: FiltroPublicacion = { modulosPublicados };
    const eventos = filtrarEventosPublicados({
      eventos: eventosRaw.map((e) => ({
        user: e.user,
        action: e.action,
        entity: e.entity,
        detail: e.detail,
        clientId: e.clientId,
        createdAt: e.createdAt,
      })),
      clasificar: (e) => clasificarFamilia(e.action, e.entity, e.detail),
      filtro,
    }).eventos;
    const navegaciones = filtrarNavegacionesPublicadas({
      navegaciones: navegacionesRaw.map((navegacion) => ({
        ruta: navegacion.path,
        total: navegacion._count.path,
      })),
      filtro,
    }).navegaciones;

    const nombresClientes = new Map(clientes.map((c) => [c.id, c.name]));
    const uso = calcularResumenUso({
      eventos,
      conexiones: conexionesRaw.map((conexion) => ({
        usuario: conexion.userName,
        total: conexion._count.userName,
      })),
      navegaciones,
      periodoDesde: rango.desde,
      periodoHasta: rango.hasta,
      nombresClientes,
      correosUsuarios: new Map(usuarios.map((u) => [u.name, u.email])),
    });
    const { planos } = crearContextoNovedades(versiones, filtro);
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

/* ===== Registro de envíos: evita repetir avances ya comunicados ===== */

const RUTA_REPORTES = "/config/reportes-ejecutivos";

export type RegistrarEnvioResult =
  | { ok: true; envio: EnvioReportePrevio }
  | { ok: false; message: string };

function esTablaEnviosNoDisponible(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : "";
  return /P2021|P2022|envios_reporte_ejecutivo|does not exist|no existe/i.test(msg);
}

type FilaEnvio = {
  id: number;
  titulo: string;
  periodoDesde: Date;
  periodoHasta: Date;
  versionIds: number[];
  totalNovedades: number;
  totalAcciones: number;
  canal: string;
  enviadoPor: string;
  enviadoEn: Date;
};

function aEnvioPrevio(fila: FilaEnvio): EnvioReportePrevio {
  return {
    id: fila.id,
    titulo: fila.titulo,
    periodoDesde: fila.periodoDesde.toISOString(),
    periodoHasta: fila.periodoHasta.toISOString(),
    versionIds: fila.versionIds,
    totalNovedades: fila.totalNovedades,
    totalAcciones: fila.totalAcciones,
    canal: fila.canal,
    enviadoPor: fila.enviadoPor,
    enviadoEn: fila.enviadoEn.toISOString(),
  };
}

const SELECT_ENVIO = {
  id: true,
  titulo: true,
  periodoDesde: true,
  periodoHasta: true,
  versionIds: true,
  totalNovedades: true,
  totalAcciones: true,
  canal: true,
  enviadoPor: true,
  enviadoEn: true,
} as const;

/**
 * Lee los envíos registrados (para los loaders RSC). Nunca lanza: si la tabla
 * aún no existe en el entorno, la pantalla funciona como antes (sin historial).
 */
export async function listarEnviosReporteEjecutivo(limite = 50): Promise<EnvioReportePrevio[]> {
  try {
    const filas = await prisma.envioReporteEjecutivo.findMany({
      orderBy: [{ enviadoEn: "desc" }, { id: "desc" }],
      take: Math.min(Math.max(limite, 1), 200),
      select: SELECT_ENVIO,
    });
    return filas.map(aEnvioPrevio);
  } catch (e) {
    if (esTablaEnviosNoDisponible(e)) return [];
    throw e;
  }
}

/**
 * Marca un reporte como entregado al cliente: deja constancia del período y de
 * las versiones de Novedades incluidas, para que el siguiente reporte solo
 * proponga lo que aún no se ha contado.
 */
export async function registrarEnvioReporteEjecutivo(
  datos: RegistroEnvioReporte,
): Promise<RegistrarEnvioResult> {
  const authz = await authorizeReporteEjecutivo();
  if (!authz.ok) return { ok: false, message: authz.message };

  const parsed = RegistroEnvioReporteSchema.safeParse(datos);
  if (!parsed.success) {
    return { ok: false, message: "No se pudo registrar el envío: los datos del reporte no son válidos." };
  }

  const rango = parseRango(parsed.data.desde, parsed.data.hasta);
  if (!rango) {
    return { ok: false, message: "El período del reporte no es válido." };
  }

  const versionIds = Array.from(new Set(parsed.data.versionIds)).sort((a, b) => a - b);

  try {
    const user = await getCurrentUser();
    const fila = await prisma.envioReporteEjecutivo.create({
      data: {
        titulo: parsed.data.titulo,
        periodoDesde: rango.desde,
        periodoHasta: rango.hasta,
        versionIds,
        totalNovedades: parsed.data.totalNovedades,
        totalAcciones: parsed.data.totalAcciones,
        canal: parsed.data.canal,
        nota: parsed.data.nota ?? null,
        enviadoPor: user?.name ?? "Sistema",
        enviadoPorId: user?.id ?? null,
      },
      select: SELECT_ENVIO,
    });

    await logAudit({
      user: user?.name ?? "Sistema",
      action: "REGISTRÓ ENVÍO DE REPORTE",
      entity: "Uso y adopción",
      detail: `Marcó como enviado «${parsed.data.titulo}» (${versionIds.length} versiones de novedades, canal ${parsed.data.canal}).`,
    });

    revalidatePath(RUTA_REPORTES);
    return { ok: true, envio: aEnvioPrevio(fila) };
  } catch (e) {
    if (esTablaEnviosNoDisponible(e)) {
      return {
        ok: false,
        message:
          "El historial de envíos aún no está disponible en este entorno. Aplica la migración pendiente e inténtalo de nuevo.",
      };
    }
    return { ok: false, message: mensajeErrorBD("registrarEnvioReporteEjecutivo", e) };
  }
}

/** Deshace un registro de envío hecho por error (vuelve a considerar sus versiones como pendientes). */
export async function eliminarEnvioReporteEjecutivo(
  id: number,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const authz = await authorizeReporteEjecutivo();
  if (!authz.ok) return { ok: false, message: authz.message };

  if (!Number.isInteger(id) || id <= 0) {
    return { ok: false, message: "El registro de envío no es válido." };
  }

  try {
    const user = await getCurrentUser();
    await prisma.envioReporteEjecutivo.delete({ where: { id } });
    await logAudit({
      user: user?.name ?? "Sistema",
      action: "ELIMINÓ ENVÍO DE REPORTE",
      entity: "Uso y adopción",
      detail: `Deshizo el registro de envío #${id}; sus novedades vuelven a considerarse pendientes.`,
    });
    revalidatePath(RUTA_REPORTES);
    return { ok: true };
  } catch (e) {
    if (esTablaEnviosNoDisponible(e)) {
      return { ok: false, message: "El historial de envíos no está disponible en este entorno." };
    }
    return { ok: false, message: mensajeErrorBD("eliminarEnvioReporteEjecutivo", e) };
  }
}
