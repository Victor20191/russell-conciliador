import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  requirePermiso: vi.fn(),
  authorizePermiso: vi.fn(),
  getCurrentUser: vi.fn(),
  notFound: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  notFound: mocks.notFound,
}));
vi.mock("@/lib/prisma", () => ({
  default: { supportTicket: { findUnique: mocks.findUnique } },
}));
vi.mock("@/lib/rbac", () => ({
  requirePermiso: mocks.requirePermiso,
  authorizePermiso: mocks.authorizePermiso,
}));
vi.mock("@/lib/dal", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/soporte-rutas", () => ({ etiquetaUbicacionNovedad: () => null }));
vi.mock("@/components/ticket-historial", () => ({ default: () => "Historial" }));
vi.mock("@/components/ticket-url-pagina", () => ({ default: () => null }));
// Se capturan las props recibidas para comprobar el contrato de la
// unificación: la MISMA caja de gestión (`ticket-gestion-form`) y sus props,
// sin depender de su implementación interna.
let propsGestion: Record<string, unknown> | null = null;
vi.mock("../../config/soporte/ticket-gestion-form", () => ({
  default: (props: Record<string, unknown>) => {
    propsGestion = props;
    return "CAJA_DE_GESTION";
  },
}));
let propsMensaje: Record<string, unknown> | null = null;
vi.mock("@/components/ticket-mensaje-form", () => ({
  default: (props: Record<string, unknown>) => {
    propsMensaje = props;
    return "CAJA_DE_MENSAJE";
  },
}));

import ReporteDetallePage from "./page";

const TICKET_BASE = {
  id: 85,
  code: "TKT-85",
  createdById: 3,
  reporterFirstName: "Ana",
  reporterLastName: "Pérez",
  subject: "No carga el balance",
  description: "Al abrir /balance sale un error.",
  routeLabel: null,
  menuLabel: null,
  pageUrl: null,
  status: "abierto",
  solution: null,
  resolvedByName: null,
  resolvedAt: null,
  createdAt: new Date("2026-08-07T15:00:00.000Z"),
  updatedAt: new Date("2026-08-09T10:00:00.000Z"),
  attachments: [],
  messages: [],
  events: [],
};

async function render(params: { id: string }) {
  return renderToStaticMarkup(await ReporteDetallePage({ params: Promise.resolve(params) }));
}

describe("ReporteDetallePage — gestión sin salir de Ayuda", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    propsGestion = null;
    propsMensaje = null;
    mocks.requirePermiso.mockResolvedValue(undefined);
    mocks.getCurrentUser.mockResolvedValue({ id: 3, role: "Usuario" });
    mocks.findUnique.mockResolvedValue(TICKET_BASE);
  });

  test("quien administra soporte ve la caja de gestión (TicketGestionForm), no un enlace a /config/soporte", async () => {
    mocks.authorizePermiso.mockResolvedValue({ ok: true });

    const html = await render({ id: "85" });

    expect(html).toContain("CAJA_DE_GESTION");
    expect(html).not.toContain("CAJA_DE_MENSAJE");
    expect(html).not.toContain("Gestionar este ticket");
    expect(html).not.toContain("/config/soporte/85");
    // Contrato: la misma caja de `/config/soporte/[id]`, pero sin navegar
    // fuera de Ayuda al cerrar el ticket.
    expect(propsGestion).toMatchObject({
      navegarAlCerrar: false,
      ticket: {
        id: 85,
        code: "TKT-85",
        status: "abierto",
        tieneRespuesta: false,
        updatedAt: "2026-08-09T10:00:00.000Z",
      },
    });
  });

  test("quien no administra pero abrió el ticket conserva la caja simple de mensajes", async () => {
    mocks.authorizePermiso.mockResolvedValue({ ok: false, message: "Sin permiso." });

    const html = await render({ id: "85" });

    expect(html).toContain("CAJA_DE_MENSAJE");
    expect(html).not.toContain("CAJA_DE_GESTION");
    expect(propsMensaje).toMatchObject({ ticketId: 85, code: "TKT-85", lado: "reportante" });
  });

  test("un tercero sin permiso de gestión ni autoría no ve ninguna caja de escritura", async () => {
    mocks.authorizePermiso.mockResolvedValue({ ok: false, message: "Sin permiso." });
    mocks.getCurrentUser.mockResolvedValue({ id: 99, role: "Usuario" });

    const html = await render({ id: "85" });

    expect(html).not.toContain("CAJA_DE_GESTION");
    expect(html).not.toContain("CAJA_DE_MENSAJE");
  });

  test("propaga tieneRespuesta cuando el ticket ya tiene una respuesta oficial", async () => {
    mocks.authorizePermiso.mockResolvedValue({ ok: true });
    mocks.findUnique.mockResolvedValue({
      ...TICKET_BASE,
      status: "resuelto",
      solution: "Se corrigió el mapeo de la cuenta.",
      resolvedByName: "Soporte Xentria",
      resolvedAt: new Date("2026-08-10T09:00:00.000Z"),
    });

    await render({ id: "85" });

    expect(propsGestion).toMatchObject({ ticket: { tieneRespuesta: true, status: "resuelto" } });
  });
});
