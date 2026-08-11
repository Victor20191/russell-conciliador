import { describe, expect, it } from "vitest";
import {
  resumirCargasModulo,
  versionarYOrdenarBorradoresModulo,
} from "./versiones";

describe("resumirCargasModulo", () => {
  it("muestra solo la recarga más reciente y conserva el total de versiones", () => {
    const resumen = resumirCargasModulo([
      { id: 1, clienteId: 10, moduloCodigo: "INV", periodo: "2026-07", version: 1, ultimaCarga: "2026-08-01T10:00:00.000Z", filas: 10 },
      { id: 2, clienteId: 10, moduloCodigo: "INV", periodo: "2026-07", version: 2, ultimaCarga: "2026-08-03T10:00:00.000Z", filas: 12 },
      { id: 3, clienteId: 20, moduloCodigo: "INV", periodo: "2026-07", version: 1, ultimaCarga: "2026-08-02T10:00:00.000Z", filas: 8 },
    ]);

    expect(resumen.map((r) => [r.id, r.versiones, r.filas])).toEqual([
      [2, 2, 12],
      [3, 1, 8],
    ]);
  });

  it("desempata por versión aunque existan oficiales históricos inconsistentes", () => {
    const [resumen] = resumirCargasModulo([
      { id: 7, clienteId: 34, moduloCodigo: "INV", periodo: "2025-12", version: 2, ultimaCarga: "2026-08-08T16:24:42.191Z", esOficial: true },
      { id: 6, clienteId: 34, moduloCodigo: "INV", periodo: "2025-12", version: 1, ultimaCarga: "2026-08-08T16:24:42.191Z", esOficial: true },
    ]);
    expect(resumen).toMatchObject({ id: 7, version: 2, versiones: 2 });
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
