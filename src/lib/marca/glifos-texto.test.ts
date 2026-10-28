import { describe, expect, it } from "vitest";
import { glifosDeEntrada, glifosDeMarca, glifosSoloLato, necesitaGlifos, tieneGlifoLato, tieneGlifoMarca } from "./glifos";

describe("glifos de la marca en un texto", () => {
  it("el texto común no cambia (ni se revisa)", () => {
    const comun = "Conciliación de cartera · cuenta 130505 – saldo $ 1.234,50 (diciembre) «ok» ñÑ ü ¿¡ € ½ ² © ® ™ → ≥ Σ";
    expect(necesitaGlifos(comun)).toBe(false);
    expect(glifosDeMarca(comun)).toBe(comun);
  });

  it("retira emojis y cambia los símbolos sin glifo por su equivalente", () => {
    expect(glifosDeMarca("Listo 🎉 gracias 👩‍💻")).toBe("Listo gracias ");
    expect(glifosDeMarca("♥️ y 1️⃣")).toBe("y ");
    expect(glifosDeMarca("✓")).toBe("Sí");
    expect(glifosDeMarca("Listo: ✓ en el Consolidado")).toBe("Listo: en el Consolidado");
    expect(glifosDeMarca("Cuadra ✗")).toBe("Cuadra ×");
    expect(glifosDeMarca("Más acciones ⋯ y ↳ hija ⇒ fin")).toBe("Más acciones … y → hija → fin");
    expect(glifosDeMarca("1 ∥ GYA")).toBe("1 · GYA");
    expect(glifosDeMarca("Marca ① y ②")).toBe("Marca (1) y (2)");
    expect(glifosDeMarca("⚠ Revisar ★ hoy")).toBe("Revisar * hoy");
  });

  it("las letras de cualquier alfabeto se conservan: son el contenido", () => {
    expect(glifosDeMarca("Ωmega Привет")).toBe("Ωmega Привет");
  });

  it("al escribir no inventa palabras: ✓ se retira", () => {
    expect(glifosDeEntrada("✓ listo 🎉")).toBe(" listo ");
    expect(glifosDeEntrada("normal")).toBe("normal");
  });

  it("para el PDF solo quedan glifos de Lato", () => {
    const pdf = glifosSoloLato("A → B, ≥ 5, ▲ 3 %, ● nota y ✓");
    expect(pdf).toBe("A › B, >= 5, + 3 %, • nota y Sí");
    for (const ch of pdf) expect(tieneGlifoLato(ch.codePointAt(0)!), ch).toBe(true);
  });

  it("cobertura: Lato trae el latín; Arial, además, flechas, griego y cirílico", () => {
    for (const ch of "AÑéü€–…«»") expect(tieneGlifoLato(ch.codePointAt(0)!)).toBe(true);
    for (const ch of "→≥ΣЖ▲") {
      expect(tieneGlifoLato(ch.codePointAt(0)!)).toBe(false);
      expect(tieneGlifoMarca(ch.codePointAt(0)!)).toBe(true);
    }
    expect(tieneGlifoMarca(0x2713)).toBe(false); // ✓
    expect(tieneGlifoMarca(0x1f389)).toBe(false); // 🎉
  });
});
