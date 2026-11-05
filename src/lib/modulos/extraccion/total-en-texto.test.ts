import { describe, expect, it } from "vitest";
import { filaDeTotalEnTexto, totalEnTexto } from "./total-en-texto";

describe("total escrito junto a su rótulo", () => {
  it("separa el rótulo del importe, en formato inglés o colombiano", () => {
    expect(totalEnTexto("Valor stock : 6,042,080,922.47                    ")).toEqual({ rotulo: "Valor stock", importe: 6042080922.47 });
    expect(totalEnTexto("Total general: $ 1.234.567,89")).toEqual({ rotulo: "Total general", importe: 1234567.89 });
    expect(totalEnTexto("Total: (300)")).toEqual({ rotulo: "Total", importe: -300 });
  });

  it("no confunde con un importe otro texto que lleve dos puntos", () => {
    for (const texto of ["Valor stock", "Elaborado por: Juan Pérez", "Hora: 10:30", "Ref: ABC-12", ": 300", "2026: 300", "Fecha: 30/09/2026"]) {
      expect(totalEnTexto(texto)).toBeNull();
    }
    expect(totalEnTexto(300)).toBeNull();
  });

  it("solo cuenta la fila que no trae nada más que esa celda", () => {
    expect(filaDeTotalEnTexto(["Valor stock : 6,042,080,922.47"])).toEqual({ columna: 1, rotulo: "Valor stock", importe: 6042080922.47 });
    expect(filaDeTotalEnTexto([null, "  ", "Total: 50", ""])).toEqual({ columna: 3, rotulo: "Total", importe: 50 });
    expect(filaDeTotalEnTexto(["Total: 50", "Producto A"])).toBeNull();
    expect(filaDeTotalEnTexto(["Total: 50", 0])).toBeNull();
    expect(filaDeTotalEnTexto([])).toBeNull();
  });
});
