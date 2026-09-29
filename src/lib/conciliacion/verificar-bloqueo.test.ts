import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  db: {
    conciliacionModuloCierre: { findMany: vi.fn() },
    cuentaBloqueadaConciliacion: { findMany: vi.fn() },
  },
}));
vi.mock("@/lib/prisma", () => ({ default: mocks.db }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/dal", () => ({ getCurrentUser: vi.fn(), verifySession: vi.fn() }));
vi.mock("@/lib/rbac", () => ({ authorizePermiso: vi.fn() }));

import { ErrorConciliacionEnFirme, bloqueoHomologacionBalance, cierresFirmes, cuentasBloqueadas, exigirCargueCompatibleConCierres } from "./verificar-bloqueo";

// La conciliación se cerró contra «Enero 2025 – Diciembre 2025»; el cierre guarda el mes del módulo.
const cierre = {
  id: 9,
  moduloCodigo: "INV",
  periodo: "2025-12",
  balancePeriodo: "Enero 2025 – Diciembre 2025",
  balanceEncabezadoId: 215,
  moduloDatoEncabezadoId: 38,
  cerradoPor: "Camilo",
  cerradoEn: new Date("2026-01-15T12:00:00Z"),
  cuentasRussell: ["1435"],
  cuentasRussell6: ["14", "1435"],
};
const bloqueada = (cuenta: string, cuenta6Russell: string, saldoFinal: number) => ({
  cuenta, cuenta6Russell, saldoInicial: 0, debitos: 500, creditos: 400, saldoFinal, cierre,
});
const nueva = (cuenta8: string, cuenta6Russell: string | null, saldoFinal: number) => ({
  cuenta8, cuenta6Russell, saldoInicial: saldoFinal - 10, debitos: 30, creditos: 20, saldoFinal,
});

// Balance nuevo de SOLO diciembre: otro período, misma fecha fin.
const diciembre = { periodo: "Diciembre 2025", periodoFin: new Date("2025-12-31T00:00:00Z") };
const DEL_CORTE = { estado: "firme", OR: [{ periodo: "2025-12" }, { balancePeriodo: "Diciembre 2025" }] };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.db.conciliacionModuloCierre.findMany.mockResolvedValue([cierre]);
  mocks.db.cuentaBloqueadaConciliacion.findMany.mockResolvedValue([
    bloqueada("14350501", "143505", 100),
    bloqueada("14350502", "143505", 0), // sin saldo al corte: el balance de diciembre no la trae
  ]);
});

describe("el cierre protege a todo balance con la misma fecha fin", () => {
  it("busca los cierres y las cuentas en firme por el mes de corte, no por el nombre del período", async () => {
    expect((await cierresFirmes(7, diciembre)).map((c) => c.id)).toEqual([9]);
    expect(mocks.db.conciliacionModuloCierre.findMany.mock.calls[0][0].where).toEqual({ clienteId: 7, ...DEL_CORTE });

    await cuentasBloqueadas(7, diciembre, { cuentas: ["14350501"] });
    expect(mocks.db.cuentaBloqueadaConciliacion.findMany.mock.calls[0][0].where).toEqual({
      clienteId: 7,
      cierre: DEL_CORTE,
      cuenta: { in: ["14350501"] },
    });
  });

  it("sin balance lista todos los cierres en firme del cliente", async () => {
    await cierresFirmes(7);
    expect(mocks.db.conciliacionModuloCierre.findMany.mock.calls[0][0].where).toEqual({ clienteId: 7, estado: "firme" });
  });

  it("admite el balance de solo diciembre con los mismos saldos finales aunque cambien los movimientos", async () => {
    await expect(
      exigirCargueCompatibleConCierres(7, diciembre, [
        nueva("14350501", "143505", 100),
        nueva("14350509", "143505", 0), // nueva en el módulo, sin saldo
        nueva("11050501", "110505", 55),
      ]),
    ).resolves.toBeUndefined();
  });

  it("rechaza el balance de solo diciembre si cambia un saldo final en firme", async () => {
    const intento = exigirCargueCompatibleConCierres(7, diciembre, [nueva("14350501", "143505", 120)]);
    await expect(intento).rejects.toBeInstanceOf(ErrorConciliacionEnFirme);
    await expect(intento).rejects.toThrow("14350501 cambia saldo final");
  });

  it("rechaza una cuenta nueva con saldo en el módulo cerrado y una en firme con saldo que no viene", async () => {
    const intento = exigirCargueCompatibleConCierres(7, diciembre, [nueva("14100101", "141005", 8)]);
    await expect(intento).rejects.toThrow("14350501 no viene en la versión nueva");
    await expect(intento).rejects.toThrow("14100101 entraría al módulo conciliado");
  });

  it("editar la homologación de un balance del mismo corte también queda bloqueado", async () => {
    mocks.db.cuentaBloqueadaConciliacion.findMany.mockResolvedValue([]);
    const bloqueo = await bloqueoHomologacionBalance({
      clienteId: 7, balance: diciembre, cuenta8: "14109901", cuenta6: "141099", alcanceGrupo: false, codigoDestino: "141005",
    });
    expect(bloqueo?.message).toContain("INV · 2025-12");
    expect(mocks.db.conciliacionModuloCierre.findMany.mock.calls[0][0].where).toEqual({ clienteId: 7, ...DEL_CORTE });
  });
});
