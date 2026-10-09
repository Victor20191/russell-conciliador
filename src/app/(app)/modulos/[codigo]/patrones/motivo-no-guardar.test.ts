import { describe, expect, it } from "vitest";
import { motivoNoGuardarPatron, type EstadoGuardarPatron } from "./motivo-no-guardar";

const listo: EstadoGuardarPatron = {
  guardando: false,
  analizando: false,
  esEdicion: false,
  erpElegido: true,
  hayMuestra: true,
  muestraLista: true,
  haySpec: true,
  esNuevoInventario: false,
  asistenciaPendiente: false,
  falloLectura: false,
  lectura: null,
};
const inventario: EstadoGuardarPatron = { ...listo, esNuevoInventario: true, lectura: { listoParaBorrador: true, preguntas: 0, errores: 0 } };

describe("por qué no se puede guardar el patrón", () => {
  it("sin motivo cuando todo está listo o mientras guarda", () => {
    expect(motivoNoGuardarPatron(listo)).toBeNull();
    expect(motivoNoGuardarPatron(inventario)).toBeNull();
    expect(motivoNoGuardarPatron({ ...listo, guardando: true, haySpec: false })).toBeNull();
  });

  it("aplicativo y muestra primero, con destino a la cabecera", () => {
    expect(motivoNoGuardarPatron({ ...listo, analizando: true })?.texto).toBe("Analizando la muestra…");
    expect(motivoNoGuardarPatron({ ...listo, erpElegido: false })).toEqual({ texto: "Elige el aplicativo del patrón.", destino: "aplicativo" });
    expect(motivoNoGuardarPatron({ ...listo, hayMuestra: false })?.destino).toBe("aplicativo");
    expect(motivoNoGuardarPatron({ ...listo, muestraLista: false })?.texto).toBe("Falta analizar la muestra del aplicativo.");
    // Al editar una versión ya hay aplicativo y muestra.
    expect(motivoNoGuardarPatron({ ...listo, esEdicion: true, erpElegido: false, hayMuestra: false })).toBeNull();
  });

  it("Inventarios nuevo: la lectura de la muestra tiene que estar validada", () => {
    const pendiente = motivoNoGuardarPatron({ ...inventario, asistenciaPendiente: true });
    expect(pendiente?.destino).toBe("lectura");
    expect(pendiente?.texto).toContain("Validar ajustes");
    expect(motivoNoGuardarPatron({ ...inventario, falloLectura: true })?.texto).toContain("Reintentar lectura");
    expect(motivoNoGuardarPatron({ ...inventario, lectura: null })?.texto).toContain("Falta reconocer la muestra");
    expect(motivoNoGuardarPatron({ ...inventario, lectura: { listoParaBorrador: false, preguntas: 1, errores: 2 } })?.texto).toContain("Resuelve los errores");
    expect(motivoNoGuardarPatron({ ...inventario, lectura: { listoParaBorrador: false, preguntas: 1, errores: 0 } })?.texto).toContain("Validar respuestas");
    expect(motivoNoGuardarPatron({ ...inventario, lectura: { listoParaBorrador: false, preguntas: 0, errores: 0 } })?.texto).toContain("Valida la lectura");
  });
});
