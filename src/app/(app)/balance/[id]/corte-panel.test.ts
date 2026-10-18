import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/app/actions/balance-corte", () => ({ revisarComparacionCorte: vi.fn() }));
// El runner sin plugin React transforma JSX con el runtime clásico.
vi.stubGlobal("React", React);
import { CortePanel } from "./corte-panel";
import type { BalanceCorteVm, VistaCorte } from "@/lib/balance/comparacion-corte-servidor";

const otro = (over: Partial<BalanceCorteVm> = {}): BalanceCorteVm => ({
  id: 274, periodo: "Enero 2025 – Diciembre 2025", version: "v1", apertura: "tercero", nombre: "Enero 2025 – Diciembre 2025 · Por terceros",
  estado: "En proceso con alertas", estaCongelado: false, versiones: 1, ultimaCarga: "13/Sep/2026 10:35 p. m.", enFirme: [],
  comparacion: { inconsistente: false, cuentasComparadas: 540, actualizadoEn: "2026-10-18T12:00:00.000Z", diferencias: [] },
  ...over,
});
const vista = (over: Partial<VistaCorte> = {}): VistaCorte => ({
  disponible: true, motivo: null, fechaCorte: "2025-12-31", etiqueta: "Corte 31/12/2025", estado: "consistente",
  esVigente: true, vigenteDeMiLinea: { id: 316, version: "v1" }, otros: [otro()], enFirme: [], anterioresEnFirme: [], anterioresCerradas: [], ...over,
});
const render = (v: VistaCorte) => renderToStaticMarkup(React.createElement(CortePanel, { balanceId: 316, vista: v, puedeRevisar: true }));

describe("CortePanel", () => {
  it("lista los demás balances del corte con su período completo y si coinciden", () => {
    const html = render(vista());
    expect(html).toContain("Corte 31/12/2025");
    expect(html).toContain("Enero 2025 – Diciembre 2025 · Por terceros");
    expect(html).toContain("Coincide · 540 cuentas comparadas");
    expect(html).toContain("Revisar comparación");
  });

  it("muestra las cuentas con saldo final distinto", () => {
    const html = render(vista({
      estado: "inconsistente",
      otros: [otro({ comparacion: { inconsistente: true, cuentasComparadas: 540, actualizadoEn: "2026-10-18T12:00:00.000Z", diferencias: [
        { cuenta8: "15920505", nombre: "Depreciación", saldoA: -100, saldoB: -90, diferencia: -10, estado: "descuadre" },
      ] } })],
    }));
    expect(html).toContain("Saldos finales distintos a 1 balance(s) del mismo corte");
    expect(html).toContain("Difiere en 1 cuenta(s)");
    expect(html).toContain("15920505");
  });

  it("avisa cuando falta comparar", () => {
    expect(render(vista({ estado: "sin_comparar", otros: [otro({ comparacion: null })] }))).toContain("Sin comparar");
  });

  it("una versión anterior no entra en la comparación y apunta a la vigente", () => {
    const html = render(vista({ esVigente: false, vigenteDeMiLinea: { id: 400, version: "v3" } }));
    expect(html).toContain("versión anterior de su línea");
    expect(html).toContain("/balance/400#corte");
  });

  it("si la consulta falla no pinta un falso OK", () => {
    const html = render(vista({ disponible: false, motivo: "No fue posible consultar los balances del mismo corte.", otros: [] }));
    expect(html).toContain("no disponible");
    expect(html).toContain("No fue posible consultar");
    expect(html).not.toContain("Es el único balance");
  });

  it("muestra la conciliación en firme que sigue contra una versión anterior de la línea", () => {
    const html = render(vista({ anterioresEnFirme: [{ ...otro({ id: 200, version: "v1" }), enFirme: [{ moduloCodigo: "INV", periodo: "2025-12", cerradoPor: "Ana" }] }] }));
    expect(html).toContain("INV · 2025-12");
    expect(html).toContain("/balance/200");
  });
});
