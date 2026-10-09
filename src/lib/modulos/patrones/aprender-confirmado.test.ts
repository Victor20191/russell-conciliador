import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TransactionClient } from "@/lib/concurrency";
import { tomarCandadoTransaccion } from "@/lib/concurrency";
import { aprenderPatronConfirmado, aprenderPatronInventarioConfirmado } from "./aprender-confirmado";
import type { LecturaEstructurada } from "../extraccion/lectura-estructurada";

vi.mock("@/lib/concurrency", () => ({ tomarCandadoTransaccion: vi.fn() }));

const spec = { hoja: "Inventario", filaEncabezado: 1, primeraFilaDatos: 2, columnas: { tipo: 1, valorTotal: 2 } };
const entrada = { originalId: 9, clienteId: 5, erpId: 3, spec, encabezado: ["Tipo", "Valor total"], usuario: { id: 1, nombre: "Staff" } };
const tx = {
  archivoOriginalModulo: { findUnique: vi.fn() },
  clientErpProcess: { findFirst: vi.fn() },
  versionPatronArchivoModulo: { findMany: vi.fn(), create: vi.fn() },
};
const db = tx as unknown as TransactionClient;
const reglas: LecturaEstructurada = {
  version: 1,
  registro: { ancla: { columna: 2, operador: "empieza", texto: "Item:" }, maxFilas: 2 },
  campos: [
    { rol: "tipo", fuente: { columna: 1, desplazamientoFila: 0, selector: { tipo: "completa" } } },
    { rol: "referencia", fuente: { columna: 2, desplazamientoFila: 0, selector: { tipo: "etiqueta", inicio: "Item:", fin: "|" } } },
    { rol: "valorTotal", fuente: { columna: 2, desplazamientoFila: 1, selector: { tipo: "etiqueta", inicio: "Costo:" } } },
  ],
  totales: [{ condicion: { columna: 2, operador: "empieza", texto: "Total:" }, fuente: { columna: 2, desplazamientoFila: 0, selector: { tipo: "etiqueta", inicio: "Total:" } }, tipo: "general" }],
};

