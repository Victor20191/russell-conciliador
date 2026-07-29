import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SpecCarga } from "@/lib/balance/extraccion/esquema";

const mocks = vi.hoisted(() => ({
  authorizePermiso: vi.fn(),
  getCurrentUser: vi.fn(),
  logAudit: vi.fn(),
  revalidatePath: vi.fn(),
  findUnique: vi.fn(),
  updateMany: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
}));

vi.mock("@/lib/prisma", () => ({
  default: {
    perfilCargaBalance: {
      findUnique: mocks.findUnique,
      updateMany: mocks.updateMany,
    },
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
  mensajeErrorBD: (_contexto: string, error: unknown) => String(error),
}));

import { actualizarPerfilCarga } from "./perfiles-carga";

const ACTUALIZADO_EN = "2026-07-29T15:00:00.000Z";

const ESTRUCTURA: SpecCarga = {
  hoja: "Balance",
  filaEncabezado: 4,
  primeraFilaDatos: 5,
  columnas: {
    codigo: 1,
    codigoFragmentos: [],
    nombre: 2,
    saldoInicial: 3,
    debitos: 4,
    creditos: 5,
    saldoFinal: 6,
    saldoFinalDebito: 0,
    saldoFinalCredito: 0,
    tercero: 7,
  },
  signoCredito: "magnitud",
  reglaDetalle: { tipo: "movimiento", columna: null, valor: null },
  agregarPorTercero: true,
};

describe("actualizarPerfilCarga", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authorizePermiso.mockResolvedValue({ ok: true });
    mocks.getCurrentUser.mockResolvedValue({ id: 9, name: "Analista" });
    mocks.findUnique.mockResolvedValue({
      clienteId: 23,
      huella: "abc123",
      hoja: "Anterior",
      actualizadoEn: new Date(ACTUALIZADO_EN),
    });
    mocks.updateMany.mockResolvedValue({ count: 1 });
  });

  it("falla cerrado antes de consultar datos cuando falta el permiso", async () => {
    mocks.authorizePermiso.mockResolvedValueOnce({ ok: false, message: "Sin permiso." });

    const resultado = await actualizarPerfilCarga({
      id: 4,
      actualizadoEn: ACTUALIZADO_EN,
      estructura: ESTRUCTURA,
    });

    expect(resultado).toEqual({ ok: false, message: "Sin permiso." });
    expect(mocks.findUnique).not.toHaveBeenCalled();
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it("revalida el alcance del cliente antes de escribir", async () => {
    mocks.authorizePermiso
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: false, message: "Cliente fuera de alcance." });

    const resultado = await actualizarPerfilCarga({
      id: 4,
      actualizadoEn: ACTUALIZADO_EN,
      estructura: ESTRUCTURA,
    });

    expect(mocks.authorizePermiso).toHaveBeenNthCalledWith(2, "balance:crear", { clientId: 23 });
    expect(resultado).toEqual({ ok: false, message: "Cliente fuera de alcance." });
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it("guarda todos los campos, conserva la regla movimiento, audita y revalida", async () => {
    const resultado = await actualizarPerfilCarga({
      id: 4,
      actualizadoEn: ACTUALIZADO_EN,
      estructura: { ...ESTRUCTURA, hoja: "  Balance ajustado  " },
    });

    expect(resultado.ok).toBe(true);
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: {
        id: 4,
        clienteId: 23,
        actualizadoEn: new Date(ACTUALIZADO_EN),
      },
      data: expect.objectContaining({
        hoja: "Balance ajustado",
        filaEncabezado: 4,
        primeraFilaDatos: 5,
        colCodigo: 1,
        colNombre: 2,
        colSaldoInicial: 3,
        colDebitos: 4,
        colCreditos: 5,
        colSaldoFinal: 6,
        colSaldoFinalDebito: 0,
        colSaldoFinalCredito: 0,
        colTercero: 7,
        signoCredito: "magnitud",
        reglaDetalleTipo: "movimiento",
        reglaDetalleColumna: null,
        reglaDetalleValor: null,
        agregarPorTercero: true,
        origen: "manual",
      }),
    });
    expect(mocks.logAudit).toHaveBeenCalledWith(expect.objectContaining({
      action: "EDITÓ PERFIL de carga de balance",
      clientId: 23,
      user: "Analista",
    }));
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/config/clientes");
  });

  it("no pisa una edición concurrente ni registra una auditoría falsa", async () => {
    mocks.updateMany.mockResolvedValue({ count: 0 });

    const resultado = await actualizarPerfilCarga({
      id: 4,
      actualizadoEn: ACTUALIZADO_EN,
      estructura: ESTRUCTURA,
    });

    expect(resultado.ok).toBe(false);
    expect(resultado.message).toContain("cambió mientras");
    expect(mocks.logAudit).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});
