import { describe, expect, it } from "vitest";
import { correoEsDelDominio, DOMINIO_RUSSELL, DOMINIO_XENTRIA } from "./dominios-correo";

describe("correoEsDelDominio", () => {
  it("reconoce el dominio sin importar mayúsculas ni espacios sobrantes", () => {
    expect(correoEsDelDominio("admin@russellbedford.co", DOMINIO_RUSSELL)).toBe(true);
    expect(correoEsDelDominio("  Luisa@XENTRIA.CO ", DOMINIO_XENTRIA)).toBe(true);
  });

  it("no confunde un dominio que solo termina parecido", () => {
    // Sin la arroba en la comparación, este correo pasaría por uno de Xentria.
    expect(correoEsDelDominio("falso@noxentria.co", DOMINIO_XENTRIA)).toBe(false);
    expect(correoEsDelDominio("ana@falsorussellbedford.co", DOMINIO_RUSSELL)).toBe(false);
  });

  it("no se deja engañar por el dominio metido en el nombre del buzón", () => {
    expect(correoEsDelDominio("xentria.co@gmail.com", DOMINIO_XENTRIA)).toBe(false);
    expect(correoEsDelDominio("russellbedford.co@gmail.com", DOMINIO_RUSSELL)).toBe(false);
  });

  it("rechaza lo que no es un correo utilizable", () => {
    expect(correoEsDelDominio("staff@cliente.com", DOMINIO_RUSSELL)).toBe(false);
    expect(correoEsDelDominio("", DOMINIO_XENTRIA)).toBe(false);
    expect(correoEsDelDominio(null, DOMINIO_XENTRIA)).toBe(false);
    expect(correoEsDelDominio(undefined, DOMINIO_XENTRIA)).toBe(false);
  });
});
