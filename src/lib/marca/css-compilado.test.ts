import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { compile } from "@tailwindcss/node";
import { Scanner } from "@tailwindcss/oxide";
import { COLORES_ADMITIDOS } from "./paleta";

/**
 * Prueba EXHAUSTIVA de la interfaz: escanea todo `src/` con el mismo escáner de
 * Tailwind que usa el build, compila `globals.css` con TODAS las clases encontradas
 * (las de cualquier pantalla, pestaña, modal o estado de datos) y revisa cada color
 * y cada familia tipográfica del CSS resultante. Una clase que no esté en el código
 * no existe en el CSS, así que ninguna pantalla puede pintar otra cosa.
 */

const RAIZ = path.resolve(__dirname, "../../..");

async function compilador() {
  const fuente = readFileSync(path.join(RAIZ, "src/app/globals.css"), "utf8");
  return compile(fuente, { base: path.join(RAIZ, "src/app"), onDependency: () => {} });
}

/** El mismo escaneo que hace el build (`@tailwindcss/postcss`): las fuentes que declara `globals.css`. */
async function cssDeLaPlataforma(): Promise<{ css: string; candidatos: number }> {
  const c = await compilador();
  expect(c.root).toBe("none"); // `source(none)`: sin detección automática del proyecto
  const candidatos = new Scanner({ sources: c.sources }).scan();
  return { css: c.build(candidatos), candidatos: candidatos.length };
}

function normalizarHex(hex: string): string {
  const h = hex.slice(1);
  return `#${(h.length <= 4 ? h.slice(0, 3).split("").map((c) => c + c).join("") : h.slice(0, 6)).toUpperCase()}`;
}

