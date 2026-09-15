import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock("@/app/actions/soporte", () => ({
  agregarMensajeTicket: vi.fn(),
  cambiarEstadoTicket: vi.fn(),
  eliminarTicketSoporte: vi.fn(),
  obtenerDetalleTicket: vi.fn(),
}));

vi.mock("@/lib/client-notifications", () => ({
  notifyError: vi.fn(),
  notifySuccess: vi.fn(),
}));

import type { TicketKanban } from "@/lib/soporte-kanban";
import TicketsVista from "./tickets-vista";

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

function render() {
  return renderToStaticMarkup(
    createElement(TicketsVista, {
      tickets: [TICKET],
      puedeMover: false,
      puedeEliminar: false,
    }),
  );
}

describe("TicketsVista", () => {
  it("ofrece el buscador global de tickets junto a los filtros", () => {
    const html = render();

    expect(html).toContain('aria-label="Buscar tickets por código, asunto, persona o ubicación"');
    expect(html).toContain("Buscar por código, asunto, persona o ubicación…");
  });
});
