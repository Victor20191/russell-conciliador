import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ session: vi.fn(), rows: vi.fn(), permiso: vi.fn(), balance: vi.fn(), modulo: vi.fn(), borrador: vi.fn(), conciliacion: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ default: { notification: { findMany: mocks.rows } } }));
vi.mock("@/lib/dal", () => ({ verifySession: mocks.session }));
vi.mock("@/lib/rbac", () => ({ authorizePermiso: mocks.permiso }));
vi.mock("@/lib/rbac/contexto", () => ({ clienteDeBalance: mocks.balance, clienteDeModuloDato: mocks.modulo, clienteDeLoteModulo: mocks.borrador, clienteDeConciliacion: mocks.conciliacion }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`REDIRECT:${url}`); } }));
import { listarNotificacionesActuales } from "./notificaciones-lectura";

const aviso = (extra: Record<string, unknown> = {}) => ({
  id: 1, userId: 7, clientId: 12, entityType: "balance", entityId: null,
  kind: "system", who: "Ana", text: "cerró el balance", target: "Cliente A",
  createdAt: new Date("2026-10-20T12:00:00Z"), unread: true, ...extra,
});
beforeEach(() => {
  vi.resetAllMocks();
  mocks.session.mockResolvedValue({ userId: 7, mustChangePassword: false });
  mocks.rows.mockResolvedValue([aviso()]);
  mocks.permiso.mockResolvedValue({ ok: true });
  mocks.balance.mockResolvedValue(12);
  mocks.modulo.mockResolvedValue(12);
  mocks.borrador.mockResolvedValue(12);
});
describe("campana personal con alcance vigente", () => {
  it("consulta solo no leídas del destinatario autenticado y devuelve un DTO mínimo", async () => {
    const result = await listarNotificacionesActuales();
    expect(mocks.rows).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 7, unread: true } }));
    expect(result).toHaveLength(1);
    expect(result[0]).not.toHaveProperty("userId");
    expect(result[0]).not.toHaveProperty("clientId");
    expect(mocks.permiso).toHaveBeenCalledWith("balance:ver", { clientId: 12, modo: "lectura" });
  });
  it("no revela avisos de otro usuario ni el legado sin dueño aunque llegue por error del repositorio", async () => {
    mocks.rows.mockResolvedValue([aviso({ userId: 8 }), aviso({ userId: null })]);
    expect(await listarNotificacionesActuales()).toEqual([]);
    expect(mocks.permiso).not.toHaveBeenCalled();
  });
  it("revocar permiso, publicación o cartera impide leer un aviso ya recibido", async () => {
    mocks.permiso.mockResolvedValue({ ok: false });
    expect(await listarNotificacionesActuales()).toEqual([]);
  });
  it("continúa después de una página de avisos revocados hasta encontrar los autorizados", async () => {
    mocks.rows.mockResolvedValueOnce(Array.from({ length: 100 }, (_, i) => aviso({ id: 200 - i, clientId: 90 })))
      .mockResolvedValueOnce([aviso({ id: 99 })]);
    mocks.permiso.mockImplementation(async (_permiso: string, scope: { clientId: number }) => ({ ok: scope.clientId === 12 }));
    expect((await listarNotificacionesActuales()).map((n) => n.id)).toEqual([99]);
    expect(mocks.rows).toHaveBeenLastCalledWith(expect.objectContaining({ cursor: { id: 101 }, skip: 1, take: 100 }));
  });
  it("omite entidades trasladadas a otra cartera o borradas", async () => {
    mocks.rows.mockResolvedValue([aviso({ entityType: "modulos_datos", entityId: 5, clientId: 12 })]);
    mocks.modulo.mockResolvedValue(90);
    expect(await listarNotificacionesActuales()).toEqual([]);
    expect(mocks.permiso).not.toHaveBeenCalled();
    mocks.modulo.mockResolvedValue(null);
    expect(await listarNotificacionesActuales()).toEqual([]);
  });
  it("el borrador requiere permiso de abrir su ruta y escritura sobre su cliente", async () => {
    mocks.rows.mockResolvedValue([aviso({ entityType: "modulos_borrador", entityId: 5 })]);
    mocks.permiso.mockImplementation(async (permiso: string) => ({ ok: permiso !== "modulos_datos:crear" }));
    expect(await listarNotificacionesActuales()).toEqual([]);
    expect(mocks.permiso).toHaveBeenCalledWith("modulos_datos:crear", { clientId: 12, modo: "escritura" });
  });
  it("DIAN conserva su permiso global; tipos desconocidos y clientes sin resolver fallan cerrados", async () => {
    mocks.rows.mockResolvedValue([aviso({ entityType: "dian", clientId: null }), aviso({ entityType: "desconocido" }), aviso({ clientId: null })]);
    expect(await listarNotificacionesActuales()).toHaveLength(1);
    expect(mocks.permiso).toHaveBeenCalledWith("dian:ver");
  });
  it("no consulta notificaciones cuando no hay sesión o falta cambiar contraseña", async () => {
    mocks.session.mockRejectedValueOnce(new Error("sesión revocada"));
    await expect(listarNotificacionesActuales()).rejects.toThrow("sesión revocada");
    mocks.session.mockResolvedValue({ userId: 7, mustChangePassword: true });
    await expect(listarNotificacionesActuales()).rejects.toThrow("REDIRECT:/cambiar-contrasena");
    expect(mocks.rows).not.toHaveBeenCalled();
  });
});
