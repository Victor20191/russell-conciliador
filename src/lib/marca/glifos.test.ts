import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { brotliDecompressSync } from "node:zlib";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { RANGOS_LATO } from "./cobertura-glifos";

/**
 * Tipografía glifo por glifo (§2): todo texto de la plataforma se dibuja en Lato o,
 * para lo que Lato no trae, en Arial, la alternativa que el manual fija «para que el
 * texto no use otras fuentes inapropiadas» (§2.2). Un símbolo que no tengan ninguna
 * de las dos (✓, ⚠, ✕, emojis…) lo dibujaría una fuente del sistema o un emoji de
 * color: va como ícono SVG (`Icon`, `IconoEnTexto`), que toma el color del texto.
 */

const RAIZ = path.resolve(__dirname, "../../..");

// Etiquetas de tabla conocidas de WOFF2 (especificación W3C, §5.1), por índice.
const ETIQUETAS =
  "cmap head hhea hmtx maxp name OS/2 post cvt  fpgm glyf loca prep CFF  VORG EBDT EBLC gasp hdmx kern LTSH PCLT VDMX vhea vmtx BASE GDEF GPOS GSUB EBSC JSTF MATH CBDT CBLC COLR CPAL SVG  sbix acnt avar bdat bloc bsln cvar fdsc feat fmtx fvar gvar hsty just lcar mort morx opbd prop trak Zapf Silf Glat Gloc Feat Sill"
    .match(/.{4}\s?/g)!
    .map((e) => e.slice(0, 4));

/** Caracteres con glifo en una fuente WOFF2 (su tabla `cmap`). */
function caracteresDeWoff2(archivo: string): Set<number> {
  const b = readFileSync(archivo);
  expect(b.toString("ascii", 0, 4)).toBe("wOF2");
  const tablas = b.readUInt16BE(12);
  const comprimido = b.readUInt32BE(20);
  let p = 48;
  const base128 = () => {
    let v = 0;
    for (let i = 0; i < 5; i++) {
      const x = b[p++];
      v = v * 128 + (x & 0x7f);
      if (!(x & 0x80)) return v;
    }
    throw new Error("UIntBase128 inválido");
  };
  const directorio: { etiqueta: string; largo: number }[] = [];
  for (let i = 0; i < tablas; i++) {
    const banderas = b[p++];
    let etiqueta = ETIQUETAS[banderas & 0x3f];
    if ((banderas & 0x3f) === 0x3f) {
      etiqueta = b.toString("ascii", p, p + 4);
      p += 4;
    }
    const version = banderas >> 6;
    const original = base128();
    const transformada = etiqueta === "glyf" || etiqueta === "loca" ? version === 0 : version !== 0;
    directorio.push({ etiqueta, largo: transformada ? base128() : original });
  }
  const datos = brotliDecompressSync(b.subarray(p, p + comprimido));
  let desde = 0;
  for (const { etiqueta, largo } of directorio) {
    if (etiqueta === "cmap") return caracteresDeCmap(datos.subarray(desde, desde + largo));
    desde += largo;
  }
  throw new Error("la fuente no trae cmap");
}

function caracteresDeCmap(c: Buffer): Set<number> {
  const salida = new Set<number>();
  for (let i = 0; i < c.readUInt16BE(2); i++) {
    const plataforma = c.readUInt16BE(4 + i * 8);
    const codificacion = c.readUInt16BE(6 + i * 8);
    const o = c.readUInt32BE(8 + i * 8);
    const formato = c.readUInt16BE(o);
    if (formato === 12) {
      for (let g = 0; g < c.readUInt32BE(o + 12); g++) {
        const inicio = c.readUInt32BE(o + 16 + g * 12);
        const fin = c.readUInt32BE(o + 20 + g * 12);
        for (let cp = inicio; cp <= fin; cp++) salida.add(cp);
      }
    } else if (formato === 4 && plataforma === 3 && (codificacion === 1 || codificacion === 0)) {
      const segmentos = c.readUInt16BE(o + 6) / 2;
      const fines = o + 14;
      const inicios = fines + segmentos * 2 + 2;
      const deltas = inicios + segmentos * 2;
      const rangos = deltas + segmentos * 2;
      for (let s = 0; s < segmentos; s++) {
        const fin = c.readUInt16BE(fines + s * 2);
        const inicio = c.readUInt16BE(inicios + s * 2);
        const delta = c.readInt16BE(deltas + s * 2);
        const rango = c.readUInt16BE(rangos + s * 2);
        for (let cp = inicio; cp <= fin && cp !== 0xffff; cp++) {
          const glifo = rango === 0 ? (cp + delta) & 0xffff : c.readUInt16BE(rangos + s * 2 + rango + (cp - inicio) * 2);
          if (glifo !== 0) salida.add(cp);
        }
      }
    }
  }
  return salida;
}

/**
 * Lo que la plataforma escribe y Lato no trae, pero Arial sí (comprobado contra la
 * tabla de caracteres de Arial): Δ Σ ← ↑ → ↓ ↔ ↕ ≈ ≠ ≤ ≥ ─ └ ▲ ▼ ●. Un carácter nuevo
 * fuera de Lato debe comprobarse en Arial antes de sumarlo aquí.
 */
