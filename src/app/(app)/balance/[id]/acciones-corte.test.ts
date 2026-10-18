import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/app/actions/balance", () => ({ eliminarBalance: vi.fn(), reemplazarBalanceConciliado: vi.fn() }));
// El runner sin plugin React transforma JSX con el runtime clásico.
vi.stubGlobal("React", React);
import { ContenidoReemplazo, EliminarBalanceCorteButton, ReemplazarBalanceButton, type ReemplazoVm } from "./acciones-corte";

const reemplazo: ReemplazoVm = {
  viejo: { id: 215, nombre: "Diciembre 2025 · Por cuenta", version: "v7" },
  nuevo: { id: 216, version: "v8" },
  cierres: [{ modulo: "Inventarios", periodo: "2025-12", cargue: 38 }],
  cuentasEnFirme: 15,
  motivo: null,
};

describe("acciones del panel del corte", () => {
  it("el reemplazo explica los tres pasos: la conciliación pasa, el viejo se elimina y este queda cerrado", () => {
    const html = renderToStaticMarkup(React.createElement(ContenidoReemplazo, { reemplazo }));
    for (const texto of ["Inventarios · 2025-12 (cargue #38)", "15 cuenta(s) en firme", "Se elimina Diciembre 2025 · Por cuenta v7 (#215)", "queda cerrada"]) {
      expect(html).toContain(texto);
    }
  });

  it("sin motivo, el botón abre la confirmación; con motivo, sale deshabilitado con la razón", () => {
    expect(renderToStaticMarkup(React.createElement(ReemplazarBalanceButton, { reemplazo }))).not.toMatch(/\sdisabled[=\s>]/);
    const html = renderToStaticMarkup(React.createElement(ReemplazarBalanceButton, { reemplazo: { ...reemplazo, motivo: "El balance nuevo cambia cuentas conciliadas: 14350501 cambia saldo final." } }));
    expect(html).toMatch(/\sdisabled[=\s>]/);
    expect(html).toContain("14350501 cambia saldo final");
  });

  it("eliminar otro balance del corte es un botón que pide confirmación", () => {
    const html = renderToStaticMarkup(React.createElement(EliminarBalanceCorteButton, { balanceId: 274, nombre: "Enero 2025 – Diciembre 2025 v1" }));
    expect(html).toContain("Eliminar");
  });
});
