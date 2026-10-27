import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ transaction: vi.fn(), query: vi.fn(), update: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ default: { $transaction: mocks.transaction } }));
import { finalizarLogin, registrarFalloLogin } from "./login-intentos";
import { LOGIN_WINDOW_MS } from "./login-throttle";

const now = new Date("2026-10-20T12:00:00Z");
beforeEach(() => {
  vi.resetAllMocks();
  mocks.transaction.mockImplementation((fn) => fn({ $queryRaw: mocks.query, user: { update: mocks.update } }));
});

describe("finalización de un login comprobado", () => {
  const cuenta = {
    id: 7, name: "Cuenta", role: "Consulta", password: "hash-original", sessionVersion: 4,
    mustChangePassword: true, active: true, blockedUntil: null,
  };
  const comprobado = { userId: 7, passwordHash: cuenta.password, sessionVersion: 4 };

  it("toma bloqueo y devuelve solo datos vigentes de sesión, sin el hash", async () => {
    mocks.query.mockResolvedValue([cuenta]);
    expect(await finalizarLogin(comprobado)).toEqual({ ok: true, user: {
      id: 7, name: "Cuenta", role: "Consulta", sessionVersion: 4, mustChangePassword: true,
    } });
    expect(mocks.query.mock.calls[0][0].join("?")).toContain("FOR UPDATE");
    expect(mocks.update).toHaveBeenCalledWith({ where: { id: 7 }, data: {
      lastLoginAt: expect.any(Date), failedLoginAttempts: 0, lastFailedLoginAt: null, blockedUntil: null,
    } });
  });

  it.each([
    ["desactivada", { ...cuenta, active: false }],
    ["contraseña restablecida", { ...cuenta, password: "otro-hash" }],
    ["sesiones revocadas", { ...cuenta, sessionVersion: 5 }],
    ["eliminada", null],
  ])("no modifica la cuenta %s durante bcrypt", async (_nombre, vigente) => {
    mocks.query.mockResolvedValue(vigente ? [vigente] : []);
    expect(await finalizarLogin(comprobado)).toEqual({ ok: false, bloqueada: false });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("conserva un bloqueo establecido por otros intentos en vuelo", async () => {
    mocks.query.mockResolvedValue([{ ...cuenta, blockedUntil: new Date(Date.now() + LOGIN_WINDOW_MS) }]);
    expect(await finalizarLogin(comprobado)).toEqual({ ok: false, bloqueada: true });
    expect(mocks.update).not.toHaveBeenCalled();
  });
});

describe("contador de fallos de autenticación", () => {
  it("usa el contador vigente bajo bloqueo de fila, no el leído antes de bcrypt", async () => {
    mocks.query.mockResolvedValue([{ failedLoginAttempts: 4, lastFailedLoginAt: now, blockedUntil: null }]);
    expect(await registrarFalloLogin(7, now)).toBe(true);
    const [sql, id] = mocks.query.mock.calls[0];
    expect(sql.join("?")).toContain("FOR UPDATE");
    expect(id).toBe(7);
    expect(mocks.update).toHaveBeenCalledWith({ where: { id: 7 }, data: {
      failedLoginAttempts: 5, lastFailedLoginAt: now, blockedUntil: new Date(now.getTime() + LOGIN_WINDOW_MS),
    } });
  });

  it("no prolonga un bloqueo ya vigente con solicitudes en vuelo", async () => {
    mocks.query.mockResolvedValue([{ failedLoginAttempts: 5, lastFailedLoginAt: now, blockedUntil: new Date(now.getTime() + 1000) }]);
    expect(await registrarFalloLogin(7, now)).toBe(true);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("no escribe si la cuenta fue desactivada o eliminada", async () => {
    mocks.query.mockResolvedValue([]);
    expect(await registrarFalloLogin(7, now)).toBe(false);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("aborta si no puede proteger el contador", async () => {
    mocks.query.mockRejectedValue(new Error("base no disponible"));
    await expect(registrarFalloLogin(7, now)).rejects.toThrow("base no disponible");
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
