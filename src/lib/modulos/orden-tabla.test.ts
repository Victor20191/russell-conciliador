import { describe, expect, it } from "vitest";
import { alternarOrden, compararNumero, compararTexto, flechaOrden, normalizarOrden, ordenarFilas, tituloOrden } from "./orden-tabla";

const filas = [
  { codigo: "10", concepto: "PROVISION CESANTIAS", total: 0 },
  { codigo: "9", concepto: "Ñandú", total: -5 },
  { codigo: "1", concepto: "SUELDO", total: 4_423_061_011 },
  { codigo: "2", concepto: "", total: null as number | null },
  { codigo: "3", concepto: "ÁRBOL", total: 12 },
];

const ordenar = (columna: string, direccion: "asc" | "desc") =>
  ordenarFilas(filas, { columna, direccion }, (f, c) => f[c as keyof typeof f], (c) => c === "total").map((f) => f.codigo);

describe("orden por columna de las tablas de módulos", () => {
  it("un clic ordena ascendente, otro descendente y el tercero quita el orden", () => {
    const uno = alternarOrden(null, "total");
    expect(uno).toEqual({ columna: "total", direccion: "asc" });
    const dos = alternarOrden(uno, "total");
    expect(dos).toEqual({ columna: "total", direccion: "desc" });
    expect(alternarOrden(dos, "total")).toBeNull();
    // Otra columna empieza de nuevo en ascendente.
    expect(alternarOrden(dos, "codigo")).toEqual({ columna: "codigo", direccion: "asc" });
  });

  it("el texto se ordena en español, con los números por valor y sin importar las tildes", () => {
    expect(ordenar("concepto", "asc")).toEqual(["3", "9", "10", "1", "2"]);
    expect(ordenar("concepto", "desc")).toEqual(["1", "10", "9", "3", "2"]);
    expect(compararTexto("ARBOL", "árbol")).toBe(0);
    expect(compararTexto("ñandu", "nutria")).toBeGreaterThan(0);
    // «10» va después de «9», no entre «1» y «2».
    expect(ordenar("codigo", "asc")).toEqual(["1", "2", "3", "9", "10"]);
  });

  it("lo numérico va de menor a mayor y al revés", () => {
    expect(ordenar("total", "asc")).toEqual(["9", "10", "3", "1", "2"]);
    expect(ordenar("total", "desc")).toEqual(["1", "3", "10", "9", "2"]);
    expect(compararNumero(2, 10)).toBeLessThan(0);
    expect(compararNumero("abc", 1)).toBeGreaterThan(0);
  });

  it("los vacíos quedan al final en las dos direcciones y el orden es estable", () => {
    expect(ordenar("concepto", "asc").at(-1)).toBe("2");
    expect(ordenar("concepto", "desc").at(-1)).toBe("2");
    expect(ordenar("total", "asc").at(-1)).toBe("2");
    const empatadas = [{ k: "a", v: 1 }, { k: "b", v: 1 }, { k: "c", v: 1 }];
    expect(ordenarFilas(empatadas, { columna: "v", direccion: "desc" }, (f, c) => f[c as "v"], () => true).map((f) => f.k)).toEqual(["a", "b", "c"]);
  });

  it("sin orden devuelve una copia con las filas como estaban", () => {
    const copia = ordenarFilas(filas, null, (f, c) => f[c as "codigo"], () => false);
    expect(copia.map((f) => f.codigo)).toEqual(["10", "9", "1", "2", "3"]);
    expect(copia).not.toBe(filas);
  });

  it("la flecha y el título dicen qué pasa al pulsar", () => {
    const orden = { columna: "total", direccion: "asc" as const };
    expect(flechaOrden(orden, "total")).toBe("↑");
    expect(flechaOrden(orden, "codigo")).toBeNull();
    expect(tituloOrden(null, "total", true)).toBe("Ordenar de menor a mayor");
    expect(tituloOrden(orden, "total", true)).toBe("Ordenar de mayor a menor");
    expect(tituloOrden({ columna: "total", direccion: "desc" }, "total", true)).toBe("Quitar el orden");
    expect(tituloOrden(null, "concepto", false)).toBe("Ordenar de la A a la Z");
  });

  it("lo que llega a una Server Action se valida contra las columnas conocidas", () => {
    expect(normalizarOrden({ columna: "total", direccion: "desc" }, ["total", "codigo"])).toEqual({ columna: "total", direccion: "desc" });
    expect(normalizarOrden({ columna: "total", direccion: "lo que sea" }, ["total"])).toEqual({ columna: "total", direccion: "asc" });
    expect(normalizarOrden({ columna: "otra" }, ["total"])).toBeNull();
    expect(normalizarOrden(null, ["total"])).toBeNull();
    expect(normalizarOrden("total", ["total"])).toBeNull();
  });
});
