import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  queryRaw: vi.fn(),
  findUnique: vi.fn(),
  updateMany: vi.fn(),
  delete: vi.fn(),
  attachmentCreate: vi.fn(),
  messageCreate: vi.fn(),
  eventCreate: vi.fn(),
  platformModuleFindMany: vi.fn(),
  rolePermissionFindMany: vi.fn(),
  authorizePermiso: vi.fn(),
  getCurrentUser: vi.fn(),
  logAudit: vi.fn(),
  revalidatePath: vi.fn(),
  almacenamientoEvidenciasTicketsDisponible: vi.fn(),
  subirEvidenciaTicket: vi.fn(),
  eliminarEvidenciaTicket: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
}));
vi.mock("@/lib/prisma", () => {
  const cliente = {
    $queryRaw: mocks.queryRaw,
    supportTicket: {
      create: mocks.create,
      findUnique: mocks.findUnique,
      updateMany: mocks.updateMany,
      delete: mocks.delete,
    },
    supportTicketAttachment: {
      create: mocks.attachmentCreate,
    },
    supportTicketMessage: {
      create: mocks.messageCreate,
    },
    supportTicketEvent: {
      create: mocks.eventCreate,
    },
    platformModule: {
      findMany: mocks.platformModuleFindMany,
    },
    rolePermission: {
      findMany: mocks.rolePermissionFindMany,
    },
  };
  return {
    default: {
      ...cliente,
      // El cambio de estado y su hito en el hilo van en la MISMA transacción;
      // en las pruebas basta con correr el callback contra el cliente simulado.
      $transaction: (fn: (tx: typeof cliente) => unknown) => fn(cliente),
    },
  };
});
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
import {
  agregarMensajeTicket,
  cambiarEstadoTicket,
  crearNovedadInterna,
  crearTicketSoporte,
  eliminarTicketSoporte,
  gestionarTicket,
  guardarSolucionTicket,
  obtenerDetalleTicket,
} from "./soporte";

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

function formularioGestion(status = "abierto", texto = "") {
  const form = new FormData();
  form.set("ticketId", "14");
  form.set("updatedAt", "2026-08-07T15:00:00.000Z");
  form.set("status", status);
  form.set("texto", texto);
  return form;
}

function formularioMensaje(body = "Se validó con el usuario y quedó conforme.") {
  const form = new FormData();
  form.set("ticketId", "14");
  form.set("body", body);
  return form;
}

function formularioEliminar(code = "TKT-7") {
  const form = new FormData();
  form.set("ticketId", "14");
  form.set("code", code);
  return form;
}

