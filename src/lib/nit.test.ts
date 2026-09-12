import { describe, expect, it } from "vitest";
import { claveNit, claveTerceroCanonica, dvNit, dvValido, nitCoincide, nucleoNit, tieneDigitosNit } from "./nit";

describe("claveNit / tieneDigitosNit", () => {
  it("deja solo los dígitos", () => {
    expect(claveNit("900.204.935-2")).toBe("9002049352");
    expect(claveNit("sin nit")).toBe("");
  });

  it("detecta si hay dígitos", () => {
    expect(tieneDigitosNit("N/A")).toBe(false);
    expect(tieneDigitosNit("830515061-1")).toBe(true);
  });
});

describe("nucleoNit", () => {
  it("recorta el dígito de verificación (9 primeros dígitos)", () => {
    expect(nucleoNit("900.204.935-2")).toBe("900204935");
    expect(nucleoNit("900204935")).toBe("900204935");
  });
});

describe("nitCoincide", () => {
  it("iguala el mismo NIT con y sin DV o con separadores", () => {
    expect(nitCoincide("900204935", "900.204.935-2")).toBe(true);
    expect(nitCoincide("NIT: 830515061-1", "830515061")).toBe(true);
  });

  it("distingue empresas diferentes", () => {
    expect(nitCoincide("900204935", "800143164")).toBe(false);
  });

  it("no da por iguales cadenas vacías o demasiado cortas", () => {
    expect(nitCoincide(null, null)).toBe(false);
    expect(nitCoincide("", "")).toBe(false);
    expect(nitCoincide("1234", "1234")).toBe(false);
  });
});

describe("dvNit / dvValido", () => {
  // Anclas públicas y verificables del algoritmo DIAN (módulo 11 con la tabla de pesos
  // 3,7,13,17,19,23,29,37,41… aplicada de derecha a izquierda).
  const casos: [string, number][] = [
    ["800197268", 4], // DIAN
    ["890903938", 8], // Bancolombia
    ["860002964", 4], // Banco de Bogotá
  ];
  for (const [base, dv] of casos) {
    it(`${base} → DV ${dv}`, () => {
      expect(dvNit(base)).toBe(dv);
      expect(dvValido(base, dv)).toBe(true);
      expect(dvValido(base, (dv + 1) % 10)).toBe(false);
    });
  }

  it("acepta el DV como texto, con o sin el guion del reporte", () => {
    expect(dvValido("890903938", "8")).toBe(true);
    expect(dvValido("890903938", "-8")).toBe(true);
  });

  it("devuelve null cuando el número base no es utilizable", () => {
    expect(dvNit("")).toBeNull();
    expect(dvNit("1".repeat(16))).toBeNull();
    expect(dvValido("", 3)).toBe(false);
  });
});

describe("claveTerceroCanonica", () => {
  it("un NIT de nueve dígitos queda igual", () => {
    expect(claveTerceroCanonica("900123456")).toBe("900123456");
  });

  it("retira el DV cuando los diez dígitos son NIT + DV válido", () => {
    expect(claveTerceroCanonica("8909039388")).toBe("890903938");
    expect(claveTerceroCanonica("890903938-8")).toBe("890903938");
  });

  it("NO trunca una cédula de diez dígitos que no lleva DV", () => {
    // Es la diferencia con `nucleoNit`: truncar aquí fusionaría personas distintas.
    expect(claveTerceroCanonica("1128385972")).toBe("1128385972");
    expect(nucleoNit("1128385972")).toBe("112838597");
  });

  it("dos cédulas vecinas de diez dígitos no colisionan", () => {
    expect(claveTerceroCanonica("1000653497")).not.toBe(claveTerceroCanonica("1000653498"));
  });

  it("conserva íntegros los identificadores no colombianos", () => {
    expect(claveTerceroCanonica("0992796928001")).toBe("0992796928001"); // RUC ecuatoriano
    expect(claveTerceroCanonica("222222222222")).toBe("222222222222"); // genérico de LIBRA
  });

  it("descarta lo que no alcanza a ser un identificador", () => {
    expect(claveTerceroCanonica("1234")).toBeNull();
    expect(claveTerceroCanonica("")).toBeNull();
    expect(claveTerceroCanonica(null)).toBeNull();
    expect(claveTerceroCanonica("Genérico")).toBeNull();
  });

  it("es estable frente a la puntuación del reporte", () => {
    expect(claveTerceroCanonica("890.903.938-8")).toBe(claveTerceroCanonica("8909039388"));
  });
});
