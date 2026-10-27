import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const valores = new Map<string, string>();
  return {
    valores,
    cookieStore: {
      set: vi.fn((nombre: string, valor: string) => valores.set(nombre, valor)),
      delete: vi.fn((nombre: string) => valores.delete(nombre)),
    },
    findUnique: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    intento: vi.fn(),
    compare: vi.fn(),
    hash: vi.fn(),
    usuarioActual: vi.fn(),
    verificarSesion: vi.fn(),
    registrarAcceso: vi.fn(),
    registrarError: vi.fn(),
    registrarFallo: vi.fn(),
    finalizarLogin: vi.fn(),
    cuota: vi.fn(),
  };
});

vi.mock("next/headers", () => ({
  cookies: async () => mocks.cookieStore,
  headers: async () => new Headers({ "x-forwarded-proto": "http" }),
}));
vi.mock("next/navigation", () => ({
  redirect: (destino: string) => { throw new Error(`REDIRECT:${destino}`); },
}));
vi.mock("bcryptjs", () => ({ default: { compare: mocks.compare, hash: mocks.hash } }));
vi.mock("@/lib/prisma", () => ({
  default: {
    user: { findUnique: mocks.findUnique, update: mocks.update, updateMany: mocks.updateMany },
    loginAttempt: { create: mocks.intento },
  },
}));
vi.mock("@/lib/dal", () => ({
  verifySession: mocks.verificarSesion,
  getCurrentUser: mocks.usuarioActual,
}));
vi.mock("@/lib/request", () => ({
  getClientIp: async () => "127.0.0.1",
  getUserAgent: async () => "Vitest",
}));
vi.mock("@/lib/access-log", () => ({ registrarAcceso: mocks.registrarAcceso }));
vi.mock("@/lib/login-intentos", () => ({ registrarFalloLogin: mocks.registrarFallo, finalizarLogin: mocks.finalizarLogin }));
vi.mock("@/lib/seguridad/limite-solicitudes", () => ({
  consumirCuotaSolicitud: mocks.cuota,
  CUOTA_LOGIN: { ambito: "login", limiteIndividual: 30, limiteGlobal: 1000, ventanaSegundos: 900 },
}));
vi.mock("@/lib/errores", () => ({
  registrarError: mocks.registrarError,
  mensajeErrorBD: () => "Error simulado",
}));

import { changePassword, login, logout } from "./auth";
import { createSession } from "@/lib/session";
import { decrypt } from "@/lib/jwt";

const usuario = {
  id: 41,
  name: "Usuario de prueba",
  email: "prueba@example.com",
  role: "Staff",
  password: "hash-simulado",
  sessionVersion: 3,
  active: true,
  mustChangePassword: false,
  blockedUntil: null,
  failedLoginAttempts: 0,
  lastFailedLoginAt: null,
};

function credenciales() {
  const formulario = new FormData();
  formulario.set("email", usuario.email);
  formulario.set("password", "Prueba123!");
  return formulario;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.valores.clear();
  mocks.valores.set("session", "sesion-anterior");
  mocks.valores.set("nav_colapsada", "1");
  mocks.findUnique.mockResolvedValue(usuario);
  mocks.compare.mockResolvedValue(true);
  mocks.hash.mockResolvedValue("nuevo-hash");
  mocks.update.mockResolvedValue(usuario);
  mocks.updateMany.mockResolvedValue({ count: 1 });
  mocks.intento.mockResolvedValue({});
  mocks.usuarioActual.mockResolvedValue(usuario);
  mocks.verificarSesion.mockResolvedValue({ userId: usuario.id });
  mocks.registrarAcceso.mockResolvedValue(undefined);
  mocks.registrarFallo.mockResolvedValue(false);
  mocks.finalizarLogin.mockResolvedValue({ ok: true, user: usuario });
  mocks.cuota.mockResolvedValue({ permitida: true });
});