const ARIAL = new Set([0x394, 0x3a3, 0x2190, 0x2191, 0x2192, 0x2193, 0x2194, 0x2195, 0x2248, 0x2260, 0x2264, 0x2265, 0x2500, 0x2514, 0x25b2, 0x25bc, 0x25cf]);

/** Textos que no se dibujan en pantalla. */
const NO_SE_DIBUJAN = new Map<string, string>([
  ["src/lib/balance/extraccion/ingesta.ts", "vista previa del archivo que se envía al modelo de IA"],
  ["src/lib/modulos/nomina/clave-consolidado.ts", "separador interno de las claves del Consolidado de Nómina"],
  ["src/lib/marca/glifos.ts", "tabla de equivalencias: son justamente los símbolos que se reemplazan al mostrar"],
]);

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

/** Caracteres de los literales, plantillas y texto JSX (no comentarios ni expresiones regulares). */
function caracteresDeTextos(ruta: string, aceptar: (cp: number) => boolean): string[] {
  const texto = readFileSync(ruta, "utf8");
  const fuente = ts.createSourceFile(ruta, texto, ts.ScriptTarget.Latest, true, ruta.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const ajenos: string[] = [];
  const visitar = (nodo: ts.Node) => {
    const valor =
      ts.isStringLiteral(nodo) || ts.isNoSubstitutionTemplateLiteral(nodo) || ts.isTemplateHead(nodo) || ts.isTemplateMiddle(nodo) || ts.isTemplateTail(nodo) || ts.isJsxText(nodo)
        ? nodo.text
        : null;
    if (valor) {
      for (const ch of valor) {
        const cp = ch.codePointAt(0)!;
        if (cp < 0x20 || cp === 0xfeff || (cp >= 0x300 && cp <= 0x36f) || aceptar(cp)) continue; // controles, BOM de los CSV y marcas para quitar tildes
        const { line } = fuente.getLineAndCharacterOfPosition(nodo.getStart());
        ajenos.push(`${path.relative(RAIZ, ruta)}:${line + 1} «${ch}» U+${cp.toString(16).toUpperCase().padStart(4, "0")}`);
      }
    }
    ts.forEachChild(nodo, visitar);
  };
  visitar(fuente);
  return ajenos;
}

describe("glifos: todo el texto se dibuja en Lato o en Arial (§2)", () => {
  const pesos = readdirSync(path.join(RAIZ, "public/marca/fuentes")).filter((n) => n.endsWith(".woff2"));
  // Un glifo sirve si lo tienen TODOS los pesos publicados (cualquier peso puede dibujarlo).
  const conjuntos = pesos.map((n) => caracteresDeWoff2(path.join(RAIZ, "public/marca/fuentes", n)));
  const lato = new Set([...conjuntos[0]].filter((cp) => conjuntos.every((c) => c.has(cp))));

  it("la Lato publicada trae el alfabeto latino completo (lectura de su tabla de caracteres)", () => {
    expect(pesos.length).toBe(6);
    for (const ch of "AZaz09áéíóúñÑüÜ¿¡$%€–—…·×−«»") expect(lato.has(ch.codePointAt(0)!), ch).toBe(true);
    expect(lato.has(0x2713)).toBe(false); // ✓ no está: por eso va como ícono
    for (const cp of ARIAL) expect(lato.has(cp), String.fromCodePoint(cp)).toBe(false);
  });

  it("la tabla de cobertura de Lato es la de los archivos publicados", () => {
    const tabla = new Set<number>();
    for (const [inicio, fin] of RANGOS_LATO) for (let cp = inicio; cp <= fin; cp++) tabla.add(cp);
    const union = new Set(conjuntos.flatMap((c) => [...c]));
    expect([...union].filter((cp) => !tabla.has(cp))).toEqual([]);
    expect([...tabla].filter((cp) => !union.has(cp))).toEqual([]);
  });

  it("ningún texto usa un símbolo que no tengan Lato ni Arial", () => {
    const ajenos = archivos(path.join(RAIZ, "src"))
      .filter((ruta) => !NO_SE_DIBUJAN.has(path.relative(RAIZ, ruta).split(path.sep).join("/")))
      .flatMap((ruta) => caracteresDeTextos(ruta, (cp) => lato.has(cp) || ARIAL.has(cp)));
    expect(ajenos).toEqual([]);
  });

  it("control: un símbolo o un emoji fuera de las dos fuentes se detecta", () => {
    const control = path.join(RAIZ, "src/lib/marca/__control-glifos.tsx");
    const texto = 'export const A = <p>{"✓ listo"} 🎉 → ok</p>;';
    const fuente = ts.createSourceFile(control, texto, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const vistos: string[] = [];
    const visitar = (n: ts.Node) => {
      if (ts.isStringLiteral(n) || ts.isJsxText(n)) for (const ch of n.text) if (!lato.has(ch.codePointAt(0)!) && !ARIAL.has(ch.codePointAt(0)!) && ch.trim()) vistos.push(ch);
      ts.forEachChild(n, visitar);
    };
    visitar(fuente);
    expect(vistos).toEqual(["✓", "🎉"]);
  });
});
