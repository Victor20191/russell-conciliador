import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { compile } from "@tailwindcss/node";

/**
 * Cada clase de color que usa la plataforma debe existir en el tema del Manual de
 * Marca: el tema retira la paleta de Tailwind, así que una clase con un color
 * ajeno (o con un tono que el tema no define) no genera CSS y el elemento queda
 * sin el color que se esperaba. Esta prueba compila `globals.css` con el mismo
 * Tailwind del build y lo comprueba clase por clase.
 */

const RAIZ = path.resolve(__dirname, "../../..");

function archivos(dir: string, salida: string[] = []): string[] {
  for (const nombre of readdirSync(dir)) {
    const ruta = path.join(dir, nombre);
    if (statSync(ruta).isDirectory()) {
      if (nombre !== "generated" && nombre !== "node_modules") archivos(ruta, salida);
    } else if (/\.tsx?$/.test(nombre) && !/\.test\.tsx?$/.test(nombre)) {
      salida.push(ruta);
    }
  }
  return salida;
}

const UTILIDAD =
  "(?:bg|text|border|border-[trblxyse]|ring|ring-offset|outline|fill|stroke|divide|from|to|via|shadow|decoration|accent|caret|placeholder)";
// Clases de esas familias que NO son de color (tamaños, estilos, posiciones…).
const NO_ES_COLOR =
  /^(?:text-(?:xs|sm|base|lg|xl|\dxl|left|right|center|justify|start|end|wrap|nowrap|balance|pretty|ellipsis|clip)|border(?:-[trblxyse])?(?:-\d+)?|border-(?:solid|dashed|dotted|double|none|collapse|separate|hidden|spacing\S*)|ring(?:-\d+)?|ring-inset|outline(?:-\d+)?|outline-(?:none|hidden|dashed|dotted|double|solid|offset-\d+)|-?outline-offset-\d+|shadow(?:-(?:sm|md|lg|xl|2xl|none|inner|xs))?|(?:from|to|via)-\d+%|decoration-(?:solid|double|dotted|dashed|wavy|\d+|from-font|auto|clone|slice)|divide-[xy](?:-\d+)?|divide-(?:solid|dashed|dotted|double|none)|stroke-\d+|fill-none|accent-auto|caret-auto|placeholder-\S*|bg-(?:fixed|local|scroll|clip-\w+|origin-\w+|no-repeat|repeat\S*|cover|contain|auto|center|top|bottom|left|right|none|linear\S*|gradient\S*))$/;
const CANDIDATO = new RegExp(
  `(?<=[\\s"'\`{:(])(?:[a-z0-9-]+:|\\[[^\\]]+\\]:)*(${UTILIDAD}-[a-z]+(?:-[a-z]+)*(?:-\\d+)?(?:/\\d+)?)(?=[\\s"'\`}),])`,
  "g",
);

describe("clases de color de la plataforma", () => {
  it("todas existen en el tema del manual", async () => {
    const usos = new Map<string, string>();
    for (const ruta of archivos(path.join(RAIZ, "src"))) {
      const texto = readFileSync(ruta, "utf8")
        // El CSS que viaja dentro de los documentos generados (p. ej. `box-sizing:border-box`)
        // no son clases: se excluyen las propiedades `algo:valor` de una cadena de estilos.
        .replace(/[a-z-]+:[a-z-]+(?=[;}"])/g, " ");
      for (const m of texto.matchAll(CANDIDATO)) {
        if (NO_ES_COLOR.test(m[1])) continue;
        if (!usos.has(m[1])) usos.set(m[1], path.relative(RAIZ, ruta));
      }
    }
    expect(usos.size).toBeGreaterThan(100);
    const css = readFileSync(path.join(RAIZ, "src/app/globals.css"), "utf8");
    const compilador = await compile(css, { base: path.join(RAIZ, "src/app"), onDependency: () => {} });
    const salida = compilador.build([...usos.keys()]);
    const sinGenerar = [...usos].filter(([clase]) => !salida.includes(`.${clase.replace(/[/.:]/g, (c) => `\\${c}`)}`));
    expect(sinGenerar.map(([clase, archivo]) => `${clase} (${archivo})`)).toEqual([]);
    // Control: un color ajeno al manual o un tono que el tema no define no genera nada.
    const ajenas = compilador.build(["bg-red-500", "text-emerald-700", "border-ok-950", "bg-sky-blue-10"]);
    for (const clase of ["bg-red-500", "text-emerald-700", "border-ok-950", "bg-sky-blue-10"]) {
      expect(ajenas).not.toContain(`.${clase}`);
    }
  });
});