describe("Server Actions de soporte", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.create.mockResolvedValue({ id: 1 });
    mocks.queryRaw.mockResolvedValue([{ consecutivo: BigInt(7) }]);
    mocks.authorizePermiso.mockResolvedValue({ ok: true, userId: 9, role: "Administrador" });
    mocks.getCurrentUser.mockResolvedValue({ id: 9, name: "Técnica Soporte" });
    mocks.findUnique.mockResolvedValue({ code: "TKT-7" });
    mocks.updateMany.mockResolvedValue({ count: 1 });
    mocks.messageCreate.mockResolvedValue({ id: 1 });
    mocks.eventCreate.mockResolvedValue({ id: 1 });
    mocks.almacenamientoEvidenciasTicketsDisponible.mockReturnValue(false);
  });

  it("crea el ticket público sin exigir sesión y entrega un enlace no adivinable", async () => {
    const resultado = await crearTicketSoporte(undefined, formularioReporte());

    expect(resultado.ok).toBe(true);
    expect(resultado.code).toBe("TKT-7");
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
      entity: "TKT-7",
    }));
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/config/soporte");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/soporte/tickets/TKT-7");
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

  it("rechaza una novedad sobre un módulo que está en desarrollo", async () => {
    mocks.platformModuleFindMany.mockResolvedValueOnce([
      {
        id: 1,
        key: "balance",
        label: "Balance de comprobación",
        description: "",
        group: "Trabajo",
        icon: "doc",
        order: 20,
        enabledForNonAdmins: false,
        configurableForNonAdmins: true,
      },
    ]);
    const resultado = await crearNovedadInterna(undefined, formularioNovedad());
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

  describe("hitos del hilo", () => {
    it("deja el cambio de estado registrado en el historial", async () => {
      mocks.findUnique.mockResolvedValue({
        code: "TKT-20260807-A1B2C3D4",
        status: "abierto",
        solution: null,
      });

      const resultado = await cambiarEstadoTicket(undefined, formularioEstado("en_proceso"));

      expect(resultado).toEqual({ ok: true });
      expect(mocks.eventCreate).toHaveBeenCalledWith({
        data: {
          ticketId: 14,
          authorId: 9,
          authorName: "Técnica Soporte",
          previousStatus: "abierto",
          newStatus: "en_proceso",
        },
      });
    });

    it("no inventa un hito cuando se reguarda el MISMO estado", async () => {
      mocks.findUnique.mockResolvedValue({
        code: "TKT-20260807-A1B2C3D4",
        status: "en_proceso",
        solution: null,
      });

      await cambiarEstadoTicket(undefined, formularioEstado("en_proceso"));

      expect(mocks.updateMany).toHaveBeenCalled();
      expect(mocks.eventCreate).not.toHaveBeenCalled();
    });

    it("no registra el hito si otra persona se adelantó y el guard optimista falla", async () => {
      mocks.findUnique.mockResolvedValue({
        code: "TKT-20260807-A1B2C3D4",
        status: "abierto",
        solution: null,
      });
      mocks.updateMany.mockResolvedValue({ count: 0 });

      const resultado = await cambiarEstadoTicket(undefined, formularioEstado("en_proceso"));

      expect(resultado.ok).toBe(false);
      expect(mocks.eventCreate).not.toHaveBeenCalled();
    });

    it("documentar la solución también deja su hito de «Resuelto»", async () => {
      mocks.findUnique.mockResolvedValue({ code: "TKT-20260807-A1B2C3D4", status: "en_proceso" });

      await guardarSolucionTicket(undefined, formularioSolucion());

      expect(mocks.eventCreate).toHaveBeenCalledWith({
        data: {
          ticketId: 14,
          authorId: 9,
          authorName: "Técnica Soporte",
          previousStatus: "en_proceso",
          newStatus: "resuelto",
        },
      });
    });
  });

  it("acepta «En evaluación» sin solución ni sello de resolución", async () => {
    const resultado = await cambiarEstadoTicket(undefined, formularioEstado("en_evaluacion"));
    expect(resultado).toEqual({ ok: true });
    const data = mocks.updateMany.mock.calls[0]![0].data;
    expect(data).toMatchObject({ status: "en_evaluacion" });
    expect(data).not.toHaveProperty("resolvedAt");
    expect(data).not.toHaveProperty("solution");
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

  // La bandeja gestiona con UN solo formulario: el texto y el estado viajan
  // juntos y el destino del texto lo decide la transición, no un campo aparte.
  describe("gestión unificada", () => {
    beforeEach(() => {
      mocks.findUnique.mockResolvedValue({
        code: "TKT-20260807-A1B2C3D4",
        status: "abierto",
        solution: null,
      });
    });

    it("con el mismo estado, el texto entra al hilo y el ticket no se toca", async () => {
      const resultado = await gestionarTicket(
        undefined,
        formularioGestion("abierto", "Ya lo estamos revisando con el equipo."),
      );

      expect(resultado).toEqual({ ok: true });
      expect(mocks.updateMany).not.toHaveBeenCalled();
      expect(mocks.messageCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          ticketId: 14,
          authorSide: "xentria",
          body: "Ya lo estamos revisando con el equipo.",
        }),
      });
    });

    it("al resolver por primera vez el texto queda como respuesta oficial, no como mensaje", async () => {
      const resultado = await gestionarTicket(
        undefined,
        formularioGestion("resuelto", "Se restableció el acceso y se verificó con la persona."),
      );

      expect(resultado).toEqual({ ok: true });
      expect(mocks.updateMany).toHaveBeenCalledWith({
        where: { id: 14, updatedAt: new Date("2026-08-07T15:00:00.000Z") },
        data: expect.objectContaining({
          status: "resuelto",
          solution: "Se restableció el acceso y se verificó con la persona.",
          resolvedByName: "Técnica Soporte",
        }),
      });
      expect(mocks.messageCreate).not.toHaveBeenCalled();
    });

    it("exige el texto al resolver y no escribe nada si falta", async () => {
      const resultado = await gestionarTicket(undefined, formularioGestion("resuelto"));

      expect(resultado.ok).toBe(false);
      expect(mocks.updateMany).not.toHaveBeenCalled();
      expect(mocks.messageCreate).not.toHaveBeenCalled();
    });

    it("nunca reescribe una respuesta ya dada: el texto se va al hilo", async () => {
      mocks.findUnique.mockResolvedValue({
        code: "TKT-20260807-A1B2C3D4",
        status: "cerrado",
        solution: "Se restableció el acceso.",
      });

      const resultado = await gestionarTicket(
        undefined,
        formularioGestion("resuelto", "Se reabre porque volvió a fallar."),
      );

      expect(resultado).toEqual({ ok: true });
      expect(mocks.updateMany.mock.calls[0]![0].data).not.toHaveProperty("solution");
      expect(mocks.messageCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({ body: "Se reabre porque volvió a fallar." }),
      });
    });

    it("rechaza el envío vacío en vez de registrar una gestión sin contenido", async () => {
      const resultado = await gestionarTicket(undefined, formularioGestion("abierto"));

      expect(resultado.ok).toBe(false);
      expect(mocks.updateMany).not.toHaveBeenCalled();
      expect(mocks.messageCreate).not.toHaveBeenCalled();
      expect(mocks.logAudit).not.toHaveBeenCalled();
    });

    it("si el guard optimista falla, el mensaje tampoco se escribe", async () => {
      mocks.updateMany.mockResolvedValue({ count: 0 });

      const resultado = await gestionarTicket(
        undefined,
        formularioGestion("en_proceso", "Escalado al equipo de desarrollo."),
      );

      expect(resultado.ok).toBe(false);
      expect(mocks.messageCreate).not.toHaveBeenCalled();
    });

    it("no gestiona sin permiso de administración", async () => {
      mocks.authorizePermiso.mockResolvedValueOnce({ ok: false, message: "Sin permiso." });

      const resultado = await gestionarTicket(undefined, formularioGestion("en_proceso", "Hola."));

      expect(resultado).toEqual({ ok: false, message: "Sin permiso." });
      expect(mocks.updateMany).not.toHaveBeenCalled();
      expect(mocks.messageCreate).not.toHaveBeenCalled();
    });
  });

  it("elimina el ticket y borra sus imágenes del almacenamiento aislado", async () => {
    mocks.almacenamientoEvidenciasTicketsDisponible.mockReturnValue(true);
    mocks.eliminarEvidenciaTicket.mockResolvedValue(undefined);
    mocks.findUnique.mockResolvedValue({
      code: "TKT-7",
      subject: "El mapeo no guarda el ajuste",
      attachments: [{ objectKey: "tickets/14/aa.jpg" }, { objectKey: "tickets/14/bb.png" }],
    });

    const resultado = await eliminarTicketSoporte(undefined, formularioEliminar());

    expect(resultado).toEqual({ ok: true });
    expect(mocks.authorizePermiso).toHaveBeenCalledWith("soporte:eliminar");
    expect(mocks.eliminarEvidenciaTicket).toHaveBeenCalledWith("tickets/14/aa.jpg");
    expect(mocks.eliminarEvidenciaTicket).toHaveBeenCalledWith("tickets/14/bb.png");
    expect(mocks.delete).toHaveBeenCalledWith({ where: { id: 14 } });
    expect(mocks.logAudit).toHaveBeenCalledWith(expect.objectContaining({
      action: "ELIMINÓ REPORTE",
      entity: "TKT-7",
    }));
  });

  it("borra el ticket aunque el almacenamiento falle y lo deja anotado en la auditoría", async () => {
    mocks.almacenamientoEvidenciasTicketsDisponible.mockReturnValue(true);
    mocks.eliminarEvidenciaTicket.mockRejectedValue(new Error("S3 caído"));
    mocks.findUnique.mockResolvedValue({
      code: "TKT-7",
      subject: "Novedad con captura",
      attachments: [{ objectKey: "tickets/14/aa.jpg" }],
    });

    const resultado = await eliminarTicketSoporte(undefined, formularioEliminar());

    expect(resultado).toEqual({ ok: true });
    expect(mocks.delete).toHaveBeenCalledWith({ where: { id: 14 } });
    expect(mocks.logAudit).toHaveBeenCalledWith(expect.objectContaining({
      detail: expect.stringContaining("1 archivo(s) no se pudieron borrar"),
    }));
  });

  it("no borra si el código de confirmación ya no corresponde al ticket", async () => {
    mocks.findUnique.mockResolvedValue({
      code: "TKT-8",
      subject: "Otro ticket",
      attachments: [],
    });

    const resultado = await eliminarTicketSoporte(undefined, formularioEliminar());

    expect(resultado.ok).toBe(false);
    expect(mocks.delete).not.toHaveBeenCalled();
  });

  it("falla cerrado sin el permiso de eliminación, antes de tocar la BD", async () => {
    mocks.authorizePermiso.mockResolvedValueOnce({ ok: false, message: "Sin permiso." });

    const resultado = await eliminarTicketSoporte(undefined, formularioEliminar());

    expect(resultado).toEqual({ ok: false, message: "Sin permiso." });
    expect(mocks.findUnique).not.toHaveBeenCalled();
    expect(mocks.delete).not.toHaveBeenCalled();
  });
  describe("respuesta congelada al cerrar", () => {
    it("rechaza reescribir la solución de un ticket cerrado", async () => {
      mocks.findUnique.mockResolvedValue({
        code: "TKT-7",
        status: "cerrado",
        solution: "La respuesta que ya vio quien reportó.",
      });

      const resultado = await cambiarEstadoTicket(
        undefined,
        formularioEstado("cerrado", "Otra cosa distinta escrita después del cierre."),
      );

      expect(resultado.ok).toBe(false);
      expect(resultado.errors?.solution?.[0]).toContain("cerrado");
      expect(mocks.updateMany).not.toHaveBeenCalled();
    });

    it("deja reabrir un ticket cerrado sin tocar su respuesta", async () => {
      mocks.findUnique.mockResolvedValue({
        code: "TKT-7",
        status: "cerrado",
        solution: "La respuesta que ya vio quien reportó.",
      });

      const resultado = await cambiarEstadoTicket(
        undefined,
        formularioEstado("en_proceso", "La respuesta que ya vio quien reportó."),
      );

      expect(resultado.ok).toBe(true);
      expect(mocks.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.not.objectContaining({ solution: expect.anything() }),
        }),
      );
    });

    it("bloquea también la ruta directa de guardarSolucionTicket", async () => {
      mocks.findUnique.mockResolvedValue({ code: "TKT-7", status: "cerrado" });

      const form = new FormData();
      form.set("ticketId", "14");
      form.set("updatedAt", "2026-08-07T15:00:00.000Z");
      form.set("solution", "Un texto nuevo con más de diez caracteres.");
      const resultado = await guardarSolucionTicket(undefined, form);

      expect(resultado.ok).toBe(false);
      expect(mocks.updateMany).not.toHaveBeenCalled();
    });
  });

  describe("agregarMensajeTicket", () => {
    it("apila el mensaje de Xentria sin tocar el estado ni la solución", async () => {
      mocks.findUnique.mockResolvedValue({ code: "TKT-20260807-A1B2C3D4", createdById: 44 });

      const resultado = await agregarMensajeTicket(undefined, formularioMensaje());

      expect(resultado.ok).toBe(true);
      expect(mocks.authorizePermiso).toHaveBeenCalledWith("soporte:ver");
      expect(mocks.messageCreate).toHaveBeenCalledWith({
        data: {
          ticketId: 14,
          authorId: 9,
          authorName: "Técnica Soporte",
          authorSide: "xentria",
          body: "Se validó con el usuario y quedó conforme.",
        },
      });
      expect(mocks.updateMany).not.toHaveBeenCalled();
      expect(mocks.revalidatePath).toHaveBeenCalledWith("/reportes");
    });

    it("deja responder a quien reportó la novedad, del lado del reportante", async () => {
      // Un usuario cualquiera de la plataforma: ve soporte, pero no lo administra.
      mocks.authorizePermiso.mockImplementation(async (permiso: string) =>
        permiso === "soporte:administrar"
          ? { ok: false, message: "Sin permiso." }
          : { ok: true, userId: 44, role: "Staff" },
      );
      mocks.getCurrentUser.mockResolvedValue({ id: 44, name: "Luisa Martinez" });
      mocks.findUnique.mockResolvedValue({ code: "TKT-20260807-A1B2C3D4", createdById: 44 });

      const resultado = await agregarMensajeTicket(undefined, formularioMensaje("Ya lo probé y sigue igual."));

      expect(resultado.ok).toBe(true);
      expect(mocks.messageCreate).toHaveBeenCalledWith({
        data: {
          ticketId: 14,
          authorId: 44,
          authorName: "Luisa Martinez",
          authorSide: "reportante",
          body: "Ya lo probé y sigue igual.",
        },
      });
    });

    it("no deja escribir en el hilo de otro a quien solo tiene lectura", async () => {
      mocks.authorizePermiso.mockImplementation(async (permiso: string) =>
        permiso === "soporte:administrar"
          ? { ok: false, message: "Sin permiso." }
          : { ok: true, userId: 12, role: "Staff" },
      );
      mocks.findUnique.mockResolvedValue({ code: "TKT-20260807-A1B2C3D4", createdById: 44 });

      const resultado = await agregarMensajeTicket(undefined, formularioMensaje());

      expect(resultado.ok).toBe(false);
      expect(mocks.messageCreate).not.toHaveBeenCalled();
    });

    it("exige el permiso de lectura antes de tocar la base de datos", async () => {
      mocks.authorizePermiso.mockResolvedValue({ ok: false, message: "Sin permiso." });

      const resultado = await agregarMensajeTicket(undefined, formularioMensaje());

      expect(resultado).toEqual({ ok: false, message: "Sin permiso." });
      expect(mocks.messageCreate).not.toHaveBeenCalled();
      expect(mocks.findUnique).not.toHaveBeenCalled();
    });

    it("rechaza un mensaje vacío", async () => {
      const resultado = await agregarMensajeTicket(undefined, formularioMensaje("   "));

      expect(resultado.ok).toBe(false);
      expect(mocks.messageCreate).not.toHaveBeenCalled();
    });
  });

  describe("obtenerDetalleTicket", () => {
    const ticketBase = {
      id: 14,
      code: "TKT-7",
      createdById: 3,
      reporterFirstName: "Ana",
      reporterLastName: "Pérez",
      subject: "No puedo ingresar al balance",
      description: "Al abrir /balance sale un error.",
      routeLabel: "Balance de comprobación",
      menuLabel: "Balance",
      status: "abierto",
      solution: null,
      resolvedByName: null,
      resolvedAt: null,
      createdAt: new Date("2026-08-07T15:00:00.000Z"),
      attachments: [{ id: 5, fileName: "captura.png" }],
      messages: [
        {
          id: 2,
          authorName: "Soporte Xentria",
          authorSide: "xentria",
          body: "Se validó con el usuario después del cierre.",
          createdAt: new Date("2026-08-09T10:00:00.000Z"),
        },
      ],
      events: [],
    };

    it("entrega el hilo ya armado, con las fechas serializadas", async () => {
      mocks.findUnique.mockResolvedValue(ticketBase);

      const resultado = await obtenerDetalleTicket(14);

      expect(mocks.authorizePermiso).toHaveBeenCalledWith("soporte:ver");
      expect(resultado).toEqual({
        ok: true,
        ticket: expect.objectContaining({
          id: 14,
          code: "TKT-7",
          reportante: "Ana Pérez",
          ubicacion: "Balance de comprobación · Balance",
          createdAt: "2026-08-07T15:00:00.000Z",
          adjuntos: [{ id: 5, fileName: "captura.png" }],
          // El modal recibe el hilo listo para pintar: la descripción es la
          // primera entrada, no un campo suelto.
          historial: [
            expect.objectContaining({
              tipo: "apertura",
              lado: "reportante",
              autor: "Ana Pérez",
              contenido: "Al abrir /balance sale un error.",
              fecha: "2026-08-07T15:00:00.000Z",
              adjuntos: [{ id: 5, fileName: "captura.png" }],
            }),
            expect.objectContaining({
              tipo: "mensaje",
              lado: "xentria",
              autor: "Soporte Xentria",
              contenido: "Se validó con el usuario después del cierre.",
              fecha: "2026-08-09T10:00:00.000Z",
            }),
          ],
          puedeEscribir: true,
        }),
      });
    });

    it("oculta los tickets públicos a quien no administra soporte", async () => {
      mocks.findUnique.mockResolvedValue({ ...ticketBase, createdById: null });
      mocks.authorizePermiso.mockImplementation(async (permiso: string) =>
        permiso === "soporte:administrar"
          ? { ok: false, message: "Sin permiso." }
          : { ok: true, userId: 9, role: "Staff" },
      );

      const resultado = await obtenerDetalleTicket(14);

      expect(resultado).toEqual({ ok: false, message: "Este reporte no está disponible." });
    });

    it("deja ver un ticket público a Xentria", async () => {
      mocks.findUnique.mockResolvedValue({ ...ticketBase, createdById: null });

      const resultado = await obtenerDetalleTicket(14);

      expect(resultado.ok).toBe(true);
    });

    it("exige el permiso de lectura antes de tocar la base de datos", async () => {
      mocks.authorizePermiso.mockResolvedValue({ ok: false, message: "Sin permiso." });

      const resultado = await obtenerDetalleTicket(14);

      expect(resultado).toEqual({ ok: false, message: "Sin permiso." });
      expect(mocks.findUnique).not.toHaveBeenCalled();
    });

    it("rechaza un id que no es un ticket", async () => {
      const resultado = await obtenerDetalleTicket(0);

      expect(resultado).toEqual({ ok: false, message: "Reporte inválido." });
      expect(mocks.findUnique).not.toHaveBeenCalled();
    });

    it("avisa cuando el ticket ya no existe", async () => {
      mocks.findUnique.mockResolvedValue(null);

      const resultado = await obtenerDetalleTicket(14);

      expect(resultado).toEqual({ ok: false, message: "Este reporte ya no existe." });
    });
  });
});
