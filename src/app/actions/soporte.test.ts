import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  findUnique: vi.fn(),
  updateMany: vi.fn(),
  authorizePermiso: vi.fn(),
  getCurrentUser: vi.fn(),
  logAudit: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/prisma", () => ({
  default: {
    supportTicket: {
      create: mocks.create,
      findUnique: mocks.findUnique,
      updateMany: mocks.updateMany,
    },
  },
}));
vi.mock("@/lib/rbac", () => ({ authorizePermiso: mocks.authorizePermiso }));
vi.mock("@/lib/dal", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/audit", () => ({ logAudit: mocks.logAudit }));
vi.mock("@/lib/errores", () => ({ mensajeErrorBD: (contexto: string) => `${contexto}: error` }));

import { crearTicketSoporte, guardarSolucionTicket } from "./soporte";

function formularioReporte() {
  const form = new FormData();
  form.set("firstName", "  Ana ");
  form.set("lastName", " Pérez  ");
  form.set("subject", "No puedo ingresar al balance");
  form.set("description", "La pantalla queda cargando después de seleccionar el archivo.");
  form.set("website", "");
  return form;
}

function formularioSolucion() {
  const form = new FormData();
  form.set("ticketId", "14");
  form.set("updatedAt", "2026-08-07T15:00:00.000Z");
  form.set("solution", "Se restableció el acceso y se verificó el ingreso con la persona.");
  return form;
}

describe("Server Actions de soporte", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.create.mockResolvedValue({ id: 1 });
    mocks.authorizePermiso.mockResolvedValue({ ok: true, userId: 9, role: "Administrador" });
    mocks.getCurrentUser.mockResolvedValue({ id: 9, name: "Técnica Soporte" });
    mocks.findUnique.mockResolvedValue({ code: "TKT-20260807-A1B2C3D4" });
    mocks.updateMany.mockResolvedValue({ count: 1 });
  });

  it("crea el ticket público sin exigir sesión y entrega un enlace no adivinable", async () => {
    const resultado = await crearTicketSoporte(undefined, formularioReporte());

    expect(resultado.ok).toBe(true);
    expect(resultado.code).toMatch(/^TKT-\d{8}-[A-Z0-9]{8}$/);
    expect(resultado.trackingUrl).toContain(`/soporte/tickets/${resultado.code}?acceso=`);
    expect(mocks.authorizePermiso).not.toHaveBeenCalled();
    expect(mocks.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        reporterFirstName: "Ana",
        reporterLastName: "Pérez",
        subject: "No puedo ingresar al balance",
        publicAccessTokenHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/config/soporte");
  });

  it("rechaza el honeypot antes de escribir", async () => {
    const form = formularioReporte();
    form.set("website", "https://bot.example");
    const resultado = await crearTicketSoporte(undefined, form);
    expect(resultado.ok).toBe(false);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("falla cerrado antes de consultar el ticket cuando no hay permiso", async () => {
    mocks.authorizePermiso.mockResolvedValueOnce({ ok: false, message: "Sin permiso." });
    const resultado = await guardarSolucionTicket(undefined, formularioSolucion());
    expect(resultado).toEqual({ ok: false, message: "Sin permiso." });
    expect(mocks.findUnique).not.toHaveBeenCalled();
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it("guarda la solución, identifica al técnico, audita y revalida ambos lados", async () => {
    const resultado = await guardarSolucionTicket(undefined, formularioSolucion());
    expect(resultado).toEqual({ ok: true });
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { id: 14, updatedAt: new Date("2026-08-07T15:00:00.000Z") },
      data: expect.objectContaining({
        status: "resuelto",
        resolvedById: 9,
        resolvedByName: "Técnica Soporte",
        solution: "Se restableció el acceso y se verificó el ingreso con la persona.",
        resolvedAt: expect.any(Date),
      }),
    });
    expect(mocks.logAudit).toHaveBeenCalledWith(expect.objectContaining({
      action: "DOCUMENTÓ SOLUCIÓN DE TICKET",
      entity: "TKT-20260807-A1B2C3D4",
    }));
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/config/soporte");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/soporte/tickets/TKT-20260807-A1B2C3D4");
  });

  it("no pisa una solución concurrente ni registra una auditoría falsa", async () => {
    mocks.updateMany.mockResolvedValueOnce({ count: 0 });
    const resultado = await guardarSolucionTicket(undefined, formularioSolucion());
    expect(resultado.ok).toBe(false);
    expect(resultado.message).toContain("Otra persona actualizó");
    expect(mocks.logAudit).not.toHaveBeenCalled();
  });
});
