import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TransactionClient } from "@/lib/concurrency";
import type { AsistenciaInventarioGuardada } from "./asistencia-inventario-estado";

const aprender = vi.hoisted(() => vi.fn());
vi.mock("./patrones/aprender-confirmado", () => ({ aprenderPatronInventarioConfirmado: aprender }));

import { confirmarAprendizajeInventario } from "./asistencia-inventario-confirmacion";

const spec = { hoja: "Inventario", filaEncabezado: 1, primeraFilaDatos: 2, columnas: { tipo: 1, valorTotal: 2 } };
const resumen = { hoja: "Inventario", filasIncluidas: 2, filasExcluidas: 0, valorLeido: 100, totalDeclarado: null, diferencia: null, tipoInventario: "Materia prima" };
const entrada = { loteId: "recepcion-1", encabezadoId: 90, usuario: { id: 1, nombre: "Analista" } };
const tx = {
  archivoOriginalModulo: { findUnique: vi.fn(), update: vi.fn() },
  moduloImportacionLote: { findUnique: vi.fn() },
  moduloDatoEncabezado: { update: vi.fn() },
};
const db = tx as unknown as TransactionClient;
let asistencia: AsistenciaInventarioGuardada;
let original: Record<string, unknown>;
let lote: Record<string, unknown>;

beforeEach(() => {
  vi.clearAllMocks();
  asistencia = {
    version: 1, estado: "borrador_preparado", operacionId: "operacion-3", venceEn: "2026-10-03T12:30:00Z",
    erpId: 4, periodo: "2026-09", anexoEncabezadoId: null, instrucciones: "", respuestas: {}, resultado: null,
    aplicado: { spec, resumen, revision: 3, origen: "ia", encabezado: ["Tipo", "Valor total"], versionBaseId: 20 },
    versionBaseId: 20, encabezado: ["Tipo", "Valor total"],
  };
  original = { id: 9, clienteId: 5, moduloCodigo: "INV", estado: "cargado", encabezadoId: 90, revisionAsistencia: 3, esAnexo: false, asistenciaJson: asistencia };
  lote = { clienteId: 5, moduloCodigo: "INV", specJson: { ...spec, asistenciaRevision: 3 }, patronVersionId: null, patronCoincidencia: null };
  tx.archivoOriginalModulo.findUnique.mockImplementation(async () => original);
  tx.moduloImportacionLote.findUnique.mockImplementation(async () => lote);
  aprender.mockResolvedValue({ id: 30, version: 6, reutilizada: false });
});

