import { describe, expect, it } from "vitest";
import { claveObjetoFormulario } from "./tipos";
import { esHeic, MAX_BYTES_IMAGEN_FORMULARIO, motivoRechazoArchivo, tipoArchivoFormulario } from "./archivo-formulario";

const bytes = (...partes: (string | number[])[]) =>
  Uint8Array.from(partes.flatMap((p) => (typeof p === "string" ? [...p].map((c) => c.charCodeAt(0)) : p)));
const relleno = (n: number) => Array(n).fill(0);

describe("archivos de formularios DIAN: PDF o imagen", () => {
  it("reconoce el tipo por los primeros bytes", () => {
    expect(tipoArchivoFormulario(bytes("%PDF-1.7", relleno(20)))?.mime).toBe("application/pdf");
    expect(tipoArchivoFormulario(bytes([0xff, 0xd8, 0xff, 0xe0], relleno(20)))).toMatchObject({ mime: "image/jpeg", extension: "jpg", esImagen: true });
    expect(tipoArchivoFormulario(bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], relleno(20)))?.mime).toBe("image/png");
    expect(tipoArchivoFormulario(bytes("RIFF", [1, 2, 3, 4], "WEBPVP8 ", relleno(10)))?.mime).toBe("image/webp");
    expect(tipoArchivoFormulario(bytes("GIF89a", relleno(10)))?.mime).toBe("image/gif");
    // El nombre no cuenta: un texto con extensión .pdf no es un PDF.
    expect(tipoArchivoFormulario(bytes("hola, esto no es un pdf"))).toBeNull();
  });

  it("explica por qué rechaza: otro tipo, una foto HEIC o una imagen de más de 5 MB", () => {
    const heic = bytes([0, 0, 0, 24], "ftypheic", relleno(16));
    expect(esHeic(heic)).toBe(true);
    expect(motivoRechazoArchivo(heic)).toContain("HEIC");
    expect(motivoRechazoArchivo(bytes("PK", relleno(20)))).toBe("no es un PDF ni una imagen JPG, PNG, WEBP o GIF.");
    const grande = new Uint8Array(MAX_BYTES_IMAGEN_FORMULARIO + 1);
    grande.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(motivoRechazoArchivo(grande)).toBe("supera 5 MB, el máximo para una imagen.");
    expect(motivoRechazoArchivo(bytes([0xff, 0xd8, 0xff], relleno(100)))).toBeNull();
  });

  it("el original se guarda con la extensión de su tipo; los PDF conservan su clave", () => {
    expect(claveObjetoFormulario(7, 2026, "abc", "iva")).toBe("impuestos/iva/7/2026/abc.pdf");
    expect(claveObjetoFormulario(7, 2026, "abc", "iva", "jpg")).toBe("impuestos/iva/7/2026/abc.jpg");
  });
});
