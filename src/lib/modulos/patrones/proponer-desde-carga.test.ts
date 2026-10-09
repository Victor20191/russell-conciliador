import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TransactionClient } from "@/lib/concurrency";

const aprender = vi.hoisted(() => vi.fn());
vi.mock("./aprender-confirmado", () => ({ aprenderPatronConfirmado: aprender }));

import { proponerPatronDesdeCarga } from "./proponer-desde-carga";

const spec = { hoja: "Ventas", filaEncabezado: 1, primeraFilaDatos: 2, columnas: { concepto: 1, valor: 2 } };
const propuestaPatron = { version: 1, erpId: 4, encabezado: ["Concepto", "Valor"], spec };
const tx = {
  archivoOriginalModulo: { findUnique: vi.fn() },
  moduloDatoEncabezado: { update: vi.fn() },
};
const db = tx as unknown as TransactionClient;
const entrada = { loteId: "lote-1", encabezadoId: 90, specLote: { ...spec, propuestaPatron }, aprender: true, usuario: { id: 1, nombre: "Staff" } };

beforeEach(() => {
  vi.clearAllMocks();
  tx.archivoOriginalModulo.findUnique.mockResolvedValue({ id: 9, clienteId: 5, moduloCodigo: "ING", esAnexo: false });
  aprender.mockResolvedValue({ id: 31, version: 2, reutilizada: false });
});

describe("proponer el formato de un cargue como patrón", () => {
  it("guarda la propuesta del lote y bautiza el cargue con la versión", async () => {
    expect(await proponerPatronDesdeCarga(db, entrada)).toEqual({ id: 31, version: 2, reutilizada: false });
    expect(aprender).toHaveBeenCalledWith(db, expect.objectContaining({ moduloCodigo: "ING", originalId: 9, clienteId: 5, erpId: 4, encabezado: ["Concepto", "Valor"] }));
    expect(tx.moduloDatoEncabezado.update).toHaveBeenCalledWith({ where: { id: 90 }, data: { patronVersionId: 31, patronCoincidencia: null } });
  });

  it("nada sin la casilla, sin propuesta o en Inventarios (va por su asistencia)", async () => {
    expect(await proponerPatronDesdeCarga(db, { ...entrada, aprender: false })).toBeNull();
    expect(await proponerPatronDesdeCarga(db, { ...entrada, specLote: spec })).toBeNull();
    tx.archivoOriginalModulo.findUnique.mockResolvedValueOnce({ id: 9, clienteId: 5, moduloCodigo: "INV", esAnexo: false });
    expect(await proponerPatronDesdeCarga(db, entrada)).toBeNull();
    expect(aprender).not.toHaveBeenCalled();
  });

  it("un anexo propone su formato sin rebautizar el cargue al que se suma", async () => {
    tx.archivoOriginalModulo.findUnique.mockResolvedValueOnce({ id: 9, clienteId: 5, moduloCodigo: "ING", esAnexo: true });
    await proponerPatronDesdeCarga(db, entrada);
    expect(aprender).toHaveBeenCalledOnce();
    expect(tx.moduloDatoEncabezado.update).not.toHaveBeenCalled();
  });
});
