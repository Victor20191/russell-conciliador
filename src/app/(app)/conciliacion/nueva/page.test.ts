import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requirePermiso: vi.fn() }));
vi.mock("@/lib/rbac", () => ({ requirePermiso: mocks.requirePermiso }));

import NuevaConciliacionPage from "./page";

describe("Nueva conciliación · selección de módulos reales", () => {
  beforeEach(() => vi.resetAllMocks());

  it("exige ambos permisos y ofrece los seis módulos sin formulario simulado", async () => {
    const html = renderToStaticMarkup(await NuevaConciliacionPage());

    expect(mocks.requirePermiso.mock.calls).toEqual([["conciliaciones:crear"], ["modulos_datos:ver"]]);
    const enlaces = Array.from(html.matchAll(/href="([^"]+)"/g), ([, href]) => href);
    expect(enlaces.sort()).toEqual(["/modulos/afi", "/modulos/car", "/modulos/cxp", "/modulos/ing", "/modulos/inv", "/modulos/nom"]);
    for (const nombre of ["Inventarios", "Activos Fijos", "Cartera", "Cuentas por Pagar", "Ingresos", "Nómina"]) {
      expect(html).toContain(nombre);
    }
    expect(html).not.toMatch(/<(form|input|select|button)\b/);
    expect(html).not.toContain("Asistente de parametrización");
  });

  it.each([1, 2])("no presenta módulos cuando falla el gate %s", async (gate) => {
    const denegado = new Error("REDIRECT:/dashboard");
    if (gate === 2) mocks.requirePermiso.mockResolvedValueOnce(undefined);
    mocks.requirePermiso.mockRejectedValueOnce(denegado);

    await expect(NuevaConciliacionPage()).rejects.toThrow(denegado);
    expect(mocks.requirePermiso).toHaveBeenCalledTimes(gate);
  });
});
