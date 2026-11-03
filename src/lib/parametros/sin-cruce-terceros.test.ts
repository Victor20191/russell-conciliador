import { describe, expect, it } from "vitest";
import { descriptorModulo } from "@/lib/modulos/descriptores";
import { sinCruceDeTerceros } from "@/lib/modulos/cuentas-conciliacion";

describe("sinCruceDeTerceros", () => {
  it("apaga el cruce por tercero en Cartera y CxP y conserva el detalle del auxiliar", () => {
    for (const codigo of ["CAR", "CXP"]) {
      const base = descriptorModulo(codigo)!;
      expect(base.crucePorTercero.habilitado).toBe(true);
      const d = sinCruceDeTerceros(base);
      expect(d.crucePorTercero.habilitado).toBe(false);
      expect(d.crucePorTercero.exigirBalanceConTerceros).toBe(false);
      expect(d.crucePorTercero.exigidoParaCierre).toBe(false);
      expect(d.crucePorTercero.detalleTercero).toBe(true);
    }
  });
});
