import { describe, expect, it } from "vitest";
import { agregarProducto, asignarPartesSugeridas, filasConProblemas, marcarInicioProducto, marcasEnCelda, modeloParaEnviar, quitarProducto, soltarDato } from "./constructor-estado";
import { ModeloUsuarioSchema, modeloVacio } from "./modelo-usuario";

const texto = "Ref: MP-001 | Cant: 120 | Total: 300000";
const celda = (buscado: string, fila = 2) => {
  const inicio = texto.indexOf(buscado);
  return { tipo: "celda" as const, fila, columna: 1, texto, inicio, fin: inicio + buscado.length };
};

describe("constructor de la lectura por ejemplo", () => {
  it("asigna pedazos de una celda al producto activo y reemplaza el campo si se vuelve a soltar", () => {
    let m = modeloVacio("INV");
    m = soltarDato(m, 0, { tipo: "rol", rol: "referencia" }, celda("MP-001"), 1).modelo;
    m = soltarDato(m, 0, { tipo: "rol", rol: "cantidad" }, celda("120"), 1).modelo;
    m = soltarDato(m, 0, { tipo: "rol", rol: "referencia" }, celda("Ref: MP-001"), 1).modelo;
    expect(m.productos[0].asignaciones).toEqual([
      { rol: "cantidad", fila: 2, columna: 1, inicio: texto.indexOf("120"), fin: texto.indexOf("120") + 3 },
      { rol: "referencia", fila: 2, columna: 1, inicio: 0, fin: 11 },
    ]);
  });

  it("bloquea al soltar un campo numérico que mezcla rótulos o no tiene cifras", () => {
    const m = modeloVacio("INV");
    expect(soltarDato(m, 0, { tipo: "rol", rol: "valorTotal" }, celda("Total: 300000"), 1).aviso?.mensaje).toContain("Selecciona solo el número");
    expect(soltarDato(m, 0, { tipo: "rol", rol: "cantidad" }, celda("MP-001"), 1).aviso?.nivel).toBe("error");
    expect(soltarDato(m, 0, { tipo: "rol", rol: "cantidad" }, celda("120"), 1).aviso).toBeNull();
    expect(soltarDato(m, 0, { tipo: "rol", rol: "cantidad" }, { tipo: "celda", fila: 2, columna: 1, texto: "Ref: A" }, 1).aviso?.nivel).toBe("error");
  });

  it("una columna entera no puede ir a dos campos y pasa a ser la regla del campo", () => {
    let m = modeloVacio("INV");
    m = soltarDato(m, 0, { tipo: "rol", rol: "valorTotal" }, celda("300000"), 1).modelo;
    m = soltarDato(m, 0, { tipo: "rol", rol: "valorTotal" }, { tipo: "columna", columna: 3 }, 1).modelo;
    expect(m.columnas).toEqual([{ rol: "valorTotal", columna: 3, filaTitulos: 1 }]);
    expect(m.productos[0].asignaciones).toEqual([]);
    const repetida = soltarDato(m, 0, { tipo: "rol", rol: "cantidad" }, { tipo: "columna", columna: 3 }, 1);
    expect(repetida.modelo).toBe(m);
    expect(repetida.aviso?.mensaje).toContain("selecciona en una celda el pedazo de cada campo");
    expect(soltarDato(m, 0, { tipo: "seccion" }, { tipo: "columna", columna: 1 }, 1).aviso?.nivel).toBe("error");
  });

  it("marca secciones, totales e inicio de producto, y los señala en la grilla", () => {
    let m = modeloVacio("INV");
    m = soltarDato(m, 0, { tipo: "rol", rol: "referencia" }, celda("MP-001", 3), 1).modelo;
    m = soltarDato(m, 0, { tipo: "seccion" }, { tipo: "celda", fila: 2, columna: 1, texto: "TIPO: MP", inicio: 6, fin: 8 }, 1).modelo;
    m = soltarDato(m, 0, { tipo: "total", subtipo: "general" }, { tipo: "celda", fila: 20, columna: 1, texto: "TOTAL: 99", inicio: 7, fin: 9 }, 1).modelo;
    m = marcarInicioProducto(m, 0, 3);
    expect(marcasEnCelda(m, 3, 1)).toEqual([{ tipo: "rol", rol: "referencia", producto: 0, tramo: true }]);
    expect(marcasEnCelda(m, 2, 1)).toEqual([{ tipo: "seccion" }]);
    expect(marcasEnCelda(m, 20, 1)).toEqual([{ tipo: "total" }]);
    expect(m.productos[0].filaInicio).toBe(3);
    expect(marcarInicioProducto(m, 0, null).productos[0]).not.toHaveProperty("filaInicio");
  });

  it("agrega y quita productos sin quedarse nunca sin uno, y envía solo los armados", () => {
    let m = agregarProducto(agregarProducto(modeloVacio("INV")));
    expect(m.productos).toHaveLength(3);
    m = soltarDato(m, 1, { tipo: "rol", rol: "referencia" }, celda("MP-001"), 1).modelo;
    m = soltarDato(m, 1, { tipo: "rol", rol: "valorTotal" }, celda("300000"), 1).modelo;
    const enviar = modeloParaEnviar({ ...m, tipoUnico: true });
    expect(enviar.productos).toHaveLength(1);
    expect(ModeloUsuarioSchema.safeParse(enviar).success).toBe(true);
    expect(quitarProducto(quitarProducto(quitarProducto(m, 0), 0), 0).productos).toEqual([{ asignaciones: [] }]);
  });

  it("resume los problemas por fila para navegar hasta ellos", () => {
    expect(filasConProblemas([
      { fila: 9, columna: 1, tipo: "sin_interpretar", mensaje: "b" },
      { fila: 4, tipo: "registro", mensaje: "a" },
      { fila: 9, columna: 2, tipo: "signo", mensaje: "c" },
    ])).toEqual([{ fila: 4, mensaje: "a" }, { fila: 9, columna: 1, mensaje: "b" }]);
  });

  it("no deja asignar la celda entera con varios datos a un campo: pide la parte", () => {
    const m = modeloVacio("INV");
    const r = soltarDato(m, 0, { tipo: "rol", rol: "tipo" }, { tipo: "celda", fila: 7, columna: 1, texto }, 1);
    expect(r.modelo).toBe(m);
    expect(r.mostrarPartes).toEqual({ fila: 7, columna: 1 });
    expect(r.aviso?.mensaje).toContain("Esta celda trae 3 datos");
    // Una celda de un solo dato sí se asigna entera.
    expect(soltarDato(m, 0, { tipo: "rol", rol: "cantidad" }, { tipo: "celda", fila: 7, columna: 2, texto: "120" }, 1).modelo.productos[0].asignaciones).toEqual([{ rol: "cantidad", fila: 7, columna: 2 }]);
  });

  it("asigna de una vez las partes que el sistema reconoce por su rótulo", () => {
    const celda = { fila: 11, columna: 1, texto: "Ref: PP-004 | Descripción: Pieza | Tipo: Productos en proceso | Cant: 60 | Unit: 12000 | Total: 720000" };
    const r = asignarPartesSugeridas(modeloVacio("INV"), 0, celda);
    expect(r.aviso).toBeNull();
    expect(r.modelo.productos[0].asignaciones.map((a) => [a.rol, celda.texto.slice(a.inicio, a.fin)])).toEqual([
      ["referencia", "PP-004"], ["descripcion", "Pieza"], ["tipo", "Productos en proceso"], ["cantidad", "60"], ["valorUnitario", "12000"], ["valorTotal", "720000"],
    ]);
  });
});
