import { describe, expect, test } from "vitest";
import { detectarTipoAdjunto, validarAdjuntoTicket } from "./soporte-adjuntos";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
const GIF = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00]);
const SVG = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
const SVG_XML = new TextEncoder().encode('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"></svg>');
const PNG_CON_BOM = new Uint8Array([0xef, 0xbb, 0xbf, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe("adjuntos de una novedad", () => {
  test("acepta PNG, GIF y SVG aunque el nombre mienta", () => {
    expect(detectarTipoAdjunto(PNG)).toBe("png");
    expect(detectarTipoAdjunto(GIF)).toBe("gif");
    expect(detectarTipoAdjunto(SVG)).toBe("svg");
    expect(detectarTipoAdjunto(SVG_XML)).toBe("svg");
    expect(detectarTipoAdjunto(PNG_CON_BOM)).toBe("png");
  });

  test("explica qué archivo falló cuando no es una imagen", () => {
    const r = validarAdjuntoTicket(new Uint8Array([0x25, 0x50, 0x44, 0x46]), "logo ru.png");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("logo ru.png");
  });

  test("acepta un SVG de logo", () => {
    const r = validarAdjuntoTicket(SVG, "logo ru.png");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.contentType).toBe("image/svg+xml");
  });
});
