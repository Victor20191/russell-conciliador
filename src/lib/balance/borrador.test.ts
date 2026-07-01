import { describe, it, expect } from "vitest";
import { construirArbolBorrador, contarNodos, type FilaBorrador } from "./borrador";

function fila(filaNum: number, codigo: string, nombre: string, saldoFinal: number, tipo: FilaBorrador["tipoFila"]): FilaBorrador {
  return { filaNum, codigo, codigoCrudo: codigo, nombre, nivel: codigo.length || null, tipoFila: tipo, saldoInicial: 0, debitos: 0, creditos: 0, saldoFinal };
}

describe("construirArbolBorrador", () => {
  it("anida por prefijo de código en orden de archivo", () => {
    const arbol = construirArbolBorrador([
      fila(1, "1", "ACTIVO", 300, "agrupadora"),
      fila(2, "11", "DISPONIBLE", 300, "agrupadora"),
      fila(3, "1105", "CAJA", 300, "agrupadora"),
      fila(4, "110505", "CAJA GENERAL", 200, "movimiento"),
      fila(5, "110510", "CAJA MENOR", 100, "movimiento"),
    ]);
    expect(arbol).toHaveLength(1); // una raíz "1"
    expect(arbol[0].codigo).toBe("1");
    expect(arbol[0].hijos[0].codigo).toBe("11");
    expect(arbol[0].hijos[0].hijos[0].hijos.map((h) => h.codigo)).toEqual(["110505", "110510"]);
    expect(contarNodos(arbol)).toBe(5);
  });

  it("código repetido: el encabezado agrupa; su línea de movimiento y su detalle cuelgan debajo", () => {
    const arbol = construirArbolBorrador([
      fila(1, "11", "EFECTIVO Y EQ", 0, "agrupadora"),
      fila(2, "1105", "EFECTIVO", 0, "agrupadora"), // encabezado
      fila(3, "1105", "CAJA GENERAL", 0, "agrupadora"), // código repetido → movimiento
      fila(4, "110505", "BASE", 0, "movimiento"),
    ]);
    const efectivo = arbol[0].hijos[0];
    expect(efectivo.codigo).toBe("1105");
    expect(efectivo.tipoFila).toBe("agrupadora");
    expect(efectivo.hijos.map((h) => h.nombre)).toEqual(["CAJA GENERAL", "BASE"]); // ambos bajo el encabezado
    expect(efectivo.hijos.find((h) => h.nombre === "CAJA GENERAL")?.tipoFila).toBe("movimiento");
  });

  it("código repetido: el encabezado cuadra con su línea de movimiento + detalle, sin doble conteo en el padre", () => {
    const arbol = construirArbolBorrador([
      fila(1, "11", "EFECTIVO Y EQ", 300, "agrupadora"),
      fila(2, "1105", "EFECTIVO", 300, "agrupadora"), // = CAJA GENERAL 100 + BASE 200
      fila(3, "1105", "CAJA GENERAL", 100, "agrupadora"), // → movimiento
      fila(4, "110505", "BASE", 200, "movimiento"),
    ]);
    expect(arbol[0].hijos[0].descuadre).toBe(0); // EFECTIVO: 100 + 200 = 300
    expect(arbol[0].descuadre).toBe(0); // 11 = EFECTIVO(300), sin doble contar CAJA GENERAL
  });

  it("multi-sucursal: dos '1 ACTIVO' → dos raíces con su propio subárbol", () => {
    const arbol = construirArbolBorrador([
      fila(1, "1", "ACTIVO ITAGUI", 100, "agrupadora"),
      fila(2, "1105", "CAJA", 100, "movimiento"),
      fila(3, "1", "ACTIVO PEREIRA", 50, "agrupadora"),
      fila(4, "1105", "CAJA", 50, "movimiento"),
    ]);
    expect(arbol).toHaveLength(2);
    expect(arbol[0].nombre).toBe("ACTIVO ITAGUI");
    expect(arbol[1].nombre).toBe("ACTIVO PEREIRA");
    expect(arbol[1].hijos).toHaveLength(1);
  });

  it("localiza el descuadre por nodo: total ≠ suma de hijos", () => {
    const arbol = construirArbolBorrador([
      fila(1, "11", "DISPONIBLE", 1000, "agrupadora"), // total del archivo 1000…
      fila(2, "110505", "CAJA", 600, "movimiento"),
      fila(3, "110510", "BANCOS", 300, "movimiento"), // …pero hijos suman 900 → Δ 100
    ]);
    expect(arbol[0].descuadre).toBe(100);
  });

  it("silencia gemelos: detalle mal ubicado por código pero que suma bien", () => {
    // El ERP puso el detalle real (14101000, mismo nombre) como HERMANO del subtotal
    // 141000 en vez de como hijo (su código no anida por prefijo). Al sumar cuadra.
    const arbol = construirArbolBorrador([
      fila(1, "1410", "PRODUCTOS EN PROCESO", 100, "agrupadora"),
      fila(2, "141000", "PRODUCTO AGUA", 100, "agrupadora"), // subtotal 100…
      fila(3, "14100001", "MATERIAS AGUA", 0, "movimiento"), // …hijos por prefijo = 0
      fila(4, "14101000", "PRODUCTO AGUA", 100, "movimiento"), // detalle real (hermano por código)
    ]);
    const c141000 = arbol[0].hijos.find((h) => h.codigo === "141000");
    expect(c141000?.descuadre).toBe(0); // subtotal silenciado (su gemelo explica el hueco)
    expect(arbol[0].descuadre).toBe(0); // 1410 tampoco: el gemelo no se cuenta doble
  });

  it("excluye del descuadre el subtotal de 6 díg duplicado de su detalle de 8 díg (MAQUILA)", () => {
    const arbol = construirArbolBorrador([
      fila(1, "1410", "PRODUCTOS EN PROCESO", 9531, "agrupadora"),
      fila(2, "141006", "PROD MAQUILA", 9531, "movimiento"), // subtotal 6 díg…
      fila(3, "14101004", "PROCESO ENVASADO MAQUILA", 9531, "movimiento"), // …detalle 8 díg idéntico
    ]);
    const dup = arbol[0].hijos.find((h) => h.codigo === "141006");
    expect(dup?.subtotalDuplicado).toBe(true);
    expect(arbol[0].descuadre).toBe(0); // 141006 excluido; 14101004 cubre el total
  });

  it("desacople: el movimiento cuelga de la agrupadora abierta por ORDEN, no por prefijo (139005 bajo 1305)", () => {
    const arbol = construirArbolBorrador([
      fila(1, "13", "CXC", 233, "agrupadora"),
      fila(2, "1305", "CLIENTES", 233, "agrupadora"), // total = 100 (130505) + 133 (139005, desacoplada)
      fila(3, "130505", "CLIENTES NAL", 100, "movimiento"),
      fila(4, "139005", "DEUDAS DIFICIL COBRO", 133, "movimiento"), // código 1390 no anida bajo 1305…
    ]);
    const clientes = arbol[0].hijos.find((h) => h.codigo === "1305");
    // …pero por orden cuelga de 1305, así que 1305 cuadra (100 + 133 = 233).
    expect(clientes?.hijos.map((h) => h.codigo)).toEqual(["130505", "139005"]);
    expect(clientes?.descuadre).toBe(0);
  });

  it("marca un descuadre REAL: la agrupadora no cuadra con las filas que la siguen", () => {
    const arbol = construirArbolBorrador([
      fila(1, "1410", "PRODUCTOS EN PROCESO", 100, "agrupadora"), // total 100…
      fila(2, "141001", "PROCESO X", 80, "movimiento"), // …pero solo la sigue 80
    ]);
    expect(arbol[0].descuadre).toBe(20); // 100 − 80, nada más lo explica
  });

  it("no marca descuadre cuando el nodo cuadra con sus hijos", () => {
    const arbol = construirArbolBorrador([
      fila(1, "11", "DISPONIBLE", 900, "agrupadora"),
      fila(2, "110505", "CAJA", 600, "movimiento"),
      fila(3, "110510", "BANCOS", 300, "movimiento"),
    ]);
    expect(arbol[0].descuadre).toBe(0); // dentro de tolerancia
    expect(arbol[0].hijos[0].descuadre).toBeNull(); // las hojas no se validan
  });
});
