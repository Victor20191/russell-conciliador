import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// Las acciones llegan a la BD: aquí solo se comprueba lo que la pantalla pinta.
vi.mock("@/app/actions/notificaciones-programadas", () => ({
  agregarDestinatarioReporte: vi.fn(),
  cambiarEstadoDestinatarioReporte: vi.fn(),
  enviarPruebaDelReporte: vi.fn(),
  enviarReporteAhoraALista: vi.fn(),
  guardarProgramacionReporte: vi.fn(),
  quitarDestinatarioReporte: vi.fn(),
}));
import { EnvioAutomatico } from "./envio-automatico";
import type { PanelEnvioAutomatico } from "@/lib/notificaciones/panel";

const PANEL: PanelEnvioAutomatico = {
  existe: true,
  activa: true,
  diaSemana: 1,
  hora: "07:00",
  // Lunes 30-nov-2026, 7:00 a. m. de Colombia.
  proximaEjecucionEn: "2026-11-30T12:00:00.000Z",
  periodoProximo: {
    estado: "nuevo", desde: "2026-11-23", hasta: "2026-11-29", origen: "continua",
    ultimoDesde: "2026-11-16", ultimoHasta: "2026-11-22", recortado: false, desdeSinRecorte: "2026-11-23",
  },
  periodoManualSugerido: {
    desde: "2026-11-23", hasta: "2026-11-24", hoy: "2026-11-24", origen: "continua",
    ultimoDesde: "2026-11-16", ultimoHasta: "2026-11-22", recortado: false, desdeSinRecorte: "2026-11-23", yaCubiertoHoy: false,
  },
  destinatarios: [
    { id: 1, correo: "ana@cliente.co", nombre: "Ana Pérez", activo: true },
    { id: 2, correo: "luis@cliente.co", nombre: null, activo: false },
  ],
  ejecuciones: [
    {
      id: 9, origen: "programada", estado: "ok", aceptados: 1, fallidos: 0,
      mensaje: "1 correo(s) aceptado(s) por SMTP.", programadaPara: "2026-11-23T12:00:00.000Z",
      iniciadaEn: "2026-11-23T12:05:00.000Z", terminadaEn: "2026-11-23T12:05:20.000Z",
      periodoDesde: "2026-11-16T00:00:00.000Z", periodoHasta: "2026-11-22T23:59:59.999Z",
      ejecutadoPor: "Sistema (envío programado)",
    },
    {
      id: 8, origen: "prueba", estado: "error", aceptados: 0, fallidos: 1,
      mensaje: "El servidor rechazó el usuario o la contraseña SMTP.", programadaPara: "2026-11-20T15:00:00.000Z",
      iniciadaEn: "2026-11-20T15:00:00.000Z", terminadaEn: "2026-11-20T15:00:03.000Z",
      periodoDesde: null, periodoHasta: null, ejecutadoPor: "Victor",
    },
  ],
  conexion: { estado: "lista", mensaje: null },
  disparadorConfigurado: true,
  atrasado: false,
  topeDestinatarios: 50,
  correoPrueba: "victor@russell.co",
};

const pintar = (panel: PanelEnvioAutomatico) => renderToStaticMarkup(createElement(EnvioAutomatico, { resultado: { ok: true, panel } }));

