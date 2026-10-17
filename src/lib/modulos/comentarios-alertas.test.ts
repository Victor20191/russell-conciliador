import { describe, expect, it } from "vitest";
import { MODULOS_IMPORT } from "./descriptores";
import {
  alertaCambio,
  alertasQueExigenComentario,
  anotarAlertasConComentarios,
  esTipoAlertaComentario,
  validarComentarioAlerta,
  type ComentarioAlerta,
} from "./comentarios-alertas";

const INV = MODULOS_IMPORT.INV;

const filas = [
  { filaNum: 2, clasificador: "1435", datos: { referencia: "A", cantidad: 10, valorUnitario: 0, valorTotal: 0 } },
  { filaNum: 3, clasificador: "1435", datos: { referencia: "B", cantidad: 0, valorUnitario: null, valorTotal: 1_500 } },
  { filaNum: 4, clasificador: "1435", datos: { referencia: "C", cantidad: 8, valorUnitario: 1, valorTotal: 8 } },
  { filaNum: 5, clasificador: "1435", datos: { referencia: "D", cantidad: -2, valorUnitario: 50, valorTotal: -100 } },
  { filaNum: 6, clasificador: "1435", datos: { referencia: "E", cantidad: 3, valorUnitario: 20, valorTotal: 60 } },
];

const comentario = (over: Partial<ComentarioAlerta> & Pick<ComentarioAlerta, "tipo">): ComentarioAlerta => ({
  comentario: "Revisado con el cliente: son ajustes del cierre.",
  referencias: 1,
  valor: 0,
  comentadoPor: "Ana",
  comentadoEn: "17/Oct/2026 9:00 a. m.",
  ...over,
});

describe("alertasQueExigenComentario (Inventarios)", () => {
  it("devuelve solo los tipos presentes, en orden, con sus ítems y su valor", () => {
    const alertas = alertasQueExigenComentario(INV, filas);
    expect(alertas.map((a) => [a.tipo, a.referencias, a.valor])).toEqual([
      // Fila 5: cantidad y valor total en negativo (dos ítems, como los lista Novedades).
      ["valores_negativos", 2, -102],
      ["costo_cero_con_existencias", 1, 0],
      ["sin_existencias_con_costo", 1, 1_500],
      ["costo_uno", 1, 8],
    ]);
    expect(alertas[0].etiqueta).toBe("Valores negativos");
  });

  it("sin alertas en el archivo no pide nada", () => {
    expect(alertasQueExigenComentario(INV, [filas[4]])).toEqual([]);
  });

  it("un módulo que no declara alertas con comentario no pide ninguna (AFI tiene negativos, pero van por otra vía)", () => {
    const afi = [{ filaNum: 2, clasificador: "1516", datos: { costo: -500 } }];
    expect(alertasQueExigenComentario(MODULOS_IMPORT.AFI, afi)).toEqual([]);
  });
});

describe("comentario de una alerta", () => {
  it("exige al menos 10 caracteres sin contar los espacios de los extremos", () => {
    expect(validarComentarioAlerta("  corto  ")).toMatchObject({ ok: false });
    expect(validarComentarioAlerta("123456789")).toMatchObject({ ok: false });
    expect(validarComentarioAlerta("  1234567890  ")).toEqual({ ok: true, texto: "1234567890" });
    expect(validarComentarioAlerta("x".repeat(2001))).toMatchObject({ ok: false });
  });

  it("reconoce solo los tipos conocidos", () => {
    expect(esTipoAlertaComentario("costo_uno")).toBe(true);
    expect(esTipoAlertaComentario("valores_negativos")).toBe(true);
    expect(esTipoAlertaComentario("otra")).toBe(false);
    expect(esTipoAlertaComentario("toString")).toBe(false);
  });
});

describe("anotarAlertasConComentarios", () => {
  const alertas = alertasQueExigenComentario(INV, filas);

  it("pendiente sin comentario, comentada si la alerta sigue igual, por revisar si cambió", () => {
    const anotadas = anotarAlertasConComentarios(alertas, [
      comentario({ tipo: "costo_uno", referencias: 1, valor: 8 }),
      comentario({ tipo: "sin_existencias_con_costo", referencias: 1, valor: 900 }),
      comentario({ tipo: "valores_negativos", referencias: 1, valor: -2 }),
    ]);
    expect(anotadas.map((a) => [a.tipo, a.estado])).toEqual([
      ["valores_negativos", "por_revisar"],
      ["costo_cero_con_existencias", "pendiente"],
      ["sin_existencias_con_costo", "por_revisar"],
      ["costo_uno", "comentada"],
    ]);
  });

  it("el comentario de un tipo que ya no aparece no se devuelve: no impide cerrar", () => {
    const soloCosto1 = alertasQueExigenComentario(INV, [filas[2]]);
    const anotadas = anotarAlertasConComentarios(soloCosto1, [comentario({ tipo: "valores_negativos" })]);
    expect(anotadas.map((a) => a.tipo)).toEqual(["costo_uno"]);
  });

  it("el cambio se mide por ítems o por valor al centavo", () => {
    expect(alertaCambio({ referencias: 3, valor: 100 }, { referencias: 3, valor: 100.004 })).toBe(false);
    expect(alertaCambio({ referencias: 3, valor: 100 }, { referencias: 3, valor: 100.01 })).toBe(true);
    expect(alertaCambio({ referencias: 4, valor: 100 }, { referencias: 3, valor: 100 })).toBe(true);
  });
});
