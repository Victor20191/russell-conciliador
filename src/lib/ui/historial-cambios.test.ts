import { describe, expect, it } from "vitest";
import {
  apilarCambio,
  desapilarCambio,
  ultimoCambio,
  type EntradaHistorial,
} from "./historial-cambios";

type Pendiente = Record<string, string>;

const entrada = (estado: Pendiente, descripcion: string): EntradaHistorial<Pendiente> => ({
  estado,
  descripcion,
});

describe("historial de cambios sin guardar", () => {
  it("apila fotografías en orden y no muta la pila recibida", () => {
    const inicial: EntradaHistorial<Pendiente>[] = [];
    const p1 = apilarCambio(inicial, entrada({}, "primer cambio"));
    const p2 = apilarCambio(p1, entrada({ a: "1" }, "segundo cambio"));

    expect(inicial).toEqual([]);
    expect(p1).toHaveLength(1);
    expect(p2.map((e) => e.descripcion)).toEqual(["primer cambio", "segundo cambio"]);
  });

  it("trunca por el extremo viejo al pasar el límite", () => {
    let pila: EntradaHistorial<Pendiente>[] = [];
    for (let i = 1; i <= 5; i++) pila = apilarCambio(pila, entrada({}, `cambio ${i}`), 3);

    expect(pila.map((e) => e.descripcion)).toEqual(["cambio 3", "cambio 4", "cambio 5"]);
  });

  it("desapila la última fotografía y deja el resto intacto", () => {
    const pila = [entrada({}, "uno"), entrada({ a: "1" }, "dos")];
    const { pila: resto, entrada: ultima } = desapilarCambio(pila);

    expect(ultima?.descripcion).toBe("dos");
    expect(ultima?.estado).toEqual({ a: "1" });
    expect(resto.map((e) => e.descripcion)).toEqual(["uno"]);
    expect(pila).toHaveLength(2); // sin mutar
  });

  it("con la pila vacía no hay nada que deshacer", () => {
    expect(desapilarCambio([])).toEqual({ pila: [], entrada: null });
    expect(ultimoCambio([])).toBeNull();
  });

  it("deshacer en cadena devuelve los estados en orden inverso", () => {
    // Simula: {} → {a} → {a,b}. Cada fotografía es el estado ANTERIOR al cambio.
    let pila: EntradaHistorial<Pendiente>[] = [];
    pila = apilarCambio(pila, entrada({}, "agrega a"));
    pila = apilarCambio(pila, entrada({ a: "1" }, "agrega b"));

    const primero = desapilarCambio(pila);
    expect(primero.entrada?.estado).toEqual({ a: "1" });
    const segundo = desapilarCambio(primero.pila);
    expect(segundo.entrada?.estado).toEqual({});
    expect(segundo.pila).toEqual([]);
  });

  it("expone el último cambio para describirlo en la confirmación", () => {
    const pila = [entrada({}, "uno"), entrada({ a: "1" }, "Staff · Balance → Operar")];
    expect(ultimoCambio(pila)?.descripcion).toBe("Staff · Balance → Operar");
  });
});
