import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MODULOS_IMPORT } from "@/lib/modulos/descriptores";

const BALANCE_ID = 91;
const CLIENTE_ID = 7;
const MODULO_ID = 3;

const mocks = vi.hoisted(() => ({
  authorizePermiso: vi.fn(),
  moduleFindUnique: vi.fn(),
  reconciliationCreate: vi.fn(),
  reconciliationUpdate: vi.fn(),
  reconciliationRowUpdate: vi.fn(),
  reconciliationCommentCreate: vi.fn(),
  clientModuleUpsert: vi.fn(),
  transaction: vi.fn(),
  getCurrentUser: vi.fn(),
  logAudit: vi.fn(),
  createProcessNotification: vi.fn(),
  revalidatePath: vi.fn(),
  transaccionSerializable: vi.fn(),
  cargarContexto: vi.fn(),
  mensajeErrorBD: vi.fn(() => "No fue posible consultar el módulo."),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/prisma", () => ({
  default: {
    module: { findUnique: mocks.moduleFindUnique },
    reconciliation: { create: mocks.reconciliationCreate, update: mocks.reconciliationUpdate },
    reconciliationRow: { update: mocks.reconciliationRowUpdate },
    reconciliationComment: { create: mocks.reconciliationCommentCreate },
    clientModule: { upsert: mocks.clientModuleUpsert },
    $transaction: mocks.transaction,
  },
}));
vi.mock("@/lib/rbac", () => ({ authorizePermiso: mocks.authorizePermiso }));
vi.mock("@/lib/rbac/contexto", () => ({
  clienteDeConciliacion: vi.fn(),
  clienteDeFilaConciliacion: vi.fn(),
}));
vi.mock("@/lib/dal", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/audit", () => ({ logAudit: mocks.logAudit }));
vi.mock("@/lib/notifications", () => ({ createProcessNotification: mocks.createProcessNotification }));
vi.mock("@/lib/errores", () => ({ mensajeErrorBD: mocks.mensajeErrorBD }));
vi.mock("@/lib/concurrency", () => ({ transaccionSerializable: mocks.transaccionSerializable }));
vi.mock("@/lib/balance/prevalidador/servidor", () => ({ cargarContextoPrevalidadorBalance: mocks.cargarContexto }));

import { executeReconciliation } from "./reconciliation";

function formulario(cambios: Record<string, string> = {}) {
  const datos = new FormData();
  for (const [clave, valor] of Object.entries({
    balanceId: String(BALANCE_ID),
    clientId: String(CLIENTE_ID),
    moduleId: String(MODULO_ID),
    ...cambios,
  })) datos.set(clave, valor);
  return datos;
}

describe("executeReconciliation · compatibilidad sin crear cruces", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.authorizePermiso.mockResolvedValue({ ok: true, userId: 12, role: "Staff" });
    mocks.moduleFindUnique.mockResolvedValue({ code: "INV" });
    mocks.mensajeErrorBD.mockReturnValue("No fue posible consultar el módulo.");
  });

  afterEach(() => {
    for (const operacion of [
      mocks.reconciliationCreate,
      mocks.reconciliationUpdate,
      mocks.reconciliationRowUpdate,
      mocks.reconciliationCommentCreate,
      mocks.clientModuleUpsert,
      mocks.transaction,
      mocks.transaccionSerializable,
      mocks.getCurrentUser,
      mocks.cargarContexto,
      mocks.logAudit,
      mocks.createProcessNotification,
      mocks.revalidatePath,
    ]) expect(operacion).not.toHaveBeenCalled();
  });

  it("deniega una llamada directa sin permiso antes de consultar datos", async () => {
    mocks.authorizePermiso.mockResolvedValueOnce({ ok: false, message: "No tienes permisos para esta acción." });

    const resultado = await executeReconciliation(undefined, formulario());

    expect(resultado).toEqual({ ok: false, message: "No tienes permisos para esta acción." });
    expect(mocks.authorizePermiso).toHaveBeenCalledExactlyOnceWith("conciliaciones:ejecutar");
    expect(mocks.moduleFindUnique).not.toHaveBeenCalled();
  });

  it.each(["balanceId", "clientId", "moduleId"])("valida %s antes de consultar el módulo", async (campo) => {
    for (const valor of ["", "0", "-1", "1.5", "1e2", "no-es-un-id", "9007199254740992"]) {
      mocks.authorizePermiso.mockClear();

      const resultado = await executeReconciliation(undefined, formulario({ [campo]: valor }));

      expect(resultado).toEqual({ ok: false, message: "Faltan datos para ejecutar la conciliación." });
      expect(mocks.authorizePermiso).toHaveBeenCalledTimes(1);
      expect(mocks.moduleFindUnique).not.toHaveBeenCalled();
    }
  });

  it("deniega un cliente fuera del alcance de escritura antes de consultar el módulo", async () => {
    mocks.authorizePermiso
      .mockResolvedValueOnce({ ok: true, userId: 12, role: "Staff" })
      .mockResolvedValueOnce({ ok: false, message: "Cliente fuera de alcance." });

    const resultado = await executeReconciliation(undefined, formulario());

    expect(resultado).toEqual({ ok: false, message: "Cliente fuera de alcance." });
    expect(mocks.authorizePermiso).toHaveBeenNthCalledWith(2, "conciliaciones:ejecutar", { clientId: CLIENTE_ID });
    expect(mocks.moduleFindUnique).not.toHaveBeenCalled();
  });

  it("rechaza un módulo inexistente", async () => {
    mocks.moduleFindUnique.mockResolvedValue(null);

    const resultado = await executeReconciliation(undefined, formulario());

    expect(resultado).toEqual({ ok: false, message: "Módulo inexistente." });
  });

  it("rechaza códigos ajenos al catálogo operativo", async () => {
    mocks.moduleFindUnique.mockResolvedValue({ code: "OTRO" });

    const resultado = await executeReconciliation(undefined, formulario());

    expect(resultado).toEqual({ ok: false, message: "El módulo seleccionado no tiene un flujo de conciliación disponible." });
  });

  it.each(Object.values(MODULOS_IMPORT))("orienta $codigo a su módulo real sin ejecutar ni persistir", async (modulo) => {
    mocks.moduleFindUnique.mockResolvedValue({ code: modulo.codigo });

    const resultado = await executeReconciliation(undefined, formulario({ period: "período manipulado", erp: "ERP del navegador" }));

    expect(resultado.ok).toBe(false);
    expect(resultado.message).toContain(modulo.label);
    expect(resultado.message).toContain(`/modulos/${modulo.codigo.toLowerCase()}`);
    expect(resultado.message).toContain("datos reales cargados");
    expect(mocks.authorizePermiso).toHaveBeenNthCalledWith(1, "conciliaciones:ejecutar");
    expect(mocks.authorizePermiso).toHaveBeenNthCalledWith(2, "conciliaciones:ejecutar", { clientId: CLIENTE_ID });
    expect(mocks.moduleFindUnique).toHaveBeenCalledExactlyOnceWith({ where: { id: MODULO_ID }, select: { code: true } });
  });

  it("normaliza el código guardado sin usar una ruta enviada por el formulario", async () => {
    mocks.moduleFindUnique.mockResolvedValue({ code: " ing " });

    const resultado = await executeReconciliation(undefined, formulario({ moduleCode: "INV", redirectTo: "https://example.test" }));

    expect(resultado.message).toContain("/modulos/ing");
    expect(resultado.message).not.toContain("/modulos/inv");
    expect(resultado.message).not.toContain("example.test");
  });

  it("traduce un error de consulta sin intentar crear un cruce alternativo", async () => {
    const error = new Error("Error de conexión");
    mocks.moduleFindUnique.mockRejectedValue(error);

    const resultado = await executeReconciliation(undefined, formulario());

    expect(resultado).toEqual({ ok: false, message: "No fue posible consultar el módulo." });
    expect(mocks.mensajeErrorBD).toHaveBeenCalledWith("executeReconciliation", error);
  });
});
