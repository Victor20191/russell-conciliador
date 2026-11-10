// De dónde salen las dos cifras que se comparan en «¿Subió o bajó el uso?».
//
// AMBOS períodos se miden con la misma regla —el «uso comparable»— que deja fuera
// a las cuentas de prueba y a las genéricas (`usuariosDelComparativo`), además de
// a las de Xentria. Con ellas dentro, una sola cuenta de pruebas llegó a ser el
// 89 % de las operaciones del período previo (110 de 124) y el comparativo
// anunciaba «el uso subió 674 %» cuando el equipo real había pasado de 4 a 565
// operaciones. El resto del reporte (detalle por usuario, top, familias) no
// cambia: esas cuentas siguen ahí, solo que no entran en la comparación.
//
// Período ACTUAL: lo calcula el llamador con `construirUsoComparable` (y el
// reporte lo guarda en `fuente.usoComparable`).
//
// Período PREVIO, por prioridad:
//  1. El último reporte cuyo período TERMINA antes de que empiece el actual
//     —comparar contra uno que se traslapa (o que contiene al período nuevo) no
//     dice nada—. Si se calculó con la metodología vigente trae su
//     `fuente.usoComparable`: exactamente las cifras con las que se comparó
//     entonces, sin que un cambio posterior de la bitácora las mueva. Si es de una
//     metodología anterior (sus cifras incluyen cuentas de prueba, o no guardó
//     `usoComparable`) se conserva su VENTANA —y su corte— y las cifras se
//     recalculan en vivo.
//  2. Respaldo: el período inmediatamente anterior de IGUAL duración, calculado en
//     vivo con la misma regla. Cubre el primer reporte y las instantáneas
//     antiguas que no guardaron la fuente.
import "server-only";
import prisma from "@/lib/prisma";
import { compararUso, type ComparativoUso } from "./comparativo";
import { filtrarEventosPublicados, filtrarNavegacionesPublicadas, type FiltroPublicacion } from "./alcance";
import { calcularResumenUso, clasificarFamilia, type EventoAuditoria, type ResumenUsoFactual } from "./metricas";
import { metodologiaAlDia } from "./metodologia";
import { leerUsuariosActivos } from "./usuarios-activos";
import { usuariosDelComparativo } from "./usuarios-reporte";

/** Tope de eventos de un período (el de la página y el de la acción tienen el suyo). */
const MAX_EVENTOS_PERIODO = 25_000;

/**
 * Normaliza el resumen guardado en una instantánea: una vieja puede no traer todos
 * los campos. `clave` elige cuál: `uso` (el del reporte, con todas las cuentas) o
 * `usoComparable` (el de la comparación).
 */
function leerResumenGuardado(metadatos: unknown, clave: "uso" | "usoComparable"): ResumenUsoFactual | null {
  if (!metadatos || typeof metadatos !== "object") return null;
  const fuente = (metadatos as { fuente?: unknown }).fuente;
  if (!fuente || typeof fuente !== "object") return null;
  const uso = (fuente as Record<string, unknown>)[clave];
  if (!uso || typeof uso !== "object") return null;
  const candidato = uso as Partial<ResumenUsoFactual>;
  if (typeof candidato.periodoDesde !== "string" || typeof candidato.periodoHasta !== "string") return null;
  if (typeof candidato.totalAcciones !== "number") return null;
  return {
    ...candidato,
    totalNavegaciones: candidato.totalNavegaciones ?? 0,
    totalConexiones: candidato.totalConexiones ?? 0,
    totalUsuarios: candidato.totalUsuarios ?? 0,
    totalClientes: candidato.totalClientes ?? 0,
    porFamilia: candidato.porFamilia ?? [],
    topUsuarios: candidato.topUsuarios ?? [],
    topAcciones: candidato.topAcciones ?? [],
    detalleUsuarios: candidato.detalleUsuarios ?? [],
    topClientes: candidato.topClientes ?? [],
    serieDiaria: candidato.serieDiaria ?? [],
    evidencia: candidato.evidencia ?? [],
    navegacionesPorFamilia: candidato.navegacionesPorFamilia ?? [],
    primeraAccion: candidato.primeraAccion ?? null,
    ultimaAccion: candidato.ultimaAccion ?? null,
    // Las instantáneas anteriores al indicador de usuarios activos no lo traen.
    usuariosActivos: leerUsuariosActivos(candidato.usuariosActivos) ?? undefined,
  } as ResumenUsoFactual;
}

