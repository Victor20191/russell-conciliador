import { describe, expect, it } from "vitest";
import { coincideOpcionBuscable, type OpcionBuscable } from "./select-buscable";

describe("coincideOpcionBuscable", () => {
  const cliente: OpcionBuscable = {
    value: "El Zarzal S.A",
    label: "El Zarzal S.A",
    sublabel: "900.123.456-7",
  };

  it("retorna true con búsqueda vacía o de solo espacios", () => {
    expect(coincideOpcionBuscable(cliente, "")).toBe(true);
    expect(coincideOpcionBuscable(cliente, "   ")).toBe(true);
  });

  it("encuentra por nombre exacto o parcial insensible a mayúsculas", () => {
    expect(coincideOpcionBuscable(cliente, "zarzal")).toBe(true);
    expect(coincideOpcionBuscable(cliente, "EL ZARZAL")).toBe(true);
    expect(coincideOpcionBuscable(cliente, "s.a")).toBe(true);
  });

  it("encuentra con normalización de acentos y tildes", () => {
    const conTildes: OpcionBuscable = {
      value: "Compañía Eléctrica del Café S.A.S.",
      label: "Compañía Eléctrica del Café S.A.S.",
      sublabel: "800.987.654-3",
    };
    expect(coincideOpcionBuscable(conTildes, "compania")).toBe(true);
    expect(coincideOpcionBuscable(conTildes, "electrica")).toBe(true);
    expect(coincideOpcionBuscable(conTildes, "cafe")).toBe(true);
  });

  it("encuentra por NIT con formato o sin formato (solo dígitos)", () => {
    expect(coincideOpcionBuscable(cliente, "900.123")).toBe(true);
    expect(coincideOpcionBuscable(cliente, "900123456")).toBe(true);
    expect(coincideOpcionBuscable(cliente, "9001234567")).toBe(true);
  });

  it("retorna false si no hay coincidencia ni en nombre ni en NIT", () => {
    expect(coincideOpcionBuscable(cliente, "bavaria")).toBe(false);
    expect(coincideOpcionBuscable(cliente, "999888")).toBe(false);
  });

  it("funciona correctamente para opciones sin sublabel", () => {
    const sinSub: OpcionBuscable = { value: "1", label: "Activo Corriente" };
    expect(coincideOpcionBuscable(sinSub, "activo")).toBe(true);
    expect(coincideOpcionBuscable(sinSub, "pasivo")).toBe(false);
  });
});

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SelectBuscable } from "./select-buscable";

describe("SelectBuscable render", () => {
  it("muestra el spinner de carga cuando cargando es true", () => {
    const html = renderToStaticMarkup(
      createElement(SelectBuscable, {
        opciones: [{ value: "1", label: "REDPLAS S.A.S" }],
        value: "1",
        onChange: () => {},
        cargando: true,
      })
    );
    expect(html).toContain("animate-spin");
    expect(html).toContain('aria-label="Cargando…"');
  });

  it("no muestra el spinner cuando cargando es false", () => {
    const html = renderToStaticMarkup(
      createElement(SelectBuscable, {
        opciones: [{ value: "1", label: "REDPLAS S.A.S" }],
        value: "1",
        onChange: () => {},
        cargando: false,
      })
    );
    expect(html).not.toContain("animate-spin");
  });
});
