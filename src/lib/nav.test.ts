import { describe, expect, test } from "vitest";
import { configNav, workNav } from "./nav";

describe("Navegación de reportes ejecutivos", () => {
  test("retira la entrada antigua de Auditoría", () => {
    const auditoria = workNav.find((item) => item.href === "/auditoria");
    expect(auditoria?.children?.some((item) => item.href === "/auditoria/adopcion")).toBe(
      false,
    );
  });

  test("publica la ruta nueva en Configuración con su permiso", () => {
    expect(configNav).toContainEqual(
      expect.objectContaining({
        label: "Reportes ejecutivos",
        href: "/config/reportes-ejecutivos",
        permiso: "auditoria:reporte_ejecutivo",
        roles: ["Superadministrador"],
      }),
    );
  });

  test("agrupa Ayuda y Gestión de reportes al final de Trabajo", () => {
    const mesa = workNav.find((item) => item.label === "Mesa de ayuda");
    expect(workNav.at(-1)).toEqual(mesa);
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
    expect(configNav.some((item) => item.href === "/config/soporte")).toBe(false);
  });
});
