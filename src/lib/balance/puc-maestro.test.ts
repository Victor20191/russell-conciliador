import { describe, expect, it } from "vitest";
import PUC_MAESTRO from "../../../prisma/data/puc-maestro-russell.json";

// Algunas herramientas de base de datos muestran un valor largo guardado fuera de
// línea como «<TOAST:23152>» en vez de su contenido. El PUC maestro se regeneró
// una vez desde una exportación así (30/Sep/2026) y esos marcadores llegaron a
// «Qué incluye» y a las notas de mapeo de /config/mapeo.
describe("PUC maestro Russell", () => {
  it("no trae marcadores TOAST en lugar del texto", () => {
    const marcadores = PUC_MAESTRO.accounts.flatMap((cuenta) =>
      Object.entries(cuenta)
        .filter(([, valor]) => typeof valor === "string" && /<TOAST:\d+>/.test(valor))
        .map(([campo, valor]) => `${cuenta.code}.${campo} = ${valor}`),
    );
    expect(marcadores).toEqual([]);
  });
});
