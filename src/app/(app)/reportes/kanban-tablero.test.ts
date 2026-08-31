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
