// Runner del arnés golden (Fase 0). Reproduce cada fixture capturado y compara su huella
// contra la esperada. Es PURO: lee los fixtures JSON commiteados (sin BD, sin IA), corre
// `construirVistaBorrador` vía `snapshotVista` y falla si algún caso ya resuelto regresa.
//
// Los fixtures se generan/actualizan con `golden/capturar.test.ts` (CAPTURAR_GOLDEN=1).
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { snapshotVista, type GoldenFixture } from "./golden/snapshot";

const DIR = fileURLToPath(new URL("./golden/__fixtures__", import.meta.url));

const archivos = (() => {
  try { return readdirSync(DIR).filter((f) => f.endsWith(".json")).sort(); } catch { return []; }
})();

describe("golden · regresión del borrador sobre casos reales", () => {
  if (archivos.length === 0) {
    it.skip("(sin fixtures capturados — corre golden/capturar con CAPTURAR_GOLDEN=1)", () => {});
    return;
  }
  for (const archivo of archivos) {
    const fx = JSON.parse(readFileSync(new URL(`./golden/__fixtures__/${archivo}`, import.meta.url), "utf8")) as GoldenFixture;
    it(`${fx.nombre} · ${archivo}`, () => {
      expect(snapshotVista(fx.filas)).toEqual(fx.esperado);
    });
  }
});
