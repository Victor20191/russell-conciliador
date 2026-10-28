import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ cuenta: vi.fn(), clientes: vi.fn() }));
vi.mock("react", () => ({ cache: (fn: unknown) => fn }));
vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn }));
vi.mock("@/lib/dal", () => ({ verifySession: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ default: {
  clientAccount: { findUnique: mocks.cuenta },
  client: { findMany: mocks.clientes },
} }));

import { clienteDeCuentaCliente } from "./contexto";

beforeEach(() => vi.resetAllMocks());

describe("identidad del propietario del mapeo", () => {
  it("usa la FK aunque el nombre antiguo haya sido reutilizado por otro cliente", async () => {
    mocks.cuenta.mockResolvedValue({ clienteId: 23, clientName: "Nombre anterior" });
    mocks.clientes.mockResolvedValue([{ id: 99 }]);
    expect(await clienteDeCuentaCliente(7)).toBe(23);
    expect(mocks.cuenta).toHaveBeenCalledWith({ where: { id: 7 }, select: { clienteId: true, clientName: true } });
    expect(mocks.clientes).not.toHaveBeenCalled();
  });

  it("mantiene el legado sin FK únicamente si el nombre resuelve un cliente único", async () => {
    mocks.cuenta.mockResolvedValue({ clienteId: null, clientName: "Cliente legado" });
    mocks.clientes.mockResolvedValue([{ id: 23 }]);
    expect(await clienteDeCuentaCliente(7)).toBe(23);
    expect(mocks.clientes).toHaveBeenCalledWith({ where: { name: "Cliente legado" }, select: { id: true }, take: 2 });
  });

  it.each([{ clientes: [] }, { clientes: [{ id: 23 }, { id: 99 }] }])("deniega un nombre legado inexistente o ambiguo: $clientes", async ({ clientes }) => {
    mocks.cuenta.mockResolvedValue({ clienteId: null, clientName: "Nombre compartido" });
    mocks.clientes.mockResolvedValue(clientes);
    expect(await clienteDeCuentaCliente(7)).toBeNull();
  });

  it("deniega la cuenta inexistente sin buscar un nombre", async () => {
    mocks.cuenta.mockResolvedValue(null);
    expect(await clienteDeCuentaCliente(7)).toBeNull();
    expect(mocks.clientes).not.toHaveBeenCalled();
  });

  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])("no reemplaza una FK inválida (%s) por una coincidencia de nombre", async (clienteId) => {
    mocks.cuenta.mockResolvedValue({ clienteId, clientName: "Cliente ajeno" });
    mocks.clientes.mockResolvedValue([{ id: 99 }]);
    expect(await clienteDeCuentaCliente(7)).toBeNull();
    expect(mocks.clientes).not.toHaveBeenCalled();
  });
});
