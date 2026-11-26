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
import { EnvioAutomatico, type AlcanceDelEnvio } from "./envio-automatico";
import type { PanelEnvioAutomatico } from "@/lib/notificaciones/panel";

// El período elegido arriba en la página y lo marcado «Omitir».
const ALCANCE: AlcanceDelEnvio = { desde: "2026-11-18", hasta: "2026-11-24", omitidos: [] };

const PANEL: PanelEnvioAutomatico = {
  existe: true,
  activa: true,
  diaSemana: 1,
  hora: "07:00",
  modoPeriodo: "continua",
  diasPeriodo: 7,
  incluirDiaEnvio: false,
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
  // Martes 24-nov-2026, 10:00 a. m. de Colombia.
  ahora: "2026-11-24T15:00:00.000Z",
};

const pintar = (panel: PanelEnvioAutomatico, alcance: AlcanceDelEnvio = ALCANCE) =>
  renderToStaticMarkup(createElement(EnvioAutomatico, { resultado: { ok: true, panel }, alcance }));

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

  it("deja elegir qué período cubre cada envío, con lo guardado marcado", () => {
    const continua = pintar(PANEL);
    expect(continua).toContain("Qué período cubre cada envío");
    expect(continua).toMatch(/<input[^>]*id="periodo-continua"[^>]*checked=""/);
    expect(continua).toContain("Desde el último reporte enviado");
    expect(continua).toMatch(/<input[^>]*aria-label="Días que cubre cada envío"[^>]*value="7"/);

    // Miércoles con los últimos 7 días: lo que pidió el usuario, con su explicación.
    const semana = pintar({
      ...PANEL,
      diaSemana: 3,
      modoPeriodo: "ultimos_dias",
      diasPeriodo: 7,
      periodoProximo: {
        estado: "nuevo", desde: "2026-11-25", hasta: "2026-12-01", origen: "ultimos_dias",
        ultimoDesde: "2026-11-18", ultimoHasta: "2026-11-24", recortado: false, desdeSinRecorte: "2026-11-25",
      },
    });
    expect(semana).toMatch(/<input[^>]*id="periodo-ultimos-dias"[^>]*checked=""/);
    expect(semana).toContain("Enviado el miércoles, cubre del miércoles anterior al martes: cada día se reporta una sola vez.");
    expect(semana).toContain("del 25/Nov/2026 al 01/Dic/2026");
    expect(semana).toContain("Los últimos 7 días antes del envío, sin contar ese día.");
  });

  it("deja contar el día del envío y advierte que ese día llega solo hasta la hora en que sale", () => {
    expect(pintar(PANEL)).toMatch(/<input[^>]*id="incluir-dia-envio"[^>]*>\s*Contar también el día del envío/);
    expect(pintar(PANEL)).not.toMatch(/<input[^>]*id="incluir-dia-envio"[^>]*checked=""/);

    const conDia = pintar({
      ...PANEL,
      diaSemana: 3,
      modoPeriodo: "ultimos_dias",
      diasPeriodo: 7,
      incluirDiaEnvio: true,
      periodoProximo: {
        estado: "nuevo", desde: "2026-11-26", hasta: "2026-12-02", origen: "ultimos_dias",
        ultimoDesde: "2026-11-18", ultimoHasta: "2026-11-24", recortado: false, desdeSinRecorte: "2026-11-26",
      },
    });
    expect(conDia).toMatch(/<input[^>]*id="incluir-dia-envio"[^>]*checked=""/);
    expect(conDia).toContain("días, contando el día del envío");
    expect(conDia).toContain("Enviado el miércoles, cubre del jueves anterior al miércoles (hasta la hora del envío).");
    expect(conDia).toContain("El día del envío entra solo con lo registrado hasta las 07:00 (hora de Colombia)");
    expect(conDia).toContain("no sale en ningún reporte");
    expect(conDia).toContain("del 26/Nov/2026 al 02/Dic/2026");
    expect(conDia).toContain("Los últimos 7 días, contando el día del envío hasta la hora en que sale.");
  });

  it("desde que carga, junto a cada opción dice qué cubriría el próximo envío", () => {
    // En pausa, miércoles 7:00; jueves 26-nov 9:00 a. m.; el último reporte enviado llegó al jueves 26.
    const html = pintar({
      ...PANEL,
      activa: false,
      proximaEjecucionEn: null,
      periodoProximo: null,
      diaSemana: 3,
      modoPeriodo: "ultimos_dias",
      diasPeriodo: 7,
      periodoManualSugerido: { ...PANEL.periodoManualSugerido, ultimoDesde: "2026-11-25", ultimoHasta: "2026-11-26", hoy: "2026-11-26" },
      ahora: "2026-11-26T14:00:00.000Z",
    });
    const ultimos = html.slice(html.indexOf('id="periodo-ultimos-dias"'), html.indexOf('id="periodo-continua"'));
    const continua = html.slice(html.indexOf('id="periodo-continua"'), html.indexOf('id="incluir-dia-envio"'));
    // Los últimos 7 días: la semana completa, del miércoles 25 al martes 1.
    expect(ultimos).toContain("Próximo envío (miércoles 02/Dic/2026, si lo activas)");
    expect(ultimos).toContain("del 25/Nov/2026 al 01/Dic/2026");
    // Desde el último reporte enviado: arranca el viernes 27.
    expect(continua).toContain("Próximo envío (miércoles 02/Dic/2026, si lo activas)");
    expect(continua).toContain("del 27/Nov/2026 al 01/Dic/2026");

    // Activo, con su próxima fecha guardada: sin «si lo activas».
    const activo = pintar({ ...PANEL, diaSemana: 1 });
    expect(activo).toContain("Próximo envío (lunes 30/Nov/2026)");
    expect(activo).not.toContain("si lo activas");
  });

  it("con otro número de días avisa qué pasa con el envío semanal", () => {
    const cinco = pintar({ ...PANEL, diaSemana: 3, modoPeriodo: "ultimos_dias", diasPeriodo: 5 });
    expect(cinco).toContain("Enviado el miércoles, cubre los 5 días que terminan el martes.");
    expect(cinco).toContain("2 días de cada semana no salen en ningún reporte");
    const diez = pintar({ ...PANEL, diaSemana: 1, modoPeriodo: "ultimos_dias", diasPeriodo: 10 });
    expect(diez).toContain("Enviado el lunes, cubre los 10 días que terminan el domingo.");
    expect(diez).toContain("3 días se repiten en el envío siguiente");
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

  it("la prueba y el envío a la lista van en recuadros separados, cada uno con sus correos", () => {
    const html = pintar(PANEL);
    const prueba = html.slice(html.indexOf('id="envio-prueba"'), html.indexOf('id="envio-lista"'));
    const lista = html.slice(html.indexOf('id="envio-lista"'), html.indexOf('id="envio-historial"'));
    // Arriba la prueba: solo el correo escrito, sin la lista de destinatarios.
    expect(html.indexOf('id="envio-prueba"')).toBeLessThan(html.indexOf('id="envio-lista"'));
    expect(prueba).toContain('id="correo-prueba"');
    expect(prueba).toContain("Enviar prueba");
    expect(prueba).toContain("No va a la lista");
    expect(prueba).not.toContain("ana@cliente.co");
    expect(prueba).not.toContain("Enviar ahora a la lista");
    // Abajo la lista: los correos activos junto a su botón.
    expect(lista).toContain("El reporte llegará a 1 correo activo:");
    expect(lista).toContain("ana@cliente.co");
    expect(lista).toContain("Enviar ahora a la lista");
    expect(lista).not.toContain('id="correo-prueba"');
  });

  it("la prueba y el envío a la lista dicen el período de la página y lo que queda fuera, sin pedir fechas", () => {
    const html = pintar(PANEL);
    const bloqueEnvio = html.slice(html.indexOf('id="envio-ahora"'), html.indexOf('id="envio-historial"'));
    expect(bloqueEnvio).toContain("llevan el período elegido arriba (");
    expect(bloqueEnvio).toContain("18/Nov/2026 al 24/Nov/2026");
    expect(bloqueEnvio).toContain("y todas sus novedades");
    expect(bloqueEnvio).not.toContain('type="date"');

    const conOmitidas = pintar(PANEL, {
      ...ALCANCE,
      omitidos: [
        { id: 31, titulo: "RST: cruce contable", version: "3.9.0" },
        { id: 32, titulo: "Calendario tributario", version: "3.9.0" },
      ],
    });
    expect(conOmitidas).toContain("dejan fuera las 2 novedades marcadas «Omitir»");
  });

  it("un período de la página que termina después de hoy no se puede enviar", () => {
    // Hoy (en el panel) es el 24/Nov/2026.
    const html = pintar(PANEL, { ...ALCANCE, hasta: "2026-11-30" });
    expect(html).toContain("El período elegido arriba termina después de hoy");
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
      createElement(EnvioAutomatico, {
        resultado: { ok: false, message: "El envío automático aún no está disponible en este entorno: falta aplicar la migración de notificaciones." },
        alcance: ALCANCE,
      }),
    );
    expect(html).toContain("falta aplicar la migración de notificaciones");
    expect(html).not.toContain("Destinatarios");
  });
});
