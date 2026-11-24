import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  ejecUpdateMany: vi.fn(), ejecCreate: vi.fn(), ejecUpdate: vi.fn(), ejecFindFirst: vi.fn(),
  progFindMany: vi.fn(), progUpdateMany: vi.fn(), progUpsert: vi.fn(), progFindUnique: vi.fn(),
  destFindMany: vi.fn(), envioCreate: vi.fn(),
  logAudit: vi.fn(), conexion: vi.fn(), enviarHtml: vi.fn(), generar: vi.fn(), logo: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({
  default: {
    notificacionEjecucion: { updateMany: mocks.ejecUpdateMany, create: mocks.ejecCreate, update: mocks.ejecUpdate, findFirst: mocks.ejecFindFirst },
    notificacionProgramada: { findMany: mocks.progFindMany, updateMany: mocks.progUpdateMany, upsert: mocks.progUpsert, findUnique: mocks.progFindUnique },
    notificacionDestinatario: { findMany: mocks.destFindMany },
    envioReporteEjecutivo: { create: mocks.envioCreate },
  },
}));
vi.mock("@/lib/audit", () => ({ logAudit: mocks.logAudit }));
vi.mock("@/lib/errores", () => ({ registrarError: vi.fn() }));
vi.mock("@/lib/correo/notificaciones", () => ({ conexionNotificaciones: mocks.conexion, enviarHtmlRegistrado: mocks.enviarHtml }));
vi.mock("@/lib/marca/recursos-correo", () => ({ logoAzulCorreo: mocks.logo }));
vi.mock("@/lib/auditoria/reporte-ejecutivo/generar-servidor", () => ({ generarReporteEjecutivoNucleo: mocks.generar }));
import {
  ACTOR_PROGRAMADO,
  enviarReporteAhora,
  leerPanelEnvio,
  procesarNotificacionesPendientes,
} from "./reporte-ejecutivo-servidor";

// Lunes 23-nov-2026, 7:05 a. m. de Colombia: el cron llega 5 minutos después de la hora programada (7:00).
const PROGRAMADA = new Date("2026-11-23T12:00:00.000Z");
const AHORA = new Date("2026-11-23T12:05:00.000Z");
const SIGUIENTE = new Date("2026-11-30T12:00:00.000Z");

const programacion = { id: 7, tipo: "reporte_ejecutivo", activa: true, diaSemana: 1, hora: "07:00", proximaEjecucionEn: PROGRAMADA };
// Sin `url_plataforma`: la dirección de Russell es opcional y el reporte no depende de ella.
const conexion = { id: 1, configuracion: { remitente: "r@example.com" } };
const LOGO = Buffer.from("png-azul");
const reporte = {
  ok: true as const,
  report: { titulo: "Reporte de uso y avances", html: "<!DOCTYPE html><html><head><style>p{color:#001871}</style></head><body><p>Hola &amp; adiós</p></body></html>" },
  versionIdsIncluidos: [9, 4, 9], totalNovedades: 3, totalAcciones: 120,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.ejecUpdateMany.mockResolvedValue({ count: 0 });
  mocks.ejecCreate.mockResolvedValue({ id: 55 });
  mocks.ejecUpdate.mockResolvedValue({});
  mocks.ejecFindFirst.mockResolvedValue(null);
  mocks.progFindMany.mockResolvedValue([programacion]);
  mocks.progUpdateMany.mockResolvedValue({ count: 1 });
  mocks.progUpsert.mockResolvedValue({ id: 7 });
  mocks.destFindMany.mockResolvedValue([
    { correo: "ana@x.co", nombre: "Ana", activo: true },
    { correo: "luis@x.co", nombre: null, activo: false },
    { correo: "eva@x.co", nombre: null, activo: true },
  ]);
  mocks.conexion.mockResolvedValue(conexion);
  mocks.logo.mockResolvedValue(LOGO);
  mocks.generar.mockResolvedValue(reporte);
  mocks.enviarHtml.mockResolvedValue({ ok: true, message: "2 correo(s) aceptado(s) por SMTP.", aceptados: 2, fallidos: 0 });
  mocks.envioCreate.mockResolvedValue({});
  vi.stubEnv("CRON_SECRET", "x");
});

