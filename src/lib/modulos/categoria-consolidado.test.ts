import { describe, expect, it } from "vitest";
import { categoriaRenglon, contarCategorias, CATEGORIAS_CONSOLIDADO, ETIQUETA_CATEGORIA } from "./categoria-consolidado";

describe("tipo de renglón del Consolidado («Mostrar»)", () => {
  it("control y fuera del módulo salen del destino de la sugerencia y ganan a lo guardado", () => {
    expect(categoriaRenglon({ guardadas: [], visibles: [], destino: "control" })).toBe("control");
    expect(categoriaRenglon({ guardadas: ["510506"], visibles: ["510506"], destino: "control" })).toBe("control");
    expect(categoriaRenglon({ guardadas: [], visibles: [], destino: "fuera" })).toBe("fuera");
  });

  it("cruza («Cuentas del módulo») con cuentas guardadas o resuelta por la cuenta del archivo", () => {
    expect(categoriaRenglon({ guardadas: ["510506"], visibles: ["510506"], destino: "gasto" })).toBe("modulo");
    expect(categoriaRenglon({ guardadas: [], visibles: ["510506"], resueltaPorArchivo: true, destino: "gasto" })).toBe("modulo");
    // Quitarle en pantalla las cuentas a un renglón guardado no lo saca de «módulo» hasta guardar.
    expect(categoriaRenglon({ guardadas: ["510506"], visibles: [], destino: "gasto" })).toBe("modulo");
  });

  it("una cuenta que se ve pero no está guardada es propuesta; sin ninguna, sin cuenta", () => {
    expect(categoriaRenglon({ guardadas: [], visibles: ["510506"], destino: "gasto" })).toBe("propuesta");
    expect(categoriaRenglon({ guardadas: [], visibles: [], destino: "gasto" })).toBe("sin_cuenta");
    expect(categoriaRenglon({ guardadas: [], visibles: [], destino: null })).toBe("sin_cuenta");
  });

  it("los módulos sin sugerencia (Inventarios) solo tienen módulo, propuesta o sin cuenta", () => {
    expect(categoriaRenglon({ guardadas: ["1435"], visibles: ["1435"] })).toBe("modulo");
    expect(categoriaRenglon({ guardadas: [], visibles: ["1435"] })).toBe("propuesta");
    expect(categoriaRenglon({ guardadas: [], visibles: [] })).toBe("sin_cuenta");
  });

  it("contarCategorias cuenta todos los tipos, también los que quedan en cero", () => {
    expect(contarCategorias(["modulo", "modulo", "control", "sin_cuenta"])).toEqual({ modulo: 2, propuesta: 0, sin_cuenta: 1, control: 1, fuera: 0 });
    expect(CATEGORIAS_CONSOLIDADO.every((c) => ETIQUETA_CATEGORIA[c])).toBe(true);
  });
});
