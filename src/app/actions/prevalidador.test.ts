import { beforeEach, describe, expect, it, vi } from "vitest";

const HUELLA = "a".repeat(64);

const VM_LISTO = {
  estado: "listo" as const,
  modulos: [],
  anidamientos: [],
  opcionesCliente: [],
  filasConDiferencia: 0,
  modulosConDiferencia: 0,
};

const REVISION_PENDIENTE = {
  estado: "pendiente" as const,
  vigente: false,
  justificacion: null,
  actor: null,
  creadoEn: null,
  huella: null,
  instantaneaDisponible: false,
};

const mocks = vi.hoisted(() => {
  const balanceFindUnique = vi.fn();
  const txBalanceFindUnique = vi.fn();
  const catalogoFindUnique = vi.fn();
  const catalogoFindMany = vi.fn();
  const detalleCount = vi.fn();
  const overrideFindUnique = vi.fn();
  const overrideFindMany = vi.fn();
  const overrideUpsert = vi.fn();
  const overrideDeleteMany = vi.fn();
  const revisionCreate = vi.fn();
  const revisionUpdate = vi.fn();
  const revisionDelete = vi.fn();
  const revisionDeleteMany = vi.fn();

  const tx = {
    balancePruebaEncabezado: { findUnique: txBalanceFindUnique },
    balancePruebaDetalle: { count: detalleCount },
    prevalidadorCuenta: { findUnique: catalogoFindUnique, findMany: catalogoFindMany },
    prevalidadorCuentaBalance: {
      findUnique: overrideFindUnique,
      findMany: overrideFindMany,
      upsert: overrideUpsert,
      deleteMany: overrideDeleteMany,
    },
    prevalidadorRevisionBalance: {
      create: revisionCreate,
      update: revisionUpdate,
      delete: revisionDelete,
      deleteMany: revisionDeleteMany,
    },
  };

  return {
    tx,
    balanceFindUnique,
    txBalanceFindUnique,
    catalogoFindUnique,
    catalogoFindMany,
    detalleCount,
    overrideFindUnique,
    overrideFindMany,
    overrideUpsert,
    overrideDeleteMany,
    revisionCreate,
    revisionUpdate,
    revisionDelete,
    revisionDeleteMany,
    authorizePermiso: vi.fn(),
    getCurrentUser: vi.fn(),
    logAudit: vi.fn(),
    revalidatePath: vi.fn(),
    updateTag: vi.fn(),
    transaccionSerializable: vi.fn(),
    tomarCandadoTransaccion: vi.fn(),
    cargarContextoPrevalidadorBalance: vi.fn(),
  };
});

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
  updateTag: mocks.updateTag,
}));

vi.mock("@/lib/prisma", () => ({
  default: {
    balancePruebaEncabezado: { findUnique: mocks.balanceFindUnique },
  },
}));

vi.mock("@/lib/rbac", () => ({
  authorizePermiso: mocks.authorizePermiso,
}));

vi.mock("@/lib/dal", () => ({
  getCurrentUser: mocks.getCurrentUser,
}));

vi.mock("@/lib/audit", () => ({
  logAudit: mocks.logAudit,
}));

vi.mock("@/lib/errores", () => ({
  mensajeErrorBD: (contexto: string, error: unknown) => `${contexto}: ${String(error)}`,
}));

vi.mock("@/lib/concurrency", () => ({
  transaccionSerializable: mocks.transaccionSerializable,
  tomarCandadoTransaccion: mocks.tomarCandadoTransaccion,
}));

vi.mock("@/lib/parametros/prevalidador", () => ({
  MODULOS_PREVALIDADOR_APROBADOS: new Set(["ING", "CAR", "INV", "AFI", "CXP", "NOM"]),
  PREVALIDADOR_CACHE_TAG: "prevalidador-catalogo",
}));

vi.mock("@/lib/balance/prevalidador/catalogo", () => ({
  normalizarPrefijo: (valor: string | null | undefined) => String(valor ?? "").replace(/\D/g, ""),
}));

vi.mock("@/lib/balance/prevalidador/servidor", () => ({
  cargarContextoPrevalidadorBalance: mocks.cargarContextoPrevalidadorBalance,
}));

