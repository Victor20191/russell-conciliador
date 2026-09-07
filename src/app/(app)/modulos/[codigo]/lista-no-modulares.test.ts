import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ListaNoModulares, ResumenNoModulares } from "./lista-no-modulares";
import type { HijoContableCruce } from "@/lib/modulos/cruce-contable";
// El runner sin plugin React transforma JSX con el runtime clásico.
vi.stubGlobal("React", React);

const hijos: HijoContableCruce[] = [
  { cuenta8: "14550101", nombre: "REPUESTOS NACIONALES", valor: 12_000_000, noModular: false },
  { cuenta8: "145508", nombre: "AJUSTE INVENTARIO", valor: -24_716_320, noModular: true },
];

describe("ListaNoModulares", () => {
  it("lista cada cuenta con su código, nombre y valor", () => {
    const html = renderToStaticMarkup(React.createElement(ListaNoModulares, { hijos, seleccion: new Set<string>() }));
    for (const texto of ["14550101", "REPUESTOS NACIONALES", "145508", "AJUSTE INVENTARIO"]) {
      expect(html).toContain(texto);
    }
  });

  it("en modo edición pinta un checkbox por cuenta, marcado según la selección", () => {
    const html = renderToStaticMarkup(
      React.createElement(ListaNoModulares, { hijos, seleccion: new Set(["145508"]), onAlternar: vi.fn() }),
    );
    expect(html.match(/<input type="checkbox"/g) ?? []).toHaveLength(2);
    expect(html).toContain("checked");
  });

  it("en solo lectura no hay checkboxes y las excluidas llevan su distintivo", () => {
    const html = renderToStaticMarkup(React.createElement(ListaNoModulares, { hijos, seleccion: new Set(["145508"]) }));
    expect(html).not.toContain("<input");
    expect(html).toContain("No modular");
  });

  it("sin desglose lo dice en vez de pintar una lista vacía", () => {
    const html = renderToStaticMarkup(React.createElement(ListaNoModulares, { hijos: [], seleccion: new Set<string>() }));
    expect(html).toContain("no tiene desglose");
    expect(html).not.toContain("<ul");
  });
});

describe("ResumenNoModulares", () => {
  it("no pinta nada cuando la marca no excluyó cuentas", () => {
    expect(renderToStaticMarkup(React.createElement(ResumenNoModulares, { cuentas: [] }))).toBe("");
  });

  it("lista las cuentas restadas con su valor al marcar, en singular y plural", () => {
    const una = renderToStaticMarkup(React.createElement(ResumenNoModulares, {
      cuentas: [{ cuenta8: "145508", nombre: "AJUSTE INVENTARIO", valorAlMarcar: -24_716_320 }],
    }));
    expect(una).toContain("Cuenta no modular restada");
    expect(una).toContain("145508");
    expect(una).toContain("AJUSTE INVENTARIO");

    const dos = renderToStaticMarkup(React.createElement(ResumenNoModulares, {
      cuentas: [
        { cuenta8: "145508", nombre: "AJUSTE INVENTARIO", valorAlMarcar: -24_716_320 },
        { cuenta8: "146505", nombre: "EN TRÁNSITO", valorAlMarcar: 14_107_833 },
      ],
    }));
    expect(dos).toContain("2 cuentas no modulares restadas");
  });
});
