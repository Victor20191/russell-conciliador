import { describe, expect, it } from "vitest";
import {
  agruparCargasModuloPorCliente,
  versionarYOrdenarBorradoresModulo,
  type CargaModuloAgrupable,
} from "./versiones";

const carga = (over: Partial<CargaModuloAgrupable>): CargaModuloAgrupable => ({
  id: 1,
  clienteId: 10,
  clienteNombre: "IVANAGRO S.A.",
  clienteNit: "811002359",
  moduloCodigo: "INV",
  periodo: "2026-07",
  version: 1,
  esOficial: true,
  estaCongelado: false,
  filas: 10,
  total: 1000,
  archivoNombre: "inv.xlsx",
  origen: "manual",
  cargadoPor: "Victor",
  ultimaCarga: "2026-08-01T10:00:00.000Z",
  comentarios: 0,
  ...over,
});

describe("agruparCargasModuloPorCliente", () => {
  it("junta las versiones del período en una fila con su conteo", () => {
    const grupos = agruparCargasModuloPorCliente([
      carga({ id: 1, version: 1, esOficial: false, filas: 10, ultimaCarga: "2026-08-01T10:00:00.000Z" }),
      carga({ id: 2, version: 2, esOficial: true, filas: 12, ultimaCarga: "2026-08-03T10:00:00.000Z" }),
    ]);

    expect(grupos).toHaveLength(1);
    expect(grupos[0].periodos).toHaveLength(1);
    expect(grupos[0].periodos[0]).toMatchObject({
      periodo: "2026-07",
      versiones: 2,
      id: 2,
      version: 2,
      filas: 12,
    });
  });

  it("agrupa por cliente y ordena clientes y períodos por la carga más reciente", () => {
    const grupos = agruparCargasModuloPorCliente([
      carga({ id: 1, clienteId: 10, periodo: "2026-05", ultimaCarga: "2026-08-01T10:00:00.000Z" }),
      carga({ id: 2, clienteId: 10, periodo: "2026-07", ultimaCarga: "2026-08-05T10:00:00.000Z" }),
      carga({ id: 3, clienteId: 20, clienteNombre: "QUIFARMA S.A.S.", clienteNit: "890938300", periodo: "2026-06", ultimaCarga: "2026-08-02T10:00:00.000Z" }),
    ]);

    expect(grupos.map((g) => g.clienteId)).toEqual([10, 20]);
    expect(grupos[0].periodos.map((p) => p.periodo)).toEqual(["2026-07", "2026-05"]);
    expect(grupos[1]).toMatchObject({ clienteNombre: "QUIFARMA S.A.S.", clienteNit: "890938300" });
  });

  it("no funde dos clientes homónimos ni parte uno renombrado", () => {
    const grupos = agruparCargasModuloPorCliente([
      carga({ id: 1, clienteId: 10, clienteNombre: "COMERCIAL S.A.", periodo: "2026-05", ultimaCarga: "2026-08-01T10:00:00.000Z" }),
      carga({ id: 2, clienteId: 10, clienteNombre: "COMERCIAL S.A. (nuevo)", periodo: "2026-06", ultimaCarga: "2026-08-04T10:00:00.000Z" }),
      carga({ id: 3, clienteId: 11, clienteNombre: "COMERCIAL S.A.", periodo: "2026-05", ultimaCarga: "2026-08-02T10:00:00.000Z" }),
    ]);

    expect(grupos).toHaveLength(2);
    // La razón social la aporta el cargue más reciente del cliente.
    expect(grupos[0]).toMatchObject({ clienteId: 10, clienteNombre: "COMERCIAL S.A. (nuevo)" });
    expect(grupos[0].periodos).toHaveLength(2);
  });

  it("representa el período con su versión vigente aunque no sea la última cargada", () => {
    const [grupo] = agruparCargasModuloPorCliente([
      carga({ id: 5, version: 1, esOficial: true, filas: 9, ultimaCarga: "2026-08-01T10:00:00.000Z" }),
      carga({ id: 6, version: 2, esOficial: false, filas: 30, ultimaCarga: "2026-08-06T10:00:00.000Z" }),
    ]);

    // Se abre y se muestra la vigente…
    expect(grupo.periodos[0]).toMatchObject({ id: 5, version: 1, filas: 9, esOficial: true, versiones: 2 });
    // …pero el período se ordena por su cargue más reciente.
    expect(grupo.periodos[0].ultimaCarga).toBe("2026-08-06T10:00:00.000Z");
  });

  it("cae en la versión más reciente cuando ningún cargue quedó vigente", () => {
    const [grupo] = agruparCargasModuloPorCliente([
      carga({ id: 6, version: 1, esOficial: false, ultimaCarga: "2026-08-08T16:24:42.191Z" }),
      carga({ id: 7, version: 2, esOficial: false, ultimaCarga: "2026-08-08T16:24:42.191Z" }),
    ]);

    expect(grupo.periodos[0]).toMatchObject({ id: 7, version: 2, versiones: 2, esOficial: false });
  });

  it("separa los períodos de módulos distintos del mismo cliente", () => {
    const [grupo] = agruparCargasModuloPorCliente([
      carga({ id: 1, moduloCodigo: "INV", periodo: "2026-07" }),
      carga({ id: 2, moduloCodigo: "CAR", periodo: "2026-07" }),
    ]);

    expect(grupo.periodos).toHaveLength(2);
  });
});

describe("versionarYOrdenarBorradoresModulo", () => {
  const base = {
    clienteId: 34,
    moduloCodigo: "INV",
    periodoInicial: "2025-12-01",
    periodoFinal: "2025-12-01",
  };

  it("mantiene juntas las versiones del grupo y pone primero la más nueva", () => {
    const resultado = versionarYOrdenarBorradoresModulo([
      { ...base, loteId: "inv-v1", creadoEn: "2026-08-01T10:00:00.000Z" },
      { ...base, loteId: "inv-v2", creadoEn: "2026-08-03T10:00:00.000Z" },
      { ...base, clienteId: 50, loteId: "otro", creadoEn: "2026-08-02T10:00:00.000Z" },
    ]);

    expect(resultado.map((r) => [r.loteId, r.version, r.versionesGrupo])).toEqual([
      ["inv-v2", 2, 2],
      ["inv-v1", 1, 2],
      ["otro", 1, 1],
    ]);
  });

  it("deja sin grupo un borrador que todavía no tiene período", () => {
    const [resultado] = versionarYOrdenarBorradoresModulo([
      { ...base, loteId: "sin-periodo", periodoInicial: null, periodoFinal: null, creadoEn: "2026-08-03T10:00:00.000Z" },
    ]);
    expect(resultado).toMatchObject({ version: 1, versionesGrupo: 1, claveGrupo: null });
  });
});
