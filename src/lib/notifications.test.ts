import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ create: vi.fn(), schedule: vi.fn(), log: vi.fn(), recipients: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ default: { notification: { createMany: mocks.create } } }));
vi.mock("@/lib/correo/notificaciones", () => ({ programarAvisoCorreo: mocks.schedule }));
vi.mock("@/lib/correo/destinatarios", () => ({ usuariosDestinatariosAviso: mocks.recipients }));
vi.mock("@/lib/errores", () => ({ registrarError: mocks.log }));
import { createProcessNotification } from "./notifications";
beforeEach(() => { vi.clearAllMocks(); mocks.create.mockResolvedValue({ count: 2 }); mocks.recipients.mockResolvedValue([{ id: 2 }, { id: 3 }]); });
it("persiste el aviso antes de programar el correo del cliente", async () => {
  await createProcessNotification({ actor: "Ana", text: "cerró el balance", target: "Cliente", clientId: 12, actorId: 1, ruta: "/balance/2" });
  expect(mocks.recipients).toHaveBeenCalledWith({ clienteId: 12, actorId: 1, permiso: "balance:ver" });
  expect(mocks.create.mock.calls[0][0].data).toEqual([
    expect.objectContaining({ userId: 2, clientId: 12, entityType: "balance" }),
    expect.objectContaining({ userId: 3, clientId: 12, entityType: "balance" }),
  ]);
  expect(mocks.schedule).toHaveBeenCalledWith(expect.objectContaining({ clienteId: 12, actorId: 1, permiso: "balance:ver", ruta: "/balance/2", referencia: "Notificación de balance" }));
  expect(mocks.create.mock.invocationCallOrder[0]).toBeLessThan(mocks.schedule.mock.invocationCallOrder[0]);
});
it("un aviso sin cliente verificable no se difunde a la campana ni al correo", async () => {
  await createProcessNotification({ text: "aviso", target: "Sistema" });
  expect(mocks.create).not.toHaveBeenCalled();
  expect(mocks.schedule).not.toHaveBeenCalled();
});
it("sin destinatarios autorizados no crea una notificación global", async () => {
  mocks.recipients.mockResolvedValue([]);
  await createProcessNotification({ text: "aviso", target: "Cliente", clientId: 12 });
  expect(mocks.create).not.toHaveBeenCalled();
});
it("fallar la persistencia no tumba la operación contable", async () => {
  mocks.create.mockRejectedValueOnce(new Error("BD"));
  await expect(createProcessNotification({ text: "aviso", target: "Cliente", clientId: 12 })).resolves.toBeUndefined();
  expect(mocks.schedule).not.toHaveBeenCalled();
});
