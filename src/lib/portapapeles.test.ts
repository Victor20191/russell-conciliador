import { describe, expect, it, vi } from "vitest";
import { copiarHtmlAlPortapapeles, copiarTextoAlPortapapeles } from "./portapapeles";

const HTML = "<p><strong>Reporte</strong></p>";
const TEXTO = "Reporte";

describe("copiarHtmlAlPortapapeles", () => {
  it("prioriza la Clipboard API con formato", async () => {
    const escribirRico = vi.fn(async () => undefined);
    const legadoHtml = vi.fn(() => true);

    await expect(
      copiarHtmlAlPortapapeles(HTML, TEXTO, { escribirRico, legadoHtml, escribirTexto: null, legadoTexto: null }),
    ).resolves.toEqual({ via: "clipboard", conFormato: true });

    expect(escribirRico).toHaveBeenCalledWith(HTML, TEXTO);
    expect(legadoHtml).not.toHaveBeenCalled();
  });

  it("conserva el formato con execCommand cuando no hay contexto seguro", async () => {
    const legadoHtml = vi.fn(() => true);
    const escribirTexto = vi.fn(async () => undefined);

    await expect(
      copiarHtmlAlPortapapeles(HTML, TEXTO, {
        escribirRico: null,
        escribirTexto,
        legadoHtml,
        legadoTexto: null,
      }),
    ).resolves.toEqual({ via: "legacy", conFormato: true });

    expect(legadoHtml).toHaveBeenCalledWith(HTML);
    expect(escribirTexto).not.toHaveBeenCalled();
  });

  it("cae a texto plano cuando ningún camino con formato funciona", async () => {
    const escribirRico = vi.fn(async () => {
      throw new Error("NotAllowedError");
    });
    const escribirTexto = vi.fn(async () => undefined);

    await expect(
      copiarHtmlAlPortapapeles(HTML, TEXTO, {
        escribirRico,
        escribirTexto,
        legadoHtml: () => false,
        legadoTexto: () => false,
      }),
    ).resolves.toEqual({ via: "clipboard", conFormato: false });

    expect(escribirTexto).toHaveBeenCalledWith(TEXTO);
  });

  it("usa el legado de texto como último recurso", async () => {
    const legadoTexto = vi.fn(() => true);

    await expect(
      copiarHtmlAlPortapapeles(HTML, TEXTO, {
        escribirRico: null,
        escribirTexto: null,
        legadoHtml: () => false,
        legadoTexto,
      }),
    ).resolves.toEqual({ via: "legacy", conFormato: false });

    expect(legadoTexto).toHaveBeenCalledWith(TEXTO);
  });

  it("explica cómo copiar manualmente cuando todo falla", async () => {
    await expect(
      copiarHtmlAlPortapapeles(HTML, TEXTO, {
        escribirRico: null,
        escribirTexto: null,
        legadoHtml: () => false,
        legadoTexto: () => false,
      }),
    ).rejects.toThrow("Cmd+C o Ctrl+C");
  });
});

describe("copiarTextoAlPortapapeles", () => {
  it("no revienta cuando navigator.clipboard no existe", async () => {
    const copiarLegacy = vi.fn(() => true);
    await expect(
      copiarTextoAlPortapapeles(TEXTO, { escribirTexto: null, copiarLegacy }),
    ).resolves.toBe("legacy");
    expect(copiarLegacy).toHaveBeenCalledWith(TEXTO);
  });
});
