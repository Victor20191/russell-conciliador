import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { conSeleccionMasiva, ListaNoModulares, ListaSinCuentaNoModulares, ResumenClasificadoresNoModulares, ResumenNoModulares } from "./lista-no-modulares";
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

  it("en edición con dos o más cuentas ofrece «Seleccionar todas» con el conteo", () => {
    const html = renderToStaticMarkup(
      React.createElement(ListaNoModulares, { hijos, seleccion: new Set(["145508"]), onAlternar: vi.fn(), onSeleccionarTodas: vi.fn() }),
    );
    expect(html).toContain("Seleccionar todas");
    expect(html).toContain("1 de 2 marcada");
    expect(html.match(/<input type="checkbox"/g) ?? []).toHaveLength(3);
  });

  it("sin «Seleccionar todas» en solo lectura ni con una sola cuenta", () => {
    const lectura = renderToStaticMarkup(React.createElement(ListaNoModulares, { hijos, seleccion: new Set<string>(), onSeleccionarTodas: vi.fn() }));
    expect(lectura).not.toContain("Seleccionar todas");
    const una = renderToStaticMarkup(
      React.createElement(ListaNoModulares, { hijos: hijos.slice(0, 1), seleccion: new Set<string>(), onAlternar: vi.fn(), onSeleccionarTodas: vi.fn() }),
    );
    expect(una).not.toContain("Seleccionar todas");
  });

  it("sin desglose lo dice en vez de pintar una lista vacía", () => {
    const html = renderToStaticMarkup(React.createElement(ListaNoModulares, { hijos: [], seleccion: new Set<string>() }));
    expect(html).toContain("no tiene desglose");
    expect(html).not.toContain("<ul");
  });
});

describe("conSeleccionMasiva", () => {
  it("marca o desmarca todas las claves y deja el resto como estaba", () => {
    const previa = new Set(["OTRA", "145508"]);
    expect([...conSeleccionMasiva(previa, ["14550101", "145508"], true)].sort()).toEqual(["14550101", "145508", "OTRA"]);
    expect([...conSeleccionMasiva(previa, ["14550101", "145508"], false)]).toEqual(["OTRA"]);
    expect([...previa].sort()).toEqual(["145508", "OTRA"]);
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

describe("ListaSinCuentaNoModulares y su resumen", () => {
  const sinCuenta = [
    { clasificador: "241205", total: 320_648_000, noModular: false },
    { clasificador: "COP", total: 87_000_000, noModular: true },
  ];

  it("lista los clasificadores sin cuenta y tacha los no modulares", () => {
    const html = renderToStaticMarkup(React.createElement(ListaSinCuentaNoModulares, { hijos: sinCuenta, seleccion: new Set(["COP"]) }));
    expect(html).toContain("241205");
    expect(html).toContain("COP");
    expect(html).toContain("line-through");
    expect(html).toContain("No modular");
  });

  it("en edición ofrece «Seleccionar todos» los saldos sin cuenta", () => {
    const html = renderToStaticMarkup(
      React.createElement(ListaSinCuentaNoModulares, { hijos: sinCuenta, seleccion: new Set(["COP", "241205"]), onAlternar: vi.fn(), onSeleccionarTodas: vi.fn() }),
    );
    expect(html).toContain("Seleccionar todos");
    expect(html).toContain("2 de 2 marcados");
  });

  it("el resumen de la marca nombra el saldo sin cuenta restado", () => {
    const html = renderToStaticMarkup(React.createElement(ResumenClasificadoresNoModulares, { clasificadores: [{ clasificador: "COP", totalAlMarcar: 87_000_000 }], sinCuenta: true }));
    expect(html).toContain("Saldo sin cuenta no modular restado");
    const enRenglon = renderToStaticMarkup(React.createElement(ResumenClasificadoresNoModulares, { clasificadores: [{ clasificador: "COP", totalAlMarcar: 87_000_000 }] }));
    expect(enRenglon).toContain("Concepto no contabilizado restado");
    expect(renderToStaticMarkup(React.createElement(ResumenClasificadoresNoModulares, { clasificadores: [] }))).toBe("");
  });
});