describe("disparo programado", () => {
  it("sin nada pendiente solo cierra las ejecuciones colgadas", async () => {
    mocks.progFindMany.mockResolvedValue([]);
    mocks.ejecUpdateMany.mockResolvedValue({ count: 2 });
    const r = await procesarNotificacionesPendientes(AHORA);
    expect(r).toEqual({ revisadas: 0, enviadas: 0, omitidas: 0, saltadas: 0, errores: 0, perdidasCerradas: 2 });
    // «En curso» desde hace más de 30 minutos (límite calculado con `ahora`, no con now() de SQL).
    expect(mocks.ejecUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { estado: "en_curso", iniciadaEn: { lt: new Date("2026-11-23T11:35:00.000Z") } },
      data: expect.objectContaining({ estado: "error", terminadaEn: AHORA }),
    }));
    // Solo programaciones activas cuya hora ya llegó.
    expect(mocks.progFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { activa: true, tipo: "reporte_ejecutivo", proximaEjecucionEn: { lte: AHORA } },
    }));
    expect(mocks.enviarHtml).not.toHaveBeenCalled();
  });

  it("reclama el disparo, avanza la próxima fecha, genera el período anterior y envía solo a los activos", async () => {
    const r = await procesarNotificacionesPendientes(AHORA);
    expect(r).toMatchObject({ revisadas: 1, enviadas: 1, omitidas: 0, saltadas: 0, errores: 0 });

    expect(mocks.ejecCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        programacionId: 7, programadaPara: PROGRAMADA, origen: "programada", estado: "en_curso",
        ejecutadoPor: ACTOR_PROGRAMADO, iniciadaEn: AHORA,
      }),
    }));
    // La próxima se recalcula desde `ahora` (lunes siguiente) y solo si nadie la cambió mientras tanto.
    expect(mocks.progUpdateMany).toHaveBeenCalledWith({
      where: { id: 7, activa: true, proximaEjecucionEn: PROGRAMADA },
      data: { proximaEjecucionEn: SIGUIENTE },
    });
    // Lunes 23: cubre del lunes 16 al domingo 22, sin novedades omitidas y reutilizando la instantánea.
    expect(mocks.generar).toHaveBeenCalledOnce();
    const entradaGenerar = mocks.generar.mock.calls[0][0];
    expect(entradaGenerar.opciones).toEqual({ desde: "2026-11-16", hasta: "2026-11-22", actualizar: false, cambiosOmitidos: [] });
    expect(await entradaGenerar.obtenerActor()).toEqual({ id: null, nombre: ACTOR_PROGRAMADO });

    const [, destinatarios, correo, actor] = mocks.enviarHtml.mock.calls[0];
    expect(destinatarios).toEqual(["ana@x.co", "eva@x.co"]);
    expect(correo.asunto).toBe("Reporte de uso y avances");
    expect(correo.html).toContain("<!doctype html>");
    expect(correo.html).toContain('<p style="color:#001871">');
    expect(correo.texto).toContain("Hola & adiós");
    expect(actor).toBe(ACTOR_PROGRAMADO);

    // Constancia de lo enviado: el siguiente reporte no repite estas novedades.
    expect(mocks.envioCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        titulo: "Reporte de uso y avances", versionIds: [4, 9], totalNovedades: 3, totalAcciones: 120,
        canal: "correo", enviadoPor: ACTOR_PROGRAMADO, enviadoPorId: null,
        periodoDesde: new Date("2026-11-16T00:00:00.000Z"), periodoHasta: new Date("2026-11-22T23:59:59.999Z"),
      }),
    });
    expect(mocks.ejecUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 55 },
      data: expect.objectContaining({ estado: "ok", aceptados: 2, fallidos: 0, periodoDesde: new Date("2026-11-16T00:00:00.000Z") }),
    }));
  });

  it("un retraso de más de 24 h se marca omitida: no genera ni envía, solo avanza la próxima fecha", async () => {
    const tarde = new Date("2026-11-24T12:00:01.000Z");
    const r = await procesarNotificacionesPendientes(tarde);
    expect(r).toMatchObject({ revisadas: 1, omitidas: 1, enviadas: 0 });
    expect(mocks.ejecCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ estado: "omitida", programadaPara: PROGRAMADA, terminadaEn: tarde }),
    }));
    expect(mocks.progUpdateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { proximaEjecucionEn: SIGUIENTE } }));
    expect(mocks.generar).not.toHaveBeenCalled();
    expect(mocks.enviarHtml).not.toHaveBeenCalled();
    expect(mocks.ejecUpdate).not.toHaveBeenCalled();
  });

  it("si el disparo ya estaba reclamado (único violado) no vuelve a enviar y avanza la próxima fecha", async () => {
    mocks.ejecCreate.mockRejectedValue(Object.assign(new Error("Unique constraint"), { code: "P2002" }));
    const r = await procesarNotificacionesPendientes(AHORA);
    expect(r).toMatchObject({ revisadas: 1, saltadas: 1, enviadas: 0, errores: 0 });
    expect(mocks.generar).not.toHaveBeenCalled();
    expect(mocks.enviarHtml).not.toHaveBeenCalled();
    expect(mocks.progUpdateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { proximaEjecucionEn: SIGUIENTE } }));
  });

  it("otro error al reclamar no se traga: cuenta como error y no envía", async () => {
    mocks.ejecCreate.mockRejectedValue(new Error("BD caída"));
    const r = await procesarNotificacionesPendientes(AHORA);
    expect(r).toMatchObject({ errores: 1, enviadas: 0 });
    expect(mocks.enviarHtml).not.toHaveBeenCalled();
  });

  it("no atiende programaciones sin próxima fecha ni de otro tipo (la consulta ya las excluye)", async () => {
    mocks.progFindMany.mockResolvedValue([{ ...programacion, proximaEjecucionEn: null }]);
    const r = await procesarNotificacionesPendientes(AHORA);
    expect(r).toMatchObject({ revisadas: 1, saltadas: 1, enviadas: 0 });
    expect(mocks.ejecCreate).not.toHaveBeenCalled();
  });

  it("sin destinatarios activos queda en error con un mensaje claro y la semana siguiente se reintenta", async () => {
    mocks.destFindMany.mockResolvedValue([{ correo: "luis@x.co", nombre: null, activo: false }]);
    const r = await procesarNotificacionesPendientes(AHORA);
    expect(r).toMatchObject({ errores: 1, enviadas: 0 });
    expect(mocks.ejecUpdate.mock.calls[0][0].data).toMatchObject({ estado: "error" });
    expect(mocks.ejecUpdate.mock.calls[0][0].data.mensaje).toContain("destinatarios");
    expect(mocks.progUpdateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { proximaEjecucionEn: SIGUIENTE } }));
    expect(mocks.generar).not.toHaveBeenCalled();
  });

  it("sin conexión de correo no genera el reporte y deja el error claro", async () => {
    mocks.conexion.mockResolvedValue(null);
    await procesarNotificacionesPendientes(AHORA);
    expect(mocks.generar).not.toHaveBeenCalled();
    expect(mocks.ejecUpdate.mock.calls[0][0].data.mensaje).toContain("Configuración › Conexiones");
  });

  it("no depende de la dirección de Russell: envía igual, con el logotipo azul incrustado por CID", async () => {
    // Ni `url_plataforma` ausente, ni una dirección inválida o con HTTP, impiden el envío.
    for (const configuracion of [{ remitente: "r@example.com" }, { url_plataforma: "" }, { url_plataforma: "http://85.239.249.103:3001" }]) {
      vi.clearAllMocks();
      mocks.ejecCreate.mockResolvedValue({ id: 55 });
      mocks.progFindMany.mockResolvedValue([programacion]);
      mocks.progUpdateMany.mockResolvedValue({ count: 1 });
      mocks.destFindMany.mockResolvedValue([{ correo: "ana@x.co", nombre: null, activo: true }]);
      mocks.conexion.mockResolvedValue({ id: 1, configuracion });
      mocks.logo.mockResolvedValue(LOGO);
      mocks.generar.mockResolvedValue({
        ...reporte,
        report: { titulo: "Reporte", html: '<!DOCTYPE html><html><head><style>@font-face{font-family:Lato;src:url(/marca/fuentes/lato-400-normal.woff2) format("woff2")}</style></head><body><div class="rb-logo" style="padding:0"><img src="/marca/russell-bedford-azul.svg" width="180" height="39" alt="Logo"></div><p>Hola</p></body></html>' },
      });
      mocks.enviarHtml.mockResolvedValue({ ok: true, message: "1 correo(s) aceptado(s) por SMTP.", aceptados: 1, fallidos: 0 });
      mocks.ejecUpdate.mockResolvedValue({});
      mocks.envioCreate.mockResolvedValue({});
      const r = await procesarNotificacionesPendientes(AHORA);
      expect(r).toMatchObject({ enviadas: 1, errores: 0 });
      const correo = mocks.enviarHtml.mock.calls[0][2];
      expect(correo.html).toContain('src="cid:logo-russell-bedford-azul"');
      expect(correo.html).not.toContain("/marca/");
      expect(correo.html).not.toContain("@font-face");
      expect(correo.imagenes).toEqual([{ cid: "logo-russell-bedford-azul", nombre: "russell-bedford-azul.png", contenido: LOGO, tipo: "image/png" }]);
      expect(mocks.ejecUpdate.mock.calls[0][0].data).toMatchObject({ estado: "ok" });
    }
  });

  it("si no se puede leer el logotipo, el correo sale sin él y lo avisa en el historial", async () => {
    mocks.logo.mockResolvedValue(null);
    mocks.generar.mockResolvedValue({
      ...reporte,
      report: { titulo: "Reporte", html: '<!DOCTYPE html><html><body><div class="rb-logo"><img src="/marca/russell-bedford-azul.svg" width="180" height="39" alt="Logo"></div><p>Hola</p></body></html>' },
    });
    const r = await procesarNotificacionesPendientes(AHORA);
    expect(r).toMatchObject({ enviadas: 1, errores: 0 });
    const correo = mocks.enviarHtml.mock.calls[0][2];
    expect(correo.imagenes).toBeUndefined();
    expect(correo.html).not.toContain("<img");
    expect(correo.html).not.toContain("/marca/");
    expect(correo.html).toContain("Hola");
    expect(mocks.ejecUpdate.mock.calls[0][0].data).toMatchObject({ estado: "ok" });
    expect(mocks.ejecUpdate.mock.calls[0][0].data.mensaje).toContain("sin él");
  });

  it("si el reporte no se puede generar, no envía y conserva el mensaje del generador", async () => {
    mocks.generar.mockResolvedValue({ ok: false, message: "El período supera el límite de movimientos del reporte." });
    const r = await procesarNotificacionesPendientes(AHORA);
    expect(r).toMatchObject({ errores: 1 });
    expect(mocks.enviarHtml).not.toHaveBeenCalled();
    expect(mocks.ejecUpdate.mock.calls[0][0].data.mensaje).toBe("El período supera el límite de movimientos del reporte.");
    expect(mocks.envioCreate).not.toHaveBeenCalled();
  });

  it("un error inesperado no filtra su texto original a la pantalla", async () => {
    mocks.generar.mockRejectedValue(new Error("password=secreta en la traza"));
    await procesarNotificacionesPendientes(AHORA);
    const { mensaje, estado } = mocks.ejecUpdate.mock.calls[0][0].data;
    expect(estado).toBe("error");
    expect(mensaje).not.toContain("secreta");
    expect(mensaje).toContain("No se pudo generar o enviar el reporte");
  });

  it("un envío parcial se marca parcial y igual deja constancia del envío", async () => {
    mocks.enviarHtml.mockResolvedValue({ ok: false, message: "1 correo(s) aceptado(s) por SMTP; 1 con error.", aceptados: 1, fallidos: 1 });
    const r = await procesarNotificacionesPendientes(AHORA);
    expect(r).toMatchObject({ enviadas: 1, errores: 0 });
    expect(mocks.ejecUpdate.mock.calls[0][0].data).toMatchObject({ estado: "parcial", aceptados: 1, fallidos: 1 });
    expect(mocks.envioCreate).toHaveBeenCalledOnce();
  });

  it("si el SMTP rechaza a todos queda en error y NO deja constancia (nadie recibió el reporte)", async () => {
    mocks.enviarHtml.mockResolvedValue({ ok: false, message: "0 correo(s) aceptado(s) por SMTP; 2 con error.", aceptados: 0, fallidos: 2 });
    const r = await procesarNotificacionesPendientes(AHORA);
    expect(r).toMatchObject({ errores: 1, enviadas: 0 });
    expect(mocks.ejecUpdate.mock.calls[0][0].data).toMatchObject({ estado: "error", aceptados: 0, fallidos: 2 });
    expect(mocks.envioCreate).not.toHaveBeenCalled();
  });

  it("si falla dejar la constancia, el envío sigue siendo ok y el mensaje avisa de marcarlo a mano", async () => {
    mocks.envioCreate.mockRejectedValue(new Error("BD"));
    await procesarNotificacionesPendientes(AHORA);
    const { estado, mensaje } = mocks.ejecUpdate.mock.calls[0][0].data;
    expect(estado).toBe("ok");
    expect(mensaje).toContain("márcalo a mano");
  });

  it("el período sigue al instante PROGRAMADO: un retraso que cruza la medianoche no corre la ventana", async () => {
    // Programada el lunes 11:30 p. m. de Colombia (martes 04:30 UTC); el cron llega pasada la medianoche.
    const programadaTarde = new Date("2026-11-24T04:30:00.000Z");
    mocks.progFindMany.mockResolvedValue([{ ...programacion, hora: "23:30", proximaEjecucionEn: programadaTarde }]);
    await procesarNotificacionesPendientes(new Date("2026-11-24T05:10:00.000Z"));
    expect(mocks.generar.mock.calls[0][0].opciones).toMatchObject({ desde: "2026-11-16", hasta: "2026-11-22" });
  });
});

