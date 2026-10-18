import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import BalanceIndexClient, { type ClientGroup, type CorteGroup, type CorteRow } from "./balance-index-client";
// El modal de carga arrastra Server Actions y el lector de archivos: no es parte de lo
// que se prueba acá y se renderiza solo con permiso de carga (`canUpload: false`).
vi.mock("./cargar-balance-modal", () => ({ CargarBalanceButton: () => null }));
// El runner sin plugin React transforma JSX con el runtime clásico.
vi.stubGlobal("React", React);

const fila = (over: Partial<CorteRow> & Pick<CorteRow, "key" | "id" | "period">): CorteRow => ({
  versions: 1, status: "En proceso con alertas", complete: 100, lastUpload: "05/Sep/2026 12:31 p. m.",
  mapped: 178, unmapped: 0, total: 178, apertura: "cuenta", inconsistente: false, enFirme: [], ...over,
});

// Caso real: KAKARAKA tiene «Diciembre 2025» por terceros y «Enero 2025 – Diciembre 2025» por
// terceros, que terminan el mismo día y se comparan por saldo final.
const CORTE_DIC: CorteGroup = {
  key: "9::2025-12-31", fechaCorte: "31/12/2025", estado: "inconsistente",
  rows: [
    fila({ key: "dic", id: 316, period: "Diciembre 2025", apertura: "tercero", status: "Cerrado", inconsistente: true }),
    fila({ key: "anual", id: 274, period: "Enero 2025 – Diciembre 2025", apertura: "tercero", versions: 2, inconsistente: true }),
  ],
};
const CORTE_MAR: CorteGroup = {
  key: "9::2026-03-31", fechaCorte: "31/03/2026", estado: "unico",
  rows: [fila({ key: "mar", id: 120, period: "Marzo 2026", mapped: 399, total: 400, unmapped: 1 })],
};
const CLIENTE: ClientGroup = { clientId: 9, clientName: "KAKARAKA S.A.S.", clientNit: "800070771", cortes: [CORTE_DIC, CORTE_MAR] };

const render = (clients: ClientGroup[]) =>
  renderToStaticMarkup(React.createElement(BalanceIndexClient, {
    clients, auditRows: [], auditClients: [], uploadClients: [], canUpload: false, configuracionIA: null,
  }));

describe("listado de balances · agrupado por fecha de corte", () => {
  it("rotula el corte una vez y muestra el período completo de cada balance", () => {
    const html = render([CLIENTE]);
    expect(html).toContain("Corte 31/12/2025");
    expect(html).toContain("2 balances");
    expect(html).toContain("Diciembre 2025");
    expect(html).toContain("Enero 2025 – Diciembre 2025");
    expect(html).toContain("/balance/316");
    expect(html).toContain("/balance/274");
  });

  it("dice si los saldos finales del corte coinciden y marca los balances que difieren", () => {
    const html = render([CLIENTE]);
    expect(html).toContain(">Inconsistentes<");
    expect(html).toContain("/balance/316#corte");
    expect(html.match(/>Inconsistente</g) ?? []).toHaveLength(2);
  });

  it.each([
    ["consistente", "Consistentes"],
    ["sin_comparar", "Sin comparar"],
  ] as const)("muestra el estado %s del corte", (estado, etiqueta) => {
    const html = render([{ ...CLIENTE, cortes: [{ ...CORTE_DIC, estado, rows: CORTE_DIC.rows.map((r) => ({ ...r, inconsistente: false })) }] }]);
    expect(html).toContain(`>${etiqueta}<`);
    expect(html).not.toContain(">Inconsistente<");
  });

  it("un corte con un solo balance es un renglón plano con su fecha de corte", () => {
    const html = render([{ ...CLIENTE, cortes: [CORTE_MAR] }]);
    expect(html).toContain("Marzo 2026");
    expect(html).toContain("· corte 31/03/2026");
    expect(html).not.toContain("balances<");
    expect(html).toContain("1 sin mapeo");
  });

  it("cuenta CORTES en el encabezado del cliente", () => {
    expect(render([CLIENTE])).toContain("2 corte(s)");
  });

  it("el conteo de versiones abre la bitácora de la línea", () => {
    expect(render([CLIENTE])).toContain("/balance/274?tab=versiones");
  });

  it("marca el balance contra el que hay una conciliación en firme", () => {
    const html = render([{ ...CLIENTE, cortes: [{ ...CORTE_MAR, rows: [{ ...CORTE_MAR.rows[0], enFirme: ["INV"] }] }] }]);
    expect(html).toContain("En firme · INV");
  });
});

describe("listado de balances · balance partido en varios archivos", () => {
  const partido = (archivos: string[] | undefined): ClientGroup => ({
    clientId: 7, clientName: "EL ZARZAL S.A.", clientNit: "890920001",
    cortes: [{ key: "7::2025-12-31", fechaCorte: "31/12/2025", estado: "unico", rows: [fila({ key: "z", id: 900, period: "Enero 2025 – Diciembre 2025", archivos })] }],
  });

  it("indica cuántos archivos formaron la versión y cuáles son", () => {
    const html = render([partido(["Balance por tercero ESF.xls", "Balance por tercero ER.xls"])]);
    expect(html).toContain(">2 archivos<");
    expect(html).toContain("Balance por tercero ESF.xls + Balance por tercero ER.xls");
  });

  it("un balance de un solo archivo no muestra el indicador", () => {
    expect(render([partido(undefined)])).not.toContain("archivos<");
    expect(render([partido(["uno.xlsx"])])).not.toContain("archivos<");
  });
});
