import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authorizePermiso: vi.fn(),
  logAudit: vi.fn(),
  revalidatePath: vi.fn(),
  asignacionesFindMany: vi.fn(),
  erpFindMany: vi.fn(),
  tx: {
    client: { findUnique: vi.fn(), update: vi.fn() },
    erpProcess: { findUnique: vi.fn() },
    erp: { findUnique: vi.fn(), create: vi.fn() },
    clientErpProcess: { findUnique: vi.fn(), create: vi.fn() },
  },
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/rbac", () => ({ authorizePermiso: mocks.authorizePermiso }));
vi.mock("@/lib/dal", () => ({ getCurrentUser: vi.fn(async () => ({ id: 4, name: "Analista" })) }));
vi.mock("@/lib/audit", () => ({ logAudit: mocks.logAudit }));
vi.mock("@/lib/errores", () => ({ mensajeErrorBD: (_c: string, e: unknown) => String(e) }));
vi.mock("@/lib/prisma", () => ({
  default: {
    clientErpProcess: { findMany: mocks.asignacionesFindMany },
    erp: { findMany: mocks.erpFindMany },
    $transaction: async (fn: (tx: typeof mocks.tx) => unknown) => fn(mocks.tx),
  },
}));

import { confirmarAplicativoCargaModulo, listarAplicativosCargaModulo } from "./aplicativos-cliente";

describe("aplicativos del cliente en la carga", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authorizePermiso.mockResolvedValue({ ok: true });
    mocks.tx.client.findUnique.mockResolvedValue({ name: "Laboratorios Mineralin", erpId: null });
    mocks.tx.erpProcess.findUnique.mockResolvedValue({ id: 1, active: true });
    mocks.tx.clientErpProcess.findUnique.mockResolvedValue(null);
  });

  it("Cuentas por pagar lista los aplicativos de Contabilidad del cliente y el catálogo", async () => {
    mocks.asignacionesFindMany.mockResolvedValue([{ erp: { id: 2, code: "SIESA", name: "SIESA" } }]);
    mocks.erpFindMany.mockResolvedValue([
      { id: 2, code: "SIESA", name: "SIESA" },
      { id: 3, code: "SAP", name: "SAP" },
      { id: 9, code: "MANUAL", name: "Archivo manual" },
    ]);

    const r = await listarAplicativosCargaModulo(17, "cxp");

    expect(r).toMatchObject({
      ok: true,
      campoNombre: "Contabilidad",
      delCliente: [{ id: 2, nombre: "SIESA", manual: false }],
      catalogo: [{ id: 2, manual: false }, { id: 3, manual: false }, { id: 9, nombre: "Archivo manual", manual: true }],
    });
    expect(mocks.asignacionesFindMany.mock.calls[0][0].where).toEqual({ clientId: 17, process: { code: "CONT" } });
    expect(mocks.authorizePermiso).toHaveBeenCalledWith("modulos_datos:crear", { clientId: 17, modo: "lectura" });
  });

  it("agrega a la ficha el aplicativo elegido que el cliente no tenía: queda usando dos", async () => {
    mocks.tx.erp.findUnique.mockResolvedValue({ id: 3, code: "SAP", name: "SAP", active: true });

    const r = await confirmarAplicativoCargaModulo({ clienteId: 17, moduloCodigo: "NOM", erpId: 3 });

    expect(r).toEqual({ ok: true, aplicativo: { id: 3, nombre: "SAP", manual: false }, agregado: true, creado: false });
    expect(mocks.tx.erpProcess.findUnique).toHaveBeenCalledWith({ where: { code: "NOM" }, select: { id: true, active: true } });
    expect(mocks.tx.clientErpProcess.create).toHaveBeenCalledWith({
      data: { clientId: 17, processId: 1, erpId: 3, status: "confirmado", source: "carga" },
    });
    // Nómina no toca el ERP «único» legado, que es el de Contabilidad.
    expect(mocks.tx.client.update).not.toHaveBeenCalled();
    expect(mocks.logAudit).toHaveBeenCalledOnce();
    expect(mocks.authorizePermiso).toHaveBeenNthCalledWith(2, "modulos_datos:crear", { clientId: 17 });
  });

  it("«Otro» crea el aplicativo en el catálogo con su código canónico y, en Contabilidad, llena el ERP legado vacío", async () => {
    mocks.tx.erp.findUnique.mockResolvedValue(null);
    mocks.tx.erp.create.mockResolvedValue({ id: 12, code: "WORLDOFFICE", name: "World Office" });

    const r = await confirmarAplicativoCargaModulo({ clienteId: 17, moduloCodigo: "CAR", erpNuevo: "world office" });

    expect(r).toMatchObject({ ok: true, creado: true, agregado: true, aplicativo: { id: 12, nombre: "World Office" } });
    expect(mocks.tx.erp.create.mock.calls[0][0].data).toEqual({ code: "WORLDOFFICE", name: "World Office" });
    expect(mocks.tx.client.update).toHaveBeenCalledWith({ where: { id: 17 }, data: { erpId: 12 } });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/config/maestros");
  });

  it("un aplicativo que el cliente ya tiene no se duplica ni se audita", async () => {
    mocks.tx.erp.findUnique.mockResolvedValue({ id: 2, code: "SIESA", name: "SIESA", active: true });
    mocks.tx.clientErpProcess.findUnique.mockResolvedValue({ id: 50 });

    const r = await confirmarAplicativoCargaModulo({ clienteId: 17, moduloCodigo: "INV", erpId: 2 });

    expect(r).toMatchObject({ ok: true, agregado: false, creado: false });
    expect(mocks.tx.clientErpProcess.create).not.toHaveBeenCalled();
    expect(mocks.logAudit).not.toHaveBeenCalled();
  });

  it("rechaza un aplicativo inactivo y el alta sin alcance de escritura", async () => {
    mocks.tx.erp.findUnique.mockResolvedValue({ id: 5, code: "ZEUS", name: "Zeus", active: false });
    expect(await confirmarAplicativoCargaModulo({ clienteId: 17, moduloCodigo: "AFI", erpId: 5 }))
      .toEqual({ ok: false, message: "Elige un aplicativo activo del catálogo." });

    mocks.authorizePermiso.mockResolvedValueOnce({ ok: true }).mockResolvedValueOnce({ ok: false, message: "Sin alcance." });
    expect(await confirmarAplicativoCargaModulo({ clienteId: 17, moduloCodigo: "AFI", erpId: 5 }))
      .toEqual({ ok: false, message: "Sin alcance." });
    expect(await confirmarAplicativoCargaModulo({ clienteId: 17, moduloCodigo: "AFI" }))
      .toEqual({ ok: false, message: "Elige un aplicativo o escribe su nombre." });
  });
});
