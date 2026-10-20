import { describe, expect, it } from "vitest";
import { MAX_COMENTARIO_PROMOCION } from "./advertencia-archivo-fuente";
import {
  campoComentario,
  leerComentariosDescuadre,
  motivosConComentario,
  textoPlanoComentarios,
  tiposComentarioRequeridos,
  validarComentariosDescuadre,
} from "./comentarios-descuadre";
import type { MotivoDescuadre } from "./cuadre-borrador";

const PARTIDA: MotivoDescuadre = { tipo: "partida_doble", monto: 2_500 };
const CLASES: MotivoDescuadre = { tipo: "clases", clases: [{ clase: "Activo", diff: 3_000 }] };
const ECUACION: MotivoDescuadre = { tipo: "ecuacion", monto: -4_000 };

describe("comentarios por condición del descuadre", () => {
  it("cada condición tiene su campo en el formulario", () => {
    expect(campoComentario("ecuacion")).toBe("comentarioDescuadre_ecuacion");
    expect(campoComentario("agrupadoras")).toBe("comentarioDescuadre_agrupadoras");
  });

  it("pide el comentario de cada condición que falla, en el orden de la pantalla", () => {
    expect(tiposComentarioRequeridos([CLASES, PARTIDA], false)).toEqual(["partida_doble", "clases"]);
    expect(tiposComentarioRequeridos([], false)).toEqual([]);
  });

  it("la diferencia del archivo fuente es la ecuación: la pide aunque el veredicto no la traiga", () => {
    expect(tiposComentarioRequeridos([], true)).toEqual(["ecuacion"]);
    expect(tiposComentarioRequeridos([CLASES, ECUACION], true)).toEqual(["ecuacion", "clases"]);
  });

  it("lee solo los cuatro campos conocidos, recortados, y descarta los vacíos", () => {
    const form: Record<string, unknown> = {
      comentarioDescuadre_partida_doble: "  Revisado con el cliente.  ",
      comentarioDescuadre_clases: "   ",
      comentarioDescuadre_otro: "no",
      comentarioPromocion: "nota",
    };
    expect(leerComentariosDescuadre((campo) => form[campo] ?? null)).toEqual({ partida_doble: "Revisado con el cliente." });
  });

  it("falla si falta el comentario de alguna condición y dice cuál", () => {
    const una = validarComentariosDescuadre({ partida_doble: "ok" }, ["partida_doble", "clases"]);
    expect(una).toEqual({ ok: false, message: "El borrador está descuadrado: falta el comentario de «Clases contra el archivo»." });

    const dos = validarComentariosDescuadre({}, ["partida_doble", "clases"]);
    expect(dos.ok).toBe(false);
    expect(!dos.ok && dos.message).toContain("«Partida doble», «Clases contra el archivo»");
  });

  it("con solo la ecuación del archivo fuente pendiente, conserva el mensaje de siempre", () => {
    expect(validarComentariosDescuadre({}, ["ecuacion"], true)).toEqual({
      ok: false,
      message: "Escribe un comentario para cargar este balance con la diferencia del archivo fuente.",
    });
  });

  it("rechaza un comentario que pasa del máximo, aunque la condición no se requiera", () => {
    const largo = "x".repeat(MAX_COMENTARIO_PROMOCION + 1);
    const r = validarComentariosDescuadre({ partida_doble: "ok", agrupadoras: largo }, ["partida_doble"]);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.message).toContain("«Agrupadoras contra su desglose»");
  });

  it("con todos los comentarios, devuelve solo los de las condiciones requeridas", () => {
    expect(validarComentariosDescuadre({ partida_doble: "a", clases: "b", ecuacion: "sobra" }, ["partida_doble", "clases"]))
      .toEqual({ ok: true, comentarios: { partida_doble: "a", clases: "b" } });
  });

  it("une cada condición con su comentario", () => {
    expect(motivosConComentario([PARTIDA, CLASES], { partida_doble: "a", clases: "b" })).toEqual([
      { ...PARTIDA, comentario: "a" },
      { ...CLASES, comentario: "b" },
    ]);
  });
});

describe("texto plano de los comentarios (comentario_aprobacion, auditoría e historial)", () => {
  it("borrador: una línea «Condición: comentario» por condición", () => {
    expect(textoPlanoComentarios({
      origen: "borrador",
      motivos: [{ ...PARTIDA, comentario: "a" }, { ...CLASES, comentario: "b" }],
    })).toBe("Partida doble: a\nClases contra el archivo: b");
  });

  it("archivo fuente: el comentario de la ecuación tal cual y las demás condiciones debajo", () => {
    expect(textoPlanoComentarios({ origen: "archivo_fuente", motivos: [{ ...ECUACION, comentario: "e" }] })).toBe("e");
    expect(textoPlanoComentarios({
      origen: "archivo_fuente",
      motivos: [{ ...ECUACION, comentario: "e" }, { ...CLASES, comentario: "b" }],
    })).toBe("e\nClases contra el archivo: b");
  });
});
