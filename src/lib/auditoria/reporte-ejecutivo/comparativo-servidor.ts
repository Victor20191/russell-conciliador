// De dónde salen las dos cifras que se comparan en «¿Subió o bajó el uso?».
//
// AMBOS períodos se miden con la misma regla —el «uso comparable»— que deja fuera
// a las cuentas de prueba y a las genéricas (`usuariosDelComparativo`), además de
// a las de Xentria. Con ellas dentro, una sola cuenta de pruebas llegó a ser el
// 89 % de las operaciones del período previo (110 de 124) y el comparativo
// anunciaba «el uso subió 674 %» cuando el equipo real había pasado de 4 a 565
// operaciones. Desde la metodología 4 el resto del reporte usa la misma regla.
//
// Período ACTUAL: lo calcula el llamador con `construirUsoComparable` (y el
// reporte lo guarda en `fuente.usoComparable`).
//
// Período PREVIO (metodología 5): el inmediatamente anterior de IGUAL duración,
// calculado en vivo con la misma regla y, si el actual sigue abierto, cortado en
// el mismo punto (`periodoAnteriorIgual`). Antes se tomaba el último reporte
// generado, que podía medir 12 días frente a 7: el tablero lo compensaba con
// promedios por día, pero las semanas no tenían los mismos días hábiles.
import "server-only";
import prisma from "@/lib/prisma";
import { compararUso, periodoAnteriorIgual, type ComparativoUso } from "./comparativo";
import { filtrarEventosPublicados, filtrarNavegacionesPublicadas, type FiltroPublicacion } from "./alcance";
import { calcularResumenUso, clasificarFamilia, type EventoAuditoria, type ResumenUsoFactual } from "./metricas";
import {
  actorUnificado,
  aliasDeActores,
  idsDelUso,
  unificarActores,
  usuariosDelComparativo,
} from "./usuarios-reporte";

/** Tope de eventos de un período (el de la página y el de la acción tienen el suyo). */
const MAX_EVENTOS_PERIODO = 25_000;

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
  const todas = await prisma.user.findMany({ select: { id: true, name: true, email: true } });
  const cuentas = usuariosDelComparativo(todas);
  // Las cuentas de prueba que usa una persona del equipo se le suman: sus visitas
  // entran por id y sus acciones e ingresos pasan al nombre de la persona.
  const alias = aliasDeActores(todas);
  const idsMedidos = [...idsDelUso(todas)];

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
      where: { kind: "navegacion", createdAt: ventana, userId: { in: idsMedidos } },
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
    eventos: unificarActores(publicados, alias),
    conexiones: conexiones.map((c) => ({ usuario: actorUnificado(c.userName, alias), total: c._count.userName })),
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
 * Comparativo del período actual contra el período ANTERIOR de igual duración
 * (`periodoAnteriorIgual`). `usoComparableActual` es el resultado de
 * `construirUsoComparable` del período actual, y `corte` hasta dónde se leyó
 * (ahora, por defecto): si el período sigue abierto, el anterior se corta en el
 * mismo punto. Nunca lanza: si no hay con qué comparar o la consulta falla,
 * devuelve null y la pantalla simplemente no muestra el bloque.
 */
export async function construirComparativoUso(params: {
  usoComparableActual: ResumenUsoFactual;
  desde: Date;
  hasta: Date;
  corte?: Date | null;
  filtro: FiltroPublicacion;
  nombresClientes: Map<number, string>;
}): Promise<ComparativoUso | null> {
  try {
    const corteActual = params.corte ?? new Date();
    const previo = periodoAnteriorIgual({ desde: params.desde, hasta: params.hasta, corte: corteActual });
    if (!previo) return null;
    const resumenPrevio = await calcularUsoComparable({
      desde: previo.desde,
      hasta: previo.hasta,
      corte: previo.corte,
      filtro: params.filtro,
      nombresClientes: params.nombresClientes,
    });
    // Un período previo sin una sola operación no es una caída: es falta de datos.
    if (resumenPrevio.totalAcciones === 0 && resumenPrevio.totalConexiones === 0) return null;
    const comparativo = compararUso({ actual: params.usoComparableActual, previo: resumenPrevio, base: "periodo_anterior" });
    if (!previo.corte) return comparativo;
    return {
      ...comparativo,
      // El costo de IA consulta esta ventana: con el período abierto, hasta el mismo punto.
      ventanaPrevia: { desde: comparativo.ventanaPrevia.desde, hasta: previo.corte.toISOString() },
      corteMismoPunto: { actual: corteActual.toISOString(), previo: previo.corte.toISOString() },
    };
  } catch {
    return null;
  }
}
