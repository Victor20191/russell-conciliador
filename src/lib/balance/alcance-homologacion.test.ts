import { describe, expect, it } from "vitest";
import { parseAlcanceHomologacion, resolverAlcanceHomologacion } from "./alcance-homologacion";

describe("alcance de la homologación manual", () => {
  it("rechaza una acción que no confirmó el alcance", () => {
    expect(parseAlcanceHomologacion(undefined)).toBeNull();
    expect(parseAlcanceHomologacion("todas")).toBeNull();
  });

  it("limita la opción individual al detalle seleccionado y no memoriza el perfil", () => {
    const alcance = parseAlcanceHomologacion("solo");
    expect(alcance).toBe("solo");
    expect(resolverAlcanceHomologacion(alcance!, { detalleId: 41, encabezadoId: 7, cuenta6: "112005" })).toEqual({
      filtroDetalle: { id: 41 },
      memorizaPerfil: false,
    });
  });

  it("conserva para la opción grupal el filtro histórico y la memoria del cliente", () => {
    const alcance = parseAlcanceHomologacion("grupo");
    expect(alcance).toBe("grupo");
    expect(resolverAlcanceHomologacion(alcance!, { detalleId: 41, encabezadoId: 7, cuenta6: "112005" })).toEqual({
      filtroDetalle: { encabezadoId: 7, cuenta6: "112005" },
      memorizaPerfil: true,
    });
  });
});
