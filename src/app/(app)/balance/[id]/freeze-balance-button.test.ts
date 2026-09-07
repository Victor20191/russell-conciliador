import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ContenidoTrasladoCierre, FreezeBalanceButton, type TrasladoCierreVm } from "./freeze-balance-button";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/app/actions/balance", () => ({ freezeBalance: vi.fn() }));
// El runner sin plugin React transforma JSX con el runtime clásico.
vi.stubGlobal("React", React);

const traslado: TrasladoCierreVm = {
  mensaje: "Esta versión conserva 3 cuentas en firme idénticas en importes y homologación. Al congelarla como oficial, el cierre de INV · 2025-12 (cargue #38, cerró Camilo Perez Rojo) pasará a esta versión.",
  cierres: [{ modulo: "INV", periodo: "2025-12", cargue: 38, cerradoPor: "Camilo Perez Rojo" }],
  cuentasEnFirme: 3,
};

describe("FreezeBalanceButton", () => {
  it("sin conciliación en firme: el botón de siempre, sin confirmación de traslado", () => {
    const html = renderToStaticMarkup(React.createElement(FreezeBalanceButton, { id: 216 }));
    expect(html).toContain("Congelar como oficial");
    expect(html).not.toContain("confirmarTraslado");
    expect(html).not.toContain("trasladar");
  });

  it("bloqueado: el botón sale deshabilitado, con la razón y sin formulario", () => {
    const html = renderToStaticMarkup(React.createElement(FreezeBalanceButton, { id: 216, bloqueo: "El balance está en firme por la conciliación cerrada de INV · 2025-12" }));
    expect(html).toContain("disabled");
    expect(html).toContain("INV · 2025-12");
    expect(html).not.toContain("confirmarTraslado");
  });

  it("con traslado: el clic abre un modal en vez de congelar directo (la confirmación no está en el HTML inicial)", () => {
    const html = renderToStaticMarkup(React.createElement(FreezeBalanceButton, { id: 216, traslado }));
    expect(html).toContain("Congelar como oficial");
    expect(html).not.toContain("confirmarTraslado"); // el modal está cerrado hasta el clic
  });
});

describe("ContenidoTrasladoCierre", () => {
  it("explica el traslado: mensaje, cierre, cargue, quién cerró y cuántas cuentas", () => {
    const html = renderToStaticMarkup(React.createElement(ContenidoTrasladoCierre, { traslado }));
    for (const texto of ["3 cuentas en firme idénticas", "INV · 2025-12", "cargue #38", "Camilo Perez Rojo", "3 cuenta(s) en firme", "no se desbloquea"]) {
      expect(html).toContain(texto);
    }
  });
});
