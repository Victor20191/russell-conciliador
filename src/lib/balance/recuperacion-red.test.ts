import { describe, expect, it } from "vitest";
import {
  completarFormularioLectura,
  esFalloTransporteCarga,
} from "./recuperacion-red";

describe("esFalloTransporteCarga", () => {
  it.each([
    new TypeError("Failed to fetch"),
    new Error("fetch failed"),
    new Error("NetworkError when attempting to fetch resource."),
    new Error("Load failed"),
    "Network request failed",
  ])("reconoce errores recuperables de transporte", (error) => {
    expect(esFalloTransporteCarga(error)).toBe(true);
  });

  it.each([
    new Error("El cliente no existe"),
    new Error("Prisma P2002"),
    new Error("La extracción no produjo cuentas"),
    null,
  ])("no oculta errores funcionales o inesperados", (error) => {
    expect(esFalloTransporteCarga(error)).toBe(false);
  });
});

describe("completarFormularioLectura", () => {
  it("reinserta el mismo File y conserva todo el contexto del segundo paso", () => {
    const archivo = new File(["balance"], "balance.xlsx");
    const formData = completarFormularioLectura(new FormData(), {
      archivo,
      loteIdSolicitud: "11111111-1111-4111-8111-111111111111",
      clienteId: 7,
      hoja: "Balance de prueba",
      proveedorIA: "anthropic",
    });

    expect(formData.get("archivo")).toBe(archivo);
    expect(formData.get("loteIdSolicitud")).toBe("11111111-1111-4111-8111-111111111111");
    expect(formData.get("clienteId")).toBe("7");
    expect(formData.get("hoja")).toBe("Balance de prueba");
    expect(formData.get("modeloIA")).toBe("anthropic");
  });

  it("elimina un cliente anterior cuando el nuevo intento vuelve a reconocimiento automático", () => {
    const formData = new FormData();
    formData.set("clienteId", "99");

    completarFormularioLectura(formData, {
      archivo: new File(["balance"], "balance.xlsx"),
      loteIdSolicitud: "11111111-1111-4111-8111-111111111111",
      clienteId: null,
      hoja: null,
    });

    expect(formData.get("clienteId")).toBeNull();
    expect(formData.get("hoja")).toBe("");
  });
});
