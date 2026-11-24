import { describe, expect, it } from "vitest";
import { origenDePlataforma } from "./origen-plataforma";

describe("origenDePlataforma", () => {
  it("devuelve el origen HTTPS sin barra final", () => {
    expect(origenDePlataforma("https://russell.example")).toBe("https://russell.example");
    expect(origenDePlataforma("  https://russell.example/  ")).toBe("https://russell.example");
    expect(origenDePlataforma("https://russell.example:8443")).toBe("https://russell.example:8443");
  });

  it("rechaza lo que no sea una dirección HTTPS limpia", () => {
    for (const valor of [
      undefined, null, 42, "", "   ", "russell.example", "http://russell.example",
      "https://user:clave@russell.example", "https://russell.example/app", "https://russell.example/?a=1",
      "https://russell.example/#x", "javascript:alert(1)",
    ]) {
      expect(origenDePlataforma(valor), String(valor)).toBeNull();
    }
  });
});
