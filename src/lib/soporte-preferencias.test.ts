import { describe, expect, it } from "vitest";
import { ESTADOS_TICKET } from "./soporte-estados";
import { resolverEstadosOcultosTickets } from "./soporte-preferencias";

describe("preferencias personales de Ayuda", () => {
  it("oculta resuelto y cerrado cuando todavía no hay preferencia", () => {
    expect(resolverEstadosOcultosTickets(null)).toEqual(["resuelto", "cerrado"]);
    expect(resolverEstadosOcultosTickets()).toEqual(["resuelto", "cerrado"]);
  });

  it("distingue la elección de no ocultar ninguno de la ausencia de preferencia", () => {
    expect(resolverEstadosOcultosTickets([])).toEqual([]);
    expect(resolverEstadosOcultosTickets(ESTADOS_TICKET)).toEqual(ESTADOS_TICKET);
  });

  it("normaliza el orden, elimina duplicados y no modifica la entrada", () => {
    const seleccion = ["cerrado", "abierto", "cerrado", "estado_desconocido"];
    expect(resolverEstadosOcultosTickets(seleccion)).toEqual(["abierto", "cerrado"]);
    expect(seleccion).toEqual(["cerrado", "abierto", "cerrado", "estado_desconocido"]);
  });
});
