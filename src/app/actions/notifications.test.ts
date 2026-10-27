import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ session: vi.fn(), update: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ default: { notification: { updateMany: mocks.update } } }));
vi.mock("@/lib/dal", () => ({ verifySession: mocks.session }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`REDIRECT:${url}`); } }));
import { markAllNotificationsRead } from "./notifications";
beforeEach(() => { vi.resetAllMocks(); mocks.session.mockResolvedValue({ userId: 7, mustChangePassword: false }); mocks.update.mockResolvedValue({ count: 1 }); });
it("marcar todas afecta únicamente las del usuario autenticado", async () => {
  expect(await markAllNotificationsRead()).toMatchObject({ ok: true });
  expect(mocks.update).toHaveBeenCalledWith({ where: { userId: 7, unread: true }, data: { unread: false } });
});
it("no modifica avisos de una sesión revocada o pendiente de cambio de clave", async () => {
  mocks.session.mockRejectedValueOnce(new Error("revocada"));
  await expect(markAllNotificationsRead()).rejects.toThrow("revocada");
  mocks.session.mockResolvedValue({ userId: 7, mustChangePassword: true });
  await expect(markAllNotificationsRead()).rejects.toThrow("REDIRECT:/cambiar-contrasena");
  expect(mocks.update).not.toHaveBeenCalled();
});
