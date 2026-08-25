import { describe, expect, it } from "vitest";
import {
  agruparTicketsKanban,
  COLUMNAS_KANBAN,
  evaluarMovimientoKanban,
  moverTicketKanban,
  type TicketKanban,
} from "./soporte-kanban";
import { ESTADOS_TICKET } from "./soporte-estados";

function ticket(id: number, status: string): TicketKanban {
  return {
    id,
    code: `TKT-20260825-0000000${id}`,
    subject: `Novedad ${id}`,
    reportante: "Ana Pérez",
    esMio: false,
    ubicacion: "Balance · Cargar balance",
    dominio: "russell",
    status,
    adjuntos: 0,
    createdAt: "2026-08-25T10:00:00.000Z",
    updatedAt: "2026-08-25T10:00:00.000Z",
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
    expect(columnas.cerrado).toEqual([]);
  });

  it("siempre devuelve las cuatro columnas aunque no haya tickets", () => {
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
