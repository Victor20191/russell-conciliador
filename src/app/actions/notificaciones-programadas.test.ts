import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(), logAudit: vi.fn(), revalidatePath: vi.fn(), getCurrentUser: vi.fn(),
  progFindUnique: vi.fn(), progUpsert: vi.fn(),
  destCount: vi.fn(), destCreate: vi.fn(), destUpdateMany: vi.fn(), destFindFirst: vi.fn(), destDelete: vi.fn(),
  enviarReporteAhora: vi.fn(), leerPanelEnvio: vi.fn(), obtenerOCrear: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/rbac/reporte-ejecutivo", () => ({ authorizeReporteEjecutivo: mocks.authorize }));
vi.mock("@/lib/dal", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/audit", () => ({ logAudit: mocks.logAudit }));
vi.mock("@/lib/errores", () => ({ mensajeErrorBD: (_c: string, e: unknown) => `ERROR: ${String(e)}` }));
vi.mock("@/lib/prisma", () => ({
  default: {
    notificacionProgramada: { findUnique: mocks.progFindUnique, upsert: mocks.progUpsert },
    notificacionDestinatario: {
      count: mocks.destCount, create: mocks.destCreate, updateMany: mocks.destUpdateMany,
      findFirst: mocks.destFindFirst, delete: mocks.destDelete,
    },
  },
}));
vi.mock("@/lib/notificaciones/reporte-ejecutivo-servidor", () => ({
  enviarReporteAhora: mocks.enviarReporteAhora,
  leerPanelEnvio: mocks.leerPanelEnvio,
  obtenerOCrearProgramacion: mocks.obtenerOCrear,
  RUTA_REPORTES_EJECUTIVOS: "/config/reportes-ejecutivos",
}));
import {
  agregarDestinatarioReporte,
  cambiarEstadoDestinatarioReporte,
  enviarPruebaDelReporte,
  enviarReporteAhoraALista,
  guardarProgramacionReporte,
  obtenerPanelEnvioAutomatico,
  quitarDestinatarioReporte,
} from "./notificaciones-programadas";

const SIN_PERMISO = { ok: false, message: "No tienes permisos para esta acción." };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.authorize.mockResolvedValue({ ok: true, userId: 3, role: "Superadministrador" });
  mocks.getCurrentUser.mockResolvedValue({ id: 3, name: "Victor", email: "victor@russell.co" });
  mocks.progFindUnique.mockResolvedValue(null);
  mocks.progUpsert.mockResolvedValue({ id: 7 });
  mocks.obtenerOCrear.mockResolvedValue({ id: 7 });
  mocks.destCount.mockResolvedValue(0);
  mocks.destCreate.mockResolvedValue({});
  mocks.destUpdateMany.mockResolvedValue({ count: 1 });
  mocks.destFindFirst.mockResolvedValue({ id: 11, correo: "ana@x.co" });
  mocks.destDelete.mockResolvedValue({});
  mocks.enviarReporteAhora.mockResolvedValue({ ok: true, message: "2 correo(s) aceptado(s) por SMTP.", estado: "ok" });
});

describe("autorización: toda acción falla cerrada sin tocar la BD ni el correo", () => {
  it.each([
    ["obtenerPanelEnvioAutomatico", () => obtenerPanelEnvioAutomatico()],
    ["guardarProgramacionReporte", () => guardarProgramacionReporte({ activa: false, diaSemana: 1, hora: "07:00" })],
    ["agregarDestinatarioReporte", () => agregarDestinatarioReporte({ correo: "ana@x.co" })],
    ["cambiarEstadoDestinatarioReporte", () => cambiarEstadoDestinatarioReporte(1, false)],
    ["quitarDestinatarioReporte", () => quitarDestinatarioReporte(1)],
    ["enviarPruebaDelReporte", () => enviarPruebaDelReporte()],
    ["enviarReporteAhoraALista", () => enviarReporteAhoraALista()],
  ])("%s", async (_nombre, accion) => {
    mocks.authorize.mockResolvedValue(SIN_PERMISO);
    expect(await accion()).toMatchObject(SIN_PERMISO);
    expect(mocks.progUpsert).not.toHaveBeenCalled();
    expect(mocks.destCreate).not.toHaveBeenCalled();
    expect(mocks.destUpdateMany).not.toHaveBeenCalled();
    expect(mocks.destDelete).not.toHaveBeenCalled();
    expect(mocks.enviarReporteAhora).not.toHaveBeenCalled();
    expect(mocks.leerPanelEnvio).not.toHaveBeenCalled();
    expect(mocks.logAudit).not.toHaveBeenCalled();
  });
});

