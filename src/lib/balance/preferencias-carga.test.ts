import { describe, expect, it } from "vitest";
import { aplicarPreferenciasCarga } from "./preferencias-carga";
import type { MappingSpec } from "./extraccion/esquema";

const spec: MappingSpec = {
  hoja: "Balance",
  filaEncabezado: 2,
  primeraFilaDatos: 3,
  columnas: {
    codigo: 1,
    codigoFragmentos: [],
    nombre: 2,
    saldoInicial: 3,
    debitos: 4,
    creditos: 5,
    saldoFinal: 6,
    saldoFinalDebito: 0,
    saldoFinalCredito: 0,
    tercero: 7,
  },
  signoCredito: "firmado",
  reglaDetalle: { tipo: "prefijo", columna: null, valor: null },
  agregarPorTercero: false,
  nit: { valor: null, fuente: "NINGUNO" },
  periodoInicial: { valor: null, fuente: "NINGUNO" },
  periodoFinal: { valor: null, fuente: "NINGUNO" },
  estandar: "NIF",
  importable: true,
  motivoNoImportable: null,
  excepciones: [],
  confianza: 0.9,
  notas: null,
};

describe("aplicarPreferenciasCarga", () => {
  it("hace prevalecer signo y tercero configurados por el cliente", () => {
    const aplicado = aplicarPreferenciasCarga(spec, {
      convencionCredito: "magnitud",
      agregarPorTercero: true,
    });

    expect(aplicado.signoCredito).toBe("magnitud");
    expect(aplicado.agregarPorTercero).toBe(true);
    expect(spec.signoCredito).toBe("firmado");
  });

  it("conserva lo detectado cuando las preferencias están en automático", () => {
    expect(
      aplicarPreferenciasCarga(spec, {
        convencionCredito: null,
        agregarPorTercero: null,
      }),
    ).toBe(spec);
  });
});
