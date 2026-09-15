import { beforeEach, describe, expect, it, vi } from "vitest";
import { ESTADOS_TICKET, type EstadoTicket } from "@/lib/soporte-estados";

const mocks = vi.hoisted(() => ({
  authorizePermiso: vi.fn(),
  getCurrentUser: vi.fn(),
  upsert: vi.fn(),
  logAudit: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/prisma", () => ({ default: { supportUserPreference: { upsert: mocks.upsert } } }));
vi.mock("@/lib/rbac", () => ({ authorizePermiso: mocks.authorizePermiso }));
vi.mock("@/lib/dal", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/audit", () => ({ logAudit: mocks.logAudit }));
vi.mock("@/lib/errores", () => ({ mensajeErrorBD: () => "No se pudo guardar la preferencia." }));

import { guardarEstadosOcultosTickets } from "./soporte-preferencias";

describe("guardar estados ocultos de Ayuda", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.authorizePermiso.mockResolvedValue({ ok: true, userId: 7, role: "Usuario" });
    mocks.getCurrentUser.mockResolvedValue({ id: 7, name: "Ana" });
    mocks.upsert.mockResolvedValue({});
  });

  it("exige permiso antes de acceder al usuario o guardar", async () => {
    mocks.authorizePermiso.mockResolvedValue({ ok: false, message: "Sin permiso" });
    expect(await guardarEstadosOcultosTickets(["cerrado"])).toEqual({ ok: false, message: "Sin permiso" });
    expect(mocks.authorizePermiso).toHaveBeenCalledWith("soporte:ver");
    expect(mocks.getCurrentUser).not.toHaveBeenCalled();
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it.each([null, { id: 99, name: "Otro usuario" }])("rechaza una sesión sin actor coincidente (%j)", async (actor) => {
    mocks.getCurrentUser.mockResolvedValue(actor);
    expect(await guardarEstadosOcultosTickets(["cerrado"])).toMatchObject({ ok: false });
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it.each([null, ["desconocido"], ["cerrado", 7], { userId: 99, estados: ["cerrado"] }])("rechaza datos inválidos y no acepta un usuario suministrado por el cliente (%j)", async (entrada) => {
    expect(await guardarEstadosOcultosTickets(entrada as unknown as EstadoTicket[])).toMatchObject({ ok: false });
    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(mocks.logAudit).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("guarda solamente para el actor y devuelve la selección normalizada", async () => {
    const resultado = await guardarEstadosOcultosTickets(["cerrado", "abierto", "cerrado"]);
    expect(resultado).toEqual({ ok: true, estadosOcultos: ["abierto", "cerrado"] });
    expect(mocks.upsert).toHaveBeenCalledWith({
      where: { userId: 7 },
      create: { userId: 7, hiddenStatuses: ["abierto", "cerrado"] },
      update: { hiddenStatuses: ["abierto", "cerrado"] },
    });
    expect(mocks.logAudit).toHaveBeenCalledWith(expect.objectContaining({
      user: "Ana", entity: "preferencias_soporte_usuario", detail: "usuario 7 · estados ocultos: abierto, cerrado",
    }));
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/reportes");
  });

  it.each([{ seleccion: [] }, { seleccion: [...ESTADOS_TICKET] }])("permite ocultar ninguno o todos: $seleccion", async ({ seleccion }) => {
    expect(await guardarEstadosOcultosTickets(seleccion)).toEqual({ ok: true, estadosOcultos: seleccion });
    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({ update: { hiddenStatuses: seleccion } }));
  });

  it("mantiene separadas las preferencias al cambiar de usuario", async () => {
    await guardarEstadosOcultosTickets(["cerrado"]);
    mocks.authorizePermiso.mockResolvedValue({ ok: true, userId: 8, role: "Usuario" });
    mocks.getCurrentUser.mockResolvedValue({ id: 8, name: "Luis" });
    await guardarEstadosOcultosTickets([]);
    expect(mocks.upsert.mock.calls.map(([consulta]) => consulta.where.userId)).toEqual([7, 8]);
  });

  it("un fallo de persistencia no anuncia éxito ni revalida la página", async () => {
    mocks.upsert.mockRejectedValue(new Error("BD no disponible"));
    expect(await guardarEstadosOcultosTickets([])).toEqual({ ok: false, message: "No se pudo guardar la preferencia." });
    expect(mocks.logAudit).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});