describe("guardarProgramacionReporte", () => {
  it("valida día y hora antes de tocar la BD", async () => {
    for (const datos of [
      { activa: true, diaSemana: 9, hora: "07:00" },
      { activa: true, diaSemana: 1, hora: "7am" },
      { activa: "si" as unknown as boolean, diaSemana: 1, hora: "07:00" },
    ]) {
      const r = await guardarProgramacionReporte(datos);
      expect(r.ok).toBe(false);
    }
    expect(mocks.progUpsert).not.toHaveBeenCalled();
  });

  it("no deja activar el envío sin destinatarios activos", async () => {
    mocks.progFindUnique.mockResolvedValue({ id: 7, activa: false, diaSemana: 1, hora: "07:00", proximaEjecucionEn: null });
    mocks.destCount.mockResolvedValue(0);
    const r = await guardarProgramacionReporte({ activa: true, diaSemana: 1, hora: "07:00" });
    expect(r.ok).toBe(false);
    expect(r.message).toContain("destinatario");
    expect(mocks.progUpsert).not.toHaveBeenCalled();
  });

  it("al activar guarda la próxima ejecución calculada en la app, audita y revalida", async () => {
    mocks.progFindUnique.mockResolvedValue({ id: 7, activa: false, diaSemana: 1, hora: "07:00", proximaEjecucionEn: null });
    mocks.destCount.mockResolvedValue(2);
    const r = await guardarProgramacionReporte({ activa: true, diaSemana: 3, hora: "09:30" });
    expect(r.ok).toBe(true);
    const { update, create } = mocks.progUpsert.mock.calls[0][0];
    expect(update).toMatchObject({ activa: true, diaSemana: 3, hora: "09:30", actualizadoPor: "Victor", actualizadoPorId: 3 });
    expect(update.proximaEjecucionEn).toBeInstanceOf(Date);
    expect(update.proximaEjecucionEn.getTime()).toBeGreaterThan(Date.now());
    expect(create).toMatchObject({ tipo: "reporte_ejecutivo", creadoPor: "Victor" });
    expect(mocks.logAudit).toHaveBeenCalledWith(expect.objectContaining({ user: "Victor", action: "ACTIVÓ ENVÍO AUTOMÁTICO DE REPORTE" }));
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/config/reportes-ejecutivos");
  });

  it("guarda qué período cubre y lo anota en la bitácora", async () => {
    mocks.progFindUnique.mockResolvedValue({ id: 7, activa: true, diaSemana: 3, hora: "07:00", proximaEjecucionEn: new Date("2026-12-02T12:00:00.000Z") });
    mocks.destCount.mockResolvedValue(2);
    const r = await guardarProgramacionReporte({ activa: true, diaSemana: 3, hora: "07:00", modoPeriodo: "ultimos_dias", diasPeriodo: 7 });
    expect(r.ok).toBe(true);
    const { update, create } = mocks.progUpsert.mock.calls[0][0];
    expect(update).toMatchObject({ modoPeriodo: "ultimos_dias", diasPeriodo: 7, incluirDiaEnvio: false });
    expect(create).toMatchObject({ modoPeriodo: "ultimos_dias", diasPeriodo: 7, incluirDiaEnvio: false });
    // Cambiar solo el período no mueve la próxima fecha.
    expect(update.proximaEjecucionEn).toEqual(new Date("2026-12-02T12:00:00.000Z"));
    expect(mocks.logAudit).toHaveBeenCalledWith(expect.objectContaining({
      detail: expect.stringContaining("cubre los últimos 7 días antes del envío"),
    }));
  });

  it("guarda si se cuenta el día del envío", async () => {
    mocks.progFindUnique.mockResolvedValue({ id: 7, activa: false, diaSemana: 3, hora: "07:00", proximaEjecucionEn: null });
    const r = await guardarProgramacionReporte({
      activa: false, diaSemana: 3, hora: "07:00", modoPeriodo: "ultimos_dias", diasPeriodo: 7, incluirDiaEnvio: true,
    });
    expect(r.ok).toBe(true);
    expect(mocks.progUpsert.mock.calls[0][0].update).toMatchObject({ incluirDiaEnvio: true });
    expect(mocks.logAudit).toHaveBeenCalledWith(expect.objectContaining({
      detail: expect.stringContaining("contando el día del envío"),
    }));
  });

  it("rechaza días fuera de 1 a 30 sin tocar la BD", async () => {
    const r = await guardarProgramacionReporte({ activa: true, diaSemana: 3, hora: "07:00", modoPeriodo: "ultimos_dias", diasPeriodo: 45 });
    expect(r).toMatchObject({ ok: false, message: "Indica cuántos días cubre el envío, de 1 a 30." });
    expect(mocks.progUpsert).not.toHaveBeenCalled();
  });

  it("pausar borra la próxima ejecución y no exige destinatarios", async () => {
    const r = await guardarProgramacionReporte({ activa: false, diaSemana: 1, hora: "07:00" });
    expect(r.ok).toBe(true);
    expect(mocks.progUpsert.mock.calls[0][0].update.proximaEjecucionEn).toBeNull();
    expect(mocks.logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "PAUSÓ ENVÍO AUTOMÁTICO DE REPORTE" }));
  });
});