/**
 * Hasta dónde llegó la lectura cuando se generó el reporte guardado (`corte`), o
 * null si no la guardó. Un reporte se genera con el período aún abierto —el del
 * 14 al 27-oct se generó el 27 a las 18:30—, así que sus cifras llegan solo hasta
 * ahí; recalcular la ventana ENTERA hoy le sumaría lo que se operó después y el
 * período previo ya no sería el que se midió.
 */
function corteGuardado(metadatos: unknown): Date | null {
  const corte = (metadatos as { corte?: unknown } | null)?.corte;
  if (typeof corte !== "string") return null;
  const fecha = new Date(corte);
  return Number.isNaN(fecha.getTime()) ? null : fecha;
}

/**
 * Resumen de uso de una ventana, SIN cuentas de prueba ni genéricas (ni de Xentria).
 *
 * La lista blanca de nombres filtra la bitácora y los inicios de sesión, y las
 * visitas —que se agrupan por ruta y no traen nombre— se acotan por `userId` a las
 * mismas cuentas. Sin cuentas que medir todo da cero: no se asume «todos».
 *
 * `desde`/`hasta` son el período declarado (lo que se rotula y de lo que se saca
 * la duración); `corte` recorta la consulta cuando el período llega al futuro.
 */
async function calcularUsoComparable(params: {
  desde: Date;
  hasta: Date;
  corte?: Date | null;
  filtro: FiltroPublicacion;
  nombresClientes: Map<number, string>;
}): Promise<ResumenUsoFactual> {
  const fin = params.corte && params.corte < params.hasta ? params.corte : params.hasta;
  const ventana = { gte: params.desde, lte: fin };
  const cuentas = usuariosDelComparativo(
    await prisma.user.findMany({ select: { id: true, name: true, email: true } }),
  );

  const [eventosRaw, conexiones, navegacionesRaw] = await Promise.all([
    prisma.auditEntry.findMany({
      where: { createdAt: ventana },
      orderBy: { createdAt: "desc" },
      take: MAX_EVENTOS_PERIODO,
      select: { user: true, action: true, entity: true, detail: true, clientId: true, createdAt: true },
    }),
    prisma.accessLog.groupBy({
      by: ["userName"],
      where: { kind: "ingreso", createdAt: ventana },
      _count: { userName: true },
    }),
    prisma.accessLog.groupBy({
      by: ["path"],
      where: { kind: "navegacion", createdAt: ventana, userId: { in: cuentas.map((c) => c.id) } },
      _count: { path: true },
    }),
  ]);
  const eventos: EventoAuditoria[] = eventosRaw.map((e) => ({ ...e, createdAt: e.createdAt }));
  const { eventos: publicados } = filtrarEventosPublicados({
    eventos,
    clasificar: (e) => clasificarFamilia(e.action, e.entity, e.detail),
    filtro: params.filtro,
  });
  const { navegaciones } = filtrarNavegacionesPublicadas({
    navegaciones: navegacionesRaw.map((n) => ({ ruta: n.path, total: n._count.path })),
    filtro: params.filtro,
  });
  return calcularResumenUso({
    eventos: publicados,
    conexiones: conexiones.map((c) => ({ usuario: c.userName, total: c._count.userName })),
    navegaciones,
    periodoDesde: params.desde,
    periodoHasta: params.hasta,
    nombresClientes: params.nombresClientes,
    correosUsuarios: new Map(cuentas.map((u) => [u.name, u.email])),
    usuariosRegistrados: cuentas.map((u) => u.name),
    // Solo se comparan cifras: la evidencia no se lee y no hace falta guardarla.
    maxEvidencia: 0,
  });
}

