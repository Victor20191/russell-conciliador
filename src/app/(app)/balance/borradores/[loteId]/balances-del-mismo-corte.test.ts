import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/app/actions/balance-corte", () => ({ revisarComparacionCorte: vi.fn() }));
vi.mock("@/app/actions/balance", () => ({}));
// El runner sin plugin React transforma JSX con el runtime clásico.
vi.stubGlobal("React", React);
import { BalancesDelMismoCorte } from "./balances-del-mismo-corte";
import type { BalanceCorteBorradorVm, ComparacionBorradorCorte } from "@/app/actions/balance";

const bal = (over: Partial<BalanceCorteBorradorVm> = {}): BalanceCorteBorradorVm => ({
  id: 316, version: "v1", nombre: "Diciembre 2025 · Por terceros", estaCongelado: false, mismaLinea: false,
  coincide: true, cuentasComparadas: 540, totalDiferencias: 0, menores: 0, diferencias: [], ...over,
});
const render = (resultado: ComparacionBorradorCorte | null, cargando = false) =>
  renderToStaticMarkup(React.createElement(BalancesDelMismoCorte, { resultado, cargando }));

describe("BalancesDelMismoCorte", () => {
  it("dice que coincide con cada balance del corte", () => {
    const html = render({ ok: true, etiqueta: "Corte 31/12/2025", tolerancia: 1_000, balances: [bal()], bloqueo: null });
    expect(html).toContain("Balances del mismo corte · Corte 31/12/2025");
    expect(html).toContain("Coincide · 540 cuentas");
    expect(html).not.toContain("Se puede cargar igual");
  });

  it("muestra las diferencias y avisa que quedará inconsistente", () => {
    const html = render({ ok: true, etiqueta: "Corte 31/12/2025", tolerancia: 1_000, bloqueo: null, balances: [bal({
      coincide: false, totalDiferencias: 1,
      diferencias: [{ cuenta8: "110505", nombre: "Caja", saldoA: 100, saldoB: 90, diferencia: 10, estado: "descuadre" }],
    })] });
    expect(html).toContain("Difiere en 1 cuenta(s)");
    expect(html).toContain("110505");
    expect(html).toContain("Se puede cargar igual");
  });

  it("una diferencia menor al umbral se muestra sin dejarlo inconsistente", () => {
    const html = render({ ok: true, etiqueta: "Corte 31/12/2025", tolerancia: 1_000, bloqueo: null, balances: [bal({
      coincide: true, totalDiferencias: 1, menores: 1,
      diferencias: [{ cuenta8: "53959501", nombre: "Ajuste al peso", saldoA: 132_390.9, saldoB: 132_399.5, diferencia: -8.6, estado: "descuadre" }],
    })] });
    expect(html).toContain("Coincide · 1 diferencia(s) menor(es) a $ 1.000");
    expect(html).toContain("53959501");
    expect(html).not.toContain("Se puede cargar igual");
  });

  it("una diferencia con la versión que esta carga reemplaza no la deja inconsistente", () => {
    const html = render({ ok: true, etiqueta: "Corte 31/12/2025", tolerancia: 1_000, bloqueo: null, balances: [bal({ mismaLinea: true, coincide: false, totalDiferencias: 2 })] });
    expect(html).toContain("Esta carga la reemplaza");
    expect(html).not.toContain("Se puede cargar igual");
  });

  it("explica el bloqueo cuando la vigente de la misma línea está cerrada", () => {
    const html = render({ ok: true, etiqueta: "Corte 31/12/2025", tolerancia: 1_000, balances: [bal({ estaCongelado: true, mismaLinea: true })], bloqueo: { balanceId: 316, mensaje: "La versión v1 de Diciembre 2025 · Por terceros está cerrada: ábrela con «Abrir balance» antes de cargar una versión nueva." } });
    expect(html).toContain("está cerrada");
    expect(html).toContain("/balance/316");
  });

  it("primer balance del corte y estado de carga", () => {
    expect(render({ ok: true, etiqueta: "Corte 31/12/2025", tolerancia: 1_000, balances: [], bloqueo: null })).toContain("primer balance del cliente con corte 31/12/2025");
    expect(render(null, true)).toContain("Comparando");
    expect(render(null, false)).toBe("");
  });
});