describe("destinatarios", () => {
  it("agrega un correo normalizado a la programación y audita", async () => {
    const r = await agregarDestinatarioReporte({ correo: " Gerencia@Cliente.CO ", nombre: " Ana " });
    expect(r.ok).toBe(true);
    expect(mocks.destCreate).toHaveBeenCalledWith({
      data: { programacionId: 7, correo: "gerencia@cliente.co", nombre: "Ana", creadoPor: "Victor", creadoPorId: 3 },
    });
    expect(mocks.logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "AGREGÓ DESTINATARIO DEL REPORTE" }));
    expect(mocks.revalidatePath).toHaveBeenCalled();
  });

  it("rechaza un correo inválido sin tocar la BD", async () => {
    const r = await agregarDestinatarioReporte({ correo: "no-es-correo" });
    expect(r.ok).toBe(false);
    expect(r.errors?.correo?.length).toBeGreaterThan(0);
    expect(mocks.destCreate).not.toHaveBeenCalled();
  });

  it("respeta el tope de destinatarios", async () => {
    mocks.destCount.mockResolvedValue(50);
    const r = await agregarDestinatarioReporte({ correo: "otro@x.co" });
    expect(r.ok).toBe(false);
    expect(r.message).toContain("50");
    expect(mocks.destCreate).not.toHaveBeenCalled();
  });

  it("un correo repetido (único violado) devuelve un error claro", async () => {
    mocks.destCreate.mockRejectedValue(Object.assign(new Error("Unique"), { code: "P2002" }));
    const r = await agregarDestinatarioReporte({ correo: "ana@x.co" });
    expect(r).toMatchObject({ ok: false, message: "Ese correo ya está en la lista." });
    expect(mocks.logAudit).not.toHaveBeenCalled();
  });

  it("pausa y reactiva solo destinatarios de la programación del reporte", async () => {
    expect((await cambiarEstadoDestinatarioReporte(11, false)).ok).toBe(true);
    expect(mocks.destUpdateMany).toHaveBeenCalledWith({
      where: { id: 11, programacion: { tipo: "reporte_ejecutivo" } },
      data: { activo: false },
    });
    mocks.destUpdateMany.mockResolvedValue({ count: 0 });
    expect(await cambiarEstadoDestinatarioReporte(11, true)).toMatchObject({ ok: false });
  });

  it("rechaza ids inválidos", async () => {
    expect((await cambiarEstadoDestinatarioReporte(-1, true)).ok).toBe(false);
    expect((await quitarDestinatarioReporte(0)).ok).toBe(false);
    expect((await quitarDestinatarioReporte(1.5)).ok).toBe(false);
    expect(mocks.destUpdateMany).not.toHaveBeenCalled();
    expect(mocks.destDelete).not.toHaveBeenCalled();
  });

  it("quita al destinatario y deja constancia del correo quitado", async () => {
    const r = await quitarDestinatarioReporte(11);
    expect(r.ok).toBe(true);
    expect(mocks.destDelete).toHaveBeenCalledWith({ where: { id: 11 } });
    expect(mocks.logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "QUITÓ DESTINATARIO DEL REPORTE", detail: expect.stringContaining("ana@x.co") }));
  });
});