describe("envío manual y prueba", () => {
  const actor = { id: 3, nombre: "Victor" };

  it("la prueba va solo al correo de quien la pide, con [Prueba] en el asunto y sin dejar constancia", async () => {
    mocks.enviarHtml.mockResolvedValue({ ok: true, message: "1 correo(s) aceptado(s) por SMTP.", aceptados: 1, fallidos: 0 });
    const r = await enviarReporteAhora({ origen: "prueba", actor, correoPrueba: " Victor@Russell.co ", ahora: AHORA });
    expect(r).toMatchObject({ ok: true, estado: "ok" });
    const [, destinatarios, correo, quien] = mocks.enviarHtml.mock.calls[0];
    expect(destinatarios).toEqual(["victor@russell.co"]);
    expect(correo.asunto).toBe("[Prueba] Reporte de uso y avances");
    expect(quien).toBe("Victor");
    expect(mocks.envioCreate).not.toHaveBeenCalled();
    expect(mocks.destFindMany).not.toHaveBeenCalled();
    expect(mocks.ejecCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ origen: "prueba", programadaPara: AHORA, ejecutadoPor: "Victor", estado: "en_curso" }),
    }));
    // El reporte se audita a nombre de quien lo pidió.
    expect(await mocks.generar.mock.calls[0][0].obtenerActor()).toEqual(actor);
  });

  it("la prueba sin correo en la cuenta no envía nada", async () => {
    const r = await enviarReporteAhora({ origen: "prueba", actor, correoPrueba: null, ahora: AHORA });
    expect(r).toMatchObject({ ok: false, estado: null });
    expect(mocks.enviarHtml).not.toHaveBeenCalled();
    expect(mocks.ejecCreate).not.toHaveBeenCalled();
  });

  it("el envío manual va a toda la lista activa y deja constancia a nombre de quien lo pidió", async () => {
    const r = await enviarReporteAhora({ origen: "manual", actor, ahora: AHORA });
    expect(r).toMatchObject({ ok: true, estado: "ok" });
    expect(mocks.enviarHtml.mock.calls[0][1]).toEqual(["ana@x.co", "eva@x.co"]);
    expect(mocks.enviarHtml.mock.calls[0][2].asunto).toBe("Reporte de uso y avances");
    expect(mocks.envioCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ enviadoPor: "Victor", enviadoPorId: 3 }) });
    expect(mocks.ejecCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ origen: "manual" }) }));
  });

  it("el envío manual con 7 días hacia atrás desde ahora", async () => {
    await enviarReporteAhora({ origen: "manual", actor, ahora: new Date("2026-11-25T15:00:00.000Z") });
    expect(mocks.generar.mock.calls[0][0].opciones).toMatchObject({ desde: "2026-11-18", hasta: "2026-11-24" });
  });

  it("sin destinatarios activos no envía ni crea ejecución", async () => {
    mocks.destFindMany.mockResolvedValue([]);
    const r = await enviarReporteAhora({ origen: "manual", actor, ahora: AHORA });
    expect(r).toMatchObject({ ok: false, estado: null });
    expect(r.message).toContain("destinatarios");
    expect(mocks.ejecCreate).not.toHaveBeenCalled();
  });

  it("con otro envío a la lista en curso se rechaza (doble clic o cruce con el programado)", async () => {
    mocks.ejecFindFirst.mockResolvedValue({ id: 99 });
    const r = await enviarReporteAhora({ origen: "manual", actor, ahora: AHORA });
    expect(r).toMatchObject({ ok: false, estado: null });
    expect(r.message).toContain("en curso");
    expect(mocks.enviarHtml).not.toHaveBeenCalled();
    expect(mocks.ejecFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ estado: "en_curso", iniciadaEn: { gte: new Date("2026-11-23T11:35:00.000Z") } }),
    }));
  });

  it("un fallo del SMTP devuelve ok=false con el mensaje y deja la ejecución en error", async () => {
    mocks.enviarHtml.mockResolvedValue({ ok: false, message: "0 correo(s) aceptado(s) por SMTP; 2 con error.", aceptados: 0, fallidos: 2 });
    const r = await enviarReporteAhora({ origen: "manual", actor, ahora: AHORA });
    expect(r).toMatchObject({ ok: false, estado: "error" });
    expect(mocks.ejecUpdate.mock.calls[0][0].data.estado).toBe("error");
  });
});

