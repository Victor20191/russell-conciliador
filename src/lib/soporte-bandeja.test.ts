import { describe, expect, test } from "vitest";
import {
  contarTicketsPorEstado,
  esFiltroEstadoTicket,
  esTicketEnGestion,
  FILTRO_ESTADO_EN_GESTION,
  FILTRO_ESTADO_TODOS,
  filtrarTicketsGestion,
  type TicketFilaGestion,
} from "./soporte-bandeja";

function fila(parcial: Partial<TicketFilaGestion> & Pick<TicketFilaGestion, "id" | "status">): TicketFilaGestion {
  return {
    code: `TKT-${parcial.id}`,
    createdById: 7,
    reporterFirstName: "Ana",
    reporterLastName: "Pérez",
    subject: "Asunto genérico",
    routeLabel: null,
    menuLabel: null,
    adjuntos: 0,
    resolvedByName: null,
    resolvedAt: null,
    createdAt: "2026-08-18T13:37:00.000Z",
    ...parcial,
  };
}

const filas: TicketFilaGestion[] = [
  fila({ id: 1, status: "abierto", subject: "Opción de comentario en conciliación", routeLabel: "Módulos de conciliación", menuLabel: "Inventarios" }),
  fila({ id: 2, status: "en_proceso", subject: "Prueba", reporterFirstName: "russell", reporterLastName: "plataforma", createdById: null }),
  fila({ id: 3, status: "resuelto", subject: "Error al cargar balance", routeLabel: "Balance de comprobación", menuLabel: "Borrador Balance" }),
  fila({ id: 4, status: "cerrado", subject: "Duplicado" }),
  fila({ id: 5, status: "en_evaluacion", subject: "Sugerencia de tablero nuevo" }),
];

describe("filtro del listado de gestión de reportes", () => {
  test("sin filtros devuelve todas las filas en el mismo orden", () => {
    expect(filtrarTicketsGestion(filas, {}).map((f) => f.id)).toEqual([1, 2, 3, 4, 5]);
    expect(filtrarTicketsGestion(filas, { estado: FILTRO_ESTADO_TODOS, busqueda: "  " }).map((f) => f.id)).toEqual([
      1, 2, 3, 4, 5,
    ]);
  });

  test("«en gestión» deja abiertos, en evaluación y en proceso", () => {
    expect(filtrarTicketsGestion(filas, { estado: FILTRO_ESTADO_EN_GESTION }).map((f) => f.id)).toEqual([1, 2, 5]);
    expect(esTicketEnGestion("abierto")).toBe(true);
    expect(esTicketEnGestion("en_evaluacion")).toBe(true);
    expect(esTicketEnGestion("en_proceso")).toBe(true);
    expect(esTicketEnGestion("resuelto")).toBe(false);
    expect(esTicketEnGestion("cerrado")).toBe(false);
  });

  test("un estado concreto filtra exacto", () => {
    expect(filtrarTicketsGestion(filas, { estado: "resuelto" }).map((f) => f.id)).toEqual([3]);
    expect(filtrarTicketsGestion(filas, { estado: "cerrado" }).map((f) => f.id)).toEqual([4]);
  });

  test("la búsqueda ignora acentos y mayúsculas y cubre código, asunto, reportante y ubicación", () => {
    expect(filtrarTicketsGestion(filas, { busqueda: "CONCILIACION" }).map((f) => f.id)).toEqual([1]);
    expect(filtrarTicketsGestion(filas, { busqueda: "perez" }).map((f) => f.id)).toEqual([1, 3, 4, 5]);
    expect(filtrarTicketsGestion(filas, { busqueda: "borrador" }).map((f) => f.id)).toEqual([3]);
    expect(filtrarTicketsGestion(filas, { busqueda: "TKT-2" }).map((f) => f.id)).toEqual([2]);
    expect(filtrarTicketsGestion(filas, { busqueda: "no existe" })).toEqual([]);
  });

  test("estado y búsqueda se combinan", () => {
    expect(filtrarTicketsGestion(filas, { estado: FILTRO_ESTADO_EN_GESTION, busqueda: "prueba" }).map((f) => f.id)).toEqual([2]);
    expect(filtrarTicketsGestion(filas, { estado: "abierto", busqueda: "prueba" })).toEqual([]);
  });
});

describe("resumen por estado", () => {
  test("cuenta todos los estados aunque alguno esté en cero", () => {
    expect(contarTicketsPorEstado(filas)).toEqual({
      abierto: 1,
      en_evaluacion: 1,
      en_proceso: 1,
      resuelto: 1,
      cerrado: 1,
    });
    expect(contarTicketsPorEstado([])).toEqual({
      abierto: 0,
      en_evaluacion: 0,
      en_proceso: 0,
      resuelto: 0,
      cerrado: 0,
    });
  });

  test("ignora estados desconocidos sin romper el conteo", () => {
    expect(contarTicketsPorEstado([fila({ id: 9, status: "raro" }), fila({ id: 10, status: "abierto" })])).toEqual({
      abierto: 1,
      en_evaluacion: 0,
      en_proceso: 0,
      resuelto: 0,
      cerrado: 0,
    });
  });

  test("valida los valores del selector de estado", () => {
    expect(esFiltroEstadoTicket("todos")).toBe(true);
    expect(esFiltroEstadoTicket("en_gestion")).toBe(true);
    expect(esFiltroEstadoTicket("resuelto")).toBe(true);
    expect(esFiltroEstadoTicket("en_evaluacion")).toBe(true);
    expect(esFiltroEstadoTicket("cualquiera")).toBe(false);
  });
});
