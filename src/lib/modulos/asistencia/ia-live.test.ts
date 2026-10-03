// Prueba opt-in: sólo datos sintéticos, ninguna escritura en BD ni registro de consumo.
// INV_IA_SMOKE=1 npx vitest run src/lib/modulos/asistencia/ia-live.test.ts
import { config } from "dotenv";
import { readFile } from "node:fs/promises";
import { expect, it, vi } from "vitest";

it.skipIf(process.env.INV_IA_SMOKE !== "1")("reconoce el formato nuevo SIESA con IA real y reutiliza su mapa sin otra llamada", async () => {
  config({ quiet: true });
  const { ingerir } = await import("@/lib/balance/extraccion/ingesta");
  const { resolverLecturaInventario } = await import("./resolver");
  const ia = await import("./ia");
  const proponer = ia.proponerSpecInventarioIA;
  const pruebaProveedor = vi.spyOn(ia, "proponerSpecInventarioIA").mockImplementation(async (...args) => {
    try { return await proponer(...args); } catch (error) {
      const causa = error instanceof Error ? error.cause : null;
      console.info("Diagnóstico proveedor:", causa instanceof Error ? causa.message.replace(/sk-[\w-]+/g, "[redactado]").slice(0, 500) : "sin causa detallada");
      throw error;
    }
  });
  const nombre = "02_siesa_formato_nuevo_2026-09.xlsx";
  const bytes = await readFile(`outputs/pruebas-inventario-siesa/${nombre}`);
  const ingesta = await ingerir(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), nombre);
  if (ingesta.modo !== "tabular") throw new Error("El ejemplo no produjo una grilla tabular.");
  const primera = await resolverLecturaInventario({ hojas: ingesta.hojas, nombreArchivo: nombre, aplicativo: "SIESA", forzarIA: true });
  pruebaProveedor.mockRestore();
  console.info(JSON.stringify({ origen: primera.origen, resumen: primera.resumen, preguntas: primera.preguntas, errores: primera.errores, advertencias: primera.advertencias, modelos: primera.usos.map((u) => u.modelo), llamadas: primera.usos.length, spec: primera.spec }));
  expect(primera.errorProveedorIA).not.toBe(true);
  expect(primera.origen).toBe("ia");
  expect(primera.usos.length).toBeGreaterThan(0);
  expect(primera.listoParaBorrador).toBe(true);
  expect(primera.resumen).toMatchObject({ filasIncluidas: 18, valorLeido: 19_140_500, totalDeclarado: 19_140_500, diferencia: 0 });
  expect(primera.preguntas).toEqual([]);
  const segunda = await resolverLecturaInventario({ hojas: ingesta.hojas, nombreArchivo: nombre, specBase: primera.spec, origenBase: "patron" });
  expect(segunda.origen).toBe("patron");
  expect(segunda.usos).toEqual([]);
  expect(segunda.resumen).toEqual(primera.resumen);
  expect(segunda.listoParaBorrador).toBe(true);
}, 180_000);