describe("confirmación transaccional del aprendizaje de inventarios", () => {
  it("aprende exclusivamente la estructura aplicada, aunque exista un resultado distinto", async () => {
    asistencia.resultado = {
      spec: { ...spec, columnas: { tipo: 2, valorTotal: 1 } }, resumen, preguntas: [], advertencias: [], errores: [],
      usos: [], origen: "manual", estructuraValida: true, listoParaBorrador: true,
    };
    asistencia.versionBaseId = 99;
    asistencia.encabezado = ["Otro encabezado", "Otro importe"];

    await confirmarAprendizajeInventario(db, entrada);

    expect(aprender).toHaveBeenCalledExactlyOnceWith(db, {
      originalId: 9, clienteId: 5, erpId: 4, spec, encabezado: ["Tipo", "Valor total"], versionBaseId: 20, usuario: entrada.usuario,
    });
    expect(tx.moduloDatoEncabezado.update).toHaveBeenCalledWith({ where: { id: 90 }, data: { patronVersionId: 30, patronCoincidencia: null } });
    expect(tx.archivoOriginalModulo.update).toHaveBeenCalledWith({ where: { id: 9 }, data: {
      asistenciaJson: expect.objectContaining({ estado: "confirmado", patronAprendidoId: 30, aplicado: asistencia.aplicado }),
    } });
  });

  it.each(["analizando", "requiere_respuesta", "propuesta_lista", "error_recuperable", "confirmado"] as const)("rechaza el estado %s sin aprender ni marcar confirmado", async (estado) => {
    asistencia.estado = estado;
    await expect(confirmarAprendizajeInventario(db, entrada)).rejects.toThrow("Resuelve la lectura pendiente");
    expect(aprender).not.toHaveBeenCalled();
    expect(tx.moduloDatoEncabezado.update).not.toHaveBeenCalled();
    expect(tx.archivoOriginalModulo.update).not.toHaveBeenCalled();
  });

  it("no trata una asistencia incompleta o corrupta como carga histórica", async () => {
    for (const invalida of [{ version: 99 }, { ...asistencia, aplicado: null }]) {
      original.asistenciaJson = invalida;
      await expect(confirmarAprendizajeInventario(db, entrada)).rejects.toThrow("Resuelve la lectura pendiente");
    }
    expect(aprender).not.toHaveBeenCalled();
  });

  it("mantiene cargas históricas, manuales y otros módulos sin asistencia", async () => {
    original.asistenciaJson = null;
    await confirmarAprendizajeInventario(db, entrada);
    original.moduloCodigo = "CXC";
    original.asistenciaJson = { version: 99 };
    await confirmarAprendizajeInventario(db, entrada);
    expect(aprender).not.toHaveBeenCalled();
    expect(tx.moduloImportacionLote.findUnique).not.toHaveBeenCalled();
    expect(tx.archivoOriginalModulo.update).not.toHaveBeenCalled();
  });

  it("exige confirmación durable del mismo original y una revisión vigente", async () => {
    for (const cambio of [{ estado: "borrador" }, { encabezadoId: 91 }, { revisionAsistencia: 4 }]) {
      tx.archivoOriginalModulo.findUnique.mockResolvedValueOnce({ ...original, ...cambio });
      await expect(confirmarAprendizajeInventario(db, entrada)).rejects.toThrow("estructura del borrador cambió");
    }
    expect(aprender).not.toHaveBeenCalled();
    expect(tx.archivoOriginalModulo.update).not.toHaveBeenCalled();
  });

  it("rechaza un lote ausente, ajeno o con una revisión aplicada distinta", async () => {
    for (const alterado of [null, { ...lote, clienteId: 6 }, { ...lote, moduloCodigo: "CXC" }, { ...lote, specJson: { asistenciaRevision: 2 } }]) {
      tx.moduloImportacionLote.findUnique.mockResolvedValueOnce(alterado);
      await expect(confirmarAprendizajeInventario(db, entrada)).rejects.toThrow("estructura del borrador cambió");
    }
    expect(aprender).not.toHaveBeenCalled();
  });

  it("reutiliza el patrón realmente aplicado sin crear aprendizaje adicional", async () => {
    asistencia.aplicado!.origen = "patron";
    lote.patronVersionId = 20;
    lote.patronCoincidencia = 100;
    await confirmarAprendizajeInventario(db, entrada);
    expect(aprender).not.toHaveBeenCalled();
    expect(tx.moduloDatoEncabezado.update).toHaveBeenCalledWith({ where: { id: 90 }, data: { patronVersionId: 20, patronCoincidencia: 100 } });
    expect(tx.archivoOriginalModulo.update).toHaveBeenCalledWith({ where: { id: 9 }, data: { asistenciaJson: expect.objectContaining({ estado: "confirmado", patronAprendidoId: 20 }) } });
  });

  it("rechaza una atribución de patrón ausente o distinta de la lectura aplicada", async () => {
    asistencia.aplicado!.origen = "patron";
    for (const patronVersionId of [null, 21]) {
      lote.patronVersionId = patronVersionId;
      await expect(confirmarAprendizajeInventario(db, entrada)).rejects.toThrow("patrón aplicado no corresponde");
    }
    expect(aprender).not.toHaveBeenCalled();
    expect(tx.archivoOriginalModulo.update).not.toHaveBeenCalled();
  });

  it("aprende el anexo sin sustituir el patrón del archivo principal", async () => {
    original.esAnexo = true;
    await confirmarAprendizajeInventario(db, entrada);
    expect(aprender).toHaveBeenCalledOnce();
    expect(tx.moduloDatoEncabezado.update).not.toHaveBeenCalled();
    expect(tx.archivoOriginalModulo.update).toHaveBeenCalledOnce();
  });

  it("sin «Guardar como patrón» confirma la lectura sin aprender ni enlazar versión", async () => {
    expect(await confirmarAprendizajeInventario(db, { ...entrada, aprender: false })).toBeNull();
    expect(aprender).not.toHaveBeenCalled();
    expect(tx.moduloDatoEncabezado.update).not.toHaveBeenCalled();
    expect(tx.archivoOriginalModulo.update).toHaveBeenCalledWith({ where: { id: 9 }, data: { asistenciaJson: expect.objectContaining({ estado: "confirmado", patronAprendidoId: null }) } });
  });

  it("devuelve la versión aprendida para el mensaje y la muestra", async () => {
    expect(await confirmarAprendizajeInventario(db, entrada)).toEqual({ id: 30, version: 6, reutilizada: false });
  });

  it("propaga fallos de aprendizaje para que la promoción se revierta", async () => {
    aprender.mockRejectedValueOnce(new Error("Fallo al guardar patrón"));
    await expect(confirmarAprendizajeInventario(db, entrada)).rejects.toThrow("Fallo al guardar patrón");
    expect(tx.moduloDatoEncabezado.update).not.toHaveBeenCalled();
    expect(tx.archivoOriginalModulo.update).not.toHaveBeenCalled();
  });
});
