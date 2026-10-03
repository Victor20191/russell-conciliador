import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SpecModulo } from "../extraccion/esquema";

const mocks = vi.hoisted(() => ({ parse: vi.fn() }));
vi.mock("@/lib/anthropic", () => ({
  getAnthropic: () => ({ messages: { parse: mocks.parse } }),
  conReintentoSinTemperatura: (llamar: (ajustes: object) => Promise<unknown>) => llamar({}),
}));
vi.mock("@/lib/ia/modelos", () => ({ CASCADA_EXTRACCION: [{ modelo: "rapido-configurado", umbralConfianza: 0.75 }, { modelo: "complejo-configurado", umbralConfianza: 0 }] }));

import { construirContextoInventario, ErrorProveedorAsistenciaInventario, proponerSpecInventarioIA, RespuestaInventarioIASchema, normalizarRespuestaProveedorInventario, SalidaProveedorInventarioSchema } from "./ia";

const spec: SpecModulo = { hoja: "INV", filaEncabezado: 1, primeraFilaDatos: 2, columnas: { tipo: 1, referencia: 2, descripcion: 0, cantidad: 3, valorUnitario: 4, valorTotal: 5 } };
const uso = { input_tokens: 100, output_tokens: 50 };
beforeEach(() => vi.clearAllMocks());

describe("contexto de la asistencia IA de inventarios", () => {
  it("incluye muestras intermedias y referencias físicas sin enviar todas las filas", () => {
    const filas = Array.from({ length: 1000 }, (_, i) => [i === 200 ? "SECCION INTERMEDIA" : `P-${i}`, 100]);
    const contexto = construirContextoInventario({ hojas: [{ nombre: "INV", filas, filasFisicas: filas.map((_, i) => i + 20) }] });
    expect(contexto).toContain("SECCION INTERMEDIA");
    expect(contexto).toContain('"fila":201,"excelFila":220');
    expect(contexto).not.toContain("P-777");
    expect(contexto.length).toBeLessThan(58_100);
  });

  it("acota textos enormes y rechaza cifras o filas fabricadas en la respuesta IA", () => {
    const contexto = construirContextoInventario({ hojas: [{ nombre: "INV", filas: Array.from({ length: 1000 }, () => Array(100).fill("x".repeat(500))) }] });
    expect(contexto.length).toBeLessThan(58_100);
    expect(RespuestaInventarioIASchema.safeParse({ spec: null, confianza: 0, motivoNoCompatible: "Sin inventario", filas: [{ valor: 100 }] }).success).toBe(false);
  });

  it("incluye anomalías puntuales fuera de inicio, fin y puntos de muestreo", () => {
    const filas = Array.from({ length: 1000 }, (_, i) => ["Tipo", `P-${i}`, 1, 10, i === 731 ? 13 : 10]);
    const contexto = construirContextoInventario({ hojas: [{ nombre: "INV", filas }], specBase: spec });
    expect(contexto).toContain('"fila":732');
    expect(contexto).toContain('"C5":13');
  });

  it("conserva etiquetas de celdas compuestas y suficientes filas iniciales de registros verticales", () => {
    const compuesto = `Referencia: A | Tipo: Materia prima | ${"descripción ".repeat(8)}| Cantidad: 7 | Total: 21`;
    const filas = Array.from({ length: 80 }, (_, i) => [i === 30 ? compuesto : `dato-${i}`]);
    const contexto = construirContextoInventario({ hojas: [{ nombre: "INV", filas }], preguntasPendientes: [{ id: "ia_separacion", etiqueta: "¿Cómo se separan tipo y referencia?", requiereIA: true }], respuestas: { ia_separacion: "Por etiquetas" } });
    expect(contexto).toContain("Cantidad: 7 | Total: 21");
    expect(contexto).toContain("ia_separacion");
    expect(contexto).toContain("Por etiquetas");
  });

  it("limita preguntas y no permite preguntas que pisen los controles deterministas", () => {
    const pregunta = { id: "ia_registro", etiqueta: "¿Dónde comienza cada registro?", evidencia: [{ hoja: "INV", fila: 2, columna: 1 }] };
    const respuesta = { spec: null, confianza: 0.5, motivoNoCompatible: null, preguntas: [pregunta] };
    expect(RespuestaInventarioIASchema.safeParse(respuesta).success).toBe(true);
    expect(RespuestaInventarioIASchema.safeParse({ ...respuesta, preguntas: [{ ...pregunta, id: "total_archivo" }] }).success).toBe(false);
    expect(RespuestaInventarioIASchema.safeParse({ ...respuesta, preguntas: Array(4).fill(pregunta) }).success).toBe(false);
    expect(RespuestaInventarioIASchema.safeParse({ ...respuesta, preguntas: [{ ...pregunta, evidencia: [{ hoja: "INV", fila: 2, columna: 1, texto: "texto fabricado" }] }] }).success).toBe(false);
  });

  it("incluye fuentes estructuradas fuera de las columnas iniciales y finales de la muestra", () => {
    const ancho = Array(100).fill("auxiliar");
    ancho[49] = "Registro importante";
    const contexto = construirContextoInventario({ hojas: [{ nombre: "INV", filas: [ancho] }], specBase: { ...spec, lecturaEstructurada: {
      version: 1, registro: { ancla: { columna: 50, operador: "no_vacia" }, maxFilas: 1 }, campos: [{ rol: "valorTotal", fuente: { columna: 50, desplazamientoFila: 0, selector: { tipo: "completa" } } }],
    } } });
    expect(contexto).toContain('"C50":"Registro importante"');
  });

  it("convierte el transporte compacto en el mismo Spec estricto, sin ampliar lo ejecutable", () => {
    const respuesta = {
      spec: [{ ...spec, clasificadorModo: "global", seccionColumnaVaciaRol: "", subtotales: "rotulo", subtotalesColumna: 0, subtotalesFila: 0, subtotalesTexto: "",
        lecturaEstructuradaJson: JSON.stringify({ version: 1, registro: { ancla: { columna: 1, operador: "empieza", texto: "Total:" }, maxFilas: 1 }, campos: [{ rol: "valorTotal", fuente: {
          columna: 1, desplazamientoFila: 0, selector: { tipo: "etiqueta", inicio: "Total:" },
        } }] }) }], confianza: 0.9, motivoNoCompatible: "", preguntas: [],
    };
    expect(SalidaProveedorInventarioSchema.safeParse(respuesta).success).toBe(true);
    const normalizada = RespuestaInventarioIASchema.parse(normalizarRespuestaProveedorInventario(respuesta));
    expect(normalizada.spec?.lecturaEstructurada?.campos[0].fuente.selector).toEqual({ tipo: "etiqueta", inicio: "Total:" });
    expect(normalizada.spec).not.toHaveProperty("subtotalesFila");
    const invalida = structuredClone(respuesta);
    const regla = JSON.parse(invalida.spec[0].lecturaEstructuradaJson);
    regla.registro.maxFilas = 300;
    invalida.spec[0].lecturaEstructuradaJson = JSON.stringify(regla);
    expect(RespuestaInventarioIASchema.safeParse(normalizarRespuestaProveedorInventario(invalida)).success).toBe(false);
    invalida.spec[0].lecturaEstructuradaJson = "require('fs').readFileSync('/secret')";
    expect(RespuestaInventarioIASchema.safeParse(normalizarRespuestaProveedorInventario(invalida)).success).toBe(false);
  });
});

