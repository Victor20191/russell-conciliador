import { describe, expect, it } from "vitest";
import { MODULOS_IMPORT } from "./descriptores";
import { columnasDetalleModulo } from "./cartera/columnas-cartera";
import { claveColumna, GRUPO_SIN_CLASIFICAR, resumirBorrador, type FilaSlim, type InsumosResumen } from "./borrador-resumen";

const INV = MODULOS_IMPORT.INV;
const COLUMNAS_INV = columnasDetalleModulo(INV, []);

const fila = (filaNum: number, clasificador: string | null, valor: number, extra: Partial<FilaSlim> = {}): FilaSlim => ({
  filaNum,
  clasificador,
  valor,
  tipoFila: extra.tipoFila ?? "movimiento",
  omitida: extra.omitida ?? null,
  motivo: extra.motivo ?? null,
});

const resumir = (filas: FilaSlim[], extra: Partial<InsumosResumen> = {}) =>
  resumirBorrador({
    filas,
    descriptor: INV,
    columnas: COLUMNAS_INV,
    imputablesEnCero: new Set(),
    declaradoPorCuenta: new Map(),
    columnasConDatos: new Set(),
    negativos: [],
    descuadres: [],
    controlesFormato: null,
    ...extra,
  });

describe("resumirBorrador · lo que la pantalla ve sin recibir las filas", () => {
  it("agrupa por clasificador conservando el orden del archivo, con sus ítems y su subtotal", () => {
    const r = resumir([
      fila(2, "MERCANCÍA", 1000),
      fila(3, "MATERIA PRIMA", 400),
      fila(4, "MERCANCÍA", 600),
      fila(5, null, 50),
    ]);
    expect(r.grupos.map((g) => [g.clasificador, g.filas, g.items, g.subtotal])).toEqual([
      ["MERCANCÍA", 2, 2, 1600],
      ["MATERIA PRIMA", 1, 1, 400],
      [GRUPO_SIN_CLASIFICAR, 1, 1, 50],
    ]);
    expect([r.totalFilas, r.imputables, r.total]).toEqual([4, 4, 2050]);
    expect(r.agrupadores).toEqual(["MATERIA PRIMA", "MERCANCÍA"]);
  });

  it("no cuenta como ítem lo omitido, los totales del archivo ni los renglones en cero", () => {
    const filas = [
      fila(2, "MERCANCÍA", 1000),
      fila(3, "MERCANCÍA", 300, { omitida: true }),
      fila(4, "MERCANCÍA", 1300, { tipoFila: "total", motivo: "subtotal:rotulo" }),
      fila(5, "MERCANCÍA", 0),
    ];
    const r = resumir(filas);
    expect(r.grupos[0]).toMatchObject({ filas: 4, items: 1, subtotal: 1000 });
    expect([r.imputables, r.total]).toEqual([1, 1000]);
    // La fila 5 vale 0 en el total, pero imputa si alguna columna numérica no está en cero:
    // eso lo resuelve la consulta y llega como `imputablesEnCero`.
    const conEnCero = resumir(filas, { imputablesEnCero: new Set([5]) });
    expect(conEnCero.imputables).toBe(2);
    expect(conEnCero.grupos[0].items).toBe(2);
  });

  it("aparta los renglones de estructura y guarda el total que declara cada cuenta", () => {
    const r = resumir(
      [
        fila(2, "1435", 5000, { tipoFila: "agrupadora", motivo: "seccion_cuenta" }),
        fila(3, "1435", 3000),
        fila(4, "1435", 2000),
      ],
      { declaradoPorCuenta: new Map([["1435", 5000]]) },
    );
    expect(r.renglonesEstructura).toBe(1);
    expect(r.grupos[0]).toMatchObject({ clasificador: "1435", filas: 2, estructura: 1, items: 2, subtotal: 5000, declarado: 5000 });
  });

  it("junta las novedades del archivo: negativos, descuadres y la fila que parece el gran total", () => {
    const r = resumir(
      [fila(2, "MERCANCÍA", -30), fila(3, "MERCANCÍA", 200), fila(4, "MERCANCÍA", 300), fila(5, "MERCANCÍA", 470)],
      {
        negativos: [{ filaNum: 2, etiqueta: "Cantidad", valor: -3 }],
        descuadres: [{ filaNum: 4, etiqueta: "Valor total", declarado: 300, esperado: 20 }],
      },
    );
    // La fila 5 vale lo que suman las demás: es el gran total del archivo colado como ítem.
    expect(r.totalizadoras.map((t) => t.filaNum)).toEqual([5]);
    expect(r.novedades).toEqual([2, 4, 5]);
    expect(r.grupos[0].novedades).toBe(3);
    expect([r.negativosFilas, r.descuadresFilas]).toEqual([1, 1]);
  });

  it("un subtotal del archivo que no cuadra con su bloque también es novedad", () => {
    const r = resumir([
      fila(2, "MERCANCÍA", 100),
      fila(3, "MERCANCÍA", 200),
      fila(4, "MERCANCÍA", 999, { tipoFila: "total", motivo: "subtotal:rotulo" }),
    ]);
    expect(r.control.grupos[0]).toMatchObject({ estado: "descuadre" });
    expect(r.novedades).toContain(4);
  });

  it("oculta las columnas que el archivo no trae y nunca la del valor ni la del clasificador", () => {
    const conDatos = new Set(["referencia", "descripcion"]);
    const r = resumir([fila(2, "MERCANCÍA", 100)], { columnasConDatos: conDatos });
    const visibles = r.columnasVisibles.map(claveColumna);
    expect(visibles).toContain(INV.valor);
    expect(visibles).toContain(INV.clasificador);
    expect(visibles).toContain("referencia");
    expect(r.columnasOcultas.map(claveColumna)).toContain("cantidad");
  });
});
