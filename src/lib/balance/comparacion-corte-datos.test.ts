import { beforeEach, describe, expect, it, vi } from "vitest";

const candado = vi.hoisted(() => vi.fn());
vi.mock("@/lib/candados", () => ({ tomarCandadoTransaccion: candado }));
import { candadoCorte, insumosCierreBalanceEn, recalcularComparacionesDelCorteEn, type DbCorte } from "./comparacion-corte-datos";

const DIC = new Date(Date.UTC(2025, 11, 31));
type Enc = { id: number; clienteId: number; periodo: string; periodoFin: Date; aperturaBalance: string | null; creadoEn: Date; estaCongelado: boolean; version: string };
type Par = { id: number; balanceAId: number; balanceBId: number; inconsistente: boolean };

const estado = { encabezados: [] as Enc[], detalle: [] as { encabezadoId: number; cuenta8: string; nombreCuenta: string; saldoFinal: number }[], pares: [] as Par[], cierres: [] as { balanceEncabezadoId: number }[] };
const db = {
  conciliacionModuloCierre: { findMany: vi.fn(async () => estado.cierres) },
  balancePruebaEncabezado: { findMany: vi.fn(async () => estado.encabezados) },
  balancePruebaDetalle: { findMany: vi.fn(async ({ where }: { where: { encabezadoId: { in: number[] } } }) => estado.detalle.filter((d) => where.encabezadoId.in.includes(d.encabezadoId))) },
  balanceComparacionCorte: {
    findMany: vi.fn(async () => estado.pares.map((p) => ({ ...p }))),
    deleteMany: vi.fn(async ({ where }: { where: { id: { in: number[] } } }) => { estado.pares = estado.pares.filter((p) => !where.id.in.includes(p.id)); return { count: where.id.in.length }; }),
    upsert: vi.fn(async ({ where, create, update }: { where: { balanceAId_balanceBId: { balanceAId: number; balanceBId: number } }; create: Par; update: { inconsistente: boolean } }) => {
      const { balanceAId, balanceBId } = where.balanceAId_balanceBId;
      const previo = estado.pares.find((p) => p.balanceAId === balanceAId && p.balanceBId === balanceBId);
      if (previo) Object.assign(previo, update);
      else estado.pares.push({ ...create, id: 100 + estado.pares.length });
      return {};
    }),
  },
} as unknown as DbCorte;

const enc = (id: number, over: Partial<Enc> = {}): Enc => ({
  id, clienteId: 7, periodo: "Diciembre 2025", periodoFin: DIC, aperturaBalance: "cuenta",
  creadoEn: new Date(Date.UTC(2026, 0, id)), estaCongelado: false, version: `v${id}`, ...over,
});
const saldo = (encabezadoId: number, cuenta8: string, saldoFinal: number) => ({ encabezadoId, cuenta8, nombreCuenta: `Cuenta ${cuenta8}`, saldoFinal });

beforeEach(() => {
  vi.clearAllMocks();
  estado.encabezados = [enc(1), enc(2, { aperturaBalance: "tercero" }), enc(3, { periodo: "Enero 2025 – Diciembre 2025" })];
  estado.detalle = [saldo(1, "110505", 100), saldo(2, "110505", 100), saldo(3, "110505", 90)];
  estado.pares = [];
  estado.cierres = [];
});

describe("insumosCierreBalanceEn", () => {
  it("lee la vigente de la línea, los demás vigentes con su comparación y si tienen conciliación en firme", async () => {
    await recalcularComparacionesDelCorteEn(db, 7, DIC, 0);
    estado.cierres = [{ balanceEncabezadoId: 3 }];
    estado.encabezados[2].estaCongelado = true;
    const r = await insumosCierreBalanceEn(db, { id: 1, clienteId: 7, periodoFin: DIC }, 0);
    expect(r.vigenteDeMiLinea).toEqual({ id: 1, version: "v1" });
    expect(r.anterioresCerradas).toEqual([]);
    expect(r.otros).toEqual([
      { id: 2, version: "v2", nombre: "Diciembre 2025 · Por terceros", estaCongelado: false, enFirme: false, comparacion: { inconsistente: false, cuentas: 0 } },
      { id: 3, version: "v3", nombre: "Enero 2025 – Diciembre 2025 · Por cuenta", estaCongelado: true, enFirme: true, comparacion: { inconsistente: true, cuentas: 1 } },
    ]);
  });

  it("una versión anterior de la línea sigue cerrada; un par sin guardar queda «sin comparar»", async () => {
    estado.encabezados.push(enc(4, { estaCongelado: false }));
    estado.encabezados[0].estaCongelado = true; // v1 es ahora la anterior de su línea
    const r = await insumosCierreBalanceEn(db, { id: 4, clienteId: 7, periodoFin: DIC }, 0);
    expect(r.vigenteDeMiLinea).toEqual({ id: 4, version: "v4" });
    expect(r.anterioresCerradas).toEqual([{ id: 1, version: "v1" }]);
    expect(r.otros.every((o) => o.comparacion === null)).toBe(true);
  });
});

