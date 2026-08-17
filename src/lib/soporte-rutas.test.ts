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
    expect(balance!.menus.map((menu) => menu.etiqueta)).toEqual(["Balance", "Borrador Balance"]);
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

  test("configuración agrupa las pantallas de ese menú", () => {
    const config = catalogoUbicacionesNovedad().find((ruta) => ruta.clave === "configuracion");
    expect(config?.menus.some((menu) => menu.etiqueta === "Clientes")).toBe(true);
    expect(config?.menus.some((menu) => menu.etiqueta === "Gestión de reportes")).toBe(true);
  });

  test("la etiqueta junta ruta y menú para listados", () => {
    expect(etiquetaUbicacionNovedad("Balance de comprobación", "Borrador Balance")).toBe(
      "Balance de comprobación · Borrador Balance",
    );
    expect(etiquetaUbicacionNovedad("Inicio", "Inicio")).toBe("Inicio");
    expect(etiquetaUbicacionNovedad(null, null)).toBeNull();
  });
});
