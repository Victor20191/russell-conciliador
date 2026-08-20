import { describe, expect, test } from "vitest";
import { configNav, workNav } from "./nav";

describe("Navegación de reportes para gerencia", () => {
  test("retira la entrada antigua de Auditoría", () => {
    const auditoria = workNav.find((item) => item.href === "/auditoria");
    expect(auditoria?.children?.some((item) => item.href === "/auditoria/adopcion")).toBe(
      false,
    );
  });

  test("publica la ruta nueva en Configuración con su permiso", () => {
    expect(configNav).toContainEqual(
      expect.objectContaining({
        label: "Reportes para gerencia",
        href: "/config/reportes-ejecutivos",
        permiso: "auditoria:reporte_ejecutivo",
        roles: ["Superadministrador"],
      }),
    );
  });

  test("agrupa Ayuda y Gestión de reportes al final del menú de Configuración", () => {
    const mesa = configNav.find((item) => item.label === "Mesa de ayuda");
    expect(configNav.at(-1)).toEqual(mesa);
    expect(mesa).toMatchObject({
      href: "/reportes",
      icon: "help",
      permiso: "soporte:ver",
      modulo: "soporte",
    });
    expect(mesa?.children).toEqual([
      { label: "Ayuda", href: "/reportes", permiso: "soporte:ver", modulo: "soporte" },
      {
        label: "Gestión de reportes",
        href: "/config/soporte",
        permiso: "soporte:administrar",
        modulo: "soporte",
      },
    ]);
    expect(workNav.some((item) => item.label === "Mesa de ayuda")).toBe(false);
  });
});
