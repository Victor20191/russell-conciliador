import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  find: vi.fn(), query: vi.fn(), update: vi.fn(), intento: vi.fn(), compare: vi.fn(),
  crearSesion: vi.fn(), limpiar: vi.fn(), cuota: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ default: {
  user: { findUnique: mocks.find, update: mocks.update },
  loginAttempt: { create: mocks.intento },
  $transaction: (fn: (tx: unknown) => unknown) => fn({ $queryRaw: mocks.query, user: { update: mocks.update } }),
} }));
vi.mock("bcryptjs", () => ({ default: { compare: mocks.compare } }));
vi.mock("next/navigation", () => ({ redirect: (ruta: string) => { throw new Error(`REDIRECT:${ruta}`); } }));
vi.mock("@/lib/session", () => ({ createSession: mocks.crearSesion, deleteSession: vi.fn(), limpiarPreferenciaNavegacion: mocks.limpiar }));
vi.mock("@/lib/dal", () => ({ verifySession: vi.fn(), getCurrentUser: vi.fn() }));
vi.mock("@/lib/request", () => ({ getClientIp: async () => "127.0.0.1", getUserAgent: async () => "Vitest" }));
vi.mock("@/lib/access-log", () => ({ registrarAcceso: vi.fn() }));
vi.mock("@/lib/errores", () => ({ registrarError: vi.fn(), mensajeErrorBD: vi.fn() }));
vi.mock("@/lib/seguridad/limite-solicitudes", () => ({ consumirCuotaSolicitud: mocks.cuota, CUOTA_LOGIN: {} }));

import { login } from "./auth";
import { registrarFalloLogin } from "@/lib/login-intentos";

const cuenta = {
  id: 7, name: "Cuenta", role: "Staff", email: "cuenta@example.com", password: "hash-original",
  sessionVersion: 4, active: true, mustChangePassword: false, blockedUntil: null as Date | null,
  failedLoginAttempts: 4, lastFailedLoginAt: new Date(),
};

function diferido<T>() {
  let resolver!: (valor: T) => void;
  const promesa = new Promise<T>((resolve) => { resolver = resolve; });
  return { promesa, resolver };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.cuota.mockResolvedValue({ permitida: true });
});

describe("cambios de cuenta mientras bcrypt está pendiente", () => {
  it("el quinto fallo concurrente prevalece sobre un login correcto ya iniciado", async () => {
    let vigente = { ...cuenta };
    mocks.find.mockImplementation(async () => ({ ...vigente }));
    mocks.query.mockImplementation(async () => [{ ...vigente }]);
    mocks.update.mockImplementation(async ({ data }) => { vigente = { ...vigente, ...data }; return vigente; });
    const bcryptPendiente = diferido<boolean>();
    const bcryptIniciado = diferido<void>();
    mocks.compare.mockImplementation(() => { bcryptIniciado.resolver(); return bcryptPendiente.promesa; });
    const formulario = new FormData();
    formulario.set("email", cuenta.email);
    formulario.set("password", "Clave123!");
    const loginPendiente = login(undefined, formulario);
    await bcryptIniciado.promesa;
    expect(await registrarFalloLogin(cuenta.id)).toBe(true);
    const bloqueo = vigente.blockedUntil;
    bcryptPendiente.resolver(true);
    expect(await loginPendiente).toEqual({ message: "Demasiados intentos. Intenta de nuevo en unos minutos." });
    expect(vigente.blockedUntil).toBe(bloqueo);
    expect(vigente.failedLoginAttempts).toBe(5);
    expect(mocks.update).toHaveBeenCalledOnce();
    expect(mocks.crearSesion).not.toHaveBeenCalled();
    expect(mocks.limpiar).not.toHaveBeenCalled();
    expect(mocks.intento).toHaveBeenCalledWith({ data: { email: cuenta.email, ip: "127.0.0.1", success: false } });
  });

  it.each([
    ["restablecimiento", { password: "hash-nuevo", sessionVersion: 5 }],
    ["revocación", { sessionVersion: 5 }],
    ["desactivación", { active: false }],
  ])("un login pendiente no crea sesión después de %s", async (_nombre, cambio) => {
    let vigente = { ...cuenta };
    mocks.find.mockImplementation(async () => ({ ...vigente }));
    mocks.query.mockImplementation(async () => [{ ...vigente }]);
    const bcryptPendiente = diferido<boolean>();
    const bcryptIniciado = diferido<void>();
    mocks.compare.mockImplementation(() => { bcryptIniciado.resolver(); return bcryptPendiente.promesa; });
    const formulario = new FormData();
    formulario.set("email", cuenta.email);
    formulario.set("password", "Clave123!");
    const pendiente = login(undefined, formulario);
    await bcryptIniciado.promesa;
    vigente = { ...vigente, ...cambio };
    bcryptPendiente.resolver(true);
    expect(await pendiente).toEqual({ message: "Credenciales inválidas." });
    expect(mocks.crearSesion).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