import {
  aprobarPrevalidadorBalance,
  guardarCuentaClientePrevalidador,
  revocarAprobacionPrevalidadorBalance,
} from "./prevalidador";

function formOverride(cuentaCliente = "17") {
  const form = new FormData();
  form.set("balanceId", "7");
  form.set("catalogoId", "11");
  form.set("cuentaCliente", cuentaCliente);
  return form;
}

function formRevision(justificacion = "Revisión contable completada") {
  const form = new FormData();
  form.set("balanceId", "7");
  form.set("justificacion", justificacion);
  return form;
}

function contexto(prevalidador: unknown = VM_LISTO, revision: unknown = REVISION_PENDIENTE) {
  return {
    prevalidador,
    revision,
    huella: HUELLA,
  };
}

describe("Server Actions del prevalidador", () => {
  beforeEach(() => {
    vi.resetAllMocks();

    mocks.authorizePermiso.mockResolvedValue({ ok: true });
    mocks.getCurrentUser.mockResolvedValue({ id: 9, name: "Ana Auditora" });
    mocks.balanceFindUnique.mockResolvedValue({ clienteId: 23 });
    mocks.txBalanceFindUnique.mockResolvedValue({
      id: 7,
      clienteId: 23,
      nombreCliente: "Cliente Prueba",
      periodo: "Enero a julio 2026",
      version: "v3",
      estaCongelado: false,
    });
    mocks.catalogoFindUnique.mockResolvedValue({
      cuentaRussell: "15",
      moduloId: 4,
      activa: true,
      module: { name: "Activos fijos" },
    });
    mocks.catalogoFindMany.mockResolvedValue([]);
    mocks.detalleCount.mockResolvedValue(1);
    mocks.overrideFindUnique.mockResolvedValue({ cuentaCliente: "16" });
    mocks.overrideFindMany.mockResolvedValue([]);
    mocks.overrideUpsert.mockResolvedValue({});
    mocks.overrideDeleteMany.mockResolvedValue({ count: 1 });
    mocks.revisionCreate.mockResolvedValue({ id: 101 });
    mocks.tomarCandadoTransaccion.mockResolvedValue(undefined);
    mocks.cargarContextoPrevalidadorBalance.mockResolvedValue(contexto());
    mocks.transaccionSerializable.mockImplementation(
      async (operacion: (tx: typeof mocks.tx) => Promise<unknown>) => operacion(mocks.tx),
    );
  });

  it("falla en el primer gate RBAC sin consultar la base de datos", async () => {
    mocks.authorizePermiso.mockResolvedValueOnce({ ok: false, message: "Sin permiso." });

    const resultado = await guardarCuentaClientePrevalidador(formOverride());

    expect(resultado).toEqual({ ok: false, message: "Sin permiso." });
    expect(mocks.authorizePermiso).toHaveBeenCalledWith("balance:crear");
    expect(mocks.balanceFindUnique).not.toHaveBeenCalled();
    expect(mocks.transaccionSerializable).not.toHaveBeenCalled();
    expect(mocks.getCurrentUser).not.toHaveBeenCalled();
  });

  it("aplica el segundo gate sobre el cliente antes de abrir la transacción", async () => {
    mocks.authorizePermiso
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: false, message: "Cliente fuera de alcance." });

    const resultado = await guardarCuentaClientePrevalidador(formOverride());

    expect(mocks.balanceFindUnique).toHaveBeenCalledWith({
      where: { id: 7 },
      select: { clienteId: true },
    });
    expect(mocks.authorizePermiso).toHaveBeenNthCalledWith(2, "balance:crear", { clientId: 23 });
    expect(resultado).toEqual({ ok: false, message: "Cliente fuera de alcance." });
    expect(mocks.transaccionSerializable).not.toHaveBeenCalled();
    expect(mocks.getCurrentUser).not.toHaveBeenCalled();
  });

  it("guarda el override por balance y audita los valores anterior y nuevo", async () => {
    const resultado = await guardarCuentaClientePrevalidador(formOverride("17"));

    expect(resultado).toEqual({
      ok: true,
      message: "La cuenta 15 se comparará contra la 17 en este balance.",
    });
    expect(mocks.tomarCandadoTransaccion).toHaveBeenNthCalledWith(1, mocks.tx, "prevalidador-catalogo");
    expect(mocks.tomarCandadoTransaccion).toHaveBeenNthCalledWith(
      2,
      mocks.tx,
      "balance-oficial:23:Enero a julio 2026",
    );
    expect(mocks.overrideFindUnique).toHaveBeenCalledWith({
      where: { balanceId_catalogoId: { balanceId: 7, catalogoId: 11 } },
      select: { cuentaCliente: true },
    });
    expect(mocks.overrideUpsert).toHaveBeenCalledWith({
      where: { balanceId_catalogoId: { balanceId: 7, catalogoId: 11 } },
      create: {
        balanceId: 7,
        catalogoId: 11,
        cuentaCliente: "17",
        actualizadoPor: "Ana Auditora",
      },
      update: { cuentaCliente: "17", actualizadoPor: "Ana Auditora" },
    });
    expect(mocks.logAudit).toHaveBeenCalledWith(expect.objectContaining({
      user: "Ana Auditora",
      action: "AJUSTÓ CUENTA DEL PREVALIDADOR",
      clientId: 23,
      detail: expect.stringContaining("anterior 16 · nuevo 17"),
    }));
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/balance/7");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/balance", "layout");
  });

  it("rechaza cualquier cambio sobre un balance congelado", async () => {
    mocks.txBalanceFindUnique.mockResolvedValue({
      id: 7,
      clienteId: 23,
      nombreCliente: "Cliente Prueba",
      periodo: "Enero a julio 2026",
      version: "v3",
      estaCongelado: true,
    });

    const resultado = await guardarCuentaClientePrevalidador(formOverride());

    expect(resultado).toEqual({
      ok: false,
      message: "El balance está congelado: no se puede cambiar su prevalidador.",
    });
    expect(mocks.tomarCandadoTransaccion).toHaveBeenCalledTimes(2);
    expect(mocks.catalogoFindUnique).not.toHaveBeenCalled();
    expect(mocks.overrideUpsert).not.toHaveBeenCalled();
  });

  it("rechaza una cuenta del cliente con longitud distinta a la regla Russell", async () => {
    mocks.catalogoFindUnique.mockResolvedValue({
      cuentaRussell: "13",
      activa: true,
      module: { name: "Cartera" },
    });

    const resultado = await guardarCuentaClientePrevalidador(formOverride("1330"));

    expect(resultado).toEqual({
      ok: false,
      message: "La cuenta del cliente debe tener 2 dígitos, igual que la cuenta 13 de Russell.",
    });
    expect(mocks.detalleCount).not.toHaveBeenCalled();
    expect(mocks.overrideUpsert).not.toHaveBeenCalled();
  });

  it("rechaza un prefijo del cliente inexistente en el balance", async () => {
    mocks.catalogoFindUnique.mockResolvedValue({
      cuentaRussell: "13",
      activa: true,
      module: { name: "Cartera" },
    });
    mocks.detalleCount.mockResolvedValue(0);

    const resultado = await guardarCuentaClientePrevalidador(formOverride("17"));

    expect(mocks.detalleCount).toHaveBeenCalledWith({
      where: { encabezadoId: 7, cuenta8: { startsWith: "17" } },
    });
    expect(resultado).toEqual({
      ok: false,
      message: "La cuenta 17 no existe en este balance.",
    });
    expect(mocks.overrideFindUnique).not.toHaveBeenCalled();
    expect(mocks.overrideUpsert).not.toHaveBeenCalled();
  });

  it("rechaza un override que solapa otra cuenta cliente del mismo módulo", async () => {
    mocks.catalogoFindUnique.mockResolvedValue({
      cuentaRussell: "1330",
      moduloId: 5,
      activa: true,
      module: { name: "Cuentas por pagar" },
    });
    mocks.catalogoFindMany.mockResolvedValue([{ id: 22, cuentaRussell: "22" }]);

    const resultado = await guardarCuentaClientePrevalidador(formOverride("2205"));

    expect(resultado).toEqual({
      ok: false,
      message: "La cuenta 2205 se solapa con 22 dentro de Cuentas por pagar; el total del módulo quedaría duplicado.",
    });
    expect(mocks.overrideUpsert).not.toHaveBeenCalled();
  });

  it.each([
    {
      nombre: "sin catálogo",
      prevalidador: { estado: "sin_catalogo" },
      mensaje: "No hay cuentas activas configuradas para aprobar el prevalidador.",
    },
    {
      nombre: "con cuentas sin homologar",
      prevalidador: { estado: "bloqueado", sinHomologar: { cuentas: 3, monto: 1500 } },
      mensaje: "Quedan 3 cuenta(s) sin homologar.",
    },
    {
      nombre: "no disponible",
      prevalidador: { estado: "no_disponible", mensaje: "Lectura estricta fallida." },
      mensaje: "Lectura estricta fallida.",
    },
  ])("no aprueba un prevalidador $nombre", async ({ prevalidador, mensaje }) => {
    mocks.cargarContextoPrevalidadorBalance.mockResolvedValue(contexto(prevalidador));

    const resultado = await aprobarPrevalidadorBalance({}, formRevision());

    expect(resultado).toEqual({ ok: false, message: mensaje });
    expect(mocks.revisionCreate).not.toHaveBeenCalled();
    expect(mocks.logAudit).not.toHaveBeenCalled();
  });

  it("aprueba únicamente el VM listo y persiste su instantánea con la huella", async () => {
    const resultado = await aprobarPrevalidadorBalance(
      {},
      formRevision("Diferencias revisadas y justificadas"),
    );

    expect(resultado).toEqual({ ok: true, message: "Prevalidador aprobado." });
    expect(mocks.cargarContextoPrevalidadorBalance).toHaveBeenCalledWith(7, mocks.tx);
    expect(mocks.revisionCreate).toHaveBeenCalledWith({
      data: {
        balanceId: 7,
        estado: "aprobada",
        justificacion: "Diferencias revisadas y justificadas",
        huella: HUELLA,
        instantanea: VM_LISTO,
        actor: "Ana Auditora",
        actorId: 9,
      },
    });
    expect(mocks.logAudit).toHaveBeenCalledWith(expect.objectContaining({
      user: "Ana Auditora",
      action: "APROBÓ PREVALIDADOR",
      clientId: 23,
      detail: expect.stringContaining(`huella ${HUELLA}`),
    }));
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/balance/7");
  });

  it("revoca de forma append-only creando una nueva revisión", async () => {
    mocks.cargarContextoPrevalidadorBalance.mockResolvedValue(
      contexto(VM_LISTO, {
        estado: "aprobada",
        vigente: true,
        justificacion: "Aprobación previa",
        actor: "Ana Auditora",
        creadoEn: "2026-08-01T15:00:00.000Z",
        huella: HUELLA,
        instantaneaDisponible: true,
      }),
    );

    const resultado = await revocarAprobacionPrevalidadorBalance(
      {},
      formRevision("Se detectó una reclasificación pendiente"),
    );

    expect(resultado).toEqual({
      ok: true,
      message: "Aprobación del prevalidador revocada.",
    });
    expect(mocks.revisionCreate).toHaveBeenCalledWith({
      data: {
        balanceId: 7,
        estado: "revocada",
        justificacion: "Se detectó una reclasificación pendiente",
        huella: HUELLA,
        instantanea: VM_LISTO,
        actor: "Ana Auditora",
        actorId: 9,
      },
    });
    expect(mocks.revisionUpdate).not.toHaveBeenCalled();
    expect(mocks.revisionDelete).not.toHaveBeenCalled();
    expect(mocks.revisionDeleteMany).not.toHaveBeenCalled();
    expect(mocks.logAudit).toHaveBeenCalledWith(expect.objectContaining({
      action: "REVOCÓ APROBACIÓN DEL PREVALIDADOR",
      detail: expect.stringContaining("justificación Se detectó una reclasificación pendiente"),
    }));
  });
});
