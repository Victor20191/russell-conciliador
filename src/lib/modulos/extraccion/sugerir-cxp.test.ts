import { describe, expect, it } from "vitest";
import type { GridHoja } from "@/lib/balance/extraccion/ingesta";
import { descriptorModulo } from "../descriptores";
import { sugerirSpec } from "./sugerir";
import encabezados from "../cxp/__fixtures__/encabezados-cxp.json";

/**
 * El sugeridor contra los ENCABEZADOS REALES de los 17 auxiliares de cuentas por pagar que
 * los clientes de la firma entregan. El fixture guarda solo la fila de encabezado tal como la
 * lee la ingesta de la plataforma, sin datos de proveedores.
 *
 * Solo se fija lo que decide el encabezado. Lo que depende de los datos —el NIT por contenido
 * de SIESA, la fila rotulada de SEVEN, el saldo del bloque de SIIGO y el signo— tiene sus
 * propias pruebas en `transformar-cxp.test.ts`, y la corrida real lo verifica contra la
 * taxonomía.
 */
const CXP = descriptorModulo("CXP")!;

const fixture = encabezados as Record<string, { software: string; hoja: string; encabezado: (string | null)[] }>;

/** Hoja sintética con el encabezado real en la fila 1 (sin datos). */
const hojaDe = (slug: string): GridHoja => ({ nombre: fixture[slug].hoja, filas: [fixture[slug].encabezado] });

