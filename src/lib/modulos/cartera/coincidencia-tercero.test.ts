import { describe, expect, it } from "vitest";
import { coincidenciaTercero, confianzaSenales, similitudSaldos } from "./coincidencia-tercero";
import type { FilaCruceTerceroCartera } from "./cruce-tercero-cartera";

function fila(parcial: Partial<FilaCruceTerceroCartera> & { c?: number; m?: number }): FilaCruceTerceroCartera {
  const c = parcial.c ?? 0;
  const m = parcial.m ?? 0;
  return {
    clave: "900",
    nombre: null,
    sinNit: false,
    claveModuloPorDv: null,
    claveModuloPorNucleo: null,
    sugerencia: null,
    explicaDiferencia: null,
    emparejadoDesde: [],
    separadoDe: [],
    contable: { porCuenta: {}, total: c },
    modulo: { nacional: m, exterior: 0, sinOrigen: 0, total: m },
    diferencia: c - m,
    estado: "cuadra",
    ...parcial,
  };
}

describe("similitudSaldos", () => {
  it("iguales → 100, opuestos o en cero → 0", () => {
    expect(similitudSaldos(100, 100)).toBe(100);
    expect(similitudSaldos(100, -100)).toBe(0);
    expect(similitudSaldos(100, 0)).toBe(0);
  });
  it("parte común truncada, nunca 100 si no cuadra", () => {
    expect(similitudSaldos(189_767_845.67, 204_097_359.67)).toBe(92);
    expect(similitudSaldos(1_000_000, 999_999)).toBe(99);
  });
});

describe("confianzaSenales", () => {
  it("combina señales como evidencias independientes", () => {
    expect(confianzaSenales([])).toBe(0);
    expect(confianzaSenales(["nombre"])).toBe(60);
    expect(confianzaSenales(["saldo", "nombre"])).toBe(88);
    expect(confianzaSenales(["nit_dv"])).toBe(95);
  });
});

describe("coincidenciaTercero", () => {
  it("sin saldo no tiene nada que cruzar", () => {
    expect(coincidenciaTercero(fila({ estado: "sin_saldo" }))).toBeNull();
  });

  it("mismo NIT y cuadra → 100 %", () => {
    expect(coincidenciaTercero(fila({ c: 500, m: 500 }))).toMatchObject({ porcentaje: 100, tipo: "cruzado", identidad: 100, valor: 100 });
  });

  it("descuadre con el mismo NIT → la parte común del saldo", () => {
    const r = coincidenciaTercero(fila({ estado: "descuadre", c: 189_767_845.67, m: 204_097_359.67 }));
    expect(r).toMatchObject({ porcentaje: 92, tipo: "cruzado", valor: 92 });
  });

  it("unido por núcleo pesa la identidad aunque cuadre", () => {
    const r = coincidenciaTercero(fila({ c: 1_666_000, m: 1_666_000, claveModuloPorNucleo: "115221809" }));
    expect(r).toMatchObject({ porcentaje: 85, identidad: 85, valor: 100 });
  });

  it("emparejado por el auditor cuenta como identidad plena", () => {
    expect(coincidenciaTercero(fila({ c: 10, m: 10, emparejadoDesde: ["15370181"] }))?.porcentaje).toBe(100);
  });

  it("solo en un lado con candidato → confianza del candidato", () => {
    const r = coincidenciaTercero(fila({
      estado: "solo_contable",
      c: 14_329_514,
      sugerencia: { clave: "890903938", nombre: "BANCOLOMBIA", senales: ["saldo", "nombre"], confianza: "alta" },
    }));
    expect(r).toMatchObject({ porcentaje: 88, tipo: "candidato", valor: null });
  });

  it("dice contra qué se calculó", () => {
    expect(coincidenciaTercero(fila({ estado: "descuadre", c: 90, m: 100 }))?.contra).toBe("mismo NIT en el auxiliar · saldos 90 % iguales");
    expect(coincidenciaTercero(fila({ c: 5, m: 5, claveModuloPorNucleo: "115221809" }))?.contra).toBe("con 115221809 del auxiliar (por núcleo) · saldos iguales");
  });

  it("la diferencia que es el saldo de un tercero suelto se señala en los dos renglones", () => {
    const descuadre = coincidenciaTercero(fila({
      estado: "descuadre", c: 189_767_845.67, m: 204_097_359.67,
      explicaDiferencia: { clave: "860059294", nombre: null, rol: "suelto", ladoSuelto: "contable", importe: 14_329_514, nombreParecido: false },
    }));
    expect(descuadre).toMatchObject({ porcentaje: 92, tipo: "cruzado", propuesto: { clave: "860059294" } });
    expect(descuadre?.contra).toContain("diferencia = saldo de 860059294");

    const suelto = coincidenciaTercero(fila({
      clave: "860059294", estado: "solo_contable", c: 14_329_514,
      explicaDiferencia: { clave: "890903938", nombre: "BANCOLOMBIA SA", rol: "descuadre", ladoSuelto: "contable", importe: 14_329_514, nombreParecido: false },
    }));
    expect(suelto).toMatchObject({ porcentaje: 70, tipo: "candidato", propuesto: { clave: "890903938", nombre: "BANCOLOMBIA SA" } });
  });

  it("solo en un lado sin candidato → 0 %", () => {
    expect(coincidenciaTercero(fila({ estado: "solo_modulo", m: 50 }))).toMatchObject({ porcentaje: 0, tipo: "sin_cruce" });
  });
});
