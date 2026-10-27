import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ user: vi.fn(), decrypt: vi.fn() }));
vi.mock("react", () => ({ cache: (fn: unknown) => fn }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: "token" }) }) }));
vi.mock("next/navigation", () => ({ redirect: (ruta: string) => { throw new Error(`REDIRECT:${ruta}`); } }));
vi.mock("@/lib/jwt", () => ({ decrypt: mocks.decrypt }));
vi.mock("@/lib/prisma", () => ({ default: { user: { findUnique: mocks.user } } }));
import { getCurrentUser, verifySession } from "./dal";

const user = { id: 4, active: true, role: "Staff", sessionVersion: 2, mustChangePassword: false, name: "Prueba", email: "prueba@example.com" };
beforeEach(() => {
  vi.resetAllMocks();
  mocks.user.mockResolvedValue(user);
  mocks.decrypt.mockResolvedValue({ userId: 4, sessionVersion: 2 });
});
describe("frontera segura de sesión", () => {
  it("la sesión temporal sirve para cambiar contraseña, no para acceder a autoservicio/archivos", async () => {
    mocks.user.mockResolvedValue({ ...user, mustChangePassword: true });
    expect(await verifySession()).toMatchObject({ mustChangePassword: true, userId: 4 });
    expect(await getCurrentUser()).toBeNull();
  });
  it.each([{ active: false }, { sessionVersion: 3 }])("rechaza una sesión revocada: %j", async (cambio) => {
    mocks.user.mockResolvedValue({ ...user, ...cambio });
    expect(await getCurrentUser()).toBeNull();
    await expect(verifySession()).rejects.toThrow("REDIRECT:/sesion-expirada");
  });
  it("solo devuelve la identidad mínima de una sesión vigente", async () => {
    expect(await getCurrentUser()).toMatchObject({ id: 4, name: "Prueba", role: "Staff" });
    expect(await getCurrentUser()).not.toHaveProperty("password");
  });
});
