import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { FUENTES_LATO, RUTA_FUENTES, cssFuentesLato, glifosDeDocumentoSoloLato } from "./html";

/**
 * El generador de PDF (Chromium sin red) solo admite recursos incrustados. Aquí
 * se cambian las rutas de `public/marca` (logotipo oficial y fuentes Lato) por
 * sus datos, para que el PDF lleve la marca y la tipografía del manual.
 */

const DIR_PUBLICO = path.join(process.cwd(), "public");
const TIPOS: Record<string, string> = { ".png": "image/png", ".svg": "image/svg+xml", ".woff2": "font/woff2" };
const cache = new Map<string, Promise<string | null>>();

function datosDe(rutaPublica: string): Promise<string | null> {
  const limpia = path.posix.normalize(rutaPublica);
  // Solo archivos de la carpeta de marca: la ruta viene del HTML del documento.
  if (!limpia.startsWith("/marca/") || limpia.includes("..")) return Promise.resolve(null);
  const tipo = TIPOS[path.extname(limpia).toLowerCase()];
  if (!tipo) return Promise.resolve(null);
  let pendiente = cache.get(limpia);
  if (!pendiente) {
    pendiente = readFile(path.join(DIR_PUBLICO, limpia))
      .then((b) => `data:${tipo};base64,${b.toString("base64")}`)
      .catch(() => null);
    cache.set(limpia, pendiente);
  }
  return pendiente;
}

export async function incrustarMarcaParaPdf(html: string): Promise<string> {
  html = glifosDeDocumentoSoloLato(html);
  const rutas = new Set<string>();
  for (const m of html.matchAll(/(?:src\s*=\s*["']|url\(\s*["']?)(\/marca\/[^"')\s]+)/gi)) rutas.add(m[1]);
  // Lato también para el HTML que no la declara (reporte redactado con IA).
  for (const f of FUENTES_LATO) rutas.add(`${RUTA_FUENTES}${f.archivo}`);

  const datos = new Map<string, string>();
  await Promise.all(
    [...rutas].map(async (ruta) => {
      const d = await datosDe(ruta);
      if (d) datos.set(ruta, d);
    }),
  );

  const salida = html.replace(/(src\s*=\s*["']|url\(\s*["']?)(\/marca\/[^"')\s]+)/gi, (todo, pre: string, ruta: string) => {
    const d = datos.get(ruta);
    return d ? pre + d : todo;
  });
  // El documento propio ya declara Lato (sus `url()` acaban de incrustarse); el
  // que no la trae recibe la declaración para no imprimirse en otra fuente.
  if (/@font-face\s*\{\s*font-family\s*:\s*Lato/i.test(salida)) return salida;
  const fuentes = cssFuentesLato((archivo) => datos.get(`${RUTA_FUENTES}${archivo}`) ?? `${RUTA_FUENTES}${archivo}`);
  const estilo = `<style id="rb-fuentes-pdf">${fuentes}</style>`;
  return /<\/head>/i.test(salida) ? salida.replace(/<\/head>/i, `${estilo}</head>`) : `${estilo}${salida}`;
}
