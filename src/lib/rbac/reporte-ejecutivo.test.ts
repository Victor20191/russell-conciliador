import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authorizePermiso: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/rbac", () => ({ authorizePermiso: mocks.authorizePermiso }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

import {
  authorizeReporteEjecutivo,
  PERMISO_REPORTE_EJECUTIVO,
  requireReporteEjecutivo,
  restringirReporteEjecutivoASuperadministrador,
} from "./reporte-ejecutivo";

describe("Autorización del reporte ejecutivo", () => {
  beforeEach(() => vi.clearAllMocks());

  test("acepta únicamente al Superadministrador que ya tiene el permiso", () => {
    const superadmin = { ok: true as const, userId: 1, role: "Superadministrador" };
    expect(restringirReporteEjecutivoASuperadministrador(superadmin)).toEqual(superadmin);

    expect(
      restringirReporteEjecutivoASuperadministrador({
        ok: true,
        userId: 2,
        role: "Administrador",
      }),
    ).toEqual({ ok: false, message: "No tienes permisos para esta acción." });
  });

  test("conserva una denegación previa de la matriz", () => {
    const denegada = { ok: false as const, message: "Permiso revocado." };
    expect(restringirReporteEjecutivoASuperadministrador(denegada)).toEqual(denegada);
  });

  test("consulta el permiso canónico y aplica la restricción de rol", async () => {
    mocks.authorizePermiso.mockResolvedValue({
      ok: true,
      userId: 2,
      role: "Administrador",
    });

    await expect(authorizeReporteEjecutivo()).resolves.toEqual({
      ok: false,
      message: "No tienes permisos para esta acción.",
    });
    expect(mocks.authorizePermiso).toHaveBeenCalledWith(PERMISO_REPORTE_EJECUTIVO);
  });

  test("la compuerta de página redirige al Administrador", async () => {
    mocks.authorizePermiso.mockResolvedValue({
      ok: true,
      userId: 2,
      role: "Administrador",
    });

    await requireReporteEjecutivo();

    expect(mocks.redirect).toHaveBeenCalledWith("/dashboard");
  });

  test("la compuerta de página permite al Superadministrador", async () => {
    mocks.authorizePermiso.mockResolvedValue({
      ok: true,
      userId: 1,
      role: "Superadministrador",
    });

    await requireReporteEjecutivo();

    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});
