import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ permisos: vi.fn(), modulos: vi.fn() }));
vi.mock("react", () => ({ cache: (fn: unknown) => fn }));
vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn }));
vi.mock("@/lib/dal", () => ({ verifySession: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ default: {
  rolePermission: { findMany: mocks.permisos },
  platformModule: { findMany: mocks.modulos },
} }));

import { getMatriz } from "./contexto";
import { getPublicacionModulos, moduloDisponibleParaRol } from "./publicacion";

beforeEach(() => vi.resetAllMocks());

describe("autorización sin recuperación permisiva", () => {
  it("una matriz vacía no restaura los permisos de fábrica", async () => {
    mocks.permisos.mockResolvedValue([]);
    expect(await getMatriz()).toEqual({});
  });

  it("respeta exclusivamente los permisos vigentes de la base", async () => {
    mocks.permisos.mockResolvedValue([
      { role: { code: "Staff" }, permission: { code: "balance:ver" } },
    ]);
    expect(await getMatriz()).toEqual({ Staff: ["balance:ver"] });
  });

  it("aborta si falla la consulta de permisos", async () => {
    mocks.permisos.mockRejectedValue(new Error("consulta no disponible"));
    await expect(getMatriz()).rejects.toThrow("consulta no disponible");
  });

  it("no publica módulos por un error de consulta", async () => {
    mocks.modulos.mockRejectedValue(new Error("consulta no disponible"));
    await expect(getPublicacionModulos()).rejects.toThrow("consulta no disponible");
    await expect(moduloDisponibleParaRol("Staff", "balance")).rejects.toThrow("consulta no disponible");
  });

  it("mantiene oculto un módulo despublicado por el administrador", async () => {
    mocks.modulos.mockResolvedValue([{ key: "balance", enabledForNonAdmins: false }]);
    expect(await moduloDisponibleParaRol("Staff", "balance")).toBe(false);
    expect(await moduloDisponibleParaRol("Superadministrador", "balance")).toBe(true);
  });
});
