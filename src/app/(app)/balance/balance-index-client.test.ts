import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import BalanceIndexClient, { type ClientGroup, type PeriodRow } from "./balance-index-client";
// El modal de carga arrastra Server Actions y el lector de archivos: no es parte de lo
// que se prueba acá y se renderiza solo con permiso de carga (`canUpload: false`).
vi.mock("./cargar-balance-modal", () => ({ CargarBalanceButton: () => null }));
// El runner sin plugin React transforma JSX con el runtime clásico.
vi.stubGlobal("React", React);

const fila = (over: Partial<PeriodRow> & Pick<PeriodRow, "key" | "period">): PeriodRow => ({
  versions: 1, officialId: 1, status: "Con alertas", complete: 100, lastUpload: "05/Sep/2026 12:31 p. m.",
  mapped: 178, unmapped: 0, total: 178, apertura: "tercero", inconsistentes: 0, ...over,
});

// Caso real que motivó el cambio: FUNDACION INFANTIL SANTIAGO CORAZON entregó Enero 2025
// por cuenta (id 244, 176 filas) y por terceros (id 245, 178 filas). El listado indexaba
// por nombre de período y solo mostraba el más reciente.
const CLIENTE: ClientGroup = {
  clientId: 9, clientName: "FUNDACION INFANTIL SANTIAGO CORAZON", clientNit: "800039776",
  periodList: [
    {
      period: "Enero 2025", paralelo: true,
      rows: [
        fila({ key: "9::Enero 2025::cuenta", period: "Enero 2025", apertura: "cuenta", officialId: 244, mapped: 176, total: 176, inconsistentes: 1 }),
        fila({ key: "9::Enero 2025::tercero", period: "Enero 2025", apertura: "tercero", officialId: 245, mapped: 178, total: 178, inconsistentes: 1 }),
      ],
    },
    {
      period: "Diciembre 2026", paralelo: false,
      rows: [fila({ key: "9::Diciembre 2026::tercero", period: "Diciembre 2026", officialId: 243, mapped: 333, total: 334, unmapped: 1 })],
    },
  ],
};

const render = (clients: ClientGroup[]) =>
  renderToStaticMarkup(React.createElement(BalanceIndexClient, {
    clients, auditRows: [], auditClients: [], uploadClients: [], canUpload: false, configuracionIA: null,
  }));

describe("listado de balances · período con las dos aperturas", () => {
  it("muestra los DOS balances del período, no solo el último cargado", () => {
    const html = render([CLIENTE]);
    // Ambos archivos alcanzables por su propio id, con su propio mapeo.
    expect(html).toContain("/balance/244");
    expect(html).toContain("/balance/245");
    expect(html).toContain("176/176");
    expect(html).toContain("178/178");
    expect(html).toContain("Por cuenta");
    expect(html).toContain("Por terceros");
  });

  it("marca la inconsistencia en las dos aperturas y en el rótulo del período", () => {
    const html = render([CLIENTE]);
    expect(html).toContain("2 aperturas inconsistentes");
    // Cada archivo lleva su propia marca, enlazada a su panel de validación cruzada.
    expect(html).toContain("/balance/244#cruce-aperturas");
    expect(html).toContain("/balance/245#cruce-aperturas");
    expect(html.match(/>Inconsistente</g) ?? []).toHaveLength(2);
  });

  it("rotula el período una sola vez y anuncia cuántas aperturas cuelgan", () => {
    const html = render([CLIENTE]);
    expect(html).toContain("2 aperturas");
    // El período se nombra en el rótulo y en el texto accesible de cada renglón colgado,
    // pero no se repite como etiqueta visible de la celda.
    expect(html.match(/Enero 2025</g) ?? []).toHaveLength(3);
  });

  it("cuenta PERÍODOS en el encabezado del cliente, no renglones", () => {
    // Dos períodos (uno de ellos con dos aperturas) siguen siendo 2 período(s).
    expect(render([CLIENTE])).toContain("2 período(s)");
  });
});

describe("listado de balances · período con una sola apertura", () => {
  const soloUna: ClientGroup = { ...CLIENTE, periodList: [CLIENTE.periodList[1]] };

  it("se sigue viendo como un renglón plano, con su período visible", () => {
    const html = render([soloUna]);
    expect(html).toContain("Diciembre 2026");
    expect(html).not.toContain("aperturas");
    expect(html).toContain("1 sin mapeo");
  });

  it("conserva el aviso por conteo de archivos cuando no hay renglones colgados", () => {
    const conAviso: ClientGroup = {
      ...soloUna,
      periodList: [{ ...soloUna.periodList[0], rows: [{ ...soloUna.periodList[0].rows[0], inconsistentes: 2 }] }],
    };
    const html = render([conAviso]);
    expect(html).toContain("2 archivo(s) inconsistente(s)");
    expect(html).not.toContain(">Inconsistente<");
  });
});
