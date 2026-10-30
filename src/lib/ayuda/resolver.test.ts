import { describe, expect, it } from "vitest";
import { MODULOS_IMPORT } from "@/lib/modulos/descriptores";
import { configSecciones, workNav } from "@/lib/nav";
import { resolverAyuda } from "./resolver";

describe("resolverAyuda", () => {
  it.each([
    ["/balance", "balance.listado"],
    ["/balance/", "balance.listado"],
    ["/balance/245", "balance.detalle"],
    ["/balance/245?tab=versiones", "balance.detalle"],
    ["/balance/245/diff", "balance.diff"],
    ["/balance/245/terceros", "balance.terceros"],
    ["/balance/borradores", "balance.borradores"],
    ["/balance/borradores/297eaba6-5fad-4425-8ecc-7d66448cd16b", "balance.borrador"],
  ])("%s → %s", (ruta, ficha) => {
    expect(resolverAyuda(ruta)?.fichaId).toBe(ficha);
  });

  it.each([
    ["/modulos/nom", "modulo.cargados"],
    ["/modulos/INV", "modulo.cargados"],
    ["/modulos/car/borradores", "modulo.borradores"],
    ["/modulos/car/borradores/lote-1", "modulo.borrador"],
    ["/modulos/cxp/patrones", "modulo.patrones"],
    ["/modulos/cxp/patrones/nueva", "modulo.patrones"],
    ["/modulos/cxp/patrones/12", "modulo.patrones"],
    ["/modulos/ing/formatos-propios", "modulo.formatos_propios"],
    ["/modulos/afi/88", "modulo.cargue"],
  ])("%s → %s", (ruta, ficha) => {
    expect(resolverAyuda(ruta)?.fichaId).toBe(ficha);
  });

  it("devuelve el código del módulo en mayúsculas", () => {
    expect(resolverAyuda("/modulos/nom/120")).toEqual({ fichaId: "modulo.cargue", modulo: "NOM" });
  });

  it.each([
    ["/config/mapeo", "catalogo.plan_russell"],
    ["/config/mapeo-cliente", "catalogo.mapeo_cliente"],
    ["/config/conceptos-nomina", "catalogo.conceptos_nomina"],
    ["/config/clientes", "equipo.clientes"],
    ["/config/usuarios/", "equipo.usuarios"],
    ["/estructura", "equipo.estructura"],
    ["/perfil", "equipo.perfil"],
    ["/config/parametros", "parametros.alertas"],
    ["/reportes", "soporte.mesa_ayuda"],
    ["/reportes/57", "soporte.mesa_ayuda"],
  ])("%s → %s", (ruta, ficha) => {
    expect(resolverAyuda(ruta)?.fichaId).toBe(ficha);
  });

  it("los filtros de cuentas van por módulo y sin módulo llevan a Ingresos", () => {
    expect(resolverAyuda("/config/prevalidador/afi")).toEqual({ fichaId: "parametros.filtros_cuentas", modulo: "AFI" });
    expect(resolverAyuda("/config/prevalidador")).toEqual({ fichaId: "parametros.filtros_cuentas", modulo: "ING" });
    expect(resolverAyuda("/config/prevalidador/xyz")).toBeNull();
  });

  it.each(["/balance/mapeo", "/balance/abc", "/balance/245/otra", "/modulos/xyz", "/modulos/nom/abc", "/config/permisos", "/config/soporte", "/reportes/abc", "/dashboard", "/"])(
    "%s no tiene ayuda",
    (ruta) => {
      expect(resolverAyuda(ruta)).toBeNull();
    },
  );

  it("cubre todas las entradas del menú de Balance y de Módulos", () => {
    const hrefs = workNav
      .filter((i) => i.href.startsWith("/balance") || i.href.startsWith("/modulos"))
      .flatMap((i) => [i.href, ...(i.children ?? []).map((c) => c.href)]);
    expect(hrefs.length).toBeGreaterThan(Object.keys(MODULOS_IMPORT).length);
    for (const href of hrefs) expect(resolverAyuda(href), href).not.toBeNull();
  });

  it("cubre las pantallas de la operación del menú (sin Administración ni lo que está en desarrollo)", () => {
    const secciones = ["Catálogos contables", "Clientes y equipo", "Parametrización"];
    const hrefs = configSecciones
      .filter((s) => secciones.includes(s.titulo))
      .flatMap((s) => s.items)
      .filter((i) => i.href !== "/config/dian") // Mapeos DIAN: en desarrollo
      .flatMap((i) => [i.href, ...(i.children ?? []).map((c) => c.href)]);
    expect(hrefs.length).toBeGreaterThan(10);
    for (const href of [...hrefs, "/reportes", "/perfil"]) expect(resolverAyuda(href), href).not.toBeNull();
  });
});