describe("cascada IA de estructuras, sin generación de importes", () => {
  it("acepta el primer mapa validado y registra una sola llamada", async () => {
    mocks.parse.mockResolvedValue({ parsed_output: { spec, confianza: 0.95, motivoNoCompatible: null }, usage: uso });
    const r = await proponerSpecInventarioIA({ hojas: [] }, () => true);
    expect(r.spec).toEqual(spec);
    expect(r.usos).toEqual([{ tipoOperacion: "extraccion_tabular", modelo: "rapido-configurado", usage: uso }]);
    expect(mocks.parse).toHaveBeenCalledTimes(1);
  });

  it("escala ante mapa no aplicable aunque el modelo declare confianza alta", async () => {
    mocks.parse.mockResolvedValueOnce({ parsed_output: { spec: { ...spec, columnas: { ...spec.columnas, valorTotal: 99 } }, confianza: 1, motivoNoCompatible: null }, usage: uso });
    mocks.parse.mockResolvedValueOnce({ parsed_output: { spec, confianza: 0.9, motivoNoCompatible: null }, usage: uso });
    const r = await proponerSpecInventarioIA({ hojas: [] }, (mapa) => mapa.columnas.valorTotal === 5);
    expect(r.spec).toEqual(spec);
    expect(r.usos.map((u) => u.modelo)).toEqual(["rapido-configurado", "complejo-configurado"]);
  });

  it("un último intento nulo no elimina el mapa válido de menor confianza", async () => {
    mocks.parse.mockResolvedValueOnce({ parsed_output: { spec, confianza: 0.5, motivoNoCompatible: null }, usage: uso });
    mocks.parse.mockResolvedValueOnce({ parsed_output: { spec: null, confianza: 0.1, motivoNoCompatible: "Ambiguo" }, usage: uso });
    const r = await proponerSpecInventarioIA({ hojas: [] }, () => true);
    expect(r.spec).toEqual(spec);
    expect(r.confianza).toBe(0.5);
    expect(r.usos).toHaveLength(2);
  });

  it("conserva consumo previo si falla el segundo proveedor y no disfraza la falla", async () => {
    mocks.parse.mockResolvedValueOnce({ parsed_output: { spec, confianza: 0.2, motivoNoCompatible: null }, usage: uso });
    mocks.parse.mockRejectedValueOnce(new Error("Proveedor temporalmente caído"));
    try {
      await proponerSpecInventarioIA({ hojas: [] }, () => true);
      throw new Error("La prueba esperaba el fallo del proveedor");
    } catch (error) {
      expect(error).toBeInstanceOf(ErrorProveedorAsistenciaInventario);
      expect((error as ErrorProveedorAsistenciaInventario).usos).toHaveLength(1);
    }
  });

  it("conserva la duda explícita y no gasta otro modelo para una decisión del usuario", async () => {
    const preguntas = [{ id: "ia_tipo", etiqueta: "¿Esta etiqueta describe el tipo o la referencia?", evidencia: [{ hoja: "INV", fila: 2, columna: 1 }] }];
    mocks.parse.mockResolvedValue({ parsed_output: { spec, confianza: 0.5, motivoNoCompatible: null, preguntas }, usage: uso });
    const r = await proponerSpecInventarioIA({ hojas: [] }, () => true);
    expect(r.preguntas).toEqual(preguntas);
    expect(mocks.parse).toHaveBeenCalledTimes(1);
  });
});
