// Opt-in con autorización humana: únicamente XLSX ficticios 04/05, sin escrituras en BD.
// INV_IA_FLEXIBLE_SMOKE=1 npx vitest run src/lib/modulos/asistencia/ia-flexible-live.test.ts
import { config } from "dotenv";
import { readFile, writeFile } from "node:fs/promises";
import { expect, it, vi } from "vitest";

const archivos = ["04_siesa_campos_en_una_celda_2026-09.xlsx", "05_siesa_producto_en_varias_filas_2026-09.xlsx"];

it.skipIf(process.env.INV_IA_FLEXIBLE_SMOKE !== "1").each(archivos)("interpreta %s con IA real, confirma ejemplos y reutiliza sin IA", async (nombre) => {
  config({ quiet: true });
  const { ingerir } = await import("@/lib/balance/extraccion/ingesta");
  const { resolverLecturaInventario } = await import("./resolver");
  const { transformarModulo } = await import("../extraccion/transformar");
  const { MODULOS_IMPORT } = await import("../descriptores");
  const ia = await import("./ia");
  const proponer = ia.proponerSpecInventarioIA;
  const llamadas = vi.spyOn(ia, "proponerSpecInventarioIA").mockImplementation(async (...args) => {
    try { return await proponer(...args); } catch (error) {
      const causa = error instanceof Error ? error.cause : null;
      console.info("Diagnóstico proveedor:", causa instanceof Error ? causa.message.replace(/sk-[\w-]+/g, "[redactado]").slice(0, 500) : "sin causa detallada");
      throw error;
    }
  });
  try {
    const inicio = Date.now();
    const bytes = await readFile(`outputs/pruebas-inventario-siesa/${nombre}`);
    const ingesta = await ingerir(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), nombre);
    if (ingesta.modo !== "tabular") throw new Error("El ejemplo no produjo una grilla tabular.");
    const primera = await resolverLecturaInventario({ hojas: ingesta.hojas, nombreArchivo: nombre, aplicativo: "SIESA", forzarIA: true });
    console.info(JSON.stringify({ archivo: nombre, origen: primera.origen, resumen: primera.resumen, preguntas: primera.preguntas, errores: primera.errores, advertencias: primera.advertencias, usos: primera.usos, spec: primera.spec }));
    expect(primera.errorProveedorIA).not.toBe(true);
    expect(primera.origen).toBe("ia");
    expect(primera.usos.length).toBeGreaterThan(0);
    expect(primera.spec?.lecturaEstructurada).toBeTruthy();
    expect(primera.errores).toEqual([]);
    expect(primera.resumen).toMatchObject({ filasIncluidas: 18, valorLeido: 19_140_500, totalDeclarado: 19_140_500, diferencia: 0 });
    expect(primera.listoParaBorrador).toBe(false);
    expect(primera.preguntas.map((p) => p.id)).toEqual(["confirmar_lectura_estructurada"]);
    expect(primera.ejemplosLectura).toHaveLength(3);
    const respuestas = { confirmar_lectura_estructurada: primera.preguntas[0].opciones![0].valor };
    llamadas.mockClear();
    const confirmada = await resolverLecturaInventario({ hojas: ingesta.hojas, specBase: primera.spec, origenBase: "ia", respuestas, respuestasNuevas: respuestas, preguntasPendientes: primera.preguntas });
    expect(confirmada.listoParaBorrador).toBe(true);
    expect(confirmada.preguntas).toEqual([]);
    expect(confirmada.usos).toEqual([]);
    expect(llamadas).not.toHaveBeenCalled();
    const original = ingesta.hojas.find((h) => h.nombre === confirmada.spec!.hoja)!;
    const lectura = transformarModulo(MODULOS_IMPORT.INV, confirmada.spec!, original);
    const movimientos = lectura.filas.filter((f) => f.tipoFila === "movimiento");
    expect(movimientos).toHaveLength(18);
    expect(movimientos.reduce((s, f) => s + Number(f.datos.cantidad ?? 0), 0)).toBe(875);
    expect(new Set(movimientos.map((f) => f.clasificador)).size).toBe(3);
    const reutilizada = await resolverLecturaInventario({ hojas: ingesta.hojas, specBase: confirmada.spec, origenBase: "patron" });
    expect(reutilizada.usos).toEqual([]);
    expect(reutilizada.resumen).toEqual(confirmada.resumen);
    expect(reutilizada.listoParaBorrador).toBe(true);
    expect(reutilizada.preguntas).toEqual([]);
    expect(llamadas).not.toHaveBeenCalled();
    const reporte = {
      fecha: new Date().toISOString(), archivo: nombre, duracionMs: Date.now() - inicio,
      datosFicticios: true, escriturasBD: false, aprendizajePersistidoVerificado: false,
      primera: { origen: primera.origen, resumen: primera.resumen, preguntas: primera.preguntas, usos: primera.usos, spec: primera.spec, ejemplos: primera.ejemplosLectura },
      confirmacion: { lista: confirmada.listoParaBorrador, usos: confirmada.usos, cantidad: 875, tipos: 3 },
      reutilizacionSpecEnMemoria: { lista: reutilizada.listoParaBorrador, usos: reutilizada.usos, resumen: reutilizada.resumen },
    };
    const ruta = `outputs/pruebas-inventario-siesa/${nombre.replace(/\.xlsx$/, ".ia-real.json")}`;
    await writeFile(ruta, `${JSON.stringify(reporte, null, 2)}\n`, "utf8");
    console.info(`Evidencia verificada: ${ruta}`);
  } finally {
    llamadas.mockRestore();
  }
}, 180_000);
