import { describe, expect, it } from "vitest";
import {
  parseAlcanceEliminacionBalance,
  resolverAlcanceEliminacionBalance,
} from "./alcance-eliminacion";

const referencia = {
  id: 41,
  clienteId: 7,
  periodo: "Enero 2026",
};

describe("alcance de eliminación de balances", () => {
  it("rechaza un alcance que no fue confirmado", () => {
    expect(parseAlcanceEliminacionBalance(undefined)).toBeNull();
    expect(parseAlcanceEliminacionBalance("todos")).toBeNull();
  });

  it("limita la opción individual a la versión seleccionada", () => {
    const alcance = parseAlcanceEliminacionBalance("version");
    expect(
      resolverAlcanceEliminacionBalance(alcance!, referencia),
    ).toEqual({
      filtroBalance: { id: 41 },
      eliminaPerfiles: false,
    });
  });

  it("elimina todas las versiones del período sin tocar perfiles", () => {
    const alcance = parseAlcanceEliminacionBalance("periodo");
    expect(
      resolverAlcanceEliminacionBalance(alcance!, referencia),
    ).toEqual({
      filtroBalance: { clienteId: 7, periodo: "Enero 2026" },
      eliminaPerfiles: false,
    });
  });

  it("reserva los perfiles para la limpieza completa del cliente", () => {
    const alcance = parseAlcanceEliminacionBalance("cliente_perfiles");
    expect(
      resolverAlcanceEliminacionBalance(alcance!, referencia),
    ).toEqual({
      filtroBalance: { clienteId: 7 },
      eliminaPerfiles: true,
    });
  });
});
