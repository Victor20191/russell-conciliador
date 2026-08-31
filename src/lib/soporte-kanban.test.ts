import { describe, expect, it } from "vitest";
import {
  agruparTicketsKanban,
  COLUMNAS_KANBAN,
  evaluarMovimientoKanban,
  filtrarCartasKanbanPorAsunto,
  moverTicketKanban,
  type TicketKanban,
} from "./soporte-kanban";
import { ESTADOS_TICKET } from "./soporte-estados";

function ticket(id: number, status: string, overrides: Partial<TicketKanban> = {}): TicketKanban {
  return {
    id,
    code: `TKT-${id}`,
    subject: `Novedad ${id}`,
    reportante: "Ana Pérez",
    esMio: false,
    ubicacion: "Balance · Cargar balance",
    dominio: "russell",
    status,
    adjuntos: 0,
    createdAt: "2026-08-25T10:00:00.000Z",
    updatedAt: "2026-08-25T10:00:00.000Z",
    ...overrides,
  };
}

describe("COLUMNAS_KANBAN", () => {
  it("cubre exactamente los estados del ticket, sin repetir", () => {
    const estados = COLUMNAS_KANBAN.map((columna) => columna.estado);
    expect(new Set(estados).size).toBe(estados.length);
    expect([...estados].sort()).toEqual([...ESTADOS_TICKET].sort());
  });
});

describe("agruparTicketsKanban", () => {
  it("reparte por estado conservando el orden de llegada", () => {
    const columnas = agruparTicketsKanban([
      ticket(1, "abierto"),
      ticket(2, "resuelto"),
      ticket(3, "abierto"),
    ]);
    expect(columnas.abierto.map((t) => t.id)).toEqual([1, 3]);
    expect(columnas.resuelto.map((t) => t.id)).toEqual([2]);
    expect(columnas.en_proceso).toEqual([]);
    expect(columnas.en_evaluacion).toEqual([]);
    expect(columnas.cerrado).toEqual([]);
  });

  it("siempre devuelve una columna por estado aunque no haya tickets", () => {
    expect(Object.keys(agruparTicketsKanban([])).sort()).toEqual([...ESTADOS_TICKET].sort());
  });

  it("no pierde un estado desconocido: lo deja en abierto", () => {
    const columnas = agruparTicketsKanban([ticket(9, "archivado_legado")]);
    expect(columnas.abierto.map((t) => t.id)).toEqual([9]);
  });
});

describe("evaluarMovimientoKanban", () => {
  const filas = [ticket(1, "abierto"), ticket(2, "en_proceso")];

  it("acepta un cambio de columna normal sin pedir solución", () => {
    const mov = evaluarMovimientoKanban(filas, 1, "en_proceso");
    expect(mov).toMatchObject({ ok: true, destino: "en_proceso", pideSolucion: false });
  });

  it("mover una mejora a «En evaluación» no pide solución", () => {
    const mov = evaluarMovimientoKanban(filas, 1, "en_evaluacion");
    expect(mov).toMatchObject({ ok: true, destino: "en_evaluacion", pideSolucion: false });
  });

  it("exige la solución al mover a resuelto", () => {
    const mov = evaluarMovimientoKanban(filas, 2, "resuelto");
    expect(mov).toMatchObject({ ok: true, pideSolucion: true });
  });

  it("ignora soltar la tarjeta en su propia columna", () => {
    expect(evaluarMovimientoKanban(filas, 1, "abierto")).toEqual({ ok: false, motivo: "" });
  });

  it("rechaza un estado inexistente", () => {
    const mov = evaluarMovimientoKanban(filas, 1, "en_revision");
    expect(mov.ok).toBe(false);
  });

  it("rechaza un ticket que ya no está en el tablero", () => {
    const mov = evaluarMovimientoKanban(filas, 99, "cerrado");
    expect(mov.ok).toBe(false);
  });
});

describe("moverTicketKanban", () => {
  it("cambia solo el ticket movido y no muta el arreglo original", () => {
    const filas = [ticket(1, "abierto"), ticket(2, "abierto")];
    const siguiente = moverTicketKanban(filas, 1, "cerrado");
    expect(siguiente.map((t) => t.status)).toEqual(["cerrado", "abierto"]);
    expect(filas.map((t) => t.status)).toEqual(["abierto", "abierto"]);
  });
});

describe("filtrarCartasKanbanPorAsunto", () => {
  const cartas = [
    ticket(1, "abierto", { subject: "No carga el balance de julio", reportante: "Ana Pérez" }),
    ticket(2, "abierto", { subject: "Error al exportar el Excel", reportante: "Carlos Ruiz" }),
    ticket(3, "abierto", { subject: "Solicitud de acceso al módulo de nómina", reportante: "María José Gómez" }),
  ];

  it("sin término devuelve todas las tarjetas sin mutar el arreglo", () => {
    const resultado = filtrarCartasKanbanPorAsunto(cartas, "");
    expect(resultado).toEqual(cartas);
    expect(resultado).not.toBe(cartas);
  });

  it("un espacio en blanco cuenta como término vacío", () => {
    expect(filtrarCartasKanbanPorAsunto(cartas, "   ")).toEqual(cartas);
  });

  it("filtra por coincidencia parcial del asunto", () => {
    const resultado = filtrarCartasKanbanPorAsunto(cartas, "balance");
    expect(resultado.map((t) => t.id)).toEqual([1]);
  });

  it("ignora mayúsculas y acentos", () => {
    const resultado = filtrarCartasKanbanPorAsunto(cartas, "NOMINA");
    expect(resultado.map((t) => t.id)).toEqual([3]);
  });

  it("sin coincidencias devuelve un arreglo vacío", () => {
    expect(filtrarCartasKanbanPorAsunto(cartas, "inexistente")).toEqual([]);
  });

  it("no confunde el nombre del ticket con su código, ubicación o reportante", () => {
    expect(filtrarCartasKanbanPorAsunto(cartas, "TKT-1")).toEqual([]);
    expect(filtrarCartasKanbanPorAsunto(cartas, "Cargar balance")).toEqual([]);
    expect(filtrarCartasKanbanPorAsunto(cartas, "Carlos Ruiz")).toEqual([]);
  });
});