describe("recalcularComparacionesDelCorteEn", () => {
  it("toma el candado del corte y compara todos los pares de vigentes", async () => {
    const r = await recalcularComparacionesDelCorteEn(db, 7, DIC, 0);
    expect(candado).toHaveBeenCalledWith(db, "balance-corte:7:2025-12-31");
    expect(candadoCorte(7, DIC)).toBe("balance-corte:7:2025-12-31");
    expect(r.pares).toBe(3);
    expect(estado.pares.map((p) => [p.balanceAId, p.balanceBId, p.inconsistente])).toEqual([
      [1, 2, false], [1, 3, true], [2, 3, true],
    ]);
    expect(r.nuevasInconsistencias.map((n) => [n.a.id, n.b.id, n.cuentas])).toEqual([[1, 3, 1], [2, 3, 1]]);
  });

  it("no es pegajoso: un par corregido deja de ser inconsistente y no se vuelve a notificar", async () => {
    await recalcularComparacionesDelCorteEn(db, 7, DIC, 0);
    estado.detalle = [saldo(1, "110505", 100), saldo(2, "110505", 100), saldo(3, "110505", 100)];
    const r = await recalcularComparacionesDelCorteEn(db, 7, DIC, 0);
    expect(estado.pares.every((p) => !p.inconsistente)).toBe(true);
    expect(r.nuevasInconsistencias).toEqual([]);
  });

  it("una inconsistencia que sigue no se vuelve a notificar", async () => {
    await recalcularComparacionesDelCorteEn(db, 7, DIC, 0);
    const r = await recalcularComparacionesDelCorteEn(db, 7, DIC, 0);
    expect(r.nuevasInconsistencias).toEqual([]);
    expect(estado.pares.filter((p) => p.inconsistente)).toHaveLength(2);
  });

  it("borra los pares de una versión que dejó de ser vigente y compara la nueva", async () => {
    await recalcularComparacionesDelCorteEn(db, 7, DIC, 0);
    // Llega la v4 de la línea «Enero 2025 – Diciembre 2025», ahora con el saldo correcto.
    estado.encabezados.push(enc(4, { periodo: "Enero 2025 – Diciembre 2025" }));
    estado.detalle.push(saldo(4, "110505", 100));
    const r = await recalcularComparacionesDelCorteEn(db, 7, DIC, 0);
    expect(r.retirados).toBe(2);
    expect(estado.pares.map((p) => [p.balanceAId, p.balanceBId, p.inconsistente])).toEqual([
      [1, 2, false], [1, 4, false], [2, 4, false],
    ]);
  });

  it("con el umbral del corte, una diferencia menor se guarda pero no es una inconsistencia nueva ni impide cerrar", async () => {
    // Los saldos difieren en 10 (100 contra 90) y el umbral es 1.000.
    const r = await recalcularComparacionesDelCorteEn(db, 7, DIC, 1_000);
    expect(estado.pares.filter((p) => p.inconsistente)).toHaveLength(2); // la columna guarda que difieren a centavos
    expect(r.nuevasInconsistencias).toEqual([]);
    const insumos = await insumosCierreBalanceEn(db, { id: 1, clienteId: 7, periodoFin: DIC }, 1_000);
    expect(insumos.otros.map((o) => o.comparacion)).toEqual([{ inconsistente: false, cuentas: 0 }, { inconsistente: false, cuentas: 0 }]);
    // Desde el monto, inclusive, vuelve a ser inconsistente y se notifica.
    estado.pares = [];
    const exacto = await recalcularComparacionesDelCorteEn(db, 7, DIC, 10);
    expect(exacto.nuevasInconsistencias.map((n) => [n.a.id, n.b.id, n.cuentas])).toEqual([[1, 3, 1], [2, 3, 1]]);
  });

  it("cambiar el umbral no notifica (solo un cambio de saldos), pero rige de inmediato al leer", async () => {
    await recalcularComparacionesDelCorteEn(db, 7, DIC, 1_000);
    const bajado = await recalcularComparacionesDelCorteEn(db, 7, DIC, 5);
    expect(bajado.nuevasInconsistencias).toEqual([]);
    const insumos = await insumosCierreBalanceEn(db, { id: 1, clienteId: 7, periodoFin: DIC }, 5);
    expect(insumos.otros.find((o) => o.id === 3)?.comparacion).toEqual({ inconsistente: true, cuentas: 1 });
  });

  it("con un solo vigente no guarda pares", async () => {
    estado.encabezados = [enc(1)];
    const r = await recalcularComparacionesDelCorteEn(db, 7, DIC, 0);
    expect(r.pares).toBe(0);
    expect(estado.pares).toEqual([]);
  });
});
