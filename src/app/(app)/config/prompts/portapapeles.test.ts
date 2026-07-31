import { describe, expect, it, vi } from "vitest";
import { copiarPromptAlPortapapeles } from "./portapapeles";

describe("copiarPromptAlPortapapeles", () => {
  it("prioriza Clipboard API y conserva el contenido exacto", async () => {
    const escribirTexto = vi.fn(async () => undefined);
    const copiarLegacy = vi.fn(() => true);

    await expect(copiarPromptAlPortapapeles("Prompt\ncon formato", {
      escribirTexto,
      copiarLegacy,
    })).resolves.toBe("clipboard");

    expect(escribirTexto).toHaveBeenCalledWith("Prompt\ncon formato");
    expect(copiarLegacy).not.toHaveBeenCalled();
  });

  it("usa el fallback cuando Clipboard API rechaza el permiso", async () => {
    const escribirTexto = vi.fn(async () => {
      throw new Error("NotAllowedError");
    });
    const copiarLegacy = vi.fn(() => true);

    await expect(copiarPromptAlPortapapeles("contenido", {
      escribirTexto,
      copiarLegacy,
    })).resolves.toBe("legacy");

    expect(copiarLegacy).toHaveBeenCalledWith("contenido");
  });

  it("usa directamente el fallback cuando Clipboard API no existe", async () => {
    const copiarLegacy = vi.fn(() => true);

    await expect(copiarPromptAlPortapapeles("contenido", {
      escribirTexto: null,
      copiarLegacy,
    })).resolves.toBe("legacy");
  });

  it("explica cómo copiar manualmente cuando ambos caminos fallan", async () => {
    await expect(copiarPromptAlPortapapeles("contenido", {
      escribirTexto: null,
      copiarLegacy: () => false,
    })).rejects.toThrow("Cmd+C o Ctrl+C");
  });
});
