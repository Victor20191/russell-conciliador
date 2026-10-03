import { describe, expect, it } from "vitest";
import {
  construirTicketsAtendidos,
  desgloseTicketsAtendidos,
  esEstadoAtendido,
  esTicketDelCliente,
  fechaDeAtencion,
  fraseSinRespuesta,
  solucionDelTicket,
  ubicacionDelTicket,
  vistaTicketsAtendidos,
  type EventoTicketReporte,
  type TicketCandidato,
} from "./tickets-atendidos";

const DESDE = "2026-10-01T00:00:00.000Z";
const HASTA = "2026-10-03T23:59:59.999Z";

const ev = (estadoAnterior: string | null, estadoNuevo: string, creadoEn: string): EventoTicketReporte => ({
  estadoAnterior,
  estadoNuevo,
  creadoEn,
});

const ticket = (p: Partial<TicketCandidato> = {}): TicketCandidato => ({
  codigo: "TKT-1",
  asunto: "No guarda el borrador",
  menuEtiqueta: "Cuentas por Pagar",
  rutaEtiqueta: "Módulos de conciliación",
  reportante: "Ana Pérez",
  correoCreador: "ana@russellbedford.com.co",
  estado: "cerrado",
  solucion: "Ya quedó corregido.",
  resueltoEn: null,
  eventos: [ev("en_proceso", "cerrado", "2026-10-02T15:00:00.000Z")],
  ultimoMensajeXentria: null,
  ...p,
});

const construir = (candidatos: TicketCandidato[], extra: { corte?: string } = {}) =>
  construirTicketsAtendidos({ candidatos, desde: DESDE, hasta: HASTA, ...extra });