describe("panel «Envío automático»", () => {
  it("muestra el próximo envío en hora de Colombia, los destinatarios y el historial", () => {
    const html = pintar(PANEL);
    expect(html).toContain("Envío automático");
    expect(html).toContain("Próximo envío:");
    expect(html).toContain("lunes 30/Nov/2026 7:00 a. m. (hora de Colombia)");
    expect(html).toContain("Ana Pérez");
    expect(html).toContain("luis@cliente.co");
    expect(html).toContain("Recibe el reporte");
    expect(html).toContain("En pausa");
    expect(html).toContain("2 de 50");
    expect(html).toContain("Correos en la lista (2)");
    expect(html).toContain("1 recibirá el reporte");
    expect(html).toContain("1 en pausa");
    // El botón «+» de agregar destinatario queda en el encabezado y la lista debajo.
    expect(html).toContain('aria-label="Agregar destinatario"');
    expect(html.indexOf("Correos en la lista (2)")).toBeGreaterThan(html.indexOf('aria-label="Agregar destinatario"'));
    // Historial con estado, origen y período en fechas de calendario.
    expect(html).toContain("Enviado");
    expect(html).toContain("Programado");
    expect(html).toContain("Con error");
    expect(html).toContain("Prueba");
    expect(html).toContain("16/Nov/2026 → 22/Nov/2026");
    expect(html).toContain("El servidor rechazó el usuario o la contraseña SMTP.");
    // Sin avisos cuando todo está en orden.
    expect(html).not.toContain("todavía no salió");
    expect(html).not.toContain("Ir a Conexiones");
  });

  it("dice desde cuándo hasta cuándo cubrirá el próximo envío y de dónde sale el período", () => {
    const html = pintar(PANEL);
    expect(html).toContain("Cubrirá:");
    expect(html).toContain("del 23/Nov/2026 al 29/Nov/2026");
    expect(html).toContain("Continúa desde el último reporte enviado (del 16/Nov/2026 al 22/Nov/2026).");

    const primero = pintar({ ...PANEL, periodoProximo: { estado: "nuevo", desde: "2026-11-23", hasta: "2026-11-29", origen: "primer_envio", ultimoDesde: null, ultimoHasta: null, recortado: false, desdeSinRecorte: "2026-11-23" } });
    expect(primero).toContain("del 23/Nov/2026 al 29/Nov/2026");
    expect(primero).toContain("Primer envío: últimos 7 días.");

    const recortado = pintar({ ...PANEL, periodoProximo: { estado: "nuevo", desde: "2026-10-31", hasta: "2026-11-29", origen: "continua", ultimoDesde: "2024-01-01", ultimoHasta: "2024-01-31", recortado: true, desdeSinRecorte: "2024-02-01" } });
    expect(recortado).toContain("Se recortó a 30 días");
    expect(recortado).toContain("habría arrancado el 01/Feb/2024");

    const cubierto = pintar({ ...PANEL, periodoProximo: { estado: "cubierto", hasta: "2026-11-29", cubiertoHasta: "2026-11-29" } });
    expect(cubierto).toContain("Ya está cubierto hasta el 29/Nov/2026: ese día no se enviará.");
    expect(cubierto).not.toContain("Cubrirá:");
  });

  it("en pausa no anuncia ningún período", () => {
    const html = pintar({ ...PANEL, activa: false, proximaEjecucionEn: null, periodoProximo: null });
    expect(html).not.toContain("Cubrirá:");
  });

  it("ofrece prueba y envío a la lista, muestra los correos activos en «Enviar ahora» y no deja enviar sin conexión", () => {
    const listo = pintar(PANEL);
    expect(listo).toContain("Enviar prueba");
    expect(listo).toContain("Enviar ahora a la lista");
    // El correo de la prueba se puede escribir; arranca con el de quien mira la pantalla.
    expect(listo).toMatch(/<input[^>]*id="correo-prueba"[^>]*value="victor@russell.co"/);
    expect(listo).toContain("La prueba llega solo al correo que escribas");
    // En «Enviar ahora» se listan solo los correos activos que recibirán el reporte (no los pausados).
    const bloqueEnvio = listo.slice(listo.indexOf('id="envio-ahora"'), listo.indexOf('id="envio-historial"'));
    expect(bloqueEnvio).toContain("El reporte llegará a 1 correo activo:");
    expect(bloqueEnvio).toContain("ana@cliente.co");
    expect(bloqueEnvio).not.toContain("luis@cliente.co");

    const sinActivos = pintar({ ...PANEL, destinatarios: [{ id: 2, correo: "luis@cliente.co", nombre: null, activo: false }] });
    const bloqueSinActivos = sinActivos.slice(sinActivos.indexOf('id="envio-ahora"'), sinActivos.indexOf('id="envio-historial"'));
    expect(bloqueSinActivos).toContain("No hay correos activos para el envío");

    const html = pintar({ ...PANEL, conexion: { estado: "sin_conexion", mensaje: "No hay una conexión de correo marcada para enviar el reporte para gerencia." } });
    expect(html).toContain("Ir a Conexiones");
    expect(html).toContain('href="/config/conexiones"');
    // Los dos botones de envío quedan deshabilitados.
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>(?:(?!<\/button>)[\s\S])*Enviar prueba/);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>(?:(?!<\/button>)[\s\S])*Enviar ahora a la lista/);
  });

  it("avisa cuando falta el disparador, cuando el envío está atrasado y cuando no hay destinatarios activos", () => {
    const html = pintar({
      ...PANEL,
      disparadorConfigurado: false,
      atrasado: true,
      destinatarios: [{ id: 2, correo: "luis@cliente.co", nombre: null, activo: false }],
    });
    expect(html).toContain("CRON_SECRET");
    expect(html).toContain("todavía no salió");
    expect(html).toContain("no hay destinatarios activos");
  });

  it("en pausa explica que no hay próximo envío; sin historial ni destinatarios invita a empezar", () => {
    const html = pintar({ ...PANEL, existe: false, activa: false, proximaEjecucionEn: null, destinatarios: [], ejecuciones: [] });
    expect(html).toContain("Sin próximo envío: está en pausa.");
    expect(html).toContain("Envío automático en pausa");
    expect(html).toContain("Aún no hay destinatarios");
    expect(html).toContain("Aún no hay envíos");
  });

  it("si el panel no se pudo cargar (falta la migración) la página sigue y el panel avisa", () => {
    const html = renderToStaticMarkup(
      createElement(EnvioAutomatico, { resultado: { ok: false, message: "El envío automático aún no está disponible en este entorno: falta aplicar la migración de notificaciones." } }),
    );
    expect(html).toContain("falta aplicar la migración de notificaciones");
    expect(html).not.toContain("Destinatarios");
  });
});
