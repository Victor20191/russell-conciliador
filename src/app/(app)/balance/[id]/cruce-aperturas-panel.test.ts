import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CruceAperturasPanel } from "./cruce-aperturas-panel";
import type { EstadoCrucesAperturas } from "@/lib/balance/cruce-aperturas-servidor";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/app/actions/balance-cruce-aperturas", () => ({ revisarAperturasBalance: vi.fn() }));
// El runner sin plugin React transforma JSX con el runtime clásico.
vi.stubGlobal("React", React);
const montos = { saldoInicial: 100, debitos: 50, creditos: -10, saldoFinal: 140 };
const estado: EstadoCrucesAperturas = {
  disponible: true, pendiente: false, motivo: null,
  pares: [{ id: 10, inconsistente: true, actualizadoEn: "2026-09-05T15:00:00Z", cuenta: { id: 1, archivo: "cuenta.xlsx", version: "v1" }, tercero: { id: 2, archivo: "terceros.xlsx", version: "v2" },
    resultado: { revision: 1, precision: 0.01, terceroId: 20, totalCuentas: 1, filas: [{ cuenta8: "1105100101", nombre: "Caja", estado: "descuadre", sinDesgloseTercero: false, cuenta: montos, tercero: { ...montos, debitos: 80, creditos: -40 }, diff: { saldoInicial: 0, debitos: -30, creditos: 30, saldoFinal: 0 } }] },
  }],
};
describe("panel bilateral de inconsistencias", () => {
  it.each([1, 2])("muestra en balance %s ambas fuentes, la cuenta y las diferencias compensadas", (id) => {
    const html = renderToStaticMarkup(React.createElement(CruceAperturasPanel, { balanceId: id, estado, puedeRevisar: false }));
    for (const texto of ["Archivo inconsistente", "cuenta.xlsx", "terceros.xlsx", "1105100101", "Débitos", "Créditos", "$ 50,00", "$ 80,00", "-$ 30,00", "eliminar uno"]) expect(html).toContain(texto);
    expect(html).not.toContain("Revisar archivos</button>");
  });
  it("distingue sin contraparte y control no disponible de un resultado correcto", () => {
    const sinDatos = { ...estado, pares: [], pendiente: true, disponible: false, motivo: "No fue posible consultar la validación" };
    const html = renderToStaticMarkup(React.createElement(CruceAperturasPanel, { balanceId: 1, estado: sinDatos, puedeRevisar: true }));
    expect(html).toContain("Validación entre archivos pendiente");
    expect(html).not.toContain("Archivos comparados sin diferencias");
    expect(html).toContain("Revisar archivos</button>");
  });
});
