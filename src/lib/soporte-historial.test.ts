import { describe, expect, it } from "vitest";
import {
  construirHistorialTicket,
  esLadoTicket,
  ladoParaEscribir,
  type TicketHistorialEntrada,
} from "./soporte-historial";

function ticket(extra: Partial<TicketHistorialEntrada> = {}): TicketHistorialEntrada {
  return {
    reportante: "Luisa Martinez",
    descripcion: "El balance no cuadra por terceros.",
    createdAt: "2026-08-26T15:00:00.000Z",
    status: "abierto",
    solution: null,
    resolvedByName: null,
    resolvedAt: null,
    mensajes: [],
    eventos: [],
    ...extra,
  };
}

describe("construirHistorialTicket", () => {
  it("abre siempre con el reporte original y sus imágenes", () => {
    const historial = construirHistorialTicket(
      ticket({ adjuntos: [{ id: 3, fileName: "captura.png" }] }),
    );

    expect(historial).toHaveLength(1);
    expect(historial[0]).toEqual({
      clave: "apertura",
      tipo: "apertura",
      lado: "reportante",
      autor: "Luisa Martinez",
      contenido: "El balance no cuadra por terceros.",
      fecha: "2026-08-26T15:00:00.000Z",
      adjuntos: [{ id: 3, fileName: "captura.png" }],
    });
  });

  it("intercala los mensajes de los dos lados en orden cronológico", () => {
    const historial = construirHistorialTicket(
      ticket({
        mensajes: [
          {
            id: 2,
            autor: "Luisa Martinez",
            lado: "reportante",
            contenido: "Ya lo probé, gracias.",
            createdAt: "2026-08-26T17:00:00.000Z",
          },
          {
            id: 1,
            autor: "Técnica Soporte",
            lado: "xentria",
            contenido: "Lo estamos revisando.",
            createdAt: "2026-08-26T16:00:00.000Z",
          },
        ],
      }),
    );

    expect(historial.map((e) => e.clave)).toEqual(["apertura", "mensaje-1", "mensaje-2"]);
    expect(historial[1]).toMatchObject({ tipo: "mensaje", lado: "xentria" });
    expect(historial[2]).toMatchObject({ tipo: "mensaje", lado: "reportante" });
  });

  it("pone la respuesta oficial ANTES del hito que la explica cuando comparten instante", () => {
    // `guardarSolucionTicket` escribe la respuesta y mueve el estado a
    // «Resuelto» en la misma transacción: sin el desempate por tipo, el hito
    // podía quedar arriba de la respuesta.
    const instante = "2026-08-26T18:00:00.000Z";
    const historial = construirHistorialTicket(
      ticket({
        status: "resuelto",
        solution: "Se corrigió el mapeo de la cuenta.",
        resolvedByName: "Técnica Soporte",
        resolvedAt: instante,
        eventos: [
          {
            id: 5,
            autor: "Técnica Soporte",
            estadoAnterior: "en_proceso",
            estadoNuevo: "resuelto",
            createdAt: instante,
          },
        ],
      }),
    );

    expect(historial.map((e) => e.tipo)).toEqual(["apertura", "respuesta", "estado"]);
    expect(historial[2]).toMatchObject({ etiqueta: "Resuelto", estadoAnterior: "en_proceso" });
  });

  it("manda al final la respuesta guardada sin sello de resolución, en vez de perderla", () => {
    const historial = construirHistorialTicket(
      ticket({
        solution: "Quedó pendiente de validar con el cliente.",
        resolvedAt: null,
        mensajes: [
          {
            id: 1,
            autor: "Técnica Soporte",
            lado: "xentria",
            contenido: "Vamos a revisarlo.",
            createdAt: "2026-08-26T16:00:00.000Z",
          },
        ],
      }),
    );

    expect(historial.map((e) => e.tipo)).toEqual(["apertura", "mensaje", "respuesta"]);
    expect(historial[2]).toMatchObject({ autor: "Xentria", fecha: null });
  });

  it("reconstruye el cierre de un ticket anterior a la tabla de eventos", () => {
    const historial = construirHistorialTicket(
      ticket({
        status: "cerrado",
        solution: "Se resolvió en la versión 1.10.",
        resolvedByName: "Técnica Soporte",
        resolvedAt: "2026-08-26T18:00:00.000Z",
        eventos: [],
      }),
    );

    const hito = historial.find((e) => e.tipo === "estado");
    expect(hito).toMatchObject({
      clave: "estado-derivado",
      etiqueta: "Cerrado",
      estadoAnterior: null,
      autor: "Técnica Soporte",
    });
  });

  it("no reconstruye nada cuando el ticket ya tiene eventos propios", () => {
    const historial = construirHistorialTicket(
      ticket({
        status: "cerrado",
        resolvedAt: "2026-08-26T18:00:00.000Z",
        eventos: [
          {
            id: 7,
            autor: "Técnica Soporte",
            estadoAnterior: "resuelto",
            estadoNuevo: "cerrado",
            createdAt: "2026-08-26T19:00:00.000Z",
          },
        ],
      }),
    );

    expect(historial.filter((e) => e.tipo === "estado")).toHaveLength(1);
    expect(historial.at(-1)).toMatchObject({ clave: "estado-7" });
  });

  it("tampoco reconstruye el cierre si no se sabe cuándo ocurrió", () => {
    const historial = construirHistorialTicket(ticket({ status: "cerrado", resolvedAt: null }));

    expect(historial.some((e) => e.tipo === "estado")).toBe(false);
  });

  it("no deja que una fecha ilegible se cuele al principio del hilo", () => {
    const historial = construirHistorialTicket(
      ticket({
        mensajes: [
          {
            id: 1,
            autor: "Técnica Soporte",
            lado: "xentria",
            contenido: "Mensaje con fecha rota.",
            createdAt: "no-es-una-fecha",
          },
          {
            id: 2,
            autor: "Luisa Martinez",
            lado: "reportante",
            contenido: "Mensaje normal.",
            createdAt: "2026-08-26T16:00:00.000Z",
          },
        ],
      }),
    );

    expect(historial.map((e) => e.clave)).toEqual(["apertura", "mensaje-2", "mensaje-1"]);
  });
});

