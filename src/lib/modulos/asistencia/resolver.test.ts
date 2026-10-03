import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SpecModulo } from "../extraccion/esquema";

const mocks = vi.hoisted(() => ({ disponible: vi.fn(() => true), proponer: vi.fn() }));
vi.mock("@/lib/anthropic", () => ({ iaDisponible: mocks.disponible }));
vi.mock("./ia", () => ({ proponerSpecInventarioIA: mocks.proponer, ErrorProveedorAsistenciaInventario: class extends Error {} }));

import { resolverLecturaInventario } from "./resolver";

const spec: SpecModulo = { hoja: "Inventario", filaEncabezado: 1, primeraFilaDatos: 2, columnas: { tipo: 1, referencia: 2, cantidad: 3, valorTotal: 4 }, clasificadorModo: "columna" };
const hoja = { nombre: "Inventario", filas: [["Tipo", "Referencia", "Cantidad", "Valor total"], ["Mercancía", "A", 2, 30], ["Mercancía", "B", 1, 20]] };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.disponible.mockReturnValue(true);
  mocks.proponer.mockResolvedValue({ spec, confianza: 0.95, motivo: null, usos: [{ tipoOperacion: "extraccion_tabular", modelo: "modelo-configurado", usage: { input_tokens: 100, output_tokens: 40 } }] });
});

