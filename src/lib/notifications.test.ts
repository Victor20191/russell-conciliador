import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ create: vi.fn(), schedule: vi.fn(), log: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ default: { notification: { create: mocks.create } } }));
vi.mock("@/lib/correo/notificaciones", () => ({ programarAvisoCorreo: mocks.schedule }));
vi.mock("@/lib/errores", () => ({ registrarError: mocks.log }));
import { createProcessNotification } from "./notifications";
beforeEach(() => { vi.clearAllMocks(); mocks.create.mockResolvedValue({ id: 8 }); });
it("persiste el aviso antes de programar el correo del cliente", async () => {
  await createProcessNotification({ actor: "Ana", text: "cerró el balance", target: "Cliente", clientId: 12, actorId: 1, ruta: "/balance/2" });
  expect(mocks.schedule).toHaveBeenCalledWith(expect.objectContaining({ clienteId: 12, actorId: 1, permiso: "balance:ver", ruta: "/balance/2", referencia: "Notificación #8" }));
  expect(mocks.create.mock.invocationCallOrder[0]).toBeLessThan(mocks.schedule.mock.invocationCallOrder[0]);
});
it("un aviso sin cliente permanece en campana sin difusión por correo", async () => {
  await createProcessNotification({ text: "aviso", target: "Sistema" }); expect(mocks.schedule).not.toHaveBeenCalled();
});
it("fallar la persistencia no tumba la operación contable", async () => {
  mocks.create.mockRejectedValueOnce(new Error("BD"));
  await expect(createProcessNotification({ text: "aviso", target: "Cliente", clientId: 12 })).resolves.toBeUndefined();
  expect(mocks.schedule).not.toHaveBeenCalled();
});