describe("qué tickets entran", () => {
  it("incluye el que pasó a cerrado dentro del período, con la fecha de su evento", () => {
    const r = construir([ticket()]);
    expect(r.total).toBe(1);
    expect(r.tickets[0]).toMatchObject({
      codigo: "TKT-1",
      atendidoEn: "2026-10-02T15:00:00.000Z",
      estado: "cerrado",
    });
  });

  it("deja fuera lo atendido antes o después del período", () => {
    const antes = ticket({ codigo: "TKT-2", eventos: [ev("abierto", "resuelto", "2026-09-30T23:59:59.999Z")] });
    const despues = ticket({ codigo: "TKT-3", eventos: [ev("abierto", "resuelto", "2026-10-04T00:00:00.000Z")] });
    expect(construir([antes, despues]).total).toBe(0);
  });

  it("los extremos del período son inclusivos", () => {
    const enDesde = ticket({ codigo: "TKT-2", eventos: [ev("abierto", "resuelto", DESDE)], estado: "resuelto" });
    const enHasta = ticket({ codigo: "TKT-3", eventos: [ev("abierto", "resuelto", HASTA)], estado: "resuelto" });
    expect(construir([enDesde, enHasta]).tickets.map((t) => t.codigo)).toEqual(["TKT-2", "TKT-3"]);
  });

  it("el corte acota la ventana cuando el período llega hasta hoy", () => {
    const tarde = ticket({ eventos: [ev("abierto", "cerrado", "2026-10-03T20:00:00.000Z")] });
    expect(construir([tarde], { corte: "2026-10-03T12:00:00.000Z" }).total).toBe(0);
    expect(construir([tarde], { corte: "2026-10-03T21:00:00.000Z" }).total).toBe(1);
  });

  it("un ticket resuelto y luego cerrado en el mismo período cuenta UNA vez, con el estado actual", () => {
    const r = construir([
      ticket({
        estado: "cerrado",
        eventos: [
          ev("en_proceso", "resuelto", "2026-10-01T22:17:07.000Z"),
          ev("resuelto", "cerrado", "2026-10-01T22:17:32.000Z"),
        ],
      }),
    ]);
    expect(r.total).toBe(1);
    expect(r.tickets[0]).toMatchObject({ estado: "cerrado", atendidoEn: "2026-10-01T22:17:07.000Z" });
  });

  it("resuelto en un período anterior y cerrado en este NO se vuelve a contar", () => {
    const t = ticket({
      estado: "cerrado",
      eventos: [
        ev("en_proceso", "resuelto", "2026-09-20T15:00:00.000Z"),
        ev("resuelto", "cerrado", "2026-10-02T15:00:00.000Z"),
      ],
    });
    expect(construir([t]).total).toBe(0);
    // ...y sí aparece en el período en que se resolvió, ya como cerrado.
    const septiembre = construirTicketsAtendidos({
      candidatos: [t], desde: "2026-09-01T00:00:00.000Z", hasta: "2026-09-30T23:59:59.999Z",
    });
    expect(septiembre.tickets.map((x) => [x.codigo, x.estado])).toEqual([["TKT-1", "cerrado"]]);
  });

  it("un ticket reabierto y vuelto a resolver se atiende de nuevo en el período del segundo cierre", () => {
    const t = ticket({
      estado: "resuelto",
      eventos: [
        ev("abierto", "cerrado", "2026-09-10T15:00:00.000Z"),
        ev("cerrado", "en_proceso", "2026-09-25T15:00:00.000Z"),
        ev("en_proceso", "resuelto", "2026-10-02T15:00:00.000Z"),
      ],
    });
    expect(construir([t]).tickets[0]).toMatchObject({ estado: "resuelto", atendidoEn: "2026-10-02T15:00:00.000Z" });
  });

  it("un ticket que hoy está reabierto no está atendido, aunque se haya cerrado dentro del período", () => {
    const t = ticket({
      estado: "en_proceso",
      eventos: [
        ev("abierto", "cerrado", "2026-10-01T15:00:00.000Z"),
        ev("cerrado", "en_proceso", "2026-10-02T15:00:00.000Z"),
      ],
    });
    expect(construir([t]).total).toBe(0);
  });

  it("los estados pendientes nunca cuentan", () => {
    for (const estado of ["abierto", "en_evaluacion", "en_proceso"]) {
      expect(construir([ticket({ estado, resueltoEn: "2026-10-02T15:00:00.000Z", eventos: [] })]).total).toBe(0);
    }
  });
});

describe("tickets anteriores a la tabla de eventos", () => {
  it("sin eventos, la atención es resolvedAt", () => {
    const r = construir([ticket({ eventos: [], resueltoEn: "2026-10-02T15:00:00.000Z" })]);
    expect(r.tickets[0].atendidoEn).toBe("2026-10-02T15:00:00.000Z");
  });

  it("sin eventos y sin resolvedAt no hay fecha que inventar: queda fuera", () => {
    expect(construir([ticket({ eventos: [], resueltoEn: null })]).total).toBe(0);
  });

  it("resolvedAt fuera del período no lo trae", () => {
    expect(construir([ticket({ eventos: [], resueltoEn: "2026-08-25T02:00:00.000Z" })]).total).toBe(0);
  });

  it("con eventos pero ninguna entrada (se resolvió antes de que existieran) usa resolvedAt", () => {
    const t = ticket({
      eventos: [ev("resuelto", "cerrado", "2026-10-02T15:00:00.000Z")],
      resueltoEn: "2026-08-25T02:00:00.000Z",
    });
    // El cierre de hoy no es una atención nueva: se atendió el 25 de agosto.
    expect(construir([t]).total).toBe(0);
    expect(construirTicketsAtendidos({
      candidatos: [t], desde: "2026-08-01T00:00:00.000Z", hasta: "2026-08-31T23:59:59.999Z",
    }).total).toBe(1);
  });

  it("cuando hay entradas registradas, resolvedAt no manda", () => {
    const t = ticket({
      eventos: [ev("abierto", "cerrado", "2026-10-02T15:00:00.000Z")],
      resueltoEn: "2026-10-03T10:00:00.000Z",
    });
    expect(construir([t]).tickets[0].atendidoEn).toBe("2026-10-02T15:00:00.000Z");
  });

  it("ignora fechas ilegibles en vez de romper", () => {
    const t = ticket({ eventos: [ev("abierto", "cerrado", "no es fecha")], resueltoEn: "tampoco" });
    expect(construir([t]).total).toBe(0);
  });
});

