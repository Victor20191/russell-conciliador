import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const tx = {
    commentMention: { deleteMany: vi.fn(), createMany: vi.fn() },
    comment: { update: vi.fn() },
  };
  return {
    tx,
    authorizePermiso: vi.fn(),
    logAudit: vi.fn(),
    commentFindUnique: vi.fn(),
    commentDelete: vi.fn(),
    marcaUpdateMany: vi.fn(),
    notificationCreateMany: vi.fn(),
    userFindMany: vi.fn(),
    transaction: vi.fn(),
  };
});

vi.mock("@/lib/rbac", () => ({ authorizePermiso: mocks.authorizePermiso }));
vi.mock("@/lib/dal", () => ({ getCurrentUser: vi.fn(async () => ({ id: 7, name: "Victor Rivera" })) }));
vi.mock("@/lib/audit", () => ({ logAudit: mocks.logAudit }));
vi.mock("@/lib/errores", () => ({ mensajeErrorBD: (_c: string, e: unknown) => String(e), registrarError: vi.fn() }));
vi.mock("@/lib/rbac/contexto", () => ({
  getMatriz: vi.fn(async () => ({})),
  clienteDeBalance: vi.fn(),
  clienteDeConciliacion: vi.fn(),
  clienteDeModuloDato: vi.fn(async () => 122),
  clienteDeLoteModulo: vi.fn(),
}));
vi.mock("@/lib/rbac/permisos", () => ({ tienePermiso: () => true }));
vi.mock("@/lib/prisma", () => ({
  default: {
    comment: { findUnique: mocks.commentFindUnique, delete: mocks.commentDelete },
    marcaCruceModulo: { updateMany: mocks.marcaUpdateMany },
    notification: { createMany: mocks.notificationCreateMany },
    user: { findMany: mocks.userFindMany },
    $transaction: mocks.transaction,
  },
}));

import { editarComentario, eliminarComentario } from "./comentarios";

const comentario = (extra: Record<string, unknown> = {}) => ({
  id: 409,
  entityType: "modulos_datos",
  entityId: 62,
  authorId: 7,
  isAI: false,
  body: "Este saldo de Bancolombia @Ana Pérez",
  mentions: [{ userId: 3 }],
  _count: { replies: 0, validaciones: 0 },
  ...extra,
});