/**
 * Uso comparable de un período, para el LADO ACTUAL de la comparación. Nunca lanza:
 * si no se pudo medir devuelve null y el comparativo simplemente no se muestra.
 */
export async function construirUsoComparable(params: {
  desde: Date;
  hasta: Date;
  corte?: Date | null;
  filtro: FiltroPublicacion;
  nombresClientes: Map<number, string>;
}): Promise<ResumenUsoFactual | null> {
  try {
    return await calcularUsoComparable(params);
  } catch {
    return null;
  }
}

/**
 * Comparativo del período actual contra el reporte anterior (o, en su defecto,
 * contra el período anterior de igual duración). `usoComparableActual` es el
 * resultado de `construirUsoComparable` del período actual. Nunca lanza: si no hay
 * con qué comparar o la consulta falla, devuelve null y la pantalla simplemente no
 * muestra el bloque.
 */
export async function construirComparativoUso(params: {
  usoComparableActual: ResumenUsoFactual;
  desde: Date;
  hasta: Date;
  filtro: FiltroPublicacion;
  nombresClientes: Map<number, string>;
}): Promise<ComparativoUso | null> {
  try {
    // 1) El último reporte cuyo período TERMINA antes de que empiece el actual.
    //
    // La condición de no traslape es lo que hace legible la comparación: un
    // reporte de 09-01 a 09-20 CONTIENE al período 09-12 → 09-20, así que
    // compararlos mide lo mismo contra sí mismo. Se ordena por fin de período
    // —no por fecha de generación— porque lo que interesa es el tramo anterior
    // inmediato, aunque se haya generado después de otro más reciente.
    //
    // Se miran varios porque las instantáneas antiguas no guardaban la fuente:
    // se toma la primera que SÍ la tenga, en vez de renunciar a comparar.
    const candidatos = await prisma.reporteEjecutivoUsoIA.findMany({
      where: { periodoHasta: { lt: params.desde } },
      orderBy: [{ periodoHasta: "desc" }, { creadoEn: "desc" }, { id: "desc" }],
      take: 10,
      select: { metadatos: true, creadoEn: true },
    });
    for (const candidato of candidatos) {
      // Del `uso` del reporte solo se toma la VENTANA (qué tramo cubrió).
      const ventana = leerResumenGuardado(candidato.metadatos, "uso");
      if (!ventana) continue;
      // Una instantánea con reglas viejas (o sin `usoComparable`) no es comparable:
      // se conserva su ventana y las cifras se recalculan con la regla de hoy. Sin
      // esto, las cuentas de prueba del período previo inflaban la subida.
      const guardado = metodologiaAlDia(candidato.metadatos)
        ? leerResumenGuardado(candidato.metadatos, "usoComparable")
        : null;
      const previo =
        guardado ??
        (await calcularUsoComparable({
          desde: new Date(ventana.periodoDesde),
          hasta: new Date(ventana.periodoHasta),
          corte: corteGuardado(candidato.metadatos),
          filtro: params.filtro,
          nombresClientes: params.nombresClientes,
        }));
      return compararUso({
        actual: params.usoComparableActual,
        previo,
        base: "reporte_anterior",
        generadoEn: candidato.creadoEn.toISOString(),
      });
    }

    // 2) Respaldo: el período inmediatamente anterior, de la misma duración.
    const duracion = params.hasta.getTime() - params.desde.getTime();
    if (!(duracion > 0)) return null;
    const hastaPrevio = new Date(params.desde.getTime() - 1);
    const desdePrevio = new Date(hastaPrevio.getTime() - duracion);
    const resumenPrevio = await calcularUsoComparable({
      desde: desdePrevio,
      hasta: hastaPrevio,
      filtro: params.filtro,
      nombresClientes: params.nombresClientes,
    });
    // Un período previo sin una sola operación no es una caída: es falta de datos.
    if (resumenPrevio.totalAcciones === 0 && resumenPrevio.totalConexiones === 0) return null;
    return compararUso({ actual: params.usoComparableActual, previo: resumenPrevio, base: "periodo_anterior" });
  } catch {
    return null;
  }
}
