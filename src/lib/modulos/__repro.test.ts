import { describe, it } from "vitest";
import { appendFileSync } from "node:fs";
const OUT = "/private/tmp/claude-501/-Users-vicbook-Documents-Xentria-apps-Russell-Diagnostico/84bed1b0-6ea7-4d8f-8f25-ac23c5cb6406/scratchpad/repro.txt";
const LOG = (...a: unknown[]) => appendFileSync(OUT, a.map(String).join(" ") + "\n");
import { readFileSync } from "node:fs";
import { ingerir } from "@/lib/balance/extraccion/ingesta";
import { MODULOS_IMPORT } from "./descriptores";
import { sugerirSpec } from "./extraccion/sugerir";
import { transformarModulo } from "./extraccion/transformar";
import { controlSubtotales } from "./subtotales";

describe("repro INVENTARIO.xlsx", () => {
  it("lee", async () => {
    const buf = readFileSync("/Users/vicbook/Downloads/INVENTARIO.xlsx");
    const ing = await ingerir(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer, "INVENTARIO.xlsx");
    const hoja = ing.hojas![0];
    LOG("modo", ing.modo, "hojas", ing.hojas?.length, "filas", hoja.filas.length);
    const desc = MODULOS_IMPORT.INV;
    const spec = sugerirSpec(desc, hoja);
    LOG("SPEC", JSON.stringify(spec));
    const res = transformarModulo(desc, spec, hoja);
    LOG("filasLeidas", res.filasLeidas, "filasExcluidas", res.filasExcluidas, "filas", res.filas.length, "omitidasArriba", res.filasOmitidasArriba);
    const totales = res.filas.filter((f) => f.tipoFila !== "movimiento");
    LOG("no-movimiento:", totales.length);
    for (const t of totales.slice(0, 30)) LOG("  ", t.filaNum, t.tipoFila, t.motivo, t.clasificador, t.valor);
    const suma = res.filas.filter((f) => f.tipoFila === "movimiento" && f.omitida !== true).reduce((a, f) => a + f.valor, 0);
    LOG("SUMA MOVIMIENTOS", suma.toFixed(2));
    // filas con valor grande que siguen como movimiento
    for (const f of res.filas.filter((f) => f.tipoFila === "movimiento" && Math.abs(f.valor) > 1e8)) LOG("  GRANDE", f.filaNum, f.clasificador, f.valor, JSON.stringify(f.datos).slice(0,150));
    const ctl = controlSubtotales(res.filas as never, (f) => f.tipoFila === "movimiento" && f.omitida !== true);
    LOG("CONTROL", JSON.stringify({ grupos: ctl.grupos.length, granTotal: ctl.granTotal, descuadres: ctl.descuadres, noValidados: ctl.noValidados }, null, 1));
    for (const g of ctl.grupos.slice(0, 10)) LOG("  grupo", g.clasificador, g.filaSubtotal, g.sumaMovimientos, g.subtotalArchivo, g.estado);
  }, 120000);
});
