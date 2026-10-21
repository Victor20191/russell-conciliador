import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const findMany = vi.fn();
  const create = vi.fn();
  const updateMany = vi.fn();
  return { findMany, create, updateMany, candado: vi.fn(), tx: { perfilCargaModulo: { findMany, create, updateMany } } };
});
const tx = mocks.tx;
vi.mock("@/lib/prisma", () => ({ default: mocks.tx }));
vi.mock("@/lib/concurrency", () => ({
  tomarCandadoTransaccion: mocks.candado,
  transaccionSerializable: async (fn: (t: unknown) => unknown) => fn(mocks.tx),
}));
vi.mock("@/lib/rbac/contexto", () => ({ alcanceLecturaUsuario: vi.fn(async () => ({ todos: true })) }));

import { descriptorModulo } from "./descriptores";
import type { SpecModulo } from "./extraccion/esquema";
import { huellaFormatoManual, type PropuestaFormatoManual } from "./formatos-manuales";
import { guardarFormatoManualConfirmado } from "./formatos-manuales-servidor";

const INV = descriptorModulo("INV")!;
const TITULOS = ["Tipo", "Referencia", "Descripción", "Cantidad", "Valor total"];
const columnas = (mapa: Record<string, number>) => Object.fromEntries(INV.columnas.map((rol) => [rol.nombre, mapa[rol.nombre] ?? 0]));
const SPEC: SpecModulo = { hoja: "Kardex", filaEncabezado: 1, primeraFilaDatos: 2, columnas: columnas({ tipo: 1, referencia: 2, descripcion: 3, cantidad: 4, valorTotal: 5 }), clasificadorModo: "columna" };
const fecha = new Date("2026-10-01T12:00:00Z");
const fila = (extra: Record<string, unknown> = {}) => ({
  id: 7, huella: huellaFormatoManual(INV, TITULOS), encabezadoJson: TITULOS, specJson: SPEC, archivoEjemplo: "kardex.xlsx",
  vecesUsado: 2, ultimoUsoEn: fecha, guardadoEn: fecha, guardadoPor: "Camilo", creadoEn: fecha, creadoPor: "Camilo", ...extra,
});
const propuesta = (extra: Partial<PropuestaFormatoManual> = {}): PropuestaFormatoManual => ({ version: 1, encabezado: TITULOS, spec: SPEC, ...extra });
const guardar = (p: PropuestaFormatoManual, casilla: unknown = "1") => guardarFormatoManualConfirmado({
  descriptor: INV, clienteId: 5, propuesta: p, archivoEjemplo: "kardex enero.xlsx", casilla, usuario: { id: 1, name: "Luisa" },
});

describe("guardarFormatoManualConfirmado", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findMany.mockResolvedValue([]);
    mocks.updateMany.mockResolvedValue({ count: 1 });
    mocks.create.mockResolvedValue({ id: 99 });
  });

  it("crea el patrón manual con sus títulos, su mapeo y quién lo guardó, bajo el candado del cliente y módulo", async () => {
    expect(await guardar(propuesta())).toEqual({ estado: "nuevo", hecho: "creó" });
    expect(mocks.candado).toHaveBeenCalledWith(tx, "formato-manual:5:INV");
    expect(mocks.create.mock.calls[0][0].data).toMatchObject({
      clienteId: 5, moduloCodigo: "INV", huella: huellaFormatoManual(INV, TITULOS), encabezadoJson: TITULOS,
      archivoEjemplo: "kardex enero.xlsx", origen: "manual", vecesUsado: 1, guardadoPor: "Luisa", creadoPor: "Luisa",
    });
  });

  it("con la casilla desmarcada no guarda nada nuevo", async () => {
    expect(await guardar(propuesta(), "0")).toEqual({ estado: "nuevo", hecho: null });
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("el mismo patrón solo suma un uso: no pisa el mapeo, los títulos ni quién lo guardó", async () => {
    mocks.findMany.mockResolvedValue([fila()]);
    expect(await guardar(propuesta({ spec: { ...SPEC, hoja: "enero" } }), undefined)).toEqual({ estado: "igual", hecho: "sumó un uso" });
    const { where, data } = mocks.updateMany.mock.calls[0][0];
    expect(where).toEqual({ id: 7 });
    expect(Object.keys(data).sort()).toEqual(["ultimoUsoEn", "vecesUsado"]);
  });

  it("otro mapeo con los mismos títulos reemplaza títulos, mapeo y ejemplo juntos y fija quién lo guardó", async () => {
    mocks.findMany.mockResolvedValue([fila()]);
    const cambiado = { ...SPEC, columnas: { ...SPEC.columnas, cantidad: 0 } };
    expect(await guardar(propuesta({ spec: cambiado }))).toEqual({ estado: "reemplaza", hecho: "reemplazó" });
    const { data } = mocks.updateMany.mock.calls[0][0];
    expect(data).toMatchObject({ encabezadoJson: TITULOS, archivoEjemplo: "kardex enero.xlsx", guardadoPor: "Luisa" });
    expect(data.specJson.columnas.cantidad).toBe(0);
  });

  it("un perfil anterior usado tal cual gana sus títulos y la llave nueva, sin cambiar quién lo guardó", async () => {
    mocks.findMany.mockResolvedValue([fila({ id: 3, huella: "abcdef0123456789", encabezadoJson: null, guardadoEn: null, guardadoPor: null })]);
    expect(await guardar(propuesta({ perfilLegadoId: 3 }), undefined)).toEqual({ estado: "igual", hecho: "actualizó" });
    const { where, data } = mocks.updateMany.mock.calls[0][0];
    expect(where).toEqual({ id: 3 });
    expect(data).toMatchObject({ huella: huellaFormatoManual(INV, TITULOS), encabezadoJson: TITULOS });
    expect(data).not.toHaveProperty("guardadoPor");
  });

  it("si lo borraron mientras tanto, se crea de nuevo (quien confirmó pidió guardarlo)", async () => {
    mocks.findMany.mockResolvedValue([fila()]);
    mocks.updateMany.mockResolvedValue({ count: 0 });
    const cambiado = { ...SPEC, columnas: { ...SPEC.columnas, cantidad: 0 } };
    expect(await guardar(propuesta({ spec: cambiado }))).toEqual({ estado: "reemplaza", hecho: "creó" });
    expect(mocks.create).toHaveBeenCalledTimes(1);
  });

  it("un formato que no identifica nada no se guarda aunque la casilla esté marcada", async () => {
    expect(await guardar(propuesta({ encabezado: ["Inventario"] }))).toEqual({ estado: "no_guardable", hecho: null });
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });
});
