import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  COLORES_ADMITIDOS,
  EARTH_ORANGE,
  FRANJA_MARCA,
  MIND_MAGENTA,
  NEUTRO,
  SEA_GREEN,
  SKY_BLUE,
  SPACE_BLUE,
} from "./paleta";
import { ajustarGlifosAMarca, ajustarHtmlAMarca, colorDeMarcaMasCercano, prepararMarcaParaCorreo } from "./html";

/**
 * Guardas del Manual de Marca Corporativa: ningún color, tipografía ni clase de
 * la plataforma puede salirse de él. Si una de estas pruebas falla, el cambio
 * introdujo algo ajeno a la guía (o hay que ampliarla con el área de mercadeo).
 */

const RAIZ = path.resolve(__dirname, "../../..");
const SRC = path.join(RAIZ, "src");

/** Código que COPIA o LEE formatos de archivos de clientes: sus colores no son de la plataforma. */
const AJENOS_A_LA_MARCA = new Set([
  "src/lib/modulos/patrones/muestra-recortada.ts",
  "src/lib/balance/extraccion/estilos-xls.ts",
]);

function archivos(dir: string, salida: string[] = []): string[] {
  for (const nombre of readdirSync(dir)) {
    const ruta = path.join(dir, nombre);
    if (statSync(ruta).isDirectory()) {
      if (nombre !== "generated" && nombre !== "node_modules") archivos(ruta, salida);
    } else if (/\.(tsx?|css)$/.test(nombre) && !/\.test\.tsx?$/.test(nombre)) {
      salida.push(ruta);
    }
  }
  return salida;
}

// También los scripts que generan informes para Russell (Excel).
const FUENTES = [...archivos(SRC), ...archivos(path.join(RAIZ, "scripts"))]
  .map((ruta) => ({ ruta: path.relative(RAIZ, ruta).split(path.sep).join("/"), texto: readFileSync(ruta, "utf8") }))
  .filter((f) => !AJENOS_A_LA_MARCA.has(f.ruta));

function hallazgos(patron: RegExp, aceptar: (coincidencia: string) => boolean = () => false): string[] {
  const salida: string[] = [];
  for (const { ruta, texto } of FUENTES) {
    for (const m of texto.matchAll(patron)) {
      if (aceptar(m[0])) continue;
      const linea = texto.slice(0, m.index).split("\n").length;
      salida.push(`${ruta}:${linea} ${m[0]}`);
    }
  }
  return salida;
}

