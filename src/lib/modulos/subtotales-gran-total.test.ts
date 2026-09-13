import { describe, expect, it } from "vitest";
import { resolverGranTotalUnico } from "./subtotales";

type Detecciones = Parameters<typeof resolverGranTotalUnico>[0];
type Filas = Parameters<typeof resolverGranTotalUnico>[1];

/** Siete filas neutras; lo que se prueba es la elección entre detecciones, no la detección. */
const filas = Array.from({ length: 7 }, (_, i) => ({
  filaNum: i + 1,
  clasificador: null,
  valor: 0,
  datos: {},
  tipoFila: "movimiento",
})) as unknown as Filas;

const deteccion = (indice: number, clase: string, senales: string[]) => ({
  indice,
  filaNum: indice + 1,
  esSubtotal: true,
  clase,
  senales,
  grupo: null,
  bloque: null,
});

const clases = (r: Detecciones) => r.map((d) => `${d.indice}:${d.clase}`);

describe("resolverGranTotalUnico", () => {
  it("con dos candidatos gana el que tiene rótulo (el caso de Mineralin)", () => {
    // Fila 1: encabezado de la sección 130505, vale la suma de SU bloque (negrita + aritmética).
    // Fila 6: «Total» al pie, el gran total de verdad.
    const r = resolverGranTotalUnico([
      deteccion(1, "gran_total", ["negrita", "aritmetica"]),
      deteccion(6, "gran_total", ["rotulo", "negrita"]),
    ] as Detecciones, filas);
    expect(clases(r)).toEqual(["1:subtotal", "6:gran_total"]);
  });

  it("el perdedor se DEGRADA a subtotal, no desaparece: nunca vuelve a imputar", () => {
    const entrada = [
      deteccion(1, "gran_total", ["negrita", "aritmetica"]),
      deteccion(6, "gran_total", ["rotulo"]),
    ] as Detecciones;
    const r = resolverGranTotalUnico(entrada, filas);
    expect(r).toHaveLength(entrada.length);
    expect(r.every((d) => d.esSubtotal)).toBe(true);
  });

  it("la coordenada que ubicó el usuario manda sobre cualquier rótulo", () => {
    const r = resolverGranTotalUnico([
      deteccion(2, "gran_total", ["marca_manual"]),
      deteccion(6, "gran_total", ["rotulo", "negrita"]),
    ] as Detecciones, filas);
    expect(clases(r)).toEqual(["2:gran_total", "6:subtotal"]);
  });

  it("el rótulo le gana a la cola de control, y la cola a la aritmética sola", () => {
    expect(clases(resolverGranTotalUnico([
      deteccion(3, "gran_total", ["cola", "sin_detalle", "aritmetica"]),
      deteccion(5, "gran_total", ["rotulo"]),
    ] as Detecciones, filas))).toEqual(["3:subtotal", "5:gran_total"]);

    expect(clases(resolverGranTotalUnico([
      deteccion(4, "gran_total", ["negrita", "aritmetica"]),
      deteccion(2, "gran_total", ["cola", "sin_detalle", "aritmetica"]),
    ] as Detecciones, filas))).toEqual(["4:subtotal", "2:gran_total"]);
  });

  it("a igual evidencia gana el más cercano al pie", () => {
    const r = resolverGranTotalUnico([
      deteccion(1, "gran_total", ["negrita", "aritmetica"]),
      deteccion(5, "gran_total", ["negrita", "aritmetica"]),
    ] as Detecciones, filas);
    expect(clases(r)).toEqual(["1:subtotal", "5:gran_total"]);
  });

  it("con un solo gran total, o ninguno, no toca nada", () => {
    const uno = [
      deteccion(2, "subtotal", ["rotulo"]),
      deteccion(6, "gran_total", ["rotulo"]),
    ] as Detecciones;
    expect(resolverGranTotalUnico(uno, filas)).toBe(uno);

    const ninguno = [deteccion(2, "subtotal", ["rotulo"]), deteccion(3, "cola_control", ["cola"])] as Detecciones;
    expect(resolverGranTotalUnico(ninguno, filas)).toBe(ninguno);
  });

  it("no toca los subtotales ni la cola que ya estaban clasificados", () => {
    const r = resolverGranTotalUnico([
      deteccion(0, "subtotal", ["rotulo"]),
      deteccion(1, "gran_total", ["negrita", "aritmetica"]),
      deteccion(5, "cola_control", ["cola", "sin_detalle"]),
      deteccion(6, "gran_total", ["rotulo"]),
    ] as Detecciones, filas);
    expect(clases(r)).toEqual(["0:subtotal", "1:subtotal", "5:cola_control", "6:gran_total"]);
  });
});
