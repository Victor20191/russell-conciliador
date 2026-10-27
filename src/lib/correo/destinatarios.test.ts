import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ users: vi.fn(), assignments: vi.fn(), hierarchy: vi.fn(), scope: vi.fn(), matrix: vi.fn(), published: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ default: { user: { findMany: mocks.users }, clientAssignment: { findMany: mocks.assignments }, userHierarchy: { findMany: mocks.hierarchy } } }));
vi.mock("@/lib/rbac/contexto", () => ({ getAsignacionesUsuario: mocks.scope, getMatriz: mocks.matrix }));
vi.mock("@/lib/rbac/publicacion", () => ({ moduloDisponibleParaRol: mocks.published }));
import { destinatariosAviso, usuariosDestinatariosAviso } from "./destinatarios";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.users.mockResolvedValue([{ id: 2, email: "ANA@example.com", role: "Senior" }]);
  mocks.matrix.mockResolvedValue({ Senior: ["balance:ver"], Socio: ["balance:ver"], Administrador: ["balance:ver"] });
  mocks.scope.mockResolvedValue({ asignaciones: [{ clientId: 12, userId: 2, readScope: true, writeScope: false, active: true }] });
  mocks.published.mockResolvedValue(true);
});
describe("destinatarios de notificaciones", () => {
  it("la campana identifica al usuario aunque no tenga una dirección de correo válida", async () => {
    mocks.users.mockResolvedValue([{ id: 2, role: "Administrador", email: "incorrecto" }]);
    const input = { permiso: "balance:ver", clienteId: 12, usuarioIds: [2] };
    expect(await usuariosDestinatariosAviso(input)).toEqual([{ id: 2, email: "incorrecto" }]);
    expect(await destinatariosAviso(input)).toEqual([]);
  });
  it("no difunde avisos globales ni de un cliente desconocido", async () => {
    expect(await destinatariosAviso({ permiso: "balance:ver" })).toEqual([]);
    expect(await destinatariosAviso({ permiso: "balance:ver", clienteId: null, usuarioIds: [2] })).toEqual([]);
    expect(mocks.users).not.toHaveBeenCalled();
  });
  it("menciones solo a usuarios activos, distintos del autor, con permiso y alcance", async () => {
    expect(await destinatariosAviso({ permiso: "balance:ver", clienteId: 12, actorId: 1, usuarioIds: [1, 2, 2] })).toEqual(["ana@example.com"]);
    expect(mocks.users).toHaveBeenCalledWith(expect.objectContaining({ where: { active: true, id: { in: [2] } } }));
    mocks.scope.mockResolvedValue({ asignaciones: [] });
    expect(await destinatariosAviso({ permiso: "balance:ver", clienteId: 12, usuarioIds: [2] })).toEqual([]);
  });
  it("ni rol sin permiso ni módulo sin publicar reciben información", async () => {
    mocks.matrix.mockResolvedValue({});
    expect(await destinatariosAviso({ permiso: "balance:ver", clienteId: 12, usuarioIds: [2] })).toEqual([]);
    mocks.matrix.mockResolvedValue({ Senior: ["balance:ver"] }); mocks.published.mockResolvedValue(false);
    expect(await destinatariosAviso({ permiso: "balance:ver", clienteId: 12, usuarioIds: [2] })).toEqual([]);
  });
  it("incluye al socio de los gerentes vigentes y excluye al actor, sin difundir a administradores", async () => {
    mocks.assignments.mockResolvedValue([{ userId: 2, role: "senior" }, { userId: 3, role: "gerente" }]);
    mocks.hierarchy.mockResolvedValue([{ superiorId: 4 }]);
    mocks.users.mockResolvedValueOnce([{ id: 4 }]).mockResolvedValueOnce([{ id: 4, role: "Socio", email: "socio@example.com" }]);
    mocks.scope.mockResolvedValue({ asignaciones: [{ userId: 4, clientId: 12, readScope: true, writeScope: false }] });
    expect(await destinatariosAviso({ permiso: "balance:ver", clienteId: 12, actorId: 2 })).toEqual(["socio@example.com"]);
    expect(mocks.assignments).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ active: true, clientId: 12, readScope: true, validFrom: { lte: expect.any(Date) }, OR: [{ validUntil: null }, { validUntil: { gte: expect.any(Date) } }] }) }));
    expect(mocks.users).toHaveBeenLastCalledWith(expect.objectContaining({ where: { active: true, id: { in: [3, 4] } } }));
  });
  it("deduplica correos y omite direcciones inválidas", async () => {
    mocks.users.mockResolvedValue([{ id: 2, role: "Administrador", email: "ANA@example.com" }, { id: 3, role: "Administrador", email: "ana@example.com" }, { id: 4, role: "Administrador", email: "incorrecto" }]);
    expect(await destinatariosAviso({ permiso: "balance:ver", clienteId: 12, usuarioIds: [2, 3, 4] })).toEqual(["ana@example.com"]);
  });
  it("la mención de borrador exige además permiso y alcance de carga para abrir la página", async () => {
    const input = { permiso: "modulos_borrador:ver", permisoRuta: "modulos_datos:crear", modoAlcance: "escritura" as const, clienteId: 12, usuarioIds: [2] };
    mocks.matrix.mockResolvedValue({ Senior: ["modulos_borrador:ver"] });
    expect(await destinatariosAviso(input)).toEqual([]);
    mocks.matrix.mockResolvedValue({ Senior: ["modulos_borrador:ver", "modulos_datos:crear"] });
    expect(await destinatariosAviso(input)).toEqual([]); // cartera de solo lectura
    mocks.scope.mockResolvedValue({ asignaciones: [{ userId: 2, clientId: 12, readScope: true, writeScope: true }] });
    expect(await destinatariosAviso(input)).toEqual(["ana@example.com"]);
    mocks.published.mockImplementation(async (_role: string, module: string) => module !== "modulos_datos");
    expect(await destinatariosAviso(input)).toEqual([]);
  });
});