describe("panel", () => {
  it("sin programación guardada muestra los valores por defecto (pausado, lunes 07:00)", async () => {
    mocks.progFindUnique.mockResolvedValue(null);
    const panel = await leerPanelEnvio({ correoPrueba: "yo@x.co", ahora: AHORA });
    expect(panel).toMatchObject({
      existe: false, activa: false, diaSemana: 1, hora: "07:00", proximaEjecucionEn: null,
      destinatarios: [], ejecuciones: [], atrasado: false, correoPrueba: "yo@x.co", disparadorConfigurado: true,
      conexion: { estado: "lista" },
    });
  });

  it("la conexión sin dirección de Russell cuenta como lista", async () => {
    mocks.progFindUnique.mockResolvedValue(null);
    mocks.conexion.mockResolvedValue({ id: 1, configuracion: { remitente: "r@example.com" } });
    const panel = await leerPanelEnvio({ correoPrueba: null, ahora: AHORA });
    expect(panel.conexion).toEqual({ estado: "lista", mensaje: null });
  });

  it("avisa cuando el envío debía haber salido hace más de 30 minutos y no hay cron, y cuando falta la conexión", async () => {
    mocks.progFindUnique.mockResolvedValue({ ...programacion, destinatarios: [], ejecuciones: [] });
    mocks.conexion.mockResolvedValue(null);
    vi.stubEnv("CRON_SECRET", "");
    const panel = await leerPanelEnvio({ correoPrueba: null, ahora: new Date("2026-11-23T13:00:00.000Z") });
    expect(panel.atrasado).toBe(true);
    expect(panel.disparadorConfigurado).toBe(false);
    expect(panel.conexion.estado).toBe("sin_conexion");
    expect(panel.proximaEjecucionEn).toBe(PROGRAMADA.toISOString());
  });
});