describe("navegación ligada a la sesión autenticada", () => {
  it("un login exitoso elimina la preferencia de otra sesión/cuenta", async () => {
    await expect(login(undefined, credenciales())).rejects.toThrow("REDIRECT:/dashboard");
    expect(mocks.valores.has("nav_colapsada")).toBe(false);
    expect((await decrypt(mocks.valores.get("session")))?.userId).toBe(usuario.id);
  });

  it("un usuario con contraseña restablecida debe elegir una nueva antes de entrar al dashboard", async () => {
    mocks.findUnique.mockResolvedValue({ ...usuario, mustChangePassword: true });
    mocks.finalizarLogin.mockResolvedValue({ ok: true, user: { ...usuario, mustChangePassword: true } });
    await expect(login(undefined, credenciales())).rejects.toThrow("REDIRECT:/cambiar-contrasena");
    expect((await decrypt(mocks.valores.get("session")))?.userId).toBe(usuario.id);
  });

  it("credenciales inválidas no cambian la preferencia ni crean sesión", async () => {
    mocks.compare.mockResolvedValue(false);
    expect(await login(undefined, credenciales())).toEqual({ message: "Credenciales inválidas." });
    expect(mocks.valores.get("nav_colapsada")).toBe("1");
    expect(mocks.cookieStore.set).not.toHaveBeenCalled();
    expect(mocks.cookieStore.delete).not.toHaveBeenCalled();
    expect(mocks.registrarFallo).toHaveBeenCalledWith(usuario.id, expect.any(Date));
  });

  it("logout elimina la sesión y el estado del menú", async () => {
    await expect(logout()).rejects.toThrow("REDIRECT:/login");
    expect(mocks.valores.has("session")).toBe(false);
    expect(mocks.valores.has("nav_colapsada")).toBe(false);
  });

  it("limpia ambos estados incluso si falla el registro de salida", async () => {
    mocks.registrarAcceso.mockRejectedValueOnce(new Error("Registro no disponible"));
    await expect(logout()).rejects.toThrow("REDIRECT:/login");
    expect(mocks.valores.has("session")).toBe(false);
    expect(mocks.valores.has("nav_colapsada")).toBe(false);
    expect(mocks.registrarError).toHaveBeenCalled();
  });

  it("renovar el JWT conserva el colapso de la sesión vigente", async () => {
    await createSession(usuario.id, usuario.role, usuario.sessionVersion + 1);
    expect(mocks.valores.get("nav_colapsada")).toBe("1");
    expect(mocks.cookieStore.delete).not.toHaveBeenCalled();
    expect((await decrypt(mocks.valores.get("session")))?.sessionVersion).toBe(4);
  });

  it("cambiar contraseña conserva el menú al renovar la sesión", async () => {
    const formulario = new FormData();
    formulario.set("current", "Prueba123!");
    formulario.set("next", "NuevaPrueba456!");
    await expect(changePassword(undefined, formulario)).rejects.toThrow("REDIRECT:/dashboard?pwd=1");
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { id: usuario.id, active: true, password: usuario.password, sessionVersion: 3 },
      data: { password: "nuevo-hash", mustChangePassword: false, sessionVersion: { increment: 1 } },
    });
    expect(mocks.valores.get("nav_colapsada")).toBe("1");
    expect((await decrypt(mocks.valores.get("session")))?.sessionVersion).toBe(4);
  });

  it("no renueva la sesión si otra solicitud cambió o desactivó la cuenta", async () => {
    mocks.updateMany.mockResolvedValue({ count: 0 });
    const formulario = new FormData();
    formulario.set("current", "Prueba123!");
    formulario.set("next", "NuevaPrueba456!");
    expect(await changePassword(undefined, formulario)).toMatchObject({ ok: false });
    expect(mocks.cookieStore.set).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });
});

describe("cuota compartida de inicio de sesión", () => {
  it("rechaza una cuota agotada antes de consultar cuentas o ejecutar bcrypt", async () => {
    mocks.cuota.mockResolvedValue({ permitida: false });
    expect(await login(undefined, credenciales())).toEqual({ message: "Demasiados intentos. Intenta de nuevo en unos minutos." });
    expect(mocks.cuota).toHaveBeenCalledWith({ ambito: "login", limiteIndividual: 30, limiteGlobal: 1000, ventanaSegundos: 900 }, "127.0.0.1");
    expect(mocks.findUnique).not.toHaveBeenCalled();
    expect(mocks.compare).not.toHaveBeenCalled();
    expect(mocks.intento).not.toHaveBeenCalled();
    expect(mocks.cookieStore.set).not.toHaveBeenCalled();
  });

  it("falla cerrado si la cuota compartida no está disponible", async () => {
    mocks.cuota.mockRejectedValue(new Error("No hay base de datos"));
    expect(await login(undefined, credenciales())).toMatchObject({ message: expect.stringContaining("error del sistema") });
    expect(mocks.findUnique).not.toHaveBeenCalled();
    expect(mocks.compare).not.toHaveBeenCalled();
    expect(mocks.cookieStore.set).not.toHaveBeenCalled();
  });

  it("consume cuota también para correos desconocidos", async () => {
    mocks.findUnique.mockResolvedValue(null);
    mocks.compare.mockResolvedValue(false);
    expect(await login(undefined, credenciales())).toEqual({ message: "Credenciales inválidas." });
    expect(mocks.cuota).toHaveBeenCalledOnce();
    expect(mocks.cuota.mock.invocationCallOrder[0]).toBeLessThan(mocks.findUnique.mock.invocationCallOrder[0]);
    expect(mocks.cuota.mock.invocationCallOrder[0]).toBeLessThan(mocks.compare.mock.invocationCallOrder[0]);
  });

  it("consume cuota también para accesos correctos", async () => {
    await expect(login(undefined, credenciales())).rejects.toThrow("REDIRECT:/dashboard");
    expect(mocks.cuota).toHaveBeenCalledOnce();
    expect(mocks.cuota.mock.invocationCallOrder[0]).toBeLessThan(mocks.findUnique.mock.invocationCallOrder[0]);
  });
});
