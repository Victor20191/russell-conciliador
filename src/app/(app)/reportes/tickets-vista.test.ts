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

vi.mock("@/app/actions/soporte-preferencias", () => ({ guardarEstadosOcultosTickets: vi.fn() }));

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


describe("preferencias de estados de Ayuda", () => {
  const cerrada = { ...TICKET, id: 2, code: "TKT-2", subject: "Solicitud finalizada", status: "cerrado" };
  it("aplica la preferencia guardada desde el primer HTML y muestra cómo recuperarlos", () => {
    const html = renderToStaticMarkup(createElement(TicketsVista, {
      tickets: [TICKET, cerrada], puedeMover: false, puedeEliminar: false,
      estadosOcultosIniciales: ["resuelto", "cerrado"],
    }));
    expect(html).toContain(TICKET.subject);
    expect(html).not.toContain(cerrada.subject);
    expect(html.match(/type="checkbox"/g)).toHaveLength(5);
    expect(html.match(/checked=""/g)).toHaveLength(3);
    expect(html).toContain("Mostrar todos");
    expect(html).toContain("Estados visibles");
  });
  it("respeta no ocultar ninguno", () => {
    const html = renderToStaticMarkup(createElement(TicketsVista, {
      tickets: [cerrada], puedeMover: false, puedeEliminar: false, estadosOcultosIniciales: [],
    }));
    expect(html).toContain(cerrada.subject);
    expect(html.match(/checked=""/g)).toHaveLength(5);
  });
  it("explica un listado vacío por estados y permite mostrarlos temporalmente", () => {
    const html = renderToStaticMarkup(createElement(TicketsVista, {
      tickets: [cerrada], puedeMover: false, puedeEliminar: false, estadosOcultosIniciales: ["cerrado"],
    }));
    expect(html).toContain("Los tickets coincidentes están en estados ocultos");
    expect(html).toContain("Mostrar todos temporalmente");
    expect(html).not.toContain("Ningún reporte de ese origen");
  });
  it("permite configurar los estados incluso sin tickets", () => {
    const html = renderToStaticMarkup(createElement(TicketsVista, {
      tickets: [], puedeMover: false, puedeEliminar: false, estadosOcultosIniciales: ["cerrado"],
    }));
    expect(html).toContain("Estados visibles");
    expect(html).toContain("Todavía no hay novedades");
  });
});