/** Las condiciones `@supports (color: …)` son detección de capacidades, no colores pintados. */
function sinCondiciones(css: string): string {
  return css.replace(/@supports\s*\([^{]*\{/g, "{");
}

// 20, 40, 60 y 80 % en hexadecimal (#RRGGBBAA), más opaco y transparente.
const ALFAS_DE_TINTE = new Set(["00", "33", "66", "99", "cc", "ff"]);
const NEGRO_DE_PROCESO = "#1D1D1B"; // las sombras: K100 con cualquier transparencia

function coloresAjenos(css: string): string[] {
  const ajenos: string[] = [];
  const patron = /#[0-9a-fA-F]{3,8}\b|%23[0-9a-fA-F]{6}\b|rgba?\([^)]*\)|hsla?\([^)]*\)|oklch\([^)]*\)|oklab\([^)]*\)|\blab\([^)]*\)|\bcolor\([^)]*\)/g;
  for (const m of sinCondiciones(css).matchAll(patron)) {
    const valor = m[0].replace(/^%23/, "#"); // un «#» escapado dentro de un data: URI
    if (valor.startsWith("#")) {
      const alfa = valor.length === 5 ? valor[4].repeat(2) : valor.length === 9 ? valor.slice(7).toLowerCase() : null;
      if (alfa === "00") continue; // transparente (#0000)
      const base = normalizarHex(valor);
      if (COLORES_ADMITIDOS.has(base) && (alfa === null || base === NEGRO_DE_PROCESO || ALFAS_DE_TINTE.has(alfa))) continue;
    } else if (/^rgba?\(\s*29[\s,]+29[\s,]+27\s*[/,]/.test(valor)) {
      continue; // sombra en negro de proceso
    }
    ajenos.push(m[0]);
  }
  return [...new Set(ajenos)];
}

/** Mezclas `color-mix(…)`: solo un color del manual al 20, 40, 60 u 80 % sobre transparente. */
function transparenciasAjenas(css: string): string[] {
  const ajenas: string[] = [];
  const plano = sinCondiciones(css);
  const admisible = /^color-mix\(in [a-z]+, ?(var\(--color-[a-z0-9-]+\)|#[0-9a-fA-F]{6}) (20|40|60|80)%, ?transparent\)$/;
  for (const m of plano.matchAll(/color-mix\(/g)) {
    // La llamada completa, con sus paréntesis anidados.
    let nivel = 0;
    let fin = m.index;
    for (; fin < plano.length; fin++) {
      if (plano[fin] === "(") nivel++;
      else if (plano[fin] === ")" && --nivel === 0) break;
    }
    const llamada = plano.slice(m.index, fin + 1).replace(/\s+/g, " ");
    const base = admisible.exec(llamada)?.[1];
    if (base && (base.startsWith("var(") || COLORES_ADMITIDOS.has(base.toUpperCase()))) continue;
    // El texto guía del preflight: globals.css lo reemplaza (se comprueba en su prueba).
    const enTextoGuia = /::placeholder\s*\{[^}]*$/.test(plano.slice(Math.max(0, m.index - 200), m.index));
    if (enTextoGuia && /^color-mix\(in oklab, ?currentcolor 50%, ?transparent\)$/.test(llamada)) continue;
    ajenas.push(llamada);
  }
  return [...new Set(ajenas)];
}

// Colores con nombre y colores del sistema (los que el navegador resuelve por su cuenta).
const NOMBRES =
  /(?<![-\w])(black|red|green|blue|yellow|orange|purple|pink|gr[ae]y|silver|navy|teal|maroon|olive|lime|aqua|cyan|magenta|fuchsia|brown|gold|indigo|violet|crimson|coral|salmon|tomato|khaki|beige|ivory|lavender|plum|orchid|tan|wheat|chocolate|sienna|Canvas|CanvasText|LinkText|VisitedText|ActiveText|ButtonFace|ButtonText|ButtonBorder|Field|FieldText|Highlight|HighlightText|SelectedItem|SelectedItemText|Mark|MarkText|GrayText|AccentColor|AccentColorText)(?![-\w(])/i;
const PROPIEDAD_DE_COLOR =
  /(?:^|[;{\s])((?:background-color|background|color|border(?:-[a-z]+)*-color|border(?:-[a-z]+)?|outline(?:-color)?|fill|stroke|text-decoration(?:-color)?|caret-color|accent-color|scrollbar-color|column-rule-color|stop-color|box-shadow|text-shadow|-webkit-text-fill-color)\s*:[^;{}]*)/g;

function coloresConNombre(css: string): string[] {
  return [...sinCondiciones(css).matchAll(PROPIEDAD_DE_COLOR)]
    .map((m) => m[1].trim())
    .filter((decl) => !/url\(/.test(decl) && NOMBRES.test(decl.slice(decl.indexOf(":") + 1)));
}

describe("CSS compilado de toda la plataforma", () => {
  it("solo trae colores del manual (más blanco, transparente y las sombras en negro de proceso)", async () => {
    const { css, candidatos } = await cssDeLaPlataforma();
    expect(candidatos).toBeGreaterThan(5000);
    expect(coloresAjenos(css)).toEqual([]);
    // Control: un color arbitrario escrito en una clase sí se detecta.
    const ajena = ["bg-[#", "ff0000]"].join("");
    const ajenaRgb = ["text-[rgb(", "10,200,30)]"].join("");
    expect(coloresAjenos((await compilador()).build([ajena, ajenaRgb]))).toEqual(["#ff0000", "rgb(10,200,30)"]);
  });

  it("las transparencias son tintes del manual (20, 40, 60 u 80 %) y nada mezcla el color del texto", async () => {
    const { css } = await cssDeLaPlataforma();
    expect(transparenciasAjenas(css)).toEqual([]);
    // El preflight pinta el texto guía con el color del texto al 50 %; globals.css lo
    // reemplaza después, en la misma capa, por un gris de la escala K.
    const plano = css.replace(/\s+/g, " ");
    const preflight = plano.lastIndexOf("currentcolor 50%, transparent");
    const reemplazo = plano.lastIndexOf("::placeholder { color: var(--color-ink-400); }");
    expect(preflight).toBeGreaterThan(-1);
    expect(reemplazo).toBeGreaterThan(preflight);
    // Control: una transparencia al 50 % se detecta (el respaldo y la mezcla en oklab).
    const ajena = ["bg-ink-50/", "50"].join("");
    expect(transparenciasAjenas((await compilador()).build([ajena]))).toEqual([
      "color-mix(in srgb, #f6f6f6 50%, transparent)",
      "color-mix(in oklab, var(--color-ink-50) 50%, transparent)",
    ]);
  });

  it("sin colores con nombre ni colores del sistema", async () => {
    const { css } = await cssDeLaPlataforma();
    expect(coloresConNombre(css)).toEqual([]);
    expect(coloresConNombre(".x { color: Highlight; background: tomato }")).toEqual(["color: Highlight", "background: tomato"]);
  });

  it("solo usa Lato (con Arial de respaldo) como tipografía", async () => {
    const { css } = await cssDeLaPlataforma();
    const familias = new Set([...css.matchAll(/font-family:\s*([^;}]+)/g)].map((m) => m[1].trim()));
    for (const familia of familias) {
      // Las de preflight remiten a las variables del tema; su lista de respaldo nunca se usa
      // porque el tema las define (abajo se comprueba).
      expect(familia).toMatch(/^var\(--(?:font-sans|default-font-family|default-mono-font-family)\b/);
    }
    expect(css).toMatch(/--default-font-family:\s*var\(--font-sans\)/);
    expect(css).toMatch(/--default-mono-font-family:\s*var\(--font-sans\)/);
    expect(css).toMatch(/--font-sans:\s*var\(--font-lato,\s*Lato\),\s*Arial,\s*Helvetica,\s*sans-serif/);
  });
});
