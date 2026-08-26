import { describe, expect, test } from "vitest";
import {
  catalogoUbicacionesNovedad,
  etiquetaUbicacionNovedad,
  resolverUbicacionNovedad,
} from "./soporte-rutas";

describe("catálogo de ruta y menú de una novedad", () => {
  test("la ruta se elige primero y el menú queda acotado a esa ruta", () => {
    const catalogo = catalogoUbicacionesNovedad();
    const balance = catalogo.find((ruta) => ruta.etiqueta === "Balance de comprobación");
    expect(balance).toBeTruthy();
    expect(balance!.menus.map((menu) => menu.etiqueta)).toEqual([
      "Balance",
      "Borrador Balance",
      "Balance por tercero",
    ]);
    expect(resolverUbicacionNovedad(balance!.clave, balance!.menus[1]!.clave)).toEqual({
      ruta: balance,
      menu: balance!.menus[1],
    });
  });

  test("un menú de otra ruta no se acepta", () => {
    const catalogo = catalogoUbicacionesNovedad();
    const balance = catalogo.find((ruta) => ruta.etiqueta === "Balance de comprobación")!;
    const auditoria = catalogo.find((ruta) => ruta.etiqueta === "Auditoría")!;
    expect(resolverUbicacionNovedad(balance.clave, auditoria.menus[0]!.clave)).toBeNull();
    expect(resolverUbicacionNovedad("ruta-inventada", "menu-inventado")).toBeNull();
  });

  test("configuración agrupa las pantallas de ese menú incluyendo Ayuda y Gestión de reportes", () => {
    const config = catalogoUbicacionesNovedad().find((ruta) => ruta.clave === "configuracion");
    expect(config?.menus.some((menu) => menu.etiqueta === "Clientes")).toBe(true);
    expect(config?.menus.some((menu) => menu.etiqueta === "Ayuda")).toBe(true);
    expect(config?.menus.some((menu) => menu.etiqueta === "Gestión de reportes")).toBe(true);
  });

  test("la etiqueta junta ruta y menú para listados", () => {
    expect(etiquetaUbicacionNovedad("Balance de comprobación", "Borrador Balance")).toBe(
      "Balance de comprobación · Borrador Balance",
    );
    expect(etiquetaUbicacionNovedad("Inicio", "Inicio")).toBe("Inicio");
    expect(etiquetaUbicacionNovedad(null, null)).toBeNull();
  });

  test("oculta rutas de trabajo cuyos módulos están en desarrollo", () => {
    const catalogo = catalogoUbicacionesNovedad({
      modulosEnDesarrollo: ["balance", "conciliaciones", "modulos_datos"],
    });
    expect(catalogo.some((ruta) => ruta.etiqueta === "Balance de comprobación")).toBe(false);
    expect(catalogo.some((ruta) => ruta.etiqueta === "Conciliaciones")).toBe(false);
    expect(catalogo.some((ruta) => ruta.etiqueta === "Módulos de conciliación")).toBe(false);
    expect(catalogo.some((ruta) => ruta.etiqueta === "Inicio")).toBe(true);
    expect(catalogo.some((ruta) => ruta.etiqueta === "Impuestos · DIAN")).toBe(true);
  });

  test("oculta menús de configuración cuyos módulos están en desarrollo", () => {
    const catalogo = catalogoUbicacionesNovedad({
      modulosEnDesarrollo: ["mapeo", "perfiles_carga", "clientes"],
    });
    const config = catalogo.find((ruta) => ruta.clave === "configuracion")!;
    expect(config).toBeTruthy();
    expect(config.menus.some((m) => m.etiqueta === "Mapeo plan estándar")).toBe(false);
    expect(config.menus.some((m) => m.etiqueta === "Perfiles de carga")).toBe(false);
    expect(config.menus.some((m) => m.etiqueta === "Clientes")).toBe(false);
    expect(config.menus.some((m) => m.etiqueta === "Maestros")).toBe(true);
    expect(config.menus.some((m) => m.etiqueta === "Ayuda")).toBe(true);
  });

  test("filtra módulos en desarrollo a partir de la lista de estados de publicación", () => {
    const catalogo = catalogoUbicacionesNovedad({
      modulos: [
        { key: "balance", enabledForNonAdmins: false, configurableForNonAdmins: true },
        { key: "dian", enabledForNonAdmins: true, configurableForNonAdmins: true },
        { key: "dashboard", enabledForNonAdmins: true, configurableForNonAdmins: false },
      ],
    });
    expect(catalogo.some((ruta) => ruta.etiqueta === "Balance de comprobación")).toBe(false);
    expect(catalogo.some((ruta) => ruta.etiqueta === "Impuestos · DIAN")).toBe(true);
    expect(catalogo.some((ruta) => ruta.etiqueta === "Inicio")).toBe(true);
  });

  test("resolverUbicacionNovedad rechaza rutas de módulos en desarrollo cuando se aplican opciones", () => {
    const balance = catalogoUbicacionesNovedad().find((r) => r.etiqueta === "Balance de comprobación")!;
    const resuelto = resolverUbicacionNovedad(balance.clave, balance.menus[0]!.clave, {
      modulosEnDesarrollo: ["balance"],
    });
    expect(resuelto).toBeNull();
  });

  test("filtra por permisos y roles del usuario", () => {
    const catalogoSuperadmin = catalogoUbicacionesNovedad({
      rol: "Superadministrador",
      permisos: ["dashboard:ver", "auditoria:reporte_ejecutivo", "soporte:ver"],
    });
    const configSuper = catalogoSuperadmin.find((r) => r.clave === "configuracion")!;
    expect(configSuper.menus.some((m) => m.etiqueta === "Reportes para gerencia")).toBe(true);

    const catalogoStaff = catalogoUbicacionesNovedad({
      rol: "Staff",
      permisos: ["dashboard:ver", "soporte:ver"],
    });
    const configStaff = catalogoStaff.find((r) => r.clave === "configuracion");
    expect(configStaff?.menus.some((m) => m.etiqueta === "Reportes para gerencia")).toBe(false);
  });
});
