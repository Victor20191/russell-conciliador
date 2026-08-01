import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrevalidadorVM } from "@/lib/balance/prevalidador/calcular";
import type { RevisionPrevalidadorVM } from "@/lib/balance/prevalidador/servidor";

const BALANCE_ID = 91;
const CLIENTE_ID = 7;
const MODULO_ID = 3;
const PERIODO_INICIO = new Date("2026-07-01T00:00:00.000Z");
const PERIODO_FIN = new Date("2026-07-31T00:00:00.000Z");

const mocks = vi.hoisted(() => {
  const reconciliationCreate = vi.fn();
  const reconciliationUpdate = vi.fn();
  const clientModuleUpsert = vi.fn();
  const tx = {
    reconciliation: {
      create: reconciliationCreate,
      update: reconciliationUpdate,
    },
    clientModule: { upsert: clientModuleUpsert },
  };

  return {
    authorizePermiso: vi.fn(),
    clientFindUnique: vi.fn(),
    moduleFindUnique: vi.fn(),
    getCurrentUser: vi.fn(),
    logAudit: vi.fn(),
    createProcessNotification: vi.fn(),
    revalidatePath: vi.fn(),
    redirect: vi.fn((destino: string) => {
      throw new Error(`REDIRECT:${destino}`);
    }),
    cargarContexto: vi.fn(),
    tomarCandado: vi.fn(),
    reconciliationCreate,
    reconciliationUpdate,
    clientModuleUpsert,
    tx,
    transaccionSerializable: vi.fn(async (callback: (cliente: typeof tx) => Promise<unknown>) => callback(tx)),
  };
});

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/prisma", () => ({
  default: {
    client: { findUnique: mocks.clientFindUnique },
    module: { findUnique: mocks.moduleFindUnique },
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
vi.mock("@/lib/errores", () => ({
  mensajeErrorBD: (_contexto: string, error: unknown) => String(error),
}));
vi.mock("@/lib/concurrency", () => ({
  tomarCandadoTransaccion: mocks.tomarCandado,
  transaccionSerializable: mocks.transaccionSerializable,
}));
vi.mock("@/lib/balance/prevalidador/servidor", () => ({
  cargarContextoPrevalidadorBalance: mocks.cargarContexto,
}));
vi.mock("@/lib/fecha-hora", () => ({ anioColombia: () => 2026 }));

import { executeReconciliation } from "./reconciliation";

type ContextoPrueba = {
  balance: {
    id: number;
    clienteId: number;
    nombreCliente: string;
    periodo: string;
    periodoInicio: Date;
    periodoFin: Date;
    version: string;
    esOficial: boolean;
    estaCongelado: boolean;
  };
  filas: [];
  catalogo: [];
  overrides: [];
  prevalidador: PrevalidadorVM;
  huella: string;
  revision: RevisionPrevalidadorVM;
};

function contextoListo(): ContextoPrueba {
  return {
    balance: {
      id: BALANCE_ID,
      clienteId: CLIENTE_ID,
      nombreCliente: "Cliente prueba",
      periodo: "Julio 2026",
      periodoInicio: PERIODO_INICIO,
      periodoFin: PERIODO_FIN,
      version: "v3",
      esOficial: true,
      estaCongelado: true,
    },
    filas: [],
    catalogo: [],
    overrides: [],
    prevalidador: {
      estado: "listo",
      modulos: [
        {
          codigo: "INV",
          nombre: "Inventarios",
          filas: [],
          totalRussell: 0,
          totalCliente: 0,
          diferenciaTotal: 0,
          coincide: true,
        },
      ],
      anidamientos: [],
      opcionesCliente: [],
      filasConDiferencia: 0,
      modulosConDiferencia: 0,
    },
    huella: "a".repeat(64),
    revision: {
      estado: "aprobada",
      vigente: true,
      justificacion: "Revisión completa",
      actor: "Revisor",
      creadoEn: "2026-08-01T12:00:00.000Z",
      huella: "a".repeat(64),
      instantaneaDisponible: true,
    },
  };
}

function formulario(valores: Partial<Record<"balanceId" | "clientId" | "moduleId", string>> = {}): FormData {
  const formData = new FormData();
  formData.set("balanceId", valores.balanceId ?? String(BALANCE_ID));
  formData.set("clientId", valores.clientId ?? String(CLIENTE_ID));
  formData.set("moduleId", valores.moduleId ?? String(MODULO_ID));
  // Campos manipulados que la acción no debe usar como fuente de verdad.
  formData.set("period", "Diciembre 1999");
  formData.set("cutoff", "1999-12-31");
  return formData;
}

describe("executeReconciliation · compuerta del prevalidador", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authorizePermiso.mockResolvedValue({ ok: true });
    mocks.clientFindUnique.mockResolvedValue({
      id: CLIENTE_ID,
      name: "Cliente prueba",
      erpId: 2,
      erp: { name: "SIGO" },
    });
    mocks.moduleFindUnique.mockResolvedValue({ id: MODULO_ID, code: "INV", name: "Inventarios" });
    mocks.getCurrentUser.mockResolvedValue({ id: 12, name: "Auditor", initials: "AU" });
    mocks.cargarContexto.mockResolvedValue(contextoListo());
    mocks.reconciliationCreate.mockResolvedValue({ id: 44 });
    mocks.reconciliationUpdate.mockResolvedValue({ id: 44 });
    mocks.clientModuleUpsert.mockResolvedValue({});
    mocks.transaccionSerializable.mockImplementation(
      async (callback: (cliente: typeof mocks.tx) => Promise<unknown>) => callback(mocks.tx),
    );
  });

  it("falla antes de consultar la BD cuando falta balanceId", async () => {
    const resultado = await executeReconciliation(undefined, formulario({ balanceId: "" }));

    expect(resultado).toEqual({ ok: false, message: "Faltan datos para ejecutar la conciliación." });
    expect(mocks.authorizePermiso).toHaveBeenCalledTimes(1);
    expect(mocks.clientFindUnique).not.toHaveBeenCalled();
    expect(mocks.cargarContexto).not.toHaveBeenCalled();
  });

  it("falla cerrado cuando el alcance del cliente es denegado", async () => {
    mocks.authorizePermiso
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: false, message: "Cliente fuera de alcance." });

    const resultado = await executeReconciliation(undefined, formulario());

    expect(mocks.authorizePermiso).toHaveBeenNthCalledWith(2, "conciliaciones:ejecutar", { clientId: CLIENTE_ID });
    expect(resultado).toEqual({ ok: false, message: "Cliente fuera de alcance." });
    expect(mocks.clientFindUnique).not.toHaveBeenCalled();
    expect(mocks.transaccionSerializable).not.toHaveBeenCalled();
  });

  it("rechaza un balance que pertenece a otro cliente", async () => {
    const contexto = contextoListo();
    contexto.balance.clienteId = 99;
    mocks.cargarContexto.mockResolvedValue(contexto);

    const resultado = await executeReconciliation(undefined, formulario());

    expect(resultado).toEqual({
      ok: false,
      message: "El balance seleccionado no pertenece al cliente de la conciliación.",
    });
    expect(mocks.transaccionSerializable).not.toHaveBeenCalled();
    expect(mocks.reconciliationCreate).not.toHaveBeenCalled();
  });

  it.each([
    [false, true],
    [true, false],
  ])("rechaza un balance no oficial o no congelado (%s/%s)", async (esOficial, estaCongelado) => {
    const contexto = contextoListo();
    contexto.balance.esOficial = esOficial;
    contexto.balance.estaCongelado = estaCongelado;
    mocks.cargarContexto.mockResolvedValue(contexto);

    const resultado = await executeReconciliation(undefined, formulario());

    expect(resultado).toEqual({
      ok: false,
      message: "La conciliación exige un balance oficial y congelado del período exacto.",
    });
    expect(mocks.reconciliationCreate).not.toHaveBeenCalled();
  });

  it("rechaza un prevalidador bloqueado por cuentas sin homologar", async () => {
    const contexto = contextoListo();
    contexto.prevalidador = { estado: "bloqueado", sinHomologar: { cuentas: 2, monto: 850000 } };
    mocks.cargarContexto.mockResolvedValue(contexto);

    const resultado = await executeReconciliation(undefined, formulario());

    expect(resultado).toEqual({
      ok: false,
      message: "El prevalidador está bloqueado: quedan 2 cuenta(s) sin homologar.",
    });
    expect(mocks.transaccionSerializable).not.toHaveBeenCalled();
  });

  it("rechaza un módulo que no está cubierto por el catálogo vigente", async () => {
    const contexto = contextoListo();
    if (contexto.prevalidador.estado !== "listo") throw new Error("Contexto de prueba inválido");
    contexto.prevalidador.modulos[0] = { ...contexto.prevalidador.modulos[0], codigo: "CXP" };
    mocks.cargarContexto.mockResolvedValue(contexto);

    const resultado = await executeReconciliation(undefined, formulario());

    expect(resultado).toEqual({
      ok: false,
      message: "El módulo seleccionado no está cubierto por el catálogo vigente del prevalidador.",
    });
    expect(mocks.reconciliationCreate).not.toHaveBeenCalled();
  });

  it.each([
    ["pendiente", "El balance todavía no tiene una aprobación vigente del prevalidador."],
    ["revocada", "La aprobación del prevalidador fue revocada. Debe aprobarse nuevamente antes de conciliar."],
    ["desactualizada", "La aprobación del prevalidador quedó desactualizada. Revísalo y apruébalo nuevamente antes de conciliar."],
  ] as const)("rechaza una aprobación %s", async (estado, mensaje) => {
    const contexto = contextoListo();
    contexto.revision = { ...contexto.revision, estado, vigente: false };
    mocks.cargarContexto.mockResolvedValue(contexto);

    const resultado = await executeReconciliation(undefined, formulario());

    expect(resultado).toEqual({ ok: false, message: mensaje });
    expect(mocks.reconciliationCreate).not.toHaveBeenCalled();
  });

  it("revalida la compuerta dentro de la transacción después de tomar el candado", async () => {
    const bloqueado = contextoListo();
    bloqueado.revision = { ...bloqueado.revision, estado: "desactualizada", vigente: false };
    mocks.cargarContexto
      .mockResolvedValueOnce(contextoListo())
      .mockResolvedValueOnce(bloqueado);

    const resultado = await executeReconciliation(undefined, formulario());

    expect(mocks.tomarCandado).toHaveBeenCalledWith(mocks.tx, "balance-oficial:7:Julio 2026");
    expect(resultado).toEqual({
      ok: false,
      message: "La aprobación del prevalidador quedó desactualizada. Revísalo y apruébalo nuevamente antes de conciliar.",
    });
    expect(mocks.reconciliationCreate).not.toHaveBeenCalled();
  });

  it("persiste el balance aprobado y toma período/corte del servidor, no del formulario", async () => {
    const ejecucion = executeReconciliation(undefined, formulario());

    await expect(ejecucion).rejects.toThrow("REDIRECT:/conciliacion/resultados/44?ejecutada=1");
    expect(mocks.cargarContexto).toHaveBeenNthCalledWith(1, BALANCE_ID);
    expect(mocks.cargarContexto).toHaveBeenNthCalledWith(2, BALANCE_ID, mocks.tx);
    expect(mocks.reconciliationCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        clientId: CLIENTE_ID,
        module: "Inventarios",
        period: "Julio 2026",
        cutoff: PERIODO_FIN,
        balancePrevalidadoId: BALANCE_ID,
      }),
      select: { id: true },
    });
    expect(mocks.reconciliationUpdate).toHaveBeenCalledWith({
      where: { id: 44 },
      data: { code: "REC-2026-5044" },
    });
    expect(mocks.clientModuleUpsert).toHaveBeenCalled();
    expect(mocks.logAudit).toHaveBeenCalled();
    expect(mocks.createProcessNotification).toHaveBeenCalled();
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/", "layout");
  });
});
