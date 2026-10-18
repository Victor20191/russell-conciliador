import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ auth: vi.fn(), find: vi.fn(), revisar: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/lib/rbac", () => ({ authorizePermiso: m.auth }));
vi.mock("@/lib/prisma", () => ({ default: { balancePruebaEncabezado: { findUnique: m.find } } }));
vi.mock("@/lib/balance/comparacion-corte-servidor", () => ({ recalcularComparacionesDelCorteSeguro: m.revisar }));
vi.mock("@/lib/dal", () => ({ getCurrentUser: vi.fn(async () => ({ name: "Analista" })) }));
vi.mock("next/cache", () => ({ revalidatePath: m.revalidate }));
import { revisarComparacionCorte } from "./balance-corte";

const DIC = new Date(Date.UTC(2025, 11, 31));
beforeEach(() => {
  vi.resetAllMocks();
  m.auth.mockResolvedValue({ ok: true });
  m.find.mockResolvedValue({ clienteId: 151, periodoFin: DIC });
  m.revisar.mockResolvedValue(true);
});

describe("revisarComparacionCorte", () => {
  it("rechaza antes de consultar la BD cuando no tiene permiso", async () => {
    m.auth.mockResolvedValue({ ok: false });
    expect((await revisarComparacionCorte(1)).ok).toBe(false);
    expect(m.find).not.toHaveBeenCalled();
    expect(m.revisar).not.toHaveBeenCalled();
  });

  it("revalida el alcance con el cliente REAL del balance", async () => {
    m.auth.mockImplementation(async (_permiso, scope) => ({ ok: !scope, message: "Fuera de cartera" }));
    expect((await revisarComparacionCorte(1)).ok).toBe(false);
    expect(m.auth).toHaveBeenCalledWith("balance:crear", { clientId: 151 });
    expect(m.revisar).not.toHaveBeenCalled();
  });

  it("recalcula el corte del balance con el nombre de quien revisa", async () => {
    expect((await revisarComparacionCorte(1)).ok).toBe(true);
    expect(m.revisar).toHaveBeenCalledWith(151, DIC, "Analista");
  });

  it.each([0, -1, 1.2, NaN])("rechaza id inválido %s", async (id) => {
    expect((await revisarComparacionCorte(id)).ok).toBe(false);
    expect(m.revisar).not.toHaveBeenCalled();
  });

  it("informa un fallo recuperable sin declarar la comparación completa", async () => {
    m.revisar.mockResolvedValue(false);
    expect((await revisarComparacionCorte(1)).ok).toBe(false);
  });
});