describe("quién lo reportó", () => {
  it("excluye los creados por cuentas de Xentria", () => {
    const interno = ticket({ codigo: "TKT-2", correoCreador: "luisa@xentria.co" });
    expect(construir([interno, ticket()]).tickets.map((t) => t.codigo)).toEqual(["TKT-1"]);
  });

  it("no se deja engañar por dominios parecidos", () => {
    expect(esTicketDelCliente("falso@noxentria.co")).toBe(true);
    expect(esTicketDelCliente("xentria.co@gmail.com")).toBe(true);
    expect(esTicketDelCliente("ADMIN@XENTRIA.CO")).toBe(false);
  });

  it("un creador que ya no existe queda fuera: no se puede atribuir al cliente", () => {
    expect(esTicketDelCliente(null)).toBe(false);
    expect(esTicketDelCliente("  ")).toBe(false);
    expect(construir([ticket({ correoCreador: null })]).total).toBe(0);
  });

  it("cuentas de otros dominios del cliente cuentan igual", () => {
    expect(esTicketDelCliente("russell4@rbcol.co")).toBe(true);
    expect(esTicketDelCliente("alguien@gmail.com")).toBe(true);
  });
});

describe("la solución", () => {
  it("manda la respuesta oficial sobre cualquier mensaje", () => {
    const s = solucionDelTicket({ solucion: "Oficial", ultimoMensajeXentria: "Mensaje" }, "cerrado");
    expect(s).toEqual({ texto: "Oficial", origen: "oficial" });
  });

  it("sin respuesta oficial usa el último mensaje de Xentria", () => {
    const s = solucionDelTicket({ solucion: null, ultimoMensajeXentria: "Ya se corrigió.\r\n\r\nQueda solucionado" }, "cerrado");
    expect(s).toEqual({ texto: "Ya se corrigió.\n\nQueda solucionado", origen: "mensaje" });
  });

  it("una respuesta en blanco no cuenta como respuesta", () => {
    expect(solucionDelTicket({ solucion: "  \n ", ultimoMensajeXentria: "Mensaje" }, "cerrado").origen).toBe("mensaje");
  });

  it("sin nada lo dice, según el estado", () => {
    expect(solucionDelTicket({ solucion: null, ultimoMensajeXentria: null }, "cerrado")).toEqual({
      texto: "Cerrado sin respuesta documentada",
      origen: "ninguna",
    });
    expect(fraseSinRespuesta("resuelto")).toBe("Resuelto sin respuesta documentada");
  });

  it("queda en el ticket atendido con su procedencia", () => {
    const [t] = construir([ticket({ solucion: null, ultimoMensajeXentria: null })]).tickets;
    expect(t).toMatchObject({ solucion: "Cerrado sin respuesta documentada", origenSolucion: "ninguna" });
  });
});