describe("paleta del manual", () => {
  it("son los colores y tintes oficiales (§3.1 y §3.2)", () => {
    expect(SPACE_BLUE[100]).toBe("#001871");
    expect(SEA_GREEN[100]).toBe("#00BFB3");
    expect(EARTH_ORANGE[100]).toBe("#ED8B00");
    expect(SKY_BLUE[100]).toBe("#00A9CE");
    expect(MIND_MAGENTA[100]).toBe("#981D97");
    // Tinte = el color mezclado con blanco en el porcentaje indicado.
    for (const color of [SPACE_BLUE, SEA_GREEN, EARTH_ORANGE, SKY_BLUE, MIND_MAGENTA]) {
      const base = [1, 3, 5].map((i) => parseInt(color[100].slice(i, i + 2), 16));
      for (const pct of [80, 60, 40, 20] as const) {
        const esperado = `#${base.map((c) => Math.round(c * (pct / 100) + 255 * (1 - pct / 100)).toString(16).padStart(2, "0")).join("").toUpperCase()}`;
        expect(color[pct]).toBe(esperado);
      }
    }
    expect(FRANJA_MARCA).toEqual(["#001871", "#981D97", "#00BFB3", "#ED8B00"]);
  });

  it("el tema de Tailwind usa exactamente esos valores y retira los colores y fuentes por defecto", () => {
    const css = readFileSync(path.join(SRC, "app/globals.css"), "utf8");
    const tema = css.slice(css.indexOf("@theme {"), css.indexOf("}", css.indexOf("@theme {")));
    expect(tema).toContain("--color-*: initial;");
    expect(tema).toContain("--font-*: initial;");
    const pares: Array<[string, string]> = [
      ["space-blue", SPACE_BLUE[100]], ["space-blue-80", SPACE_BLUE[80]], ["space-blue-60", SPACE_BLUE[60]],
      ["space-blue-40", SPACE_BLUE[40]], ["space-blue-20", SPACE_BLUE[20]],
      ["sea-green", SEA_GREEN[100]], ["sea-green-20", SEA_GREEN[20]],
      ["earth-orange", EARTH_ORANGE[100]], ["earth-orange-20", EARTH_ORANGE[20]],
      ["sky-blue", SKY_BLUE[100]], ["sky-blue-40", SKY_BLUE[40]], ["sky-blue-20", SKY_BLUE[20]],
      ["mind-magenta", MIND_MAGENTA[100]], ["mind-magenta-80", MIND_MAGENTA[80]], ["mind-magenta-20", MIND_MAGENTA[20]],
    ];
    for (const [nombre, valor] of pares) {
      expect(tema.toLowerCase()).toContain(`--color-${nombre}: ${valor.toLowerCase()};`);
    }
    // Todo valor literal del tema es de la paleta; el resto, referencias a ella.
    for (const m of tema.matchAll(/--color-[\w-]+:\s*([^;]+);/g)) {
      const valor = m[1].replace(/\/\*.*?\*\//g, "").trim();
      if (valor === "initial" || valor.startsWith("var(--color-")) continue;
      expect(COLORES_ADMITIDOS.has(valor.toUpperCase()), `color ajeno al manual en el tema: ${m[0]}`).toBe(true);
    }
    expect(tema).toMatch(/--font-sans: var\(--font-lato, Lato\), Arial/);
  });
});

describe("ningún color fuera de la paleta en el código", () => {
  it("hexadecimales y ARGB de Excel", () => {
    const blanco = (h: string) => /^#fff$/i.test(h);
    const malos = [
      ...hallazgos(/(?<![&\w])#[0-9a-fA-F]{6}\b|(?<![&\w])#[0-9a-fA-F]{3}\b/g, (h) => blanco(h) || COLORES_ADMITIDOS.has(h.toUpperCase())),
      ...hallazgos(/"FF[0-9A-F]{6}"/g, (h) => COLORES_ADMITIDOS.has(`#${h.slice(3, 9)}`)),
      // Dentro de un `data:` URI (íconos SVG en CSS) el «#» va escapado como %23.
      ...hallazgos(/%23[0-9a-fA-F]{6}\b/g, (h) => COLORES_ADMITIDOS.has(`#${h.slice(3).toUpperCase()}`)),
    ];
    expect(malos).toEqual([]);
  });

  it("sin colores escritos como rgb(), hsl(), oklch() o color-mix() (solo las sombras en negro de proceso)", () => {
    // Un número o una interpolación tras el paréntesis: un color literal o calculado.
    // (`rgb(SPACE_BLUE[100])` de las exportaciones es una función que recibe la paleta.)
    const malos = hallazgos(/\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color-mix)\(\s*(?:[\d.]|\$\{|in\b)[^)]*\)/g, (c) =>
      /^rgba?\(\s*29[\s,]+29[\s,]+27\s*[/,]/.test(c),
    );
    expect(malos).toEqual([]);
  });

  it("sin diálogos del navegador (confirm, alert, prompt): la confirmación es el modal de la plataforma", () => {
    const malos = hallazgos(/(?<![\w.$])(?:window\.)?(?:confirm|alert|prompt)\(/g).filter((h) => !/^\S+:\d+ \s*$/.test(h));
    // Las menciones en comentarios no son llamadas.
    const llamadas = malos.filter((h) => {
      const [ruta, linea] = h.split(" ")[0].split(":");
      const texto = FUENTES.find((f) => f.ruta === ruta)?.texto.split("\n")[Number(linea) - 1] ?? "";
      return !/^\s*(?:\/\/|\*|\/\*)/.test(texto);
    });
    expect(llamadas).toEqual([]);
  });

  it("sin desenfoques ni filtros que alteren el color (mezclarían colores fuera de la paleta)", () => {
    const malos = hallazgos(
      /(?<=[\s"'`{:])(?:[\w-]+:)*(?:backdrop-)?(?:blur|brightness|contrast|grayscale|hue-rotate|invert|saturate|sepia|mix-blend|bg-blend)(?:-[\w[\]./%]+)?(?=[\s"'`}])|\b(?:backdrop-filter|mix-blend-mode)\s*:/g,
    ).filter((h) => {
      // «blur» también es el nombre de un evento (`addEventListener("blur", …)`), no una clase.
      const [ruta, linea] = h.split(" ")[0].split(":");
      const texto = FUENTES.find((f) => f.ruta === ruta)?.texto.split("\n")[Number(linea) - 1] ?? "";
      return !/EventListener\(\s*["']blur["']/.test(texto);
    });
    expect(malos).toEqual([]);
  });

  it("sin colores con nombre en estilos ni atributos de SVG", () => {
    const malos = hallazgos(
      /\b(?:fill|stroke|color|background(?:Color)?|stopColor|stop-color|borderColor|outlineColor|floodColor|lightingColor)\s*[=:]\s*["'`]?(?:black|red|gray|grey|silver|blue|green|yellow|orange|purple|pink|navy|teal|maroon|olive|lime|aqua|cyan|magenta|fuchsia|brown|gold|indigo|violet|darkgr[ae]y|lightgr[ae]y|dimgr[ae]y|gainsboro|whitesmoke)\b/g,
    );
    expect(malos).toEqual([]);
  });

  it("clases de Tailwind: solo las familias del tema, sin colores arbitrarios", () => {
    const familiasAjenas =
      /(?<=[\s"'`{:])(?:[\w-]+:)*(?:bg|text|border(?:-[trblxyse])?|ring|outline|fill|stroke|divide|from|to|via|shadow|decoration|accent|caret|placeholder)-(?:red|green|emerald|lime|teal|cyan|sky|indigo|violet|purple|fuchsia|pink|rose|amber|yellow|orange|slate|gray|zinc|neutral|stone)-\d{2,3}\b/g;
    expect(hallazgos(familiasAjenas)).toEqual([]);
    expect(hallazgos(/(?:bg|text|border|ring|outline|fill|stroke|shadow|decoration|accent)-\[(?:#|rgb|hsl|color-mix)/g)).toEqual([]);
  });

  it("las transparencias caen en los tintes del manual (20, 40, 60 u 80 %), también en grises, blanco y negro", () => {
    const malos = hallazgos(
      /(?<=[\s"'`{:])(?:[\w-]+:)*(?:bg|text|border(?:-[trblxyse])?|ring|outline|divide|fill|stroke|from|via|to|shadow|decoration|accent|caret|placeholder)-(?:navy|blue|ok|warn|err|ai|ink|paper|white|black|space-blue|sea-green|earth-orange|sky-blue|mind-magenta)(?:-\d+)?\/(\d+)\b/g,
      (clase) => ["20", "40", "60", "80"].includes(clase.split("/").pop() ?? ""),
    );
    expect(malos).toEqual([]);
  });
});

describe("tipografía: Lato y Arial (§2)", () => {
  it("sin clases de serif ni de monoespaciada", () => {
    expect(hallazgos(/(?<=[\s"'`{:])font-(?:serif|mono)(?=[\s"'`}])/g)).toEqual([]);
  });

  it("sin otras familias tipográficas", () => {
    const ajenas = /Georgia|Times New Roman|Helvetica Neue|Consolas|Calibri|Cambria|Segoe UI|IBM Plex|Newsreader|ui-monospace|Menlo|Courier|Verdana|Tahoma|Roboto|Open Sans|Inter\b/g;
    expect(hallazgos(ajenas)).toEqual([]);
  });
});

describe("ajuste de HTML generado a la marca", () => {
  it("lleva cualquier color al más parecido del manual y deja intactos los que ya lo son", () => {
    // Cada tono va a la familia que tiene su sentido en la plataforma.
    expect(colorDeMarcaMasCercano([154, 42, 34])).toBe(MIND_MAGENTA[100]); // rojo de error
    expect(Object.values(MIND_MAGENTA)).toContain(colorDeMarcaMasCercano([200, 30, 30]));
    expect(Object.values(SEA_GREEN)).toContain(colorDeMarcaMasCercano([47, 107, 63])); // verde de éxito
    expect(Object.values(EARTH_ORANGE)).toContain(colorDeMarcaMasCercano([184, 128, 31])); // ámbar
    expect(colorDeMarcaMasCercano([0, 24, 113])).toBe(SPACE_BLUE[100]);
    expect(Object.values(NEUTRO)).toContain(colorDeMarcaMasCercano([86, 98, 115])); // gris azulado → neutro
    const html = `<html><head><style>.a{color:#c53a30;background:linear-gradient(90deg,#2f6fa7,#fff)}.red-box{border:1px solid red}@font-face{font-family:Lato;src:url(/marca/fuentes/lato-400-normal.woff2)}</style></head><body style="color:#001871;font-family:Georgia,serif"><p style="font:13px/1.5 'Helvetica Neue',Arial">x</p></body></html>`;
    const ajustado = ajustarHtmlAMarca(html);
    for (const m of ajustado.matchAll(/#[0-9a-fA-F]{6}\b/g)) expect(COLORES_ADMITIDOS.has(m[0].toUpperCase())).toBe(true);
    expect(ajustado).not.toContain("gradient");
    expect(ajustado).toContain(".red-box{"); // un selector no es un color
    expect(ajustado).toContain("color:#001871"); // ya era del manual: no cambia
    expect(ajustado).toContain("@font-face{font-family:Lato;src:url(/marca/fuentes/lato-400-normal.woff2)}");
    expect(ajustado).not.toMatch(/Georgia|Helvetica Neue/);
    expect(ajustado).toContain("font:13px/1.5 Lato, Arial, Helvetica, sans-serif");
    expect(ajustarHtmlAMarca(ajustado)).toBe(ajustado);
  });

  it("para el correo: Arial y el logotipo con dirección absoluta", () => {
    const correo = prepararMarcaParaCorreo(
      `<div style="font-family:Lato, Arial, Helvetica, sans-serif"><img src="/marca/russell-bedford-azul-600.png"></div>`,
      "https://russell.example/",
    );
    expect(correo).toContain('src="https://russell.example/marca/russell-bedford-azul-600.png"');
    expect(correo).toContain("font-family:Arial, Helvetica, sans-serif");
  });
});

describe("los colores del manual nunca se redondean", () => {
  it("cada color admitido es su propio color más cercano", async () => {
    const { COLORES_ADMITIDOS } = await import("./paleta");
    for (const hex of COLORES_ADMITIDOS) {
      const rgb = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
      expect(colorDeMarcaMasCercano(rgb)).toBe(hex);
    }
  });
});

describe("CSS con comentarios en el HTML generado", () => {
  it("una declaración después de un comentario también se lleva a la paleta", () => {
    const html = "<style>.caja{background-color:#f2f7fc; /* blue-50 */\n border: 1px solid #e5eef7; /* blue-100 */ color:#2a3441}</style>";
    const salida = ajustarHtmlAMarca(html);
    expect(salida).not.toMatch(/#f2f7fc|#e5eef7|#2a3441/i);
    expect(salida).toContain("/* blue-100 */"); // el comentario se conserva
    expect(ajustarHtmlAMarca(salida)).toBe(salida);
    // Un comentario nunca se «estira» hasta el cierre de otro: las declaraciones del medio se ajustan.
    const varios = ajustarHtmlAMarca("<style>/* Sistema */ body { font-family: 'Helvetica Neue', Arial; color: #1a2330; /* ink-800 */ background: #fff } h3 { color: #142b4a }</style>");
    expect(varios).not.toMatch(/Helvetica Neue|#1a2330|#142b4a/i);
  });
});

describe("glifos del HTML generado (IA y reportes guardados)", () => {
  it("retira emojis y símbolos sin Lato ni Arial, y conserva © ® ™ y las flechas", () => {
    expect(ajustarGlifosAMarca("📊 Resumen 🎉")).toBe("Resumen ");
    expect(ajustarGlifosAMarca("Equipo 👩‍💻 listo")).toBe("Equipo listo");
    expect(ajustarGlifosAMarca("⚠️ Revisar ⚠ ya")).toBe("Revisar ya");
    expect(ajustarGlifosAMarca("✓")).toBe("Sí");
    expect(ajustarGlifosAMarca("✓ Disponible")).toBe("Disponible");
    expect(ajustarGlifosAMarca("Cuadra: ✗")).toBe("Cuadra: ×");
    expect(ajustarGlifosAMarca("Russell Bedford® · Lato™ · © 2026 · A → B")).toBe("Russell Bedford® · Lato™ · © 2026 · A → B");
  });

  it("solo toca el texto: estilos, atributos y scripts quedan igual", () => {
    const html = '<style>.a::before{content:"✓"}</style><p title="✓ ok">✓ Listo 🎉</p><td>✓</td>';
    const salida = ajustarHtmlAMarca(html);
    expect(salida).toContain('content:"✓"');
    expect(salida).toContain('title="✓ ok"');
    expect(salida).toContain("<p title=\"✓ ok\">Listo </p>");
    expect(salida).toContain("<td>Sí</td>");
    expect(ajustarHtmlAMarca(salida)).toBe(salida);
  });
});

describe("el texto ajustado sigue siendo legible", () => {
  it("un texto verde, ámbar o celeste oscuro pasa a Space Blue; el fondo conserva su color", () => {
    const html = ajustarHtmlAMarca(`<p style="color:#166534;background:#dcfce7">Éxito</p><p style="color:#b45309">Aviso</p><p style="color:#9a2a22">Error</p>`);
    expect(html).toContain("color:#001871;background:#CCF2F0");
    expect(html).toContain('style="color:#001871">Aviso');
    expect(html).toContain('style="color:#981D97">Error');
  });
});