describe("resolverLecturaInventario", () => {
  it("reutiliza un patrón aceptable con cero llamadas a IA", async () => {
    const r = await resolverLecturaInventario({ hojas: [hoja], specBase: spec });
    expect(r.origen).toBe("patron");
    expect(r.listoParaBorrador).toBe(true);
    expect(mocks.proponer).not.toHaveBeenCalled();
  });

  it("un descuadre del archivo no dispara IA para cambiar la estructura", async () => {
    const r = await resolverLecturaInventario({ hojas: [{ ...hoja, filas: [...hoja.filas, ["Total general", null, null, 80]] }], specBase: spec });
    expect(r.resumen.diferencia).toBe(30);
    expect(r.estructuraValida).toBe(true);
    expect(mocks.proponer).not.toHaveBeenCalled();
  });

  it("usa la IA cuando el patrón tiene columnas fuera de rango y verifica su mapa completo", async () => {
    const r = await resolverLecturaInventario({ hojas: [hoja], specBase: { ...spec, columnas: { ...spec.columnas, valorTotal: 12 } } });
    expect(mocks.proponer).toHaveBeenCalledTimes(1);
    expect(r.origen).toBe("ia");
    expect(r.resumen.valorLeido).toBe(50);
    expect(r.usos).toHaveLength(1);
  });

  it("sólo pregunta la hoja cuando hay dos fuentes plausibles, sin gastar IA", async () => {
    const r = await resolverLecturaInventario({ hojas: [hoja, { ...hoja, nombre: "Otro inventario" }] });
    expect(r.preguntas[0].id).toBe("hoja");
    expect(mocks.proponer).not.toHaveBeenCalled();
  });

  it("no propone hojas ocultas y respeta una elección explícita", async () => {
    const hojas = [hoja, { ...hoja, nombre: "Archivo oculto", oculta: true }];
    await resolverLecturaInventario({ hojas });
    expect(mocks.proponer.mock.calls[0][0].hojas.map((h: { nombre: string }) => h.nombre)).toEqual(["Inventario"]);
    mocks.proponer.mockResolvedValue({ spec: { ...spec, hoja: "Archivo oculto" }, confianza: 0.9, usos: [], motivo: null });
    const r = await resolverLecturaInventario({ hojas, respuestas: { hoja: "Archivo oculto" } });
    expect(r.resumen.hoja).toBe("Archivo oculto");
  });

  it("sin clave conserva el flujo determinista y explica la limitación", async () => {
    mocks.disponible.mockReturnValue(false);
    const r = await resolverLecturaInventario({ hojas: [hoja] });
    expect(r.origen).toBe("heuristica");
    expect(r.listoParaBorrador).toBe(true);
    expect(r.advertencias.some((a) => a.includes("no está configurada"))).toBe(true);
    expect(mocks.proponer).not.toHaveBeenCalled();
  });

  it("una relectura explícita vuelve a IA aunque el patrón sea aplicable", async () => {
    await resolverLecturaInventario({ hojas: [hoja], specBase: spec, forzarIA: true, instrucciones: "La columna D corresponde al costo." });
    expect(mocks.proponer).toHaveBeenCalledTimes(1);
  });

  it("un fallo del proveedor conserva el mapa para editar y nunca simula una lectura IA", async () => {
    mocks.proponer.mockRejectedValue(new Error("Proveedor no disponible"));
    const r = await resolverLecturaInventario({ hojas: [hoja], specBase: spec, forzarIA: true });
    expect(r.spec).toBeTruthy();
    expect(r.origen).toBe("patron");
    expect(r.errorProveedorIA).toBe(true);
    expect(r.listoParaBorrador).toBe(false);
    expect(r.errores.some((e) => e.includes("proveedor de IA"))).toBe(true);
  });

  it("conserva dudas de una propuesta IA al recibir respuestas parciales", async () => {
    const original = { ...hoja, filas: hoja.filas.map((fila, i) => [...fila, i === 0 ? "Valor total" : 40]) };
    const r = await resolverLecturaInventario({ hojas: [original], specBase: spec, origenBase: "ia", respuestas: { hoja: "Inventario" } });
    expect(r.preguntas.map((p) => p.id)).toContain("columna_valor");
    expect(r.listoParaBorrador).toBe(false);
    expect(mocks.proponer).not.toHaveBeenCalled();
  });

  it("las indicaciones históricas no repiten IA al responder una duda", async () => {
    const original = { ...hoja, filas: hoja.filas.map((fila, i) => [...fila, i === 0 ? "Valor total" : 40]) };
    const r = await resolverLecturaInventario({ hojas: [original], specBase: spec, origenBase: "ia", instrucciones: "Indicaciones de la lectura anterior", respuestas: { columna_valor: "4" } });
    expect(r.listoParaBorrador).toBe(true);
    expect(r.usos).toEqual([]);
    expect(mocks.proponer).not.toHaveBeenCalled();
  });

  it("una duda semántica de IA conserva evidencia real y bloquea aunque los números cuadren", async () => {
    mocks.proponer.mockResolvedValue({ spec, confianza: 0.99, motivo: null, usos: [], preguntas: [{ id: "ia_naturaleza_importe", etiqueta: "¿El importe es costo o precio de venta?", evidencia: [{ hoja: "Inventario", fila: 2, columna: 4 }] }] });
    const r = await resolverLecturaInventario({ hojas: [{ ...hoja, filasFisicas: [8, 10, 12], columnaInicial: 2 }] });
    expect(r.resumen.valorLeido).toBe(50);
    expect(r.listoParaBorrador).toBe(false);
    expect(r.preguntas[0]).toMatchObject({ id: "ia_naturaleza_importe", requiereIA: true, evidencia: [{ hoja: "Inventario", fila: 10, columna: 6, texto: "30" }] });
  });

  it("confianza baja sin pregunta del proveedor exige aclarar una celda real", async () => {
    mocks.proponer.mockResolvedValue({ spec, confianza: 0.4, motivo: null, usos: [], preguntas: [] });
    const r = await resolverLecturaInventario({ hojas: [hoja] });
    expect(r.listoParaBorrador).toBe(false);
    expect(r.preguntas[0]).toMatchObject({ id: "ia_aclarar_estructura", requiereIA: true, evidencia: [{ texto: "30" }] });
    expect(r.preguntas[0].etiqueta).toContain("30");
  });

  it("no muestra coordenadas inexistentes inventadas por el proveedor", async () => {
    mocks.proponer.mockResolvedValue({ spec, confianza: 0.95, motivo: null, usos: [], preguntas: [{ id: "ia_ejemplo", etiqueta: "¿Cómo se lee la cifra inventada 999999?", evidencia: [{ hoja: "Inventario", fila: 200, columna: 4 }] }] });
    const r = await resolverLecturaInventario({ hojas: [hoja] });
    expect(r.listoParaBorrador).toBe(false);
    expect(r.preguntas[0].etiqueta).not.toContain("999999");
    expect(r.preguntas[0].evidencia?.[0].texto).toBe("30");
  });

  it("sólo una respuesta semántica nueva pide otra regla a IA; las guardadas no repiten consumo", async () => {
    const pregunta = { id: "ia_significado", etiqueta: "¿Qué significa la cantidad de la columna C?", requiereIA: true };
    const entrada = { hojas: [hoja], specBase: spec, origenBase: "ia" as const, preguntasPendientes: [pregunta], respuestas: { ia_significado: "Unidades disponibles" } };
    const guardada = await resolverLecturaInventario(entrada);
    expect(guardada.listoParaBorrador).toBe(false);
    expect(mocks.proponer).not.toHaveBeenCalled();
    const resuelta = await resolverLecturaInventario({ ...entrada, respuestasNuevas: entrada.respuestas });
    expect(resuelta.listoParaBorrador).toBe(true);
    expect(mocks.proponer).toHaveBeenCalledTimes(1);
  });

  it("la respuesta parcial no elimina otra pregunta semántica aunque IA omita repetirla", async () => {
    const preguntas = [{ id: "ia_tipo", etiqueta: "¿Cuál es el tipo de este registro?", requiereIA: true }, { id: "ia_importe", etiqueta: "¿Cuál es el importe de este registro?", requiereIA: true }];
    const r = await resolverLecturaInventario({ hojas: [hoja], specBase: spec, origenBase: "ia", preguntasPendientes: preguntas, respuestas: { ia_tipo: "Mercancía" }, respuestasNuevas: { ia_tipo: "Mercancía" } });
    expect(mocks.proponer).toHaveBeenCalledTimes(1);
    expect(r.preguntas.map((p) => p.id)).toEqual(["ia_importe"]);
    expect(r.listoParaBorrador).toBe(false);
  });

  it("el formato fuera del contrato queda pendiente de una aclaración, no genera un falso borrador", async () => {
    mocks.proponer.mockResolvedValue({ spec: null, confianza: 0, motivo: "Los registros no tienen un inicio reconocible", usos: [], preguntas: [{ id: "ia_inicio", etiqueta: "¿Qué etiqueta inicia cada producto en esta columna?", evidencia: [{ hoja: "Inventario", fila: 2, columna: 2 }] }] });
    const r = await resolverLecturaInventario({ hojas: [hoja] });
    expect(r.spec).toBeNull();
    expect(r.listoParaBorrador).toBe(false);
    expect(r.preguntas[0].id).toBe("ia_inicio");
    expect(r.errores[0]).toContain("inicio reconocible");
    mocks.proponer.mockClear();
    await resolverLecturaInventario({ hojas: [hoja], preguntasPendientes: r.preguntas });
    expect(mocks.proponer).not.toHaveBeenCalled();
  });
});
