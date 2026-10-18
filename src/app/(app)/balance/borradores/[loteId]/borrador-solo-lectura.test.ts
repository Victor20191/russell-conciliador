import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/app/actions/balance", () => ({
  actualizarAperturaBorrador: vi.fn(),
  actualizarPeriodoBorrador: vi.fn(),
  agregarParteBorrador: vi.fn(),
  aplicarCambiosBorrador: vi.fn(),
  asignarClienteBorrador: vi.fn(),
  cargarBorrador: vi.fn(),
  compararBorradorConCorte: vi.fn(async () => ({ ok: false, message: "sin datos" })),
  descartarBorrador: vi.fn(),
  guardarNotasDesdeEditor: vi.fn(),
}));

import BorradorDetailClient from "./borrador-detail-client";
import { compactarFilas } from "@/lib/balance/filas-compactas";
import type { FilaBorrador } from "@/lib/balance/borrador";
import { UMBRALES_ALERTAS_DEFECTO } from "@/lib/balance/umbrales-alertas";

const fila = (filaNum: number, codigo: string, nombre: string, tipoFila: FilaBorrador["tipoFila"], saldoFinal: number): FilaBorrador => ({
  filaNum, codigo, codigoCrudo: codigo, nombre, nivel: codigo.length, tipoFila,
  tipoFilaForzado: null, desacoplada: false, padreManual: null,
  saldoInicial: 0, debitos: Math.max(saldoFinal, 0), creditos: Math.max(-saldoFinal, 0), saldoFinal,
});

function render(soloLectura: boolean) {
  return renderToStaticMarkup(createElement(BorradorDetailClient, {
    loteId: "11111111-1111-4111-8111-111111111111",
    archivoNombre: "balance.xlsx",
    nitDetectado: "900123456",
    periodoInicial: "2026-01-01",
    periodoFinal: "2026-01-31",
    aperturaGuardada: "cuenta",
    filasCompactas: compactarFilas([
      fila(1, "11", "Disponible", "agrupadora", 100),
      fila(2, "110505", "Caja general", "movimiento", 100),
      fila(3, "31", "Capital", "agrupadora", -100),
      fila(4, "310505", "Capital autorizado", "movimiento", -100),
    ]),
    porTerceroDetectado: false,
    clientes: [{ id: 7, name: "Cliente Uno", nit: "900123456", notas: null, imputarSoloHojas: null }],
    clienteSugeridoId: 7,
    clientePersistido: true,
    correccionesAplicadas: 0,
    umbrales: UMBRALES_ALERTAS_DEFECTO,
    soloLectura,
  }));
}

describe("borrador en modo consulta (senior asignado)", () => {
  it("se puede revisar y descartar, pero no editar ni cargar", () => {
    const html = render(true);
    expect(html).toContain("Solo consulta");
    expect(html).toContain("Descartar borrador");
    expect(html).toContain("Cliente Uno");
    expect(html).not.toContain("Cargar balance");
    expect(html).not.toContain("Guardar cambios");
    expect(html).not.toContain("Agregar otra parte");
  });

  it("quien carga sigue viendo cargar y guardar", () => {
    const html = render(false);
    expect(html).toContain("Cargar balance");
    expect(html).toContain("Guardar cambios");
    expect(html).not.toContain("Solo consulta");
  });
});
