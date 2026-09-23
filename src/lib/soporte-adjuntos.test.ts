import { describe, expect, test } from "vitest";
import {
  cuerpoBinarioRespuesta,
  detectarTipoAdjunto,
  nombreAdjuntoTicket,
  tipoContenidoAdjunto,
  urlAdjuntoTicket,
  validarAdjuntoTicket,
} from "./soporte-adjuntos";

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

  test("acepta PDF, Excel y TXT por su contenido real", () => {
    const pdf = new TextEncoder().encode("%PDF-1.7 ...");
    const xlsx = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]);
    const xls = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0x00]);
    const txt = new TextEncoder().encode("NIT 900123456 · saldo 1.234");
    expect(detectarTipoAdjunto(pdf, "reporte.pdf")).toBe("pdf");
    expect(detectarTipoAdjunto(pdf, "sin-extension")).toBe("pdf");
    expect(detectarTipoAdjunto(xlsx, "cartera.xlsx")).toBe("xlsx");
    expect(detectarTipoAdjunto(xls, "cartera.xls")).toBe("xls");
    expect(detectarTipoAdjunto(txt, "log.txt")).toBe("txt");
    const r = validarAdjuntoTicket(xlsx, "cartera.xlsx");
    expect(r.ok && r.contentType).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  });

  test("rechaza un ZIP cualquiera, un binario disfrazado de TXT y el texto sin extensión .txt", () => {
    expect(detectarTipoAdjunto(new Uint8Array([0x50, 0x4b, 0x03, 0x04]), "algo.docx")).toBeNull();
    expect(detectarTipoAdjunto(new Uint8Array([0x41, 0x00, 0x42]), "log.txt")).toBeNull();
    expect(detectarTipoAdjunto(new TextEncoder().encode("hola"), "notas.csv")).toBeNull();
  });

  test("un documento se guarda con la extensión de su tipo", () => {
    expect(nombreAdjuntoTicket("soporte", "pdf")).toBe("soporte.pdf");
    expect(nombreAdjuntoTicket("cartera.XLSX", "xlsx")).toBe("cartera.XLSX");
    expect(nombreAdjuntoTicket("../a/b.txt", "txt")).toBe("..ab.txt");
    expect(nombreAdjuntoTicket("captura", "png")).toBe("captura");
  });

  test("la URL del adjunto queda namespaced por id", () => {
    expect(urlAdjuntoTicket(9)).toBe("/api/soporte/adjuntos/9");
  });

  test("acepta un SVG de logo", () => {
    const r = validarAdjuntoTicket(SVG, "logo ru.png");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.contentType).toBe("image/svg+xml");
  });

  test("el MIME del registro gana si S3 devuelve octet-stream", () => {
    expect(tipoContenidoAdjunto("application/octet-stream", "image/svg+xml")).toBe("image/svg+xml");
    expect(tipoContenidoAdjunto("image/png", "image/svg+xml")).toBe("image/svg+xml");
    expect(tipoContenidoAdjunto("image/jpeg", undefined)).toBe("image/jpeg");
  });

  test("el cuerpo de la respuesta es una copia independiente", () => {
    const origen = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    const copia = cuerpoBinarioRespuesta(origen);
    expect(new Uint8Array(copia)).toEqual(origen);
    expect(copia).not.toBe(origen.buffer);
    expect(copia.byteLength).toBe(origen.byteLength);
  });
});
