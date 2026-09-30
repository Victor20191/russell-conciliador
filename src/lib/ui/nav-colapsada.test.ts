import { afterEach, describe, expect, it, vi } from "vitest";
import { guardarNavColapsada, navColapsadaDesdeCookie } from "./nav-colapsada";

afterEach(() => vi.unstubAllGlobals());

describe("preferencia de navegación", () => {
  it("restaura únicamente un colapso guardado explícitamente", () => {
    expect(navColapsadaDesdeCookie("1")).toBe(true);
    for (const valor of [undefined, "0", "", "true", "incorrecto"]) {
      expect(navColapsadaDesdeCookie(valor)).toBe(false);
    }
  });

  it.each(["http:", "https:"])("guarda ambos estados para la recarga sin duración anual en %s", (protocolo) => {
    const documento = { cookie: "" };
    vi.stubGlobal("document", documento);
    vi.stubGlobal("window", { location: { protocol: protocolo } });

    for (const colapsada of [true, false]) {
      guardarNavColapsada(colapsada);
      expect(documento.cookie).toContain(`nav_colapsada=${colapsada ? "1" : "0"}; Path=/; SameSite=Lax`);
      expect(documento.cookie).not.toMatch(/Max-Age|Expires/i);
      expect(documento.cookie.endsWith("; Secure")).toBe(protocolo === "https:");
      const valor = documento.cookie.split(";")[0].split("=")[1];
      expect(navColapsadaDesdeCookie(valor)).toBe(colapsada);
    }
  });

  it("mantiene operativa la navegación si el navegador bloquea cookies", () => {
    vi.stubGlobal("window", { location: { protocol: "https:" } });
    vi.stubGlobal("document", {
      set cookie(_valor: string) {
        throw new Error("Cookies bloqueadas");
      },
    });
    expect(() => guardarNavColapsada(true)).not.toThrow();
  });
});
