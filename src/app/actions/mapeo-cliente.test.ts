import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(), cliente: vi.fn(), findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ default: { clientAccount: { findUnique: mocks.findUnique, update: mocks.update, updateMany: mocks.updateMany } } }));
vi.mock("@/lib/rbac", () => ({ authorizePermiso: mocks.authorize }));
vi.mock("@/lib/conciliacion/verificar-bloqueo", () => ({
  bloqueoHomologacionBalance: vi.fn(async () => null),
  bloqueoMemoriaHomologacion: vi.fn(async () => null),
  cierresFirmes: vi.fn(async () => []),
  cierresFirmesDeBalance: vi.fn(async () => []),
  cuentasBloqueadas: vi.fn(async () => []),
  exigirCargueCompatibleConCierres: vi.fn(async () => undefined),
  registrarIntentoBloqueado: vi.fn(async () => undefined),
  autorizarCierreConciliacion: vi.fn(async () => ({ ok: true, userId: 1, role: "Senior" })),
  ErrorConciliacionEnFirme: class ErrorConciliacionEnFirme extends Error {},
}));
vi.mock("@/lib/rbac/contexto", () => ({ clienteDeCuentaCliente: mocks.cliente }));
vi.mock("@/lib/dal", () => ({ getCurrentUser: vi.fn(async () => ({ name: "Prueba" })) }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/errores", () => ({ mensajeErrorBD: () => "Error al guardar." }));

import { eliminarMapeoCliente } from "./mapeo-cliente";

describe("retirar reglas desde el PUC completo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authorize.mockResolvedValue({ ok: true });
    mocks.cliente.mockResolvedValue(23);
    mocks.findUnique.mockResolvedValue({ code: "1105050101", clienteId: 23, cuenta6Russell: "110510" });
    mocks.update.mockResolvedValue({});
    mocks.updateMany.mockResolvedValue({ count: 2 });
  });
  const formulario = () => { const f = new FormData(); f.set("id", "7"); return f; };

  it("quitar la cuenta N10 conserva las reglas N12/N14 que empiezan igual", async () => {
    expect(await eliminarMapeoCliente(undefined, formulario())).toEqual({ ok: true });
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 7 }, data: expect.objectContaining({ cuenta6Russell: null }) }));
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });
  it("quitar un grupo conserva el alcance por cliente y prefijo N6", async () => {
    mocks.findUnique.mockResolvedValue({ code: "110505", clienteId: 23, cuenta6Russell: "110510" });
    await eliminarMapeoCliente(undefined, formulario());
    expect(mocks.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { clienteId: 23, code: { startsWith: "110505" }, NOT: { id: 7 } } }));
  });
  it("rechaza una cuenta fuera de la cartera antes de escribir", async () => {
    mocks.authorize.mockResolvedValueOnce({ ok: true }).mockResolvedValueOnce({ ok: false, message: "Fuera de cartera" });
    expect(await eliminarMapeoCliente(undefined, formulario())).toEqual({ ok: false, message: "Fuera de cartera" });
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });
});
