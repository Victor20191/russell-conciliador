import { beforeEach, describe, expect, test, vi } from "vitest";

const db = vi.hoisted(() => ({
  despliegues: { findMany: vi.fn(), create: vi.fn() },
  versiones: { findMany: vi.fn(), updateMany: vi.fn() },
  auditoria: { create: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({
  default: {
    $transaction: (operacion: (tx: unknown) => Promise<unknown>) =>
      operacion({ platformDeployment: db.despliegues, platformVersion: db.versiones, auditEntry: db.auditoria }),
  },
}));
import { registrarDespliegue } from "./registro-despliegue-servidor";

// 24/Nov/2026 a las 9:30 p. m. en Colombia: en UTC ya es el 25.
const ahora = new Date("2026-11-25T02:30:00.000Z");
const versiones = [
  { id: 1, number: "3.6.0", deployedAt: new Date("2026-11-06T12:00:00.000Z") },
  { id: 2, number: "3.7.0", deployedAt: null },
  { id: 3, number: "3.7.1", deployedAt: null },
  { id: 4, number: "3.8.0", deployedAt: null },
];

beforeEach(() => {
  vi.resetAllMocks();
  db.versiones.findMany.mockResolvedValue(versiones);
});

describe("registrarDespliegue", () => {
  test("un reinicio con la misma versión no anota ni fecha nada", async () => {
    db.despliegues.findMany.mockResolvedValue([{ version: "3.7.1" }]);
    expect(await registrarDespliegue({ version: "3.7.1", ahora })).toEqual({ registrado: false, motivo: "ya_registrada" });
    expect(db.despliegues.create).not.toHaveBeenCalled();
    expect(db.versiones.updateMany).not.toHaveBeenCalled();
  });

  test("el primer registro anota la versión sin fechar el pasado", async () => {
    db.despliegues.findMany.mockResolvedValue([]);
    const r = await registrarDespliegue({ version: "3.7.1", ahora });
    expect(r).toMatchObject({ registrado: true, anterior: null, fechadas: [] });
    expect(db.despliegues.create).toHaveBeenCalledWith({ data: { version: "3.7.1", startedAt: ahora, origin: "servidor" } });
    expect(db.versiones.updateMany).not.toHaveBeenCalled();
    expect(db.auditoria.create.mock.calls[0][0].data.detail).toContain("Primer registro");
  });

  test("una versión nueva fecha las que entraron desde la anterior, con el día de Colombia", async () => {
    db.despliegues.findMany.mockResolvedValue([{ version: "3.6.0" }, { version: "3.5.0" }]);
    const r = await registrarDespliegue({ version: "3.7.1", ahora });
    expect(r).toMatchObject({ registrado: true, anterior: "3.6.0", fechadas: ["3.7.0", "3.7.1"], dia: "2026-11-24" });
    expect(db.versiones.updateMany).toHaveBeenCalledWith({
      where: { id: { in: [2, 3] } },
      data: { deployedAt: new Date("2026-11-24T12:00:00.000Z") },
    });
    expect(db.auditoria.create.mock.calls[0][0].data).toMatchObject({ user: "Sistema", action: "REGISTRÓ DESPLIEGUE" });
  });

  test("un número que no es versión no toca la base", async () => {
    expect(await registrarDespliegue({ version: "dev", ahora })).toEqual({ registrado: false, motivo: "version_invalida" });
    expect(db.despliegues.findMany).not.toHaveBeenCalled();
  });
});