describe("editar y eliminar comentarios", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authorizePermiso.mockResolvedValue({ ok: true, userId: 7 });
    mocks.commentFindUnique.mockResolvedValue(comentario());
    mocks.userFindMany.mockResolvedValue([
      { id: 3, name: "Ana Pérez", initials: "AP", role: "senior" },
      { id: 4, name: "Luisa Gómez", initials: "LG", role: "staff" },
      { id: 7, name: "Victor Rivera", initials: "VR", role: "admin" },
    ]);
    mocks.transaction.mockImplementation(async (arg: unknown) => (
      typeof arg === "function" ? (arg as (tx: typeof mocks.tx) => unknown)(mocks.tx) : Promise.all(arg as unknown[])
    ));
    mocks.tx.comment.update.mockImplementation(async ({ data }: { data: { body: string } }) => ({
      id: 409, body: data.body, authorId: 7, isAI: false, createdAt: new Date("2026-09-17T16:31:00Z"),
      author: { name: "Victor Rivera", initials: "VR" },
      mentions: [{ userId: 4, user: { name: "Luisa Gómez" } }],
    }));
  });

  it("el autor edita su comentario: queda marcado como editado y avisa solo a las menciones nuevas", async () => {
    const r = await editarComentario({ id: 409, body: "  Saldo en la 210510 @Luisa Gómez  ", menciones: [4, 7, 99] });

    expect(r).toMatchObject({ ok: true, comentario: { id: 409, body: "Saldo en la 210510 @Luisa Gómez", editado: true, mine: true } });
    expect(mocks.authorizePermiso).toHaveBeenNthCalledWith(1, "modulos_datos:comentar");
    expect(mocks.authorizePermiso).toHaveBeenNthCalledWith(2, "modulos_datos:comentar", { clientId: 122 });
    // Ana ya no está en el texto: su mención se retira. Luisa es nueva; uno mismo y los desconocidos no.
    expect(mocks.tx.commentMention.deleteMany).toHaveBeenCalledWith({ where: { commentId: 409, userId: { notIn: [4] } } });
    expect(mocks.tx.commentMention.createMany).toHaveBeenCalledWith({ data: [{ commentId: 409, userId: 4 }], skipDuplicates: true });
    expect(mocks.tx.comment.update.mock.calls[0][0].data).toMatchObject({ body: "Saldo en la 210510 @Luisa Gómez", editedAt: expect.any(Date) });
    expect(mocks.notificationCreateMany.mock.calls[0][0].data).toHaveLength(1);
    expect(mocks.logAudit.mock.calls[0][0]).toMatchObject({
      action: "EDITÓ un comentario",
      entity: "Módulo de conciliación #62",
      detail: "comentario #409 · antes: «Este saldo de Bancolombia @Ana Pérez»",
      clientId: 122,
    });
  });

  it("nadie edita ni elimina el comentario de otro, ni sin alcance sobre el cliente", async () => {
    mocks.commentFindUnique.mockResolvedValue(comentario({ authorId: 8 }));
    const mensaje = "Solo quien escribió el comentario puede editarlo o eliminarlo.";
    expect(await editarComentario({ id: 409, body: "otro" })).toEqual({ ok: false, message: mensaje });
    expect(await eliminarComentario({ id: 409 })).toEqual({ ok: false, message: mensaje });

    mocks.commentFindUnique.mockResolvedValue(comentario());
    mocks.authorizePermiso.mockResolvedValueOnce({ ok: true, userId: 7 }).mockResolvedValueOnce({ ok: false, message: "Sin alcance" });
    expect(await eliminarComentario({ id: 409 })).toEqual({ ok: false, message: "No tienes alcance sobre este cliente." });
    expect(mocks.commentDelete).not.toHaveBeenCalled();
    expect(mocks.tx.comment.update).not.toHaveBeenCalled();
  });

  it("no guarda un comentario vacío", async () => {
    expect(await editarComentario({ id: 409, body: "   " })).toEqual({ ok: false, message: "El comentario está vacío." });
  });

  it("el autor elimina su comentario y la marca que lo citaba pierde la referencia", async () => {
    mocks.marcaUpdateMany.mockResolvedValue({ count: 1 });
    mocks.commentDelete.mockResolvedValue({ id: 409 });
    expect(await eliminarComentario({ id: 409 })).toEqual({ ok: true, message: "Comentario eliminado." });
    expect(mocks.marcaUpdateMany).toHaveBeenCalledWith({ where: { comentarioId: 409 }, data: { comentarioId: null } });
    expect(mocks.commentDelete).toHaveBeenCalledWith({ where: { id: 409 } });
    expect(mocks.logAudit.mock.calls[0][0]).toMatchObject({ action: "ELIMINÓ un comentario", clientId: 122 });
  });

  it("no elimina el comentario que sustenta una validación del balance ni uno con respuestas", async () => {
    mocks.commentFindUnique.mockResolvedValue(comentario({ _count: { replies: 0, validaciones: 1 } }));
    expect((await eliminarComentario({ id: 409 })).message).toContain("sustenta la validación de una alerta");
    mocks.commentFindUnique.mockResolvedValue(comentario({ _count: { replies: 2, validaciones: 0 } }));
    expect(await eliminarComentario({ id: 409 })).toEqual({ ok: false, message: "Este comentario tiene respuestas: no se puede eliminar." });
    expect(mocks.commentDelete).not.toHaveBeenCalled();
  });
});