describe("envíos desde la pantalla", () => {
  it("sin correo escrito, la prueba va al correo de la sesión", async () => {
    const r = await enviarPruebaDelReporte();
    expect(r.ok).toBe(true);
    expect(mocks.enviarReporteAhora).toHaveBeenCalledWith({
      origen: "prueba", actor: { id: 3, nombre: "Victor" }, correoPrueba: "victor@russell.co",
    });
    expect(await enviarPruebaDelReporte({ correo: "   " })).toMatchObject({ ok: true });
    expect(mocks.enviarReporteAhora).toHaveBeenLastCalledWith(expect.objectContaining({ correoPrueba: "victor@russell.co" }));
  });

  it("la prueba va al correo escrito, normalizado, y la bitácora anota a dónde fue", async () => {
    const r = await enviarPruebaDelReporte({ correo: "  Gerencia@Cliente.CO " });
    expect(r.ok).toBe(true);
    expect(mocks.enviarReporteAhora).toHaveBeenCalledWith({
      origen: "prueba", actor: { id: 3, nombre: "Victor" }, correoPrueba: "gerencia@cliente.co",
    });
    expect(mocks.logAudit).toHaveBeenCalledWith(expect.objectContaining({
      action: "ENVIÓ PRUEBA DEL REPORTE", detail: expect.stringContaining("gerencia@cliente.co"),
    }));
  });

  it("un correo inválido no envía nada", async () => {
    const r = await enviarPruebaDelReporte({ correo: "no-es-correo" });
    expect(r).toMatchObject({ ok: false, message: "Escribe un correo válido." });
    expect(mocks.enviarReporteAhora).not.toHaveBeenCalled();
    expect(mocks.logAudit).not.toHaveBeenCalled();
  });

  it("sin correo escrito ni en la cuenta, pide escribirlo", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: 3, name: "Victor", email: null });
    const r = await enviarPruebaDelReporte();
    expect(r).toMatchObject({ ok: false, message: "Escribe el correo al que quieres enviar la prueba." });
    expect(mocks.enviarReporteAhora).not.toHaveBeenCalled();
  });

  it("la prueba lleva el período de la página y las novedades omitidas, y la bitácora anota el período", async () => {
    const r = await enviarPruebaDelReporte({
      correo: "gerencia@cliente.co",
      alcance: { desde: "2026-11-18", hasta: "2026-11-24", cambiosOmitidos: [31, 32] },
    });
    expect(r.ok).toBe(true);
    expect(mocks.enviarReporteAhora).toHaveBeenCalledWith({
      origen: "prueba", actor: { id: 3, nombre: "Victor" }, correoPrueba: "gerencia@cliente.co",
      periodoElegido: { desde: "2026-11-18", hasta: "2026-11-24" }, cambiosOmitidos: [31, 32],
    });
    expect(mocks.logAudit).toHaveBeenCalledWith(expect.objectContaining({
      detail: "Envió una prueba del reporte para gerencia del 2026-11-18 al 2026-11-24 a gerencia@cliente.co.",
    }));
  });

  it("la prueba con un período que no sirve no envía nada", async () => {
    for (const alcance of [
      { desde: "18/11/2026", hasta: "2026-11-24" },
      { desde: "2026-11-24", hasta: "2026-11-18" },
      { desde: "2026-11-18", hasta: "2026-11-24", cambiosOmitidos: [0] },
    ]) {
      expect(await enviarPruebaDelReporte({ correo: "gerencia@cliente.co", alcance })).toMatchObject({ ok: false });
    }
    expect(mocks.enviarReporteAhora).not.toHaveBeenCalled();
    expect(mocks.logAudit).not.toHaveBeenCalled();
  });

  it("el envío a la lista pasa como manual a nombre de la persona", async () => {
    const r = await enviarReporteAhoraALista();
    expect(r).toMatchObject({ ok: true, message: "2 correo(s) aceptado(s) por SMTP." });
    expect(mocks.enviarReporteAhora).toHaveBeenCalledWith({ origen: "manual", actor: { id: 3, nombre: "Victor" } });
    expect(mocks.revalidatePath).toHaveBeenCalled();
  });

  it("el envío a la lista lleva el período de la página y las novedades omitidas", async () => {
    const r = await enviarReporteAhoraALista({ desde: "2026-11-18", hasta: "2026-11-24", cambiosOmitidos: [31] });
    expect(r.ok).toBe(true);
    expect(mocks.enviarReporteAhora).toHaveBeenCalledWith({
      origen: "manual", actor: { id: 3, nombre: "Victor" },
      periodoElegido: { desde: "2026-11-18", hasta: "2026-11-24" }, cambiosOmitidos: [31],
    });
    // Sin omisiones, viaja la lista vacía.
    await enviarReporteAhoraALista({ desde: "2026-11-18", hasta: "2026-11-24" });
    expect(mocks.enviarReporteAhora).toHaveBeenLastCalledWith(expect.objectContaining({ cambiosOmitidos: [] }));
  });

  it("el envío a la lista con un período de más de 366 días no envía", async () => {
    const r = await enviarReporteAhoraALista({ desde: "2024-01-01", hasta: "2026-11-24" });
    expect(r).toMatchObject({ ok: false });
    expect(r.message).toContain("366 días");
    expect(mocks.enviarReporteAhora).not.toHaveBeenCalled();
  });

  it("un fallo del envío vuelve como ok=false con el mensaje", async () => {
    mocks.enviarReporteAhora.mockResolvedValue({ ok: false, message: "Ya hay un envío a la lista en curso.", estado: null });
    expect(await enviarReporteAhoraALista()).toMatchObject({ ok: false, message: "Ya hay un envío a la lista en curso." });
  });

  it("una excepción no se convierte en éxito", async () => {
    mocks.enviarReporteAhora.mockRejectedValue(new Error("BD caída"));
    const r = await enviarReporteAhoraALista();
    expect(r.ok).toBe(false);
  });
});

describe("panel", () => {
  it("devuelve el panel con el correo de la sesión", async () => {
    mocks.leerPanelEnvio.mockResolvedValue({ activa: false });
    expect(await obtenerPanelEnvioAutomatico()).toEqual({ ok: true, panel: { activa: false } });
    expect(mocks.leerPanelEnvio).toHaveBeenCalledWith({ correoPrueba: "victor@russell.co" });
  });

  it("si faltan las tablas (migración pendiente) no lanza: avisa", async () => {
    mocks.leerPanelEnvio.mockRejectedValue(Object.assign(new Error("no existe"), { code: "P2021" }));
    const r = await obtenerPanelEnvioAutomatico();
    expect(r.ok).toBe(false);
    expect(!r.ok && r.message).toContain("migración");
  });
});
