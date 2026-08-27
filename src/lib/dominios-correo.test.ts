import { describe, expect, it } from "vitest";
import {
  correoEsDeAlgunDominio,
  correoEsDelDominio,
  DOMINIO_XENTRIA,
  DOMINIOS_RUSSELL,
} from "./dominios-correo";

const RUSSELL = "@russellbedford.com.co";

describe("correoEsDelDominio", () => {
  it("reconoce el dominio sin importar mayúsculas ni espacios sobrantes", () => {
    expect(correoEsDelDominio("admin@russellbedford.com.co", RUSSELL)).toBe(true);
    expect(correoEsDelDominio("  Luisa@XENTRIA.CO ", DOMINIO_XENTRIA)).toBe(true);
  });

  it("no confunde un dominio que solo termina parecido", () => {
    // Sin la arroba en la comparación, este correo pasaría por uno de Xentria.
    expect(correoEsDelDominio("falso@noxentria.co", DOMINIO_XENTRIA)).toBe(false);
    expect(correoEsDelDominio("ana@falsorussellbedford.com.co", RUSSELL)).toBe(false);
  });

  it("no se deja engañar por el dominio metido en el nombre del buzón", () => {
    expect(correoEsDelDominio("xentria.co@gmail.com", DOMINIO_XENTRIA)).toBe(false);
    expect(correoEsDelDominio("russellbedford.com.co@gmail.com", RUSSELL)).toBe(false);
  });

  it("distingue los dos dominios de Russell, que NO son sufijo uno del otro", () => {
    expect(correoEsDelDominio("ana@russellbedford.com.co", "@russellbedford.co")).toBe(false);
    expect(correoEsDelDominio("ana@russellbedford.co", RUSSELL)).toBe(false);
  });

  it("rechaza lo que no es un correo utilizable", () => {
    expect(correoEsDelDominio("staff@cliente.com", RUSSELL)).toBe(false);
    expect(correoEsDelDominio("", DOMINIO_XENTRIA)).toBe(false);
    expect(correoEsDelDominio(null, DOMINIO_XENTRIA)).toBe(false);
    expect(correoEsDelDominio(undefined, DOMINIO_XENTRIA)).toBe(false);
  });
});

describe("correoEsDeAlgunDominio", () => {
  it("acepta cualquiera de los buzones corporativos de Russell", () => {
    expect(correoEsDeAlgunDominio("ana@russellbedford.com.co", DOMINIOS_RUSSELL)).toBe(true);
    expect(correoEsDeAlgunDominio("ana@russellbedford.co", DOMINIOS_RUSSELL)).toBe(true);
    expect(correoEsDeAlgunDominio("ana@rbcol.co", DOMINIOS_RUSSELL)).toBe(true);
  });

  it("hereda las salvaguardas del singular", () => {
    expect(correoEsDeAlgunDominio("ana@falsorbcol.co", DOMINIOS_RUSSELL)).toBe(false);
    expect(correoEsDeAlgunDominio("rbcol.co@gmail.com", DOMINIOS_RUSSELL)).toBe(false);
    expect(correoEsDeAlgunDominio(null, DOMINIOS_RUSSELL)).toBe(false);
  });

  it("con la lista vacía nunca clasifica (fail-closed)", () => {
    expect(correoEsDeAlgunDominio("ana@russellbedford.com.co", [])).toBe(false);
  });
});