describe("aprendizaje confirmado de inventarios", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tx.archivoOriginalModulo.findUnique.mockResolvedValue({ id: 9, clienteId: 5, nombreCliente: "Cliente privado", moduloCodigo: "INV", estado: "cargado", encabezadoId: 90 });
    tx.clientErpProcess.findFirst.mockResolvedValue({ erp: { code: "SIIGO" } });
    tx.versionPatronArchivoModulo.findMany.mockResolvedValue([]);
    tx.versionPatronArchivoModulo.create.mockImplementation(async ({ data }) => ({ id: 10, version: data.version }));
  });

  it("no aprende de un borrador, de otro cliente ni sin confirmación durable", async () => {
    for (const cambios of [{ estado: "borrador" }, { clienteId: 6 }, { encabezadoId: null }]) {
      tx.archivoOriginalModulo.findUnique.mockResolvedValueOnce({ id: 9, clienteId: 5, moduloCodigo: "INV", estado: "cargado", encabezadoId: 90, ...cambios });
      await expect(aprenderPatronInventarioConfirmado(db, entrada)).rejects.toThrow("solo se aprende al confirmar");
    }
    expect(tx.versionPatronArchivoModulo.create).not.toHaveBeenCalled();
  });

  it("crea una versión local sin publicar el original como muestra", async () => {
    expect(await aprenderPatronInventarioConfirmado(db, entrada)).toEqual({ id: 10, version: 1, reutilizada: false });
    const data = tx.versionPatronArchivoModulo.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ estado: "validada_cliente", clienteOrigenId: 5, archivoOrigenId: 9 });
    expect(data).not.toHaveProperty("muestraClaveObjeto");
    expect(data).not.toHaveProperty("aprobadoEn");
  });

  it("deduplica sin depender del orden de las propiedades ni del total particular del archivo", async () => {
    tx.versionPatronArchivoModulo.findMany.mockResolvedValue([{ id: 20, version: 4, estado: "validada_cliente", clienteOrigenId: 5, specJson: { ...spec, columnas: { valorTotal: 2, tipo: 1 } }, encabezadoJson: entrada.encabezado }]);
    expect(await aprenderPatronInventarioConfirmado(db, { ...entrada, spec: { ...spec, subtotalesFila: 100 } })).toEqual({ id: 20, version: 4, reutilizada: true });
    expect(tx.versionPatronArchivoModulo.create).not.toHaveBeenCalled();
  });

  it("otro formato crea versión sin modificar ni desactivar las existentes", async () => {
    tx.versionPatronArchivoModulo.findMany.mockResolvedValue([{ id: 20, version: 4, estado: "validada_cliente", clienteOrigenId: 5, specJson: spec, encabezadoJson: ["Clase", "Costo"] }]);
    expect(await aprenderPatronInventarioConfirmado(db, entrada)).toMatchObject({ version: 5, reutilizada: false });
  });

  it("rechaza ERP ajeno y versión de partida privada de otro cliente", async () => {
    tx.clientErpProcess.findFirst.mockResolvedValueOnce(null);
    await expect(aprenderPatronInventarioConfirmado(db, entrada)).rejects.toThrow("aplicativo no corresponde");
    tx.versionPatronArchivoModulo.findMany.mockResolvedValue([{ id: 20, version: 4, estado: "validada_cliente", clienteOrigenId: 6 }]);
    await expect(aprenderPatronInventarioConfirmado(db, { ...entrada, versionBaseId: 20 })).rejects.toThrow("versión de partida");
  });

  it("conserva completa la gramática normalizada al aprender y no guarda traza del archivo en ella", async () => {
    const estructurado = { ...spec, lecturaEstructurada: reglas, subtotalesFila: 100 };
    await aprenderPatronInventarioConfirmado(db, { ...entrada, spec: estructurado });
    const guardado = tx.versionPatronArchivoModulo.create.mock.calls[0][0].data.specJson;
    expect(guardado.lecturaEstructurada).toEqual(reglas);
    expect(guardado).not.toHaveProperty("subtotalesFila");
    expect(guardado).not.toHaveProperty("__origenInventario");
  });

  it("deduplica reglas equivalentes sin depender del orden de propiedades de sus fuentes", async () => {
    tx.versionPatronArchivoModulo.findMany.mockResolvedValue([{ id: 20, version: 4, estado: "validada_cliente", clienteOrigenId: 5, specJson: { ...spec, lecturaEstructurada: reglas }, encabezadoJson: entrada.encabezado }]);
    const equivalentes = { ...reglas, campos: reglas.campos.map((campo) => ({ rol: campo.rol, fuente: {
      selector: campo.fuente.selector, desplazamientoFila: campo.fuente.desplazamientoFila, columna: campo.fuente.columna,
    } })) };
    expect(await aprenderPatronInventarioConfirmado(db, { ...entrada, spec: { ...spec, lecturaEstructurada: equivalentes } })).toEqual({ id: 20, version: 4, reutilizada: true });
    expect(tx.versionPatronArchivoModulo.create).not.toHaveBeenCalled();
  });

  it("otra regla con los mismos encabezados crea versión sin reutilizar la estructura anterior", async () => {
    tx.versionPatronArchivoModulo.findMany.mockResolvedValue([{ id: 20, version: 4, estado: "validada_cliente", clienteOrigenId: 5, specJson: { ...spec, lecturaEstructurada: reglas }, encabezadoJson: entrada.encabezado }]);
    const distintas = structuredClone(reglas);
    distintas.campos[2].fuente.desplazamientoFila = 0;
    expect(await aprenderPatronInventarioConfirmado(db, { ...entrada, spec: { ...spec, lecturaEstructurada: distintas } })).toMatchObject({ version: 5, reutilizada: false });
    expect(tx.versionPatronArchivoModulo.create.mock.calls[0][0].data.specJson.lecturaEstructurada).toEqual(distintas);
  });

  it("si ya hay una versión APROBADA igual, la enlaza en vez de crear otra", async () => {
    tx.versionPatronArchivoModulo.findMany.mockResolvedValue([{ id: 40, version: 2, estado: "aprobada", clienteOrigenId: null, specJson: spec, encabezadoJson: entrada.encabezado }]);
    expect(await aprenderPatronInventarioConfirmado(db, entrada)).toEqual({ id: 40, version: 2, reutilizada: true });
    expect(tx.versionPatronArchivoModulo.create).not.toHaveBeenCalled();
  });

  it("los demás módulos: aplicativo de Contabilidad, candado del módulo y tipo de formato declarado", async () => {
    const specCar = { hoja: "Cartera", filaEncabezado: 1, primeraFilaDatos: 2, columnas: { cuenta: 1, nit: 2, documento: 3, total: 4 }, tipoFormato: "documento" as const };
    const entradaCar = { ...entrada, moduloCodigo: "CAR", spec: specCar, encabezado: ["Cuenta", "NIT", "Documento", "Saldo"] };
    tx.archivoOriginalModulo.findUnique.mockResolvedValue({ id: 9, clienteId: 5, nombreCliente: "Cliente", moduloCodigo: "CAR", estado: "cargado", encabezadoId: 90 });
    expect(await aprenderPatronConfirmado(db, entradaCar)).toMatchObject({ reutilizada: false });
    expect(tx.clientErpProcess.findFirst.mock.calls[0][0].where.process).toEqual({ code: "CONT" });
    expect(vi.mocked(tomarCandadoTransaccion)).toHaveBeenCalledWith(db, "patron-archivo:3:CAR");
    expect(tx.versionPatronArchivoModulo.create.mock.calls[0][0].data).toMatchObject({ moduloCodigo: "CAR", estado: "validada_cliente" });
    await expect(aprenderPatronConfirmado(db, { ...entradaCar, spec: { ...specCar, tipoFormato: undefined } })).rejects.toThrow("tipo de formato");
    // Un original de otro módulo no se aprende como este.
    await expect(aprenderPatronConfirmado(db, { ...entradaCar, moduloCodigo: "CXP" })).rejects.toThrow("solo se aprende al confirmar");
  });

  it("aprende campos combinados en una columna sólo con gramática válida", async () => {
    const unaColumna: LecturaEstructurada = {
      version: 1, registro: { ancla: { columna: 1, operador: "empieza", texto: "Item:" }, maxFilas: 1 },
      campos: [
        { rol: "tipo", fuente: { columna: 1, desplazamientoFila: 0, selector: { tipo: "etiqueta", inicio: "Tipo:", fin: "|" } } },
        { rol: "valorTotal", fuente: { columna: 1, desplazamientoFila: 0, selector: { tipo: "etiqueta", inicio: "Costo:" } } },
      ],
    };
    const entradaUnica = { ...entrada, encabezado: ["Datos del inventario"], spec: { ...spec, columnas: { tipo: 1, valorTotal: 1 }, lecturaEstructurada: unaColumna } };
    expect(await aprenderPatronInventarioConfirmado(db, entradaUnica)).toMatchObject({ reutilizada: false });
    expect(tx.versionPatronArchivoModulo.create.mock.calls[0][0].data.specJson.lecturaEstructurada).toEqual(unaColumna);
    await expect(aprenderPatronInventarioConfirmado(db, { ...entradaUnica, spec: { ...spec, columnas: { tipo: 1, valorTotal: 1 } } })).rejects.toThrow("encabezados suficientes");
    await expect(aprenderPatronInventarioConfirmado(db, { ...entradaUnica, spec: { ...entradaUnica.spec, lecturaEstructurada: { ...unaColumna, version: 2 } as unknown as LecturaEstructurada } })).rejects.toThrow("estructura confirmada");
  });
});