describe("sugerirSpec · mapeo de los encabezados reales de CxP", () => {
  // Columna 1-based → rol esperado, y cuántas columnas de edades reconoce.
  const ESPERADO: Record<string, { roles: Record<number, string>; edades: number }> = {
    "laminaire-nal": { roles: { 1: "documento", 2: "nit", 3: "nombre", 4: "fecha", 5: "vencimiento", 6: "diasVencidos", 7: "total" }, edades: 5 },
    // Anexo del exterior con el saldo en USD y en COP: manda la columna en pesos.
    "laminaire-ext": { roles: { 1: "nit", 2: "nombre", 3: "tipoDocumento", 4: "documento", 6: "fecha", 7: "vencimiento", 8: "diasVencidos", 15: "tasaCambio", 16: "total" }, edades: 10 },
    "libra-dan": { roles: { 1: "sucursal", 2: "documento", 3: "cuenta", 4: "vencimiento", 5: "nit", 6: "nombre", 7: "total", 9: "fecha", 11: "edadEtiqueta" }, edades: 0 },
    // El NIT comparte la columna 4 con la cuenta y el documento: lo resuelve el contenido.
    "siesa-zarzal": { roles: { 4: "documento", 5: "fecha", 6: "vencimiento", 10: "marcaSeccion", 19: "total" }, edades: 7 },
    "siesa-plasmar-nal": { roles: { 1: "nit", 2: "nombre", 3: "total" }, edades: 0 },
    "plasmar-usd-eur": { roles: { 2: "nit", 3: "nombre", 4: "documento", 6: "fecha", 7: "vencimiento", 8: "moneda", 10: "tasaCambio", 11: "total" }, edades: 0 },
    // «Saldo vencido» es el saldo abierto del documento en SAP.
    "sap-igb": { roles: { 1: "nit", 2: "nombre", 3: "tipoDocumento", 4: "documento", 7: "vencimiento", 8: "fecha", 10: "total", 16: "cuenta" }, edades: 5 },
    // «TOTAL» es el valor original de la factura; lo pendiente es «SALDO».
    "seven-camara": { roles: { 1: "tipoDocumento", 3: "documento", 4: "cuenta", 5: "fecha", 7: "vencimiento", 8: "diasVencidos", 9: "total" }, edades: 8 },
    metroplus: { roles: { 1: "fecha", 3: "documento", 4: "nit", 5: "nombre" }, edades: 4 },
    "siigo-pure-nature": { roles: { 1: "nit", 2: "nombre", 3: "sucursal", 4: "documento", 5: "vencimiento", 13: "total" }, edades: 6 },
    // Cédula sin NIT: el proveedor se identifica por nombre. «Vencido» se resuelve con los datos.
    helisa: { roles: { 1: "nombre", 2: "cuenta", 9: "total" }, edades: 4 },
    "world-office": { roles: { 2: "nombre", 3: "nit", 6: "sucursal", 11: "tipoDocumento", 12: "documento", 13: "fecha", 14: "vencimiento", 15: "total", 21: "diasVencidos" }, edades: 5 },
    "siesa-mineralin": { roles: { 1: "nit", 8: "marcaSeccion", 15: "total" }, edades: 5 },
    "ilimitada-kp": { roles: { 2: "nit", 3: "nombre" }, edades: 9 },
    "siesa-aceros": { roles: { 1: "nit", 8: "marcaSeccion", 14: "total" }, edades: 0 },
    "sap-redplas": { roles: { 1: "nit", 2: "nombre", 4: "tipoDocumento", 5: "documento", 7: "fecha", 8: "vencimiento", 10: "total" }, edades: 6 },
    // Con solo el encabezado, «SALDO» queda como total; con los datos pasa a saldo del bloque.
    "siigo-kakaraka": { roles: { 1: "cuenta", 9: "dv", 10: "nit", 11: "sucursal", 12: "nombre", 13: "total", 18: "documento", 19: "fecha", 20: "vencimiento" }, edades: 5 },
  };

  it("el fixture cubre los 17 auxiliares que la ingesta lee", () => {
    expect(Object.keys(fixture).sort()).toEqual(Object.keys(ESPERADO).sort());
  });

  for (const [slug, esperado] of Object.entries(ESPERADO)) {
    it(`${slug} (${fixture[slug].software})`, () => {
      const spec = sugerirSpec(CXP, hojaDe(slug));
      const rolPorColumna = new Map<number, string>();
      for (const [rol, col] of Object.entries(spec.columnas)) if (col >= 1) rolPorColumna.set(col, rol);
      for (const [col, rol] of Object.entries(esperado.roles)) {
        expect(rolPorColumna.get(Number(col)), `columna ${col} «${fixture[slug].encabezado[Number(col) - 1]}»`).toBe(rol);
      }
      expect(spec.familias?.edades?.length ?? 0).toBe(esperado.edades);
    });
  }

  it("«VALOR VENCIDO» de SIIGO es un importe, no los días vencidos", () => {
    const spec = sugerirSpec(CXP, hojaDe("siigo-kakaraka"));
    expect(spec.columnas.diasVencidos).toBe(0);
  });

  it("«Vencido» de Helisa es un importe: con los datos no queda como días vencidos", () => {
    const hoja: GridHoja = {
      nombre: "Hoja1",
      filas: [
        fixture.helisa.encabezado,
        ["PROVEEDOR UNO S.A.S.", 23359509, 0, 80794100, 0, 0, 0, 80794100, 80794100],
        ["PROVEEDOR DOS S.A.", 23359510, 2204389, 0, 0, 0, 0, 0, 2204389],
        ["PROVEEDOR TRES S.A.", 23359510, 1475809, 0, 0, 0, 0, 0, 1475809],
        ["PROVEEDOR CUATRO S.A.", 22050501, 270600.5, 0, 0, 0, 0, 0, 270600.5],
      ],
    };
    const spec = sugerirSpec(CXP, hoja);
    expect(spec.columnas.diasVencidos).toBe(0);
    expect(spec.columnas.total).toBe(9);
  });

  it("conserva la columna de días vencidos cuando trae días", () => {
    const hoja: GridHoja = {
      nombre: "ANEXO CXP NACIONALES",
      filas: [
        fixture["laminaire-nal"].encabezado,
        ["FV-1", "900000001", "PROVEEDOR UNO S.A.S.", "2025-10-01", "2025-10-31", 61, 1500000, 0, 0, 0, 1500000, 0],
        ["FV-2", "900000002", "PROVEEDOR DOS S.A.", "2025-12-01", "2026-01-30", -30, 250000, 250000, 0, 0, 0, 0],
        ["FV-3", "900000003", "PROVEEDOR TRES S.A.", "2024-01-01", "2024-01-31", 700, 90000, 0, 0, 0, 0, 90000],
      ],
    };
    expect(sugerirSpec(CXP, hoja).columnas.diasVencidos).toBe(6);
  });
});
