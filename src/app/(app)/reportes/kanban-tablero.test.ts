import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock("@/app/actions/soporte", () => ({
  cambiarEstadoTicket: vi.fn(),
}));

vi.mock("@/lib/client-notifications", () => ({
  notifyError: vi.fn(),
  notifySuccess: vi.fn(),
}));

vi.mock("@/components/modal", () => ({
  Modal: () => null,
}));

vi.mock("@/components/ticket-eliminar-modal", () => ({
  default: () => null,
}));

import type { TicketKanban } from "@/lib/soporte-kanban";
import KanbanTablero from "./kanban-tablero";

const TICKET: TicketKanban = {
  id: 1,
  code: "TKT-1",
  subject: "No carga el balance de julio",
  status: "abierto",
  reportante: "Ana Pérez",
  esMio: false,
  dominio: "otros",
  ubicacion: "Balance de comprobación · Balance",
  adjuntos: 0,
  createdAt: "2026-08-25T10:00:00.000Z",
  updatedAt: "2026-08-25T10:00:00.000Z",
};

describe("KanbanTablero", () => {
  it("ofrece una flecha de búsqueda accesible en cada columna", () => {
    const html = renderToStaticMarkup(
      createElement(KanbanTablero, {
        tickets: [TICKET],
        puedeMover: false,
        puedeEliminar: false,
        onAbrir: () => undefined,
      }),
    );

    expect(html.match(/aria-expanded="false"/g)).toHaveLength(5);
    for (const etiqueta of ["Abierto", "En evaluación", "En proceso", "Resuelto", "Cerrado"]) {
      expect(html).toContain(`aria-label="Buscar por nombre del ticket en ${etiqueta}"`);
    }
  });
});


it("oculta columnas completas y adapta el ancho sin quitar destinos del selector", () => {
  const html = renderToStaticMarkup(createElement(KanbanTablero, {
    tickets: [TICKET, { ...TICKET, id: 2, subject: "Finalizado", status: "cerrado" }],
    puedeMover: true, puedeEliminar: false, onAbrir: () => undefined,
    estadosOcultos: ["resuelto", "cerrado"],
  }));
  expect(html).not.toContain('aria-label="Cerrado (1)"');
  expect(html).not.toContain('aria-label="Resuelto (0)"');
  expect(html).not.toContain("Finalizado");
  expect(html).toContain("lg:grid-cols-3");
  expect(html).not.toContain("xl:grid-cols-5");
  expect(html).toContain('value="cerrado"');
  expect(html).toContain('value="resuelto"');
});
