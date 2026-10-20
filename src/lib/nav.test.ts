import { describe, expect, test } from "vitest";
import { configNav, configSecciones, workNav } from "./nav";

describe("Secciones del menú lateral", () => {
  test("agrupa las entradas por propósito, en este orden", () => {
    expect(configSecciones.map((s) => s.titulo)).toEqual([
      "Catálogos contables",
      "Clientes y equipo",
      "Parametrización",
      "Administración",
      "Ayuda",
    ]);
    const seccionDe = (label: string) =>
      configSecciones.find((s) => s.items.some((it) => it.label === label))?.titulo;
    expect(seccionDe("Conceptos de nómina")).toBe("Catálogos contables");
    expect(seccionDe("Estructura")).toBe("Clientes y equipo");
    expect(seccionDe("Parámetros de alertas")).toBe("Parametrización");
    expect(seccionDe("Perfiles de carga")).toBe("Administración");
  });

  test("la lista plana trae las mismas entradas, cada una una sola vez", () => {
    expect(configNav).toEqual(configSecciones.flatMap((s) => s.items));
    const hrefs = configNav.map((it) => it.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });
});

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
