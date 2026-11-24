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
    expect(html).toContain("En pausa");
    expect(html).toContain("2 de 50");
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

  it("ofrece prueba y envío a la lista, y no deja enviar si no hay conexión de correo (con enlace a Conexiones)", () => {
    const listo = pintar(PANEL);
    expect(listo).toContain("Enviar prueba a mi correo");
    expect(listo).toContain("Enviar ahora a la lista");
    expect(listo).toContain("victor@russell.co");

    const html = pintar({ ...PANEL, conexion: { estado: "sin_conexion", mensaje: "No hay una conexión de correo marcada para enviar las notificaciones de Russell." } });
    expect(html).toContain("Ir a Conexiones");
    expect(html).toContain('href="/config/conexiones"');
    // Los dos botones de envío quedan deshabilitados.
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>(?:(?!<\/button>)[\s\S])*Enviar prueba a mi correo/);
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
