import { describe, expect, it } from "vitest";
import { avisosDescongelar, quedoDescongelado } from "./descongelar";

describe("descongelar un balance", () => {
  it("avisa que vuelve a ser editable, si sigue siendo la oficial y que hay que volver a congelarla", () => {
    const avisos = avisosDescongelar({ esOficial: true, cierres: [] });
    expect(avisos).toHaveLength(3);
    expect(avisos[0]).toContain("editar otra vez");
    expect(avisos[1]).toContain("Sigue siendo la versión oficial");
    expect(avisos[2]).toContain("vuelve a congelarla");
    expect(avisos[2]).toContain("prevalidador");
    expect(avisosDescongelar({ esOficial: false, cierres: [] })[1]).toContain("No es la versión oficial");
  });

  it("lista las conciliaciones en firme del corte y aclara que sus cuentas siguen bloqueadas", () => {
    const una = avisosDescongelar({ esOficial: true, cierres: [{ modulo: "Cartera", cargue: 41, cerradoPor: "Ana" }] });
    expect(una).toHaveLength(4);
    expect(una[3]).toBe("Hay una conciliación en firme en este corte: Cartera (cargue #41, cerró Ana). Sus cuentas siguen bloqueadas aunque el balance quede descongelado.");
    const dos = avisosDescongelar({
      esOficial: true,
      cierres: [{ modulo: "Cartera", cargue: 41, cerradoPor: "Ana" }, { modulo: "Nómina", cargue: 88, cerradoPor: "Luis" }],
    });
    expect(dos[3]).toContain("Hay conciliaciones en firme");
    expect(dos[3]).toContain("Nómina (cargue #88, cerró Luis)");
  });

  it("quedoDescongelado: sin congelar y con la marca de descongelado", () => {
    expect(quedoDescongelado({ estaCongelado: false, descongeladoEn: new Date() })).toBe(true);
    expect(quedoDescongelado({ estaCongelado: true, descongeladoEn: new Date() })).toBe(false);
    expect(quedoDescongelado({ estaCongelado: false, descongeladoEn: null })).toBe(false); // nunca se congeló
  });
});
