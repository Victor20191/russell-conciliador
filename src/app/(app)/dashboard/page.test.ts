import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ scope: vi.fn(), permiso: vi.fn(), audit: vi.fn() }));
vi.mock("@/lib/dal", () => ({ getCurrentUser: async () => ({ id: 7, name: "Ana" }) }));
vi.mock("@/lib/rbac", () => ({ authorizePermiso: mocks.permiso }));
vi.mock("@/lib/rbac/contexto", () => ({ alcanceLecturaUsuario: mocks.scope }));
vi.mock("./inicio-en-preparacion", () => ({ default: () => "Inicio en preparación" }));
vi.mock("@/components/flash-toast", () => ({ FlashToast: () => null }));
vi.mock("@/lib/prisma", () => ({ default: {
  reconciliation: { findMany: async () => [] },
  reconciliationRow: { aggregate: async () => ({ _sum: { diff: 0 } }) },
  clientModule: { count: async () => 0 },
  auditEntry: { findMany: mocks.audit },
  client: { findMany: async () => [] },
  $transaction: (queries: Promise<unknown>[]) => Promise.all(queries),
} }));
import DashboardPage from "./page";

const eventos = [
  { id: 1, clientId: 12, user: "Ana", action: "EDITÓ", entity: "Balance A", detail: "Nota visible", createdAt: new Date() },
  { id: 2, clientId: 90, user: "Luis", action: "EDITÓ", entity: "Cliente ajeno", detail: "Saldo reservado", createdAt: new Date() },
  { id: 3, clientId: null, user: "Admin", action: "EDITÓ", entity: "Configuración", detail: "Nota interna", createdAt: new Date() },
];
beforeEach(() => {
  vi.resetAllMocks();
  mocks.permiso.mockResolvedValue({ ok: true });
  mocks.scope.mockResolvedValue({ todos: false, clientIds: [12] });
  mocks.audit.mockImplementation(async ({ where, take }: { where: { clientId?: { in: number[] } }; take: number }) =>
    eventos.filter((e) => !where.clientId || (e.clientId != null && where.clientId.in.includes(e.clientId))).slice(0, take));
});
it("la actividad no muestra detalles de clientes ajenos ni eventos globales a una cartera limitada", async () => {
  const html = renderToStaticMarkup(await DashboardPage({ searchParams: Promise.resolve({}) }));
  expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ where: { clientId: { in: [12] } } }));
  expect(html).toContain("Nota visible");
  expect(html).not.toContain("Saldo reservado");
  expect(html).not.toContain("Nota interna");
});
it("el alcance global conserva el historial de actividad completo", async () => {
  mocks.scope.mockResolvedValue({ todos: true, clientIds: [] });
  const html = renderToStaticMarkup(await DashboardPage({ searchParams: Promise.resolve({}) }));
  expect(html).toContain("Saldo reservado");
});
it("sin permiso de auditoría no devuelve actividad ni muestra la tarjeta aunque Inicio esté publicado", async () => {
  mocks.permiso.mockImplementation(async (permiso: string) => ({ ok: permiso !== "auditoria:ver" }));
  mocks.scope.mockResolvedValue({ todos: true, clientIds: [] });
  const html = renderToStaticMarkup(await DashboardPage({ searchParams: Promise.resolve({}) }));
  expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ take: 0 }));
  expect(html).not.toContain("Actividad del equipo");
  expect(html).not.toContain("Nota visible");
  expect(html).not.toContain("Saldo reservado");
  expect(html).not.toContain("Nota interna");
});
it("Inicio sin publicar no consulta datos de actividad", async () => {
  mocks.permiso.mockResolvedValue({ ok: false });
  renderToStaticMarkup(await DashboardPage({ searchParams: Promise.resolve({}) }));
  expect(mocks.audit).not.toHaveBeenCalled();
});
