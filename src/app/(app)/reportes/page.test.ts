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
}));

vi.mock("@/lib/prisma", () => ({
  default: {
    supportTicket: {
      count: mocks.count,
      findMany: mocks.findMany,
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
vi.mock("./nueva-novedad-form", () => ({ default: () => null }));

import ReportesPage from "./page";

describe("contador de tickets abiertos en reportes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requirePermiso.mockResolvedValue(undefined);
    mocks.authorizePermiso.mockResolvedValue({ ok: false });
    mocks.getCurrentUser.mockResolvedValue({ id: 7, role: "Usuario" });
    mocks.getMatriz.mockResolvedValue({ Usuario: ["soporte:ver"] });
    mocks.getPublicacionModulos.mockResolvedValue({});
    mocks.findMany.mockResolvedValue([]);
  });

  test("cuenta solo tickets abiertos de la bandeja interna y muestra el total", async () => {
    mocks.count.mockResolvedValue(3);

    const html = renderToStaticMarkup(await ReportesPage());

    expect(mocks.requirePermiso).toHaveBeenCalledWith("soporte:ver");
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { createdById: { not: null } },
    }));
    expect(mocks.count).toHaveBeenCalledWith({
      where: {
        createdById: { not: null },
        status: "abierto",
      },
    });
    expect(html).toContain("3</strong> tickets abiertos");
  });

  test("usa singular cuando hay un solo ticket abierto", async () => {
    mocks.count.mockResolvedValue(1);

    const html = renderToStaticMarkup(await ReportesPage());

    expect(html).toContain("1</strong> ticket abierto");
  });
});
