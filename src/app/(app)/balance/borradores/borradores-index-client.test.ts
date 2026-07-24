import { describe, expect, it } from "vitest";
import { coincideBusquedaBorrador } from "./borradores-index-client";

const fila = {
  archivoNombre: "Balance por tercero GRUPO FORMARTE (1).xlsx",
  clienteSugerido: "GRUPO FORMARTE S.A.S.",
  nitDetectado: "830515061-1",
};

describe("coincideBusquedaBorrador", () => {
  it("sin término devuelve todos", () => {
    expect(coincideBusquedaBorrador(fila, "")).toBe(true);
    expect(coincideBusquedaBorrador(fila, "   ")).toBe(true);
  });

  it("busca por razón social (parcial, sin acentos/mayúsculas)", () => {
    expect(coincideBusquedaBorrador(fila, "formarte")).toBe(true);
    expect(coincideBusquedaBorrador(fila, "GRUPO FORMARTE")).toBe(true);
    expect(coincideBusquedaBorrador(fila, "s.a.s")).toBe(true);
    expect(coincideBusquedaBorrador(fila, "inexistente")).toBe(false);
  });

  it("busca por NIT con o sin dígito de verificación", () => {
    expect(coincideBusquedaBorrador(fila, "830515061")).toBe(true);
    expect(coincideBusquedaBorrador(fila, "830.515.061-1")).toBe(true);
    expect(coincideBusquedaBorrador(fila, "999999")).toBe(false);
  });

  it("busca por nombre de archivo cargado", () => {
    expect(coincideBusquedaBorrador(fila, "Balance por tercero")).toBe(true);
    expect(coincideBusquedaBorrador(fila, "(1).xlsx")).toBe(true);
    expect(coincideBusquedaBorrador(fila, "otro-archivo")).toBe(false);
  });

  it("encuentra por archivo aunque no haya cliente ni NIT", () => {
    const sinCliente = {
      archivoNombre: "05 3ROS - BCE MAYO 2026 -GC.xlsx",
      clienteSugerido: null,
      nitDetectado: null,
    };
    expect(coincideBusquedaBorrador(sinCliente, "3ROS")).toBe(true);
    expect(coincideBusquedaBorrador(sinCliente, "MAYO")).toBe(true);
    expect(coincideBusquedaBorrador(sinCliente, "formarte")).toBe(false);
  });
});