describe("presentación de los datos", () => {
  it("ordena por fecha de atención y, a igual fecha, por código numérico", () => {
    const f = (codigo: string, iso: string) => ticket({ codigo, eventos: [ev("abierto", "cerrado", iso)] });
    const r = construir([
      f("TKT-56", "2026-10-02T15:00:00.000Z"),
      f("TKT-9", "2026-10-02T15:00:00.000Z"),
      f("TKT-70", "2026-10-01T15:00:00.000Z"),
    ]);
    expect(r.tickets.map((t) => t.codigo)).toEqual(["TKT-70", "TKT-9", "TKT-56"]);
  });

  it("el orden de entrada no cambia el resultado", () => {
    const a = ticket({ codigo: "TKT-1" });
    const b = ticket({ codigo: "TKT-2", eventos: [ev("abierto", "resuelto", "2026-10-01T10:00:00.000Z")], estado: "resuelto" });
    expect(construir([a, b])).toEqual(construir([b, a]));
  });

  it("cuenta cerrados y resueltos y desglosa con singular y plural", () => {
    const r = construir([
      ticket({ codigo: "TKT-1" }),
      ticket({ codigo: "TKT-2" }),
      ticket({ codigo: "TKT-3", estado: "resuelto", eventos: [ev("abierto", "resuelto", "2026-10-01T10:00:00.000Z")] }),
    ]);
    expect([r.total, r.cerrados, r.resueltos]).toEqual([3, 2, 1]);
    expect(desgloseTicketsAtendidos(r)).toBe("2 cerrados, 1 resuelto");
    expect(desgloseTicketsAtendidos({ cerrados: 1, resueltos: 0 })).toBe("1 cerrado");
    expect(desgloseTicketsAtendidos({ cerrados: 0, resueltos: 0 })).toBe("");
  });

  it("une módulo y pantalla como la bandeja de /reportes", () => {
    expect(ubicacionDelTicket("Módulos de conciliación", "Cuentas por Pagar")).toBe("Módulos de conciliación · Cuentas por Pagar");
    expect(ubicacionDelTicket("Balance", "Balance")).toBe("Balance");
    expect(ubicacionDelTicket(null, "Cartera")).toBe("Cartera");
    expect(ubicacionDelTicket("Balance", null)).toBe("Balance");
    expect(ubicacionDelTicket(null, null)).toBeNull();
    expect(ubicacionDelTicket("  ", "")).toBeNull();
  });

  it("guarda el período declarado, no el corte", () => {
    const r = construir([], { corte: "2026-10-03T12:00:00.000Z" });
    expect(r).toMatchObject({ desde: DESDE, hasta: HASTA, total: 0, tickets: [] });
  });

  it("la vista del tablero no arrastra el texto de las soluciones", () => {
    const v = vistaTicketsAtendidos(construir([ticket()]));
    expect(v?.tickets[0]).toEqual({
      codigo: "TKT-1",
      asunto: "No guarda el borrador",
      ubicacion: "Módulos de conciliación · Cuentas por Pagar",
      atendidoEn: "2026-10-02T15:00:00.000Z",
      estado: "cerrado",
    });
    expect(JSON.stringify(v)).not.toContain("Ya quedó corregido");
    expect(vistaTicketsAtendidos(null)).toBeNull();
  });
});

describe("piezas sueltas", () => {
  it("solo resuelto y cerrado son estados atendidos", () => {
    expect(esEstadoAtendido("resuelto")).toBe(true);
    expect(esEstadoAtendido("cerrado")).toBe(true);
    expect(esEstadoAtendido("en_proceso")).toBe(false);
    expect(esEstadoAtendido(null)).toBe(false);
  });

  it("fechaDeAtencion elige la primera entrada dentro de la ventana", () => {
    const ventana = { desde: Date.parse(DESDE), hasta: Date.parse(HASTA) };
    const t = {
      resueltoEn: null,
      eventos: [
        ev("abierto", "resuelto", "2026-09-01T10:00:00.000Z"),
        ev("resuelto", "en_proceso", "2026-09-02T10:00:00.000Z"),
        ev("en_proceso", "resuelto", "2026-10-01T10:00:00.000Z"),
        ev("resuelto", "en_proceso", "2026-10-02T10:00:00.000Z"),
        ev("en_proceso", "cerrado", "2026-10-03T10:00:00.000Z"),
      ],
    };
    expect(new Date(fechaDeAtencion(t, ventana)!).toISOString()).toBe("2026-10-01T10:00:00.000Z");
  });
});
