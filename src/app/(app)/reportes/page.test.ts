import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authorizePermiso: vi.fn(),
  count: vi.fn(),
  findMany: vi.fn(),
  getCurrentUser: vi.fn(),
  getMatriz: vi.fn(),
  getPublicacionModulos: vi.fn(),
  requirePermiso: vi.fn(),
  userFindMany: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  default: {
    supportTicket: {
      count: mocks.count,
      findMany: mocks.findMany,
    },
    user: {
      findMany: mocks.userFindMany,
    },
  },
}));

vi.mock("@/lib/rbac", () => ({
  authorizePermiso: mocks.authorizePermiso,
  requirePermiso: mocks.requirePermiso,
}));

vi.mock("@/lib/dal", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/rbac/contexto", () => ({ getMatriz: mocks.getMatriz }));
vi.mock("@/lib/rbac/publicacion", () => ({
  getPublicacionModulos: mocks.getPublicacionModulos,
}));
vi.mock("@/lib/storage/evidencias-tickets", () => ({
  almacenamientoEvidenciasTicketsDisponible: () => false,
}));
vi.mock("@/lib/soporte-rutas", () => ({
  catalogoUbicacionesNovedad: () => [],
  etiquetaUbicacionNovedad: () => null,
}));
vi.mock("./nueva-novedad-form", () => ({ default: () => "Nueva novedad" }));
// La vista es un componente cliente; aquí solo interesa QUÉ filas recibe.
vi.mock("./tickets-vista", () => ({
  default: (props: { tickets: { dominio: string }[] }) => {
    propsVista = props;
    return "Listado";
  },
}));

import ReportesPage from "./page";

let propsVista: { tickets: { dominio: string }[] } | null = null;
const vistaRecibida = () => propsVista;

function ticketBD(parcial: { id: number; createdById: number | null }) {
  return {
    code: `TKT-${parcial.id}`,
    reporterFirstName: "Ana",
    reporterLastName: "Pérez",
    subject: "Novedad",
    routeLabel: null,
    menuLabel: null,
    status: "abierto",
    createdAt: new Date("2026-08-25T10:00:00.000Z"),
    updatedAt: new Date("2026-08-25T10:00:00.000Z"),
    _count: { attachments: 0 },
    ...parcial,
  };
}

describe("encabezado de reportes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requirePermiso.mockResolvedValue(undefined);
    mocks.authorizePermiso.mockResolvedValue({ ok: false });
    mocks.getCurrentUser.mockResolvedValue({ id: 7, role: "Usuario" });
    mocks.getMatriz.mockResolvedValue({ Usuario: ["soporte:ver"] });
    mocks.getPublicacionModulos.mockResolvedValue({});
    mocks.findMany.mockResolvedValue([]);
    mocks.userFindMany.mockResolvedValue([]);
    propsVista = null;
  });

  test("retira el indicador y su consulta sin ocultar las acciones", async () => {
    mocks.authorizePermiso
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: true });

    const html = renderToStaticMarkup(await ReportesPage());

    expect(mocks.requirePermiso).toHaveBeenCalledWith("soporte:ver");
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { createdById: { not: null } },
    }));
    expect(mocks.count).not.toHaveBeenCalled();
    expect(html).not.toMatch(/tickets? abiertos?/i);
    expect(html).toContain("Bandeja de Xentria");
    expect(html).toContain("Nueva novedad");
  });
  test("resuelve el dominio del reportante con una sola consulta por ids únicos", async () => {
    // Dos tickets del mismo creador y uno de otro: la consulta de correos no
    // debe repetir ids ni convertirse en un N+1.
    mocks.findMany.mockResolvedValue([
      ticketBD({ id: 1, createdById: 11 }),
      ticketBD({ id: 2, createdById: 11 }),
      ticketBD({ id: 3, createdById: 22 }),
    ]);
    mocks.userFindMany.mockResolvedValue([
      { id: 11, email: "ana@russellbedford.co" },
      { id: 22, email: "luis@xentria.co" },
    ]);

    renderToStaticMarkup(await ReportesPage());

    expect(mocks.userFindMany).toHaveBeenCalledTimes(1);
    expect(mocks.userFindMany).toHaveBeenCalledWith({
      where: { id: { in: [11, 22] } },
      select: { id: true, email: true },
    });
    expect(vistaRecibida()?.tickets.map((t) => t.dominio)).toEqual([
      "russell",
      "russell",
      "xentria",
    ]);
  });

  test("clasifica en «otros» al reportante cuyo usuario ya no existe", async () => {
    // `deleteUser` no limpia los tickets, así que el id puede quedar huérfano:
    // el ticket debe seguir en el listado, no desaparecer por no clasificarse.
    mocks.findMany.mockResolvedValue([ticketBD({ id: 1, createdById: 99 })]);
    mocks.userFindMany.mockResolvedValue([]);

    renderToStaticMarkup(await ReportesPage());

    expect(vistaRecibida()?.tickets.map((t) => t.dominio)).toEqual(["otros"]);
  });

  test("no consulta correos cuando no hay tickets", async () => {
    renderToStaticMarkup(await ReportesPage());

    expect(mocks.userFindMany).not.toHaveBeenCalled();
  });
});
