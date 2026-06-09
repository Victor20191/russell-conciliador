import { describe, expect, test } from "vitest";
import {
  MODULOS_PLATAFORMA,
  esRolAdministrativo,
  moduloPublicadoParaRol,
  type PlatformModuleKey,
} from "./modulos-plataforma";

type EstadoModulo = {
  key: PlatformModuleKey;
  enabledForNonAdmins: boolean;
  configurableForNonAdmins: boolean;
};

describe("Publicación de módulos por rol", () => {
  test("solo Superadministrador ve módulos en desarrollo", () => {
    const estados: EstadoModulo[] = [{ key: "balance", enabledForNonAdmins: false, configurableForNonAdmins: true }];
    expect(moduloPublicadoParaRol("Superadministrador", "balance", estados)).toBe(true);
    expect(moduloPublicadoParaRol("Administrador", "balance", estados)).toBe(false);
    expect(esRolAdministrativo("Superadministrador")).toBe(true);
  });

  test("roles no superadministradores respetan el interruptor de publicación", () => {
    const estados: EstadoModulo[] = [{ key: "dian", enabledForNonAdmins: false, configurableForNonAdmins: true }];
    expect(moduloPublicadoParaRol("Staff", "dian", estados)).toBe(false);
    expect(moduloPublicadoParaRol("Senior", "dian", estados)).toBe(false);
  });

  test("módulos no bloqueables y módulos desconocidos quedan visibles", () => {
    const dashboard = MODULOS_PLATAFORMA.find((m) => m.key === "dashboard")!;
    expect(
      moduloPublicadoParaRol("Staff", "dashboard", [
        { ...dashboard, enabledForNonAdmins: false },
      ]),
    ).toBe(true);
    expect(moduloPublicadoParaRol("Staff", "externo", [])).toBe(true);
  });
});
