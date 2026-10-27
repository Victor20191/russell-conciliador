import { describe, expect, it } from "vitest";
import { incrustarMarcaParaPdf } from "./recursos-pdf";
import { forzarTipografiaMarca, logoHtml } from "./html";

describe("recursos de marca para el PDF (Chromium sin red)", () => {
  it("incrusta el logotipo oficial y Lato como datos; no queda ninguna ruta de la plataforma", async () => {
    const html = forzarTipografiaMarca(`<!DOCTYPE html><html><head><title>x</title></head><body>${logoHtml()}<p>Hola</p></body></html>`);
    const pdf = await incrustarMarcaParaPdf(html);
    expect(pdf).toMatch(/<img src="data:image\/svg\+xml;base64,[A-Za-z0-9+/=]{1000,}"/);
    expect(pdf).toMatch(/@font-face\{font-family:Lato;[^}]*src:url\(data:font\/woff2;base64,/);
    expect(pdf).not.toMatch(/(?:src="|url\()\/marca\//);
    // Sin declaración propia, se agrega una sola vez.
    expect((await incrustarMarcaParaPdf("<html><head></head><body>x</body></html>")).match(/font-family:Lato;/g)).toHaveLength(6);
  });

  it("no lee nada fuera de la carpeta de marca", async () => {
    const html = '<img src="/marca/../../.env"><img src="/otra/logo.png">';
    expect(await incrustarMarcaParaPdf(html)).toContain('src="/marca/../../.env"');
  });
});
