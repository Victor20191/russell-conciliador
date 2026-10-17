import { describe, expect, it } from "vitest";
import {
  ESTADO_CERRADO,
  ESTADO_EN_PROCESO,
  ESTADO_EN_PROCESO_CON_ALERTAS,
  estadoBalance,
  estadoEnProceso,
  tonoEstadoBalance,
} from "./estado-balance";

describe("estado de un balance cargado", () => {
  it("al confirmar queda en proceso, con alertas si la validación las encontró", () => {
    expect(estadoEnProceso(0)).toBe("En proceso");
    expect(estadoEnProceso(3)).toBe("En proceso con alertas");
  });

  it("cerrado manda sobre lo que diga la columna", () => {
    expect(estadoBalance({ estaCongelado: true, estado: "En proceso con alertas" })).toBe(ESTADO_CERRADO);
    expect(estadoBalance({ estaCongelado: true, estado: "Congelado" })).toBe(ESTADO_CERRADO);
  });

  it("traduce los rótulos de los cargues anteriores", () => {
    expect(estadoBalance({ estaCongelado: false, estado: "Única" })).toBe(ESTADO_EN_PROCESO);
    expect(estadoBalance({ estaCongelado: false, estado: "Última" })).toBe(ESTADO_EN_PROCESO);
    expect(estadoBalance({ estaCongelado: false, estado: "Con alertas" })).toBe(ESTADO_EN_PROCESO_CON_ALERTAS);
    // Abierto para corregir (antes «Descongelado»): vuelve a en proceso.
    expect(estadoBalance({ estaCongelado: false, estado: "Descongelado" })).toBe(ESTADO_EN_PROCESO);
    // Una bandera vieja de congelado ya bajada no deja el balance como cerrado.
    expect(estadoBalance({ estaCongelado: false, estado: "Congelado" })).toBe(ESTADO_EN_PROCESO);
    expect(estadoBalance({ estaCongelado: false, estado: null })).toBe(ESTADO_EN_PROCESO);
  });

  it("tono: azul cerrado, advertencia con alertas, neutro en proceso", () => {
    expect(tonoEstadoBalance(ESTADO_CERRADO)).toBe("blue");
    expect(tonoEstadoBalance(ESTADO_EN_PROCESO_CON_ALERTAS)).toBe("warn");
    expect(tonoEstadoBalance(ESTADO_EN_PROCESO)).toBe("ink");
  });
});
