import { describe, expect, it } from "vitest";
import {
  bloqueosEliminacionBalance,
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

describe("bloqueosEliminacionBalance", () => {
  const cierre = { moduloCodigo: "NOM", periodo: "2025-12", cerradoPor: "Camila", balanceEncabezadoId: 210 };

  it("sin conciliaciones en firme se puede eliminar todo", () => {
    expect(bloqueosEliminacionBalance({ balanceId: 210, idsPeriodo: [210, 211], cierresCliente: [] })).toEqual({ version: null, periodo: null, cliente_perfiles: null });
  });

  it("el balance conciliado no se elimina en ningún alcance; otra versión del período sí, sola", () => {
    const conciliado = bloqueosEliminacionBalance({ balanceId: 210, idsPeriodo: [210, 211], cierresCliente: [cierre] });
    expect(conciliado.version).toContain("NOM · 2025-12 (cerró Camila)");
    expect(conciliado.periodo).not.toBeNull();
    expect(conciliado.cliente_perfiles).not.toBeNull();
    const otraVersion = bloqueosEliminacionBalance({ balanceId: 211, idsPeriodo: [210, 211], cierresCliente: [cierre] });
    expect(otraVersion.version).toBeNull();
    expect(otraVersion.periodo).not.toBeNull();
  });
});
