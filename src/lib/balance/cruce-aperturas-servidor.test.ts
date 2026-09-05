import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  db: {
    balancePruebaEncabezado: { findFirst: vi.fn(), findMany: vi.fn() },
    balanceTerceroEncabezado: { findMany: vi.fn() },
    balancePruebaDetalle: { findMany: vi.fn() },
    balanceTerceroDetalle: { findMany: vi.fn() },
    balanceCruceApertura: { findUnique: vi.fn(), findMany: vi.fn(), upsert: vi.fn() },
  },
  notificar: vi.fn(), audit: vi.fn(), error: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ default: mocks.db }));
vi.mock("@/lib/concurrency", () => ({ tomarCandadoTransaccion: vi.fn(), transaccionSerializable: (fn: (db: typeof mocks.db) => unknown) => fn(mocks.db) }));
vi.mock("@/lib/notifications", () => ({ createProcessNotification: mocks.notificar }));
vi.mock("@/lib/audit", () => ({ logAudit: mocks.audit }));
vi.mock("@/lib/errores", () => ({ registrarError: mocks.error }));
import { cargarEstadoCrucesAperturas, revisarCrucesAperturas, revisarCrucesAperturasSeguro } from "./cruce-aperturas-servidor";

const c = { id: 1, clienteId: 151, loteId: "c", aperturaBalance: "cuenta", periodoInicio: new Date("2025-12-01"), periodoFin: new Date("2025-12-31"), archivo: "cuenta.xlsx", version: "v1" };
const t = { ...c, id: 2, loteId: "t", aperturaBalance: "tercero", archivo: "terceros.xlsx", version: "v2" };
const fila = { cuenta8: "1105100101", nombreCuenta: "Caja", saldoInicial: 100, debitos: 50, creditos: -10, saldoFinal: 140 };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.db.balancePruebaEncabezado.findFirst.mockImplementation(({ where }) => Promise.resolve(where.id === 1 ? c : t));
  mocks.db.balancePruebaEncabezado.findMany.mockResolvedValue([c, t]);
  mocks.db.balanceTerceroEncabezado.findMany.mockResolvedValue([{ id: 20, loteId: "t", clienteId: 151 }]);
  mocks.db.balancePruebaDetalle.findMany.mockResolvedValue([fila]);
  mocks.db.balanceTerceroDetalle.findMany.mockResolvedValue([{ ...fila, nitTercero: "123", nombreTercero: "Prueba", debitos: 80, creditos: -40 }]);
  mocks.db.balanceCruceApertura.findUnique.mockResolvedValue(null);
  mocks.db.balanceCruceApertura.findMany.mockResolvedValue([]);
  mocks.db.balanceCruceApertura.upsert.mockResolvedValue({ id: 10 });
});

describe("registro persistente del cruce", () => {
  it.each([1, 2])("registra ambos archivos al confirmar %s y compara sus fuentes independientes", async (id) => {
    const r = await revisarCrucesAperturas(id, 151);
    expect(r.nuevas).toHaveLength(1);
    const { create } = mocks.db.balanceCruceApertura.upsert.mock.calls[0][0];
    expect(create).toMatchObject({ balanceCuentaId: 1, balanceTerceroId: 2, inconsistente: true });
    expect(create.resultado.filas[0].diff).toMatchObject({ debitos: -30, creditos: 30, saldoFinal: 0 });
    expect(mocks.db.balancePruebaDetalle.findMany.mock.calls[0][0].where).toEqual({ encabezadoId: 1 });
    expect(mocks.db.balanceTerceroDetalle.findMany.mock.calls[0][0].where).toEqual({ encabezadoId: 20 });
  });
  it("conserva la primera inconsistencia aunque ahora los importes coincidan", async () => {
    mocks.db.balanceCruceApertura.findUnique.mockResolvedValue({ inconsistente: true });
    mocks.db.balanceTerceroDetalle.findMany.mockResolvedValue([{ ...fila, nitTercero: "123", nombreTercero: "Prueba" }]);
    const r = await revisarCrucesAperturas(1, 151);
    expect(r.nuevas).toEqual([]);
    expect(mocks.db.balanceCruceApertura.upsert).not.toHaveBeenCalled();
    expect(mocks.db.balancePruebaDetalle.findMany).not.toHaveBeenCalled();
  });
  it("un cruce antes correcto puede registrar una diferencia posterior", async () => {
    mocks.db.balanceCruceApertura.findUnique.mockResolvedValue({ inconsistente: false });
    await revisarCrucesAperturas(1, 151);
    expect(mocks.db.balanceCruceApertura.upsert.mock.calls[0][0].update.inconsistente).toBe(true);
  });
  it("si solo existe el tercero no persiste una pareja ficticia", async () => {
    mocks.db.balancePruebaEncabezado.findMany.mockResolvedValue([t]);
    expect((await revisarCrucesAperturas(2, 151)).comparaciones).toBe(0);
    expect(mocks.db.balanceCruceApertura.upsert).not.toHaveBeenCalled();
  });
  it("un fallo del control devuelve pendiente, sin lanzar error al flujo de confirmación", async () => {
    mocks.db.balancePruebaDetalle.findMany.mockRejectedValue(new Error("fallo simulado"));
    expect(await revisarCrucesAperturasSeguro(1, 151)).toBe(false);
    expect(mocks.db.balanceCruceApertura.upsert).not.toHaveBeenCalled();
  });
  it("un reintento no duplica notificaciones de una inconsistencia persistida", async () => {
    await revisarCrucesAperturasSeguro(1, 151);
    mocks.db.balanceCruceApertura.findUnique.mockResolvedValue({ inconsistente: true });
    await revisarCrucesAperturasSeguro(1, 151);
    expect(mocks.notificar).toHaveBeenCalledTimes(1);
  });
});

describe("lectura segura del panel", () => {
  it("una pareja sin resultado aparece pendiente, nunca como consistente", async () => {
    expect(await cargarEstadoCrucesAperturas(1, 151)).toMatchObject({ disponible: true, pendiente: true });
    expect(mocks.db.balanceCruceApertura.upsert).not.toHaveBeenCalled();
  });
  it("el informe es el mismo en ambos balances y restringe ambas relaciones al cliente", async () => {
    await revisarCrucesAperturas(1, 151);
    const create = mocks.db.balanceCruceApertura.upsert.mock.calls[0][0].create;
    mocks.db.balanceCruceApertura.findMany.mockResolvedValue([{ ...create, id: 10, actualizadoEn: new Date(), balanceCuenta: c, balanceTercero: t }]);
    const a = await cargarEstadoCrucesAperturas(1, 151);
    const b = await cargarEstadoCrucesAperturas(2, 151);
    expect(a.pares).toEqual(b.pares);
    expect(a.pendiente).toBe(false);
    expect(mocks.db.balanceCruceApertura.findMany.mock.calls[0][0].where).toMatchObject({ balanceCuenta: { clienteId: 151 }, balanceTercero: { clienteId: 151 } });
  });
  it("si la BD falla o el snapshot está dañado no pinta un falso OK", async () => {
    mocks.db.balanceCruceApertura.findMany.mockRejectedValue(new Error("fallo"));
    expect(await cargarEstadoCrucesAperturas(1, 151)).toMatchObject({ disponible: false, pendiente: true });
    mocks.db.balanceCruceApertura.findMany.mockResolvedValue([{ resultado: { invalido: true }, actualizadoEn: new Date() }]);
    expect(await cargarEstadoCrucesAperturas(1, 151)).toMatchObject({ disponible: false, pendiente: true });
  });
});
