import { chromium, type Browser } from "playwright";

const ANCHO_PREDETERMINADO = 900;
const ANCHO_MINIMO = 640;
const ANCHO_MAXIMO = 1200;
const ANCHO_CARTA_CSS = 8.5 * 96;
const RELACION_CARTA = 11 / 8.5;

let browserPromise: Promise<Browser> | null = null;

function limitarAnchoVistaPrevia(value?: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return ANCHO_PREDETERMINADO;
  return Math.min(ANCHO_MAXIMO, Math.max(ANCHO_MINIMO, Math.round(value)));
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

async function obtenerBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = chromium.launch({ headless: true }).catch((error) => {
      browserPromise = null;
      throw error;
    });
  }

  const browser = await browserPromise;
  if (browser.isConnected()) return browser;

  browserPromise = null;
  return obtenerBrowser();
}

export async function cerrarGeneradorPdfNovedades(): Promise<void> {
  const actual = browserPromise;
  browserPromise = null;
  if (!actual) return;

  const browser = await actual.catch(() => null);
  await browser?.close().catch(() => undefined);
}

export async function generarPdfReporteNovedades({
  html,
  viewportWidth,
  media = "screen",
  ajustarEscalaVistaPrevia = true,
}: {
  titulo: string;
  html: string;
  viewportWidth?: number;
  media?: "screen" | "print";
  ajustarEscalaVistaPrevia?: boolean;
}): Promise<ArrayBuffer> {
  const width = ajustarEscalaVistaPrevia
    ? limitarAnchoVistaPrevia(viewportWidth)
    : Math.round(ANCHO_CARTA_CSS);
  const height = Math.round(width * RELACION_CARTA);
  const scale = ajustarEscalaVistaPrevia ? Math.min(1, ANCHO_CARTA_CSS / width) : 1;
  const browser = await obtenerBrowser();
  const context = await browser.newContext({
    javaScriptEnabled: false,
    viewport: { width, height },
    deviceScaleFactor: 1,
  });

  try {
    const page = await context.newPage();
    page.setDefaultTimeout(30_000);
    page.setDefaultNavigationTimeout(30_000);

    await page.route("**/*", (route) => {
      const url = route.request().url();
      if (url === "about:blank" || url.startsWith("data:") || url.startsWith("blob:")) {
        return route.continue();
      }
      return route.abort();
    });

    await page.emulateMedia({ media });
    await page.setContent(html, { waitUntil: "load" });
    await page.evaluate(() => document.fonts?.ready).catch(() => undefined);
    await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => undefined);

    const pdf = await page.pdf({
      format: "Letter",
      printBackground: true,
      displayHeaderFooter: false,
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
      scale,
    });

    return toArrayBuffer(pdf);
  } finally {
    await context.close().catch(() => undefined);
  }
}