describe("ladoParaEscribir", () => {
  it("Xentria escribe en cualquier ticket", () => {
    expect(ladoParaEscribir({ administra: true, usuarioId: 9, creadoPorId: 44 })).toBe("xentria");
  });

  it("quien reportó escribe en el suyo", () => {
    expect(ladoParaEscribir({ administra: false, usuarioId: 44, creadoPorId: 44 })).toBe("reportante");
  });

  it("un tercero con permiso de lectura NO escribe", () => {
    expect(ladoParaEscribir({ administra: false, usuarioId: 12, creadoPorId: 44 })).toBeNull();
  });

  it("el permiso manda sobre la identidad: Xentria en su propio ticket sigue siendo Xentria", () => {
    expect(ladoParaEscribir({ administra: true, usuarioId: 9, creadoPorId: 9 })).toBe("xentria");
  });

  it("un ticket público (sin autor en la plataforma) no habilita a nadie por identidad", () => {
    expect(ladoParaEscribir({ administra: false, usuarioId: 44, creadoPorId: null })).toBeNull();
    // Sin sesión tampoco, aunque el ticket sí tenga autor.
    expect(ladoParaEscribir({ administra: false, usuarioId: null, creadoPorId: 44 })).toBeNull();
  });
});

describe("esLadoTicket", () => {
  it("acepta solo los dos lados del hilo", () => {
    expect(esLadoTicket("reportante")).toBe(true);
    expect(esLadoTicket("xentria")).toBe(true);
    expect(esLadoTicket("sistema")).toBe(false);
  });
});
