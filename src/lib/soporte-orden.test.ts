import { describe, expect, it } from "vitest";
import { ESTADOS_TICKET } from "@/lib/soporte-estados";
import type { TicketKanban } from "@/lib/soporte-kanban";
import { ordenarTickets, valorColumnaTicket } from "./soporte-orden";

const ticket = (over: Partial<TicketKanban>): TicketKanban => ({
  id: 1,
  code: "TKT-1",
  subject: "Asunto",
  reportante: "Persona",
  esMio: false,
  ubicacion: null,
  dominio: "otros" as TicketKanban["dominio"],
  status: ESTADOS_TICKET[0],
  tieneRespuesta: false,
  adjuntos: 0,
  createdAt: "2026-11-01T10:00:00.000Z",
  updatedAt: "2026-11-01T10:00:00.000Z",
  ...over,
});

const LISTA = [
  ticket({ id: 1, code: "TKT-100", subject: "Botón", reportante: "Camilo", status: ESTADOS_TICKET[3], adjuntos: 0, createdAt: "2026-11-19T22:03:00.000Z" }),
  ticket({ id: 2, code: "TKT-99", subject: "Fecha de corte", reportante: "Yuli", status: ESTADOS_TICKET[0], adjuntos: 2, createdAt: "2026-11-18T14:56:00.000Z" }),
  ticket({ id: 3, code: "TKT-9", subject: "árbol", reportante: "Ana", esMio: true, status: ESTADOS_TICKET[2], adjuntos: 1, createdAt: "2026-10-01T08:00:00.000Z", ubicacion: "Nómina" }),
];
const ids = (lista: TicketKanban[]) => lista.map((t) => t.id);

describe("orden de la tabla de la Mesa de ayuda", () => {
  it("sin orden deja las novedades como llegaron", () => {
    expect(ids(ordenarTickets(LISTA, null))).toEqual([1, 2, 3]);
  });

  it("el código ordena por su número: TKT-9, TKT-99, TKT-100", () => {
    expect(ids(ordenarTickets(LISTA, { columna: "codigo", direccion: "asc" }))).toEqual([3, 2, 1]);
    expect(ids(ordenarTickets(LISTA, { columna: "codigo", direccion: "desc" }))).toEqual([1, 2, 3]);
  });

  it("el estado sigue el orden del flujo y la fecha su valor real", () => {
    expect(ids(ordenarTickets(LISTA, { columna: "estado", direccion: "asc" }))).toEqual([2, 3, 1]);
    expect(ids(ordenarTickets(LISTA, { columna: "creado", direccion: "asc" }))).toEqual([3, 2, 1]);
    expect(ids(ordenarTickets(LISTA, { columna: "imagenes", direccion: "desc" }))).toEqual([2, 3, 1]);
  });

  it("los textos ordenan en español y sin ubicación va al final", () => {
    // «árbol» junto a la «a»; «Tú» es quien reportó cuando es uno mismo.
    expect(ids(ordenarTickets(LISTA, { columna: "asunto", direccion: "asc" }))).toEqual([3, 1, 2]);
    expect(valorColumnaTicket(LISTA[2], "reportado")).toBe("Tú");
    expect(ids(ordenarTickets(LISTA, { columna: "ubicacion", direccion: "desc" }))).toEqual([3, 1, 2]);
  });
});
