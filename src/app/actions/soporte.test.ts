import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  findUnique: vi.fn(),
  updateMany: vi.fn(),
  delete: vi.fn(),
  attachmentCreate: vi.fn(),
  authorizePermiso: vi.fn(),
  getCurrentUser: vi.fn(),
  logAudit: vi.fn(),
  revalidatePath: vi.fn(),
  almacenamientoEvidenciasTicketsDisponible: vi.fn(),
  subirEvidenciaTicket: vi.fn(),
  eliminarEvidenciaTicket: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/prisma", () => ({
  default: {
    supportTicket: {
      create: mocks.create,
      findUnique: mocks.findUnique,
      updateMany: mocks.updateMany,
      delete: mocks.delete,
    },
    supportTicketAttachment: {
      create: mocks.attachmentCreate,
    },
  },
}));
vi.mock("@/lib/rbac", () => ({ authorizePermiso: mocks.authorizePermiso }));
vi.mock("@/lib/dal", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/audit", () => ({ logAudit: mocks.logAudit }));
vi.mock("@/lib/errores", () => ({ mensajeErrorBD: (contexto: string) => `${contexto}: error` }));
vi.mock("@/lib/storage/evidencias-tickets", () => ({
  almacenamientoEvidenciasTicketsDisponible: mocks.almacenamientoEvidenciasTicketsDisponible,
  subirEvidenciaTicket: mocks.subirEvidenciaTicket,
  eliminarEvidenciaTicket: mocks.eliminarEvidenciaTicket,
}));

import { catalogoUbicacionesNovedad } from "@/lib/soporte-rutas";
import { cambiarEstadoTicket, crearNovedadInterna, crearTicketSoporte, guardarSolucionTicket } from "./soporte";

const rutaBalance = catalogoUbicacionesNovedad().find((ruta) => ruta.etiqueta === "Balance de comprobación")!;
const menuBorrador = rutaBalance.menus.find((menu) => menu.etiqueta === "Borrador Balance")!;

function formularioReporte() {
  const form = new FormData();
  form.set("firstName", "  Ana ");
  form.set("lastName", " Pérez  ");
  form.set("subject", "No puedo ingresar al balance");
  form.set("description", "La pantalla queda cargando después de seleccionar el archivo.");
  form.set("website", "");
  return form;
}

function formularioNovedad() {
  const form = new FormData();
  form.set("subject", "El mapeo no guarda el ajuste");
  form.set("description", "Cambié la cuenta y al recargar volvió al valor anterior.");
  form.set("routeKey", rutaBalance.clave);
  form.set("menuKey", menuBorrador.clave);
  return form;
}

function formularioSolucion() {
  const form = new FormData();
  form.set("ticketId", "14");
  form.set("updatedAt", "2026-08-07T15:00:00.000Z");
  form.set("solution", "Se restableció el acceso y se verificó el ingreso con la persona.");
  return form;
}

function formularioEstado(status = "en_proceso", solution = "") {
  const form = new FormData();
  form.set("ticketId", "14");
  form.set("updatedAt", "2026-08-07T15:00:00.000Z");
  form.set("status", status);
  form.set("solution", solution);
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
    mocks.almacenamientoEvidenciasTicketsDisponible.mockReturnValue(false);
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

  it("crea una novedad interna con la sesión y sin pedir nombre", async () => {
    mocks.authorizePermiso.mockResolvedValueOnce({ ok: true, userId: 4, role: "Staff" });
    mocks.getCurrentUser.mockResolvedValueOnce({ id: 4, name: "Laura Staff" });
    const resultado = await crearNovedadInterna(undefined, formularioNovedad());
    expect(resultado.ok).toBe(true);
    expect(resultado.ticketId).toBe(1);
    expect(mocks.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        createdById: 4,
        reporterFirstName: "Laura",
        reporterLastName: "Staff",
        subject: "El mapeo no guarda el ajuste",
        routeKey: rutaBalance.clave,
        routeLabel: "Balance de comprobación",
        menuKey: menuBorrador.clave,
        menuLabel: "Borrador Balance",
      }),
      select: { id: true },
    });
    expect(mocks.logAudit).toHaveBeenCalledWith(expect.objectContaining({
      action: "REPORTÓ NOVEDAD",
    }));
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/reportes");
  });

  it("rechaza un menú que no pertenece a la ruta elegida", async () => {
    const form = formularioNovedad();
    form.set("menuKey", "registro-de-acciones");
    const resultado = await crearNovedadInterna(undefined, form);
    expect(resultado.ok).toBe(false);
    expect(resultado.errors?.menuKey?.[0]).toMatch(/ruta/i);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("no crea la novedad interna sin permiso", async () => {
    mocks.authorizePermiso.mockResolvedValueOnce({ ok: false, message: "Sin permiso." });
    const resultado = await crearNovedadInterna(undefined, formularioNovedad());
    expect(resultado).toEqual({ ok: false, message: "Sin permiso." });
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("rechaza imágenes si el almacenamiento no está configurado", async () => {
    const form = formularioNovedad();
    form.append("adjuntos", new File([new Uint8Array([0xff, 0xd8, 0xff])], "captura.jpg", { type: "image/jpeg" }));
    const resultado = await crearNovedadInterna(undefined, form);
    expect(resultado.ok).toBe(false);
    expect(resultado.message).toMatch(/almacenamiento/i);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("sube la evidencia al almacenamiento aislado de tickets", async () => {
    mocks.almacenamientoEvidenciasTicketsDisponible.mockReturnValue(true);
    const form = formularioNovedad();
    form.append(
      "adjuntos",
      new File([new Uint8Array([0xff, 0xd8, 0xff])], "captura.jpg", {
        type: "image/jpeg",
      }),
    );

    const resultado = await crearNovedadInterna(undefined, form);

    expect(resultado.ok).toBe(true);
    expect(mocks.subirEvidenciaTicket).toHaveBeenCalledWith({
      key: expect.stringMatching(/^tickets\/1\/[a-f0-9]{16}\.jpg$/),
      cuerpo: expect.any(Uint8Array),
      contentType: "image/jpeg",
    });
    expect(mocks.attachmentCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        ticketId: 1,
        objectKey: expect.stringMatching(/^tickets\/1\/[a-f0-9]{16}\.jpg$/),
        fileName: "captura.jpg",
        contentType: "image/jpeg",
        sizeBytes: 3,
      }),
    });
  });

  it("cambia el estado sin exigir solución cuando no está resuelto", async () => {
    const resultado = await cambiarEstadoTicket(undefined, formularioEstado("en_proceso"));
    expect(resultado).toEqual({ ok: true });
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { id: 14, updatedAt: new Date("2026-08-07T15:00:00.000Z") },
      data: expect.objectContaining({ status: "en_proceso" }),
    });
    expect(mocks.logAudit).toHaveBeenCalledWith(expect.objectContaining({
      action: "ACTUALIZÓ ESTADO DE REPORTE",
    }));
  });

  it("exige solución al marcar resuelto y no escribe si falta", async () => {
    const resultado = await cambiarEstadoTicket(undefined, formularioEstado("resuelto"));
    expect(resultado.ok).toBe(false);
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it("no cambia estado sin permiso de administración", async () => {
    mocks.authorizePermiso.mockResolvedValueOnce({ ok: false, message: "Sin permiso." });
    const resultado = await cambiarEstadoTicket(undefined, formularioEstado());
    expect(resultado).toEqual({ ok: false, message: "Sin permiso." });
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });
});
