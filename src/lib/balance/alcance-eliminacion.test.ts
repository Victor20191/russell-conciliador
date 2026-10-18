import { describe, expect, it } from "vitest";
import {
  bloqueosEliminacionBalance,
  motivoEliminacionCerrados,
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

  it("un balance cerrado se abre antes de eliminarlo, en cualquier alcance que lo incluya", () => {
    const cerrado = { id: 210, periodo: "Diciembre 2025", version: "v1" };
    const r = bloqueosEliminacionBalance({ balanceId: 210, idsPeriodo: [210, 211], cierresCliente: [], cerradosCliente: [cerrado] });
    expect(r.version).toBe("No se puede eliminar esta versión: el balance v1 de Diciembre 2025 está cerrado. Ábrelo primero con «Abrir balance».");
    expect(r.periodo).not.toBeNull();
    expect(r.cliente_perfiles).not.toBeNull();
    // Otra versión abierta del período sí se elimina sola.
    expect(bloqueosEliminacionBalance({ balanceId: 211, idsPeriodo: [210, 211], cierresCliente: [], cerradosCliente: [cerrado] }).version).toBeNull();
  });

  it("la conciliación en firme manda sobre el aviso de cerrado", () => {
    const r = bloqueosEliminacionBalance({ balanceId: 210, idsPeriodo: [210], cierresCliente: [cierre], cerradosCliente: [{ id: 210, periodo: "Diciembre 2025", version: "v1" }] });
    expect(r.version).toContain("cerró la conciliación");
  });
});

describe("motivoEliminacionCerrados", () => {
  it("null sin cerrados; plural con varios", () => {
    expect(motivoEliminacionCerrados("este período", [])).toBeNull();
    expect(motivoEliminacionCerrados("este período", [{ periodo: "Diciembre 2025", version: "v1" }, { periodo: "Diciembre 2025", version: "v2" }]))
      .toBe("No se puede eliminar este período: los balances v1 de Diciembre 2025, v2 de Diciembre 2025 están cerrados. Ábrelo primero con «Abrir balance».");
  });
});
