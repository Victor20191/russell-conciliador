import { describe, expect, test } from "vitest";
import {
  ADJUNTOS_MAX,
  crearCodigoTicket,
  crearUrlSeguimiento,
  esCodigoSeguimientoTicket,
  esCodigoTicketActual,
  esEstadoTicket,
  etiquetaEstadoTicket,
  huellaTokenAcceso,
  keyAdjuntoTicket,
  nombreReportanteDesdeSesion,
  requiereSolucion,
  tonoEstadoTicket,
  urlAdjuntoTicket,
} from "./soporte";

describe("credenciales publicas de tickets", () => {
  test("el codigo es el consecutivo corto que entrega la secuencia", () => {
    expect(crearCodigoTicket(1)).toBe("TKT-1");
    expect(crearCodigoTicket(62)).toBe("TKT-62");
    expect(() => crearCodigoTicket(0)).toThrow();
    expect(() => crearCodigoTicket(1.5)).toThrow();
  });

  test("la huella no persiste el token publico en texto plano", () => {
    const token = "un-token-de-acceso-suficientemente-largo";
    const huella = huellaTokenAcceso(token);
    expect(huella).toMatch(/^[a-f0-9]{64}$/);
    expect(huella).not.toContain(token);
  });

  test("la URL codifica codigo y token", () => {
    expect(crearUrlSeguimiento("TKT 1", "abc/123")).toBe("/soporte/tickets/TKT%201?acceso=abc%2F123");
  });

  test("acepta códigos actuales y enlaces históricos sin relajar otros formatos", () => {
    expect(esCodigoTicketActual("TKT-62")).toBe(true);
    expect(esCodigoTicketActual("TKT-20260807-A1B2C3D4")).toBe(false);
    expect(esCodigoSeguimientoTicket("TKT-62")).toBe(true);
    expect(esCodigoSeguimientoTicket("TKT-20260807-A1B2C3D4")).toBe(true);
    expect(esCodigoSeguimientoTicket("TKT-20260807-a1b2c3d4")).toBe(false);
    expect(esCodigoSeguimientoTicket("TKT-cualquier-cosa")).toBe(false);
  });
});

describe("estados y reportante de una novedad interna", () => {
  test("reconoce los estados operativos", () => {
    expect(esEstadoTicket("abierto")).toBe(true);
    expect(esEstadoTicket("en_evaluacion")).toBe(true);
    expect(esEstadoTicket("en_proceso")).toBe(true);
    expect(esEstadoTicket("resuelto")).toBe(true);
    expect(esEstadoTicket("cerrado")).toBe(true);
    expect(esEstadoTicket("pendiente")).toBe(false);
  });

  test("solo el estado resuelto exige documentar la solución", () => {
    expect(requiereSolucion("resuelto")).toBe(true);
    expect(requiereSolucion("abierto")).toBe(false);
    expect(requiereSolucion("en_proceso")).toBe(false);
    expect(requiereSolucion("en_evaluacion")).toBe(false);
    expect(requiereSolucion("cerrado")).toBe(false);
  });

  test("etiqueta y tono son estables para la UI", () => {
    expect(etiquetaEstadoTicket("en_proceso")).toBe("En proceso");
    expect(etiquetaEstadoTicket("en_evaluacion")).toBe("En evaluación");
    expect(tonoEstadoTicket("resuelto")).toBe("ok");
    expect(tonoEstadoTicket("en_proceso")).toBe("blue");
    expect(tonoEstadoTicket("cerrado")).toBe("ink");
    expect(tonoEstadoTicket("abierto")).toBe("warn");
    expect(tonoEstadoTicket("en_evaluacion")).toBe("ai");
  });

  test("parte el nombre de la sesión sin pedir nombre y apellido", () => {
    expect(nombreReportanteDesdeSesion("  Ana Pérez Gómez ")).toEqual({
      firstName: "Ana",
      lastName: "Pérez Gómez",
    });
    expect(nombreReportanteDesdeSesion("Staff")).toEqual({
      firstName: "Staff",
      lastName: "plataforma",
    });
    expect(nombreReportanteDesdeSesion("   ")).toEqual({
      firstName: "Usuario",
      lastName: "plataforma",
    });
  });

  test("la clave del adjunto queda namespaced por ticket y sin caracteres libres", () => {
    expect(keyAdjuntoTicket(14, "a1b2c3d4", "png")).toBe("tickets/14/a1b2c3d4.png");
    expect(() => keyAdjuntoTicket(14, "../x", "jpg")).toThrow();
    expect(urlAdjuntoTicket(9)).toBe("/api/soporte/adjuntos/9");
    expect(ADJUNTOS_MAX).toBe(5);
  });
});
