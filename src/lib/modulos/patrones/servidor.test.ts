import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ versiones: vi.fn(), originales: vi.fn(), alcance: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ default: {
  versionPatronArchivoModulo: { findMany: mocks.versiones },
  archivoOriginalModulo: { findMany: mocks.originales },
  clientErpProcess: { groupBy: vi.fn(async () => []) },
} }));
vi.mock("@/lib/rbac", () => ({ authorizePermiso: mocks.alcance }));

import { listarPatronesDeModulo, versionesPatronCandidatas } from "./servidor";
import { descriptorModulo } from "../descriptores";

const INV = descriptorModulo("INV")!;
const fecha = new Date("2026-10-03T00:00:00Z");
function version(extra: Record<string, unknown> = {}) {
  return { id: 4, version: 1, erpId: 3, erp: { id: 3, name: "SIIGO", active: true }, estado: "validada_cliente", clienteOrigenId: 5, clienteOrigenNombre: "Cliente privado", archivoOrigenId: 9,
    specJson: { hoja: "H", filaEncabezado: 1, primeraFilaDatos: 2, columnas: { tipo: 1, valorTotal: 2 } },
    encabezadoJson: ["Tipo", "Valor total"], nota: "Nota privada", creadoEn: fecha, actualizadoEn: fecha, ...extra };
}

describe("lectura de patrones privados y compartidos", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.versiones.mockResolvedValue([version()]);
    mocks.alcance.mockResolvedValue({ ok: true });
    mocks.originales.mockResolvedValue([{ id: 9, nombreArchivo: "Original privado.xlsx", loteId: "lote", actualizadoEn: fecha }]);
  });

  it("no lista patrones locales ni consulta originales fuera del alcance", async () => {
    mocks.alcance.mockResolvedValue({ ok: false });
    expect(await listarPatronesDeModulo(INV)).toEqual([]);
    expect(mocks.originales).not.toHaveBeenCalled();
  });

  it("la aprobación global comparte el formato, no la evidencia ni el nombre del cliente", async () => {
    mocks.versiones.mockResolvedValue([version({ estado: "aprobada" })]);
    mocks.alcance.mockResolvedValue({ ok: false });
    const [patron] = await listarPatronesDeModulo(INV);
    expect(patron.versiones[0]).toMatchObject({ estado: "aprobada", evidencia: null, clienteOrigenNombre: null, nota: null });
    expect(mocks.originales).not.toHaveBeenCalled();
  });

  it("el usuario con alcance recibe la evidencia del archivo confirmado", async () => {
    const [patron] = await listarPatronesDeModulo(INV);
    expect(patron.versiones[0].evidencia).toMatchObject({ nombreArchivo: "Original privado.xlsx", loteId: "lote" });
    expect(mocks.alcance).toHaveBeenCalledWith("modulos_datos:crear", { clientId: 5, modo: "lectura" });
  });

  it("la candidata local mantiene su estado y solo se ofrece a su cliente", async () => {
    expect((await versionesPatronCandidatas(INV, 3, 5)).versiones[0].estado).toBe("validada_cliente");
    expect((await versionesPatronCandidatas(INV, 3, 6)).versiones).toEqual([]);
  });
});
