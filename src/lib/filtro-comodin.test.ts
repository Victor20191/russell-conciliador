import { describe, expect, it } from "vitest";
import { coincideComodin, coincideTextoConComodin, tieneComodin } from "./filtro-comodin";

describe("comodín de posición en los códigos de cuenta", () => {
  it("el caso del usuario: **25 pide 25 en los dígitos 3 y 4", () => {
    // Cualquier código cuyos dígitos 3 y 4 sean «25», sin importar lo que venga antes ni después.
    for (const codigo of ["112505", "11250501", "11250502", "11250504", "222501", "2225"]) {
      expect(coincideComodin(codigo, "**25"), codigo).toBe(true);
    }
    for (const codigo of ["110510", "110505", "251005", "133015", "41"]) {
      expect(coincideComodin(codigo, "**25"), codigo).toBe(false);
    }
  });

  it("el patrón se ancla al principio y lo que sigue queda libre", () => {
    expect(coincideComodin("11250501", "1*25")).toBe(true);
    // El patrón empieza en el primer dígito: «11*5» pide un 5 en el cuarto, y 112505 lo tiene.
    expect(coincideComodin("112505", "11*5")).toBe(true);
    expect(coincideComodin("112505", "11*4")).toBe(false);
    expect(coincideComodin("41", "4*")).toBe(true);
    // Un comodín exige que haya un carácter en esa posición.
    expect(coincideComodin("4", "4*")).toBe(false);
  });

  it("la interrogación hace lo mismo que el asterisco y el patrón vacío no filtra", () => {
    expect(coincideComodin("112505", "??25")).toBe(true);
    expect(tieneComodin("**25")).toBe(true);
    expect(tieneComodin("1125")).toBe(false);
    expect(coincideComodin("112505", "")).toBe(true);
    expect(coincideComodin(null, "**25")).toBe(false);
  });

  it("sin comodines el texto sigue buscando por subcadena", () => {
    expect(coincideTextoConComodin("PROVISION CESANTIAS", "cesantias")).toBe(true);
    expect(coincideTextoConComodin("CESANTÍAS", "cesantias")).toBe(true);
    expect(coincideTextoConComodin("11250501", "2505")).toBe(true);
    // Con comodín manda la posición: «2505» ya no vale en mitad del código.
    expect(coincideTextoConComodin("11250501", "**2505")).toBe(true);
    expect(coincideTextoConComodin("11250501", "**0501")).toBe(false);
  });

  it("los caracteres de expresión regular se buscan tal cual", () => {
    expect(coincideComodin("1.25", "1.*5")).toBe(true);
    expect(coincideComodin("1x25", "1.*5")).toBe(false);
    expect(coincideComodin("a+b25", "a+b25")).toBe(true);
    expect(coincideComodin("axb25", "a+b25")).toBe(false);
  });
});
