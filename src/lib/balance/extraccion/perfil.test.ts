import { describe, it, expect } from "vitest";
import { aplanarSpec, specCargaDesdePerfil, specDesdePerfil } from "./perfil";
import { transformarTabular, type ParamsExtraccion } from "./transformar";
import type { GridHoja } from "./ingesta";
import type { MappingSpec, SpecCarga } from "./esquema";

const SPEC: MappingSpec = {
  hoja: "Balance",
  filaEncabezado: 3,
  primeraFilaDatos: 4,
  columnas: {
    codigo: 1,
    nombre: 2,
    saldoInicial: 3,
    debitos: 4,
    creditos: 5,
    saldoFinal: 6,
    saldoFinalDebito: 0,
    saldoFinalCredito: 0,
    tercero: 0,
  },
  signoCredito: "magnitud",
  reglaDetalle: { tipo: "columna", columna: 7, valor: "I" },
  agregarPorTercero: false,
  nit: { valor: "890903938", fuente: "FUENTE" },
  periodoInicial: { valor: "2026-05-01", fuente: "PARAMETRO" },
  periodoFinal: { valor: "2026-05-31", fuente: "PARAMETRO" },
  estandar: "NIIF",
  importable: true,
  motivoNoImportable: null,
  excepciones: [{ hoja: "Balance", fila: 9, campo: "codigo", valor: "x", regla: "r", accion: "a" }],
  confianza: 0.92,
  notas: "notas de la corrida",
};

describe("aplanarSpec ↔ specCargaDesdePerfil", () => {
  it("ida y vuelta conserva el layout completo", () => {
    const esperado: SpecCarga = {
      hoja: SPEC.hoja,
      filaEncabezado: SPEC.filaEncabezado,
      primeraFilaDatos: SPEC.primeraFilaDatos,
      columnas: SPEC.columnas,
      signoCredito: SPEC.signoCredito,
      reglaDetalle: SPEC.reglaDetalle,
      agregarPorTercero: SPEC.agregarPorTercero,
    };
    expect(specCargaDesdePerfil(aplanarSpec(SPEC))).toEqual(esperado);
  });

  it("aplana columnas y regla de detalle a campos planos del modelo", () => {
    const plano = aplanarSpec(SPEC);
    expect(plano.colCodigo).toBe(1);
    expect(plano.colSaldoFinalDebito).toBe(0);
    expect(plano.reglaDetalleTipo).toBe("columna");
    expect(plano.reglaDetalleColumna).toBe(7);
    expect(plano.reglaDetalleValor).toBe("I");
  });
});

describe("equivalencia de transformación (perfil ↔ spec original)", () => {
  it("aplicar el spec reconstruido del perfil da el mismo resultado que el original", () => {
    const hoja: GridHoja = {
      nombre: "Balance",
      filas: [
        ["Empresa XYZ", "", "", "", "", ""],
        ["", "", "", "", "", ""],
        ["Código", "Cuenta", "Saldo anterior", "Débito", "Crédito", "Saldo final"],
        [110505, "Caja", 1000, 500, 0, 1500],
        [220505, "Proveedores", 2000, 0, 500, 2500],
      ],
    };
    // Spec como el que devolvería la IA, con la cabecera en neutro: el NIT y el
    // estándar son metadatos POR CORRIDA (los aporta la detección determinista y
    // los parámetros del asistente, no el perfil), así que la equivalencia se
    // valida sobre lo que depende del LAYOUT.
    const original: MappingSpec = {
      ...SPEC,
      filaEncabezado: 3,
      primeraFilaDatos: 4,
      signoCredito: "magnitud",
      reglaDetalle: { tipo: "prefijo", columna: null, valor: null },
      nit: { valor: null, fuente: "NINGUNO" },
      periodoInicial: { valor: null, fuente: "NINGUNO" },
      periodoFinal: { valor: null, fuente: "NINGUNO" },
      estandar: "AUTO",
      excepciones: [],
      notas: null,
      confianza: 0.88,
    };
    const params: ParamsExtraccion = { nit: null, periodoInicial: null, periodoFinal: null, estandar: "AUTO" };
    const reconstruido = specDesdePerfil(aplanarSpec(original));
    const a = transformarTabular(original, [hoja], params);
    const b = transformarTabular(reconstruido, [hoja], params);
    expect(b.importReady).toEqual(a.importReady);
    expect(b.cuadre).toEqual(a.cuadre);
    expect(b.resumen).toEqual(a.resumen);
    expect(b.filasCrudas).toEqual(a.filasCrudas);
  });
});

describe("specDesdePerfil", () => {
  it("reconstruye un MappingSpec completo con metadatos neutros", () => {
    const spec = specDesdePerfil(aplanarSpec(SPEC));
    // Layout intacto…
    expect(spec.hoja).toBe(SPEC.hoja);
    expect(spec.columnas).toEqual(SPEC.columnas);
    expect(spec.signoCredito).toBe(SPEC.signoCredito);
    expect(spec.reglaDetalle).toEqual(SPEC.reglaDetalle);
    // …metadatos de corrida en neutro (NO arrastra NIT/período/confianza viejos).
    expect(spec.importable).toBe(true);
    expect(spec.confianza).toBe(1);
    expect(spec.excepciones).toEqual([]);
    expect(spec.estandar).toBe("AUTO");
    expect(spec.nit).toEqual({ valor: null, fuente: "NINGUNO" });
    expect(spec.periodoInicial.fuente).toBe("NINGUNO");
  });
});
