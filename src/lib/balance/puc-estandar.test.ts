import { describe, expect, it } from "vitest";
import { colapsarPucHastaNivel, construirPucRussell, filasVisiblesPuc, filtrarPucRussell } from "./puc-estandar";

const cuentas = [
  { codigo: "1105", nombre: "Caja", grupo: "11", nombreGrupo: "Disponible", naturaleza: "D" },
  { codigo: "1110", nombre: "Bancos", grupo: "11", nombreGrupo: "Disponible", naturaleza: "D" },
];
const subcuentas = [
  { code: "110505", name: "Caja general", nature: "D" },
  { code: "110510", name: "Cajas menores", nature: "C" },
  { code: "220505", name: "Proveedores nacionales", nature: "C" },
];

describe("PUC Russell completo", () => {
  it("incluye cada nivel en orden y conserva cuentas de cuatro dígitos sin subcuentas", () => {
    const arbol = construirPucRussell(subcuentas, cuentas);
    expect(arbol.map((f) => f.codigo)).toEqual(["1", "11", "1105", "110505", "110510", "1110", "2", "22", "2205", "220505"]);
    expect(arbol.find((f) => f.codigo === "11")?.nombre).toBe("Disponible");
    expect(arbol.find((f) => f.codigo === "1105")).toMatchObject({ naturaleza: "D", nivel: 4 });
    expect(arbol.find((f) => f.codigo === "110510")).toMatchObject({ naturaleza: "C", nivel: 6 });
  });
  it("no inventa la naturaleza ni el nombre de una ficha de cuenta faltante", () => {
    const arbol = construirPucRussell(subcuentas, cuentas);
    expect(arbol.find((f) => f.codigo === "2205")).toMatchObject({ nombre: "Cuenta 2205", naturaleza: null, catalogada: false });
  });
  it("buscar una subcuenta conserva sus padres sin incluir sus hermanas", () => {
    expect(filtrarPucRussell(construirPucRussell(subcuentas, cuentas), "menores").map((f) => f.codigo)).toEqual(["1", "11", "1105", "110510"]);
  });
  it("buscar el nombre de un grupo incluye su árbol completo", () => {
    expect(filtrarPucRussell(construirPucRussell(subcuentas, cuentas), "Disponible").map((f) => f.codigo)).toEqual(["1", "11", "1105", "110505", "110510", "1110"]);
  });
});

describe("Agrupación del PUC Russell", () => {
  const arbol = construirPucRussell(subcuentas, cuentas);

  it.each([1, 2, 4, 6] as const)("mostrar hasta N%s mantiene los padres y permite abrir más detalle", (nivel) => {
    const colapsados = colapsarPucHastaNivel(arbol, nivel);
    expect(filasVisiblesPuc(arbol, colapsados)).toEqual(arbol.filter((fila) => fila.nivel <= nivel));
    expect(colapsados.has("1110")).toBe(false); // Una cuenta sin hijos no se pliega.
    if (nivel === 1) {
      colapsados.delete("1");
      expect(filasVisiblesPuc(arbol, colapsados).map((fila) => fila.codigo)).toEqual(["1", "11", "2"]);
    }
  });

  it("colapsar todas las ramas muestra únicamente las clases", () => {
    const ramas = new Set(arbol.flatMap((fila) => fila.padre ? [fila.padre] : []));
    expect(filasVisiblesPuc(arbol, ramas).map((fila) => fila.codigo)).toEqual(["1", "2"]);
    expect(filasVisiblesPuc(arbol, new Set())).toEqual(arbol);
  });

  it("cerrar una clase oculta todos sus niveles sin afectar otras clases", () => {
    expect(filasVisiblesPuc(arbol, new Set(["1"])).map((fila) => fila.codigo))
      .toEqual(["1", "2", "22", "2205", "220505"]);
  });

  it("cerrar un grupo conserva la clase y oculta sus cuentas y subcuentas", () => {
    expect(filasVisiblesPuc(arbol, new Set(["11"])).map((fila) => fila.codigo))
      .toEqual(["1", "11", "2", "22", "2205", "220505"]);
  });

  it("reabrir una clase conserva las cuentas internas que estaban cerradas", () => {
    const colapsados = new Set(["1", "1105"]);
    filasVisiblesPuc(arbol, colapsados);
    expect([...colapsados]).toEqual(["1", "1105"]);
    colapsados.delete("1");
    expect(filasVisiblesPuc(arbol, colapsados).map((fila) => fila.codigo))
      .toEqual(["1", "11", "1105", "1110", "2", "22", "2205", "220505"]);
  });

  it("permite plegar cuentas sintéticas sin ocultar su fila", () => {
    const filas = filasVisiblesPuc(arbol, new Set(["2205"]));
    expect(filas.find((fila) => fila.codigo === "2205")).toMatchObject({ catalogada: false });
    expect(filas.some((fila) => fila.codigo === "220505")).toBe(false);
    expect(filas.some((fila) => fila.codigo === "1110")).toBe(true);
  });

  it("la búsqueda se puede desplegar y plegar sin alterar el catálogo ni su estado previo", () => {
    const colapsadosCatalogo = new Set(["1", "2"]);
    const encontradas = filtrarPucRussell(arbol, "menores");
    expect(filasVisiblesPuc(encontradas, new Set()).map((fila) => fila.codigo))
      .toEqual(["1", "11", "1105", "110510"]);
    expect(filasVisiblesPuc(encontradas, new Set(["1105"])).map((fila) => fila.codigo))
      .toEqual(["1", "11", "1105"]);
    expect(filasVisiblesPuc(arbol, colapsadosCatalogo).map((fila) => fila.codigo)).toEqual(["1", "2"]);
    expect(arbol).toEqual(construirPucRussell(subcuentas, cuentas));
  });
});
