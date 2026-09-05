import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ auth: vi.fn(), find: vi.fn(), revisar: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/lib/rbac", () => ({ authorizePermiso: m.auth }));
vi.mock("@/lib/prisma", () => ({ default: { balancePruebaEncabezado: { findUnique: m.find } } }));
vi.mock("@/lib/balance/cruce-aperturas-servidor", () => ({ revisarCrucesAperturasSeguro: m.revisar }));
vi.mock("@/lib/dal", () => ({ getCurrentUser: vi.fn(async () => ({ name: "Analista" })) }));
vi.mock("next/cache", () => ({ revalidatePath: m.revalidate }));
import { revisarAperturasBalance } from "./balance-cruce-aperturas";

beforeEach(() => { vi.resetAllMocks(); m.auth.mockResolvedValue({ ok: true }); m.find.mockResolvedValue({ clienteId: 151 }); m.revisar.mockResolvedValue(true); });
describe("autorización del control de aperturas", () => {
  it("rechaza antes de consultar la BD cuando no tiene permiso", async () => {
    m.auth.mockResolvedValue({ ok: false });
    expect((await revisarAperturasBalance(1)).ok).toBe(false);
    expect(m.find).not.toHaveBeenCalled();
    expect(m.revisar).not.toHaveBeenCalled();
  });
  it("revalida el alcance usando el cliente REAL del balance", async () => {
    m.auth.mockImplementation(async (_permiso, scope) => ({ ok: !scope, message: "Fuera de cartera" }));
    expect((await revisarAperturasBalance(1)).ok).toBe(false);
    expect(m.auth).toHaveBeenCalledWith("balance:crear", { clientId: 151 });
    expect(m.revisar).not.toHaveBeenCalled();
  });
  it("admite al editor que no tiene permiso para cargar y mantiene el alcance", async () => {
    m.auth.mockImplementation(async (permiso) => ({ ok: permiso === "balance:editar" }));
    expect((await revisarAperturasBalance(1)).ok).toBe(true);
    expect(m.auth).toHaveBeenCalledWith("balance:editar", { clientId: 151 });
    expect(m.revisar).toHaveBeenCalledWith(1, 151, "Analista");
  });
  it.each([0, -1, 1.2, NaN])("rechaza id inválido %s", async (id) => {
    expect((await revisarAperturasBalance(id)).ok).toBe(false);
    expect(m.revisar).not.toHaveBeenCalled();
  });
  it("informa error recuperable sin declarar el control completado", async () => {
    m.revisar.mockResolvedValue(false);
    expect((await revisarAperturasBalance(1)).ok).toBe(false);
  });
});
