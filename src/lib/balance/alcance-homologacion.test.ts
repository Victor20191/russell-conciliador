import { describe, expect, it } from "vitest";
import { parseAlcanceHomologacion, resolverAlcanceHomologacion } from "./alcance-homologacion";

const CONTEXTO = { detalleId: 41, encabezadoId: 7, cuenta6: "112005", cuenta8: "11200501" };

describe("alcance de la homologación manual", () => {
  it("rechaza una acción que no confirmó el alcance", () => {
    expect(parseAlcanceHomologacion(undefined)).toBeNull();
    expect(parseAlcanceHomologacion("todas")).toBeNull();
  });

  it("limita la opción individual al detalle seleccionado y la memoriza como excepción de esa cuenta", () => {
    const alcance = parseAlcanceHomologacion("solo");
    expect(alcance).toBe("solo");
    expect(resolverAlcanceHomologacion(alcance!, CONTEXTO)).toEqual({
      filtroDetalle: { id: 41 },
      memoriaCliente: { codigo: "11200501", origen: "manual_cuenta", propagaGrupo: false },
    });
  });

  it("conserva para la opción grupal el filtro histórico y la regla de grupo del cliente", () => {
    const alcance = parseAlcanceHomologacion("grupo");
    expect(alcance).toBe("grupo");
    expect(resolverAlcanceHomologacion(alcance!, CONTEXTO)).toEqual({
      filtroDetalle: { encabezadoId: 7, cuenta6: "112005" },
      memoriaCliente: { codigo: "112005", origen: "manual", propagaGrupo: true },
    });
  });
});
