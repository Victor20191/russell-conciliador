import { describe, expect, it, vi } from "vitest";
import {
  calcularImpactoHomologacionCliente,
  filtroDetallePorAlcanceCliente,
  migrarHomologacionClienteEnTransaccion,
  normalizarAlcanceHomologacionCliente,
  type ClienteDB,
} from "./homologacion-cliente-servidor";

describe("normalizarAlcanceHomologacionCliente", () => {
  it("acepta grupo con una cuenta de 8 dígitos y deriva el prefijo de 6", () => {
    const r = normalizarAlcanceHomologacionCliente("11050501", "grupo");
    expect(r).toMatchObject({ ok: true, alcance: "grupo", codigoMemoria: "110505", propagaGrupo: true, origen: "manual" });
  });

  it("rechaza grupo con menos de 6 dígitos", () => {
    const r = normalizarAlcanceHomologacionCliente("1105", "grupo");
    expect(r).toEqual({ ok: false, message: expect.stringContaining("al menos 6 dígitos") });
  });

  it("normaliza «solo» sobre una cuenta EXACTA de 6 dígitos a grupo (son la misma cuenta)", () => {
    const r = normalizarAlcanceHomologacionCliente("110505", "solo");
    expect(r).toMatchObject({ ok: true, alcance: "grupo", codigoMemoria: "110505", propagaGrupo: true });
  });

  it("mantiene «solo» como excepción de cuenta exacta para códigos largos (10/14 dígitos)", () => {
    const r10 = normalizarAlcanceHomologacionCliente("1105050001", "solo");
    expect(r10).toMatchObject({ ok: true, alcance: "solo", codigoMemoria: "1105050001", propagaGrupo: false, origen: "manual_cuenta" });

    const r14 = normalizarAlcanceHomologacionCliente("11050500010001", "solo");
    expect(r14).toMatchObject({ ok: true, alcance: "solo", codigoMemoria: "11050500010001", propagaGrupo: false, origen: "manual_cuenta" });
  });

  it("acepta «solo» con 4 dígitos (excepción, no requiere prefijo de grupo)", () => {
    const r = normalizarAlcanceHomologacionCliente("1105", "solo");
    expect(r).toMatchObject({ ok: true, alcance: "solo", codigoMemoria: "1105", propagaGrupo: false });
  });
});

describe("filtroDetallePorAlcanceCliente", () => {
  it("grupo filtra por cuenta6 (prefijo, alcanza descendientes)", () => {
    expect(filtroDetallePorAlcanceCliente("grupo", "110505", "11050501")).toEqual({ cuenta6: "110505" });
  });

  it("solo filtra por cuenta8 exacta (no alcanza hermanas/descendientes)", () => {
    expect(filtroDetallePorAlcanceCliente("solo", "1105050001", "1105050001")).toEqual({ cuenta8: "1105050001" });
  });
});

describe("migrarHomologacionClienteEnTransaccion", () => {
  it("sin encabezados afectados, no consulta ni escribe nada", async () => {
    const tx = {
      balancePruebaDetalle: { updateMany: vi.fn(), groupBy: vi.fn() },
      balanceTerceroEncabezado: { findMany: vi.fn() },
      balanceTerceroDetalle: { updateMany: vi.fn() },
      balancePruebaEncabezado: { update: vi.fn() },
    } as unknown as ClienteDB;

    const resultado = await migrarHomologacionClienteEnTransaccion(tx, {
      codigo: "110505",
      alcance: "solo",
      codigoMemoria: "11050501",
      cuentaCliente: "11050501",
      encabezados: [],
    });

    expect(resultado).toEqual({ filasActualizadas: 0, filasTerceroActualizadas: 0, encabezadosActualizados: 0 });
    expect(tx.balancePruebaDetalle.updateMany).not.toHaveBeenCalled();
    expect(tx.balanceTerceroEncabezado.findMany).not.toHaveBeenCalled();
  });

  it("no consulta terceros cuando ningún encabezado tiene loteId", async () => {
    const tx = {
      balancePruebaDetalle: {
        updateMany: vi.fn(async () => ({ count: 2 })),
        groupBy: vi.fn(async () => []),
      },
      balanceTerceroEncabezado: { findMany: vi.fn() },
      balanceTerceroDetalle: { updateMany: vi.fn() },
      balancePruebaEncabezado: { update: vi.fn(async () => ({})) },
    } as unknown as ClienteDB;

    const resultado = await migrarHomologacionClienteEnTransaccion(tx, {
      codigo: "110505",
      alcance: "grupo",
      codigoMemoria: "110505",
      cuentaCliente: "110505",
      encabezados: [{ id: 1, periodo: "Enero 2026", loteId: null }],
    });

    expect(resultado.filasActualizadas).toBe(2);
    expect(resultado.filasTerceroActualizadas).toBe(0);
    expect(tx.balanceTerceroEncabezado.findMany).not.toHaveBeenCalled();
  });

  it("deja completitud en 100 cuando el encabezado no tiene filas (evita división por cero)", async () => {
    const actualizaciones: Array<{ where: { id: number }; data: Record<string, unknown> }> = [];
    const tx = {
      balancePruebaDetalle: {
        updateMany: vi.fn(async () => ({ count: 0 })),
        groupBy: vi.fn(async () => []),
      },
      balanceTerceroEncabezado: { findMany: vi.fn() },
      balanceTerceroDetalle: { updateMany: vi.fn() },
      balancePruebaEncabezado: {
        update: vi.fn(async (args: { where: { id: number }; data: Record<string, unknown> }) => {
          actualizaciones.push(args);
          return {};
        }),
      },
    } as unknown as ClienteDB;

    await migrarHomologacionClienteEnTransaccion(tx, {
      codigo: "110505",
      alcance: "solo",
      codigoMemoria: "11050501",
      cuentaCliente: "11050501",
      encabezados: [{ id: 1, periodo: "Enero 2026", loteId: null }],
    });

    expect(actualizaciones).toEqual([{ where: { id: 1 }, data: { mapeadas: 0, sinMapear: 0, completitud: 100 } }]);
  });
});

describe("calcularImpactoHomologacionCliente", () => {
  it("con alcance «solo» no consulta excepciones (siempre 0)", async () => {
    const clientAccountCount = vi.fn();
    const db = {
      balancePruebaEncabezado: { count: vi.fn(async () => 3) },
      balancePruebaDetalle: { count: vi.fn(async () => 7) },
      clientAccount: { count: clientAccountCount },
    } as unknown as ClienteDB;

    const impacto = await calcularImpactoHomologacionCliente(db, {
      clienteId: 7,
      alcance: "solo",
      codigoMemoria: "11050501",
      cuentaCliente: "11050501",
    });

    expect(clientAccountCount).not.toHaveBeenCalled();
    expect(impacto.excepciones).toBe(0);
    expect(impacto.filas).toBe(7);
  });
});
