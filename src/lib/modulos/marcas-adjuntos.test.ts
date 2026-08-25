import { describe, expect, it } from "vitest";
import {
  claveSoporteMarca,
  detectarTipoSoporteMarca,
  extensionDeNombre,
  nombreArchivoSeguro,
  SOPORTE_MARCA_MAX_BYTES,
  tamanoLegible,
  tipoContenidoSoporte,
  urlSoporteMarca,
  validarSoporteMarca,
} from "./marcas-adjuntos";

const conFirma = (firma: number[], relleno = 32): Uint8Array =>
  new Uint8Array([...firma, ...new Array(relleno).fill(0x41)]);

const PDF = conFirma([0x25, 0x50, 0x44, 0x46, 0x2d]);
const ZIP = conFirma([0x50, 0x4b, 0x03, 0x04]);
const OLE2 = conFirma([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
const PNG = conFirma([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const CSV = new TextEncoder().encode("cuenta;saldo\n1435;1000\n");

describe("extensionDeNombre", () => {
  it("saca la extensión en minúsculas", () => {
    expect(extensionDeNombre("Conteo Físico.XLSX")).toBe("xlsx");
    expect(extensionDeNombre("sin-extension")).toBe("");
  });
});

describe("detectarTipoSoporteMarca", () => {
  it("reconoce el PDF por su firma, sin mirar la extensión", () => {
    expect(detectarTipoSoporteMarca(PDF, "")).toBe("pdf");
    expect(detectarTipoSoporteMarca(PDF, "docx")).toBe("pdf");
  });

  it("acepta el ZIP solo como xlsx/xlsm: otro Office no es un soporte", () => {
    expect(detectarTipoSoporteMarca(ZIP, "xlsx")).toBe("xlsx");
    expect(detectarTipoSoporteMarca(ZIP, "xlsm")).toBe("xlsx");
    expect(detectarTipoSoporteMarca(ZIP, "docx")).toBeNull();
    expect(detectarTipoSoporteMarca(ZIP, "zip")).toBeNull();
  });

  it("acepta el OLE2 solo como xls", () => {
    expect(detectarTipoSoporteMarca(OLE2, "xls")).toBe("xls");
    expect(detectarTipoSoporteMarca(OLE2, "doc")).toBeNull();
  });

  it("reconoce imágenes por magic bytes", () => {
    expect(detectarTipoSoporteMarca(PNG, "png")).toBe("png");
    // Renombrada a .pdf: manda el contenido, no el nombre.
    expect(detectarTipoSoporteMarca(PNG, "pdf")).toBe("png");
  });

  it("acepta el CSV por extensión cuando el contenido es texto", () => {
    expect(detectarTipoSoporteMarca(CSV, "csv")).toBe("csv");
    expect(detectarTipoSoporteMarca(CSV, "txt")).toBe("csv");
    expect(detectarTipoSoporteMarca(CSV, "")).toBeNull();
  });

  it("rechaza un binario disfrazado de csv", () => {
    const binario = new Uint8Array([0x01, 0x00, 0x02, 0x00]);
    expect(detectarTipoSoporteMarca(binario, "csv")).toBeNull();
  });
});

describe("validarSoporteMarca", () => {
  it("acepta un soporte válido y devuelve su MIME", () => {
    expect(validarSoporteMarca(PDF, "factura.pdf")).toEqual({
      ok: true,
      tipo: "pdf",
      contentType: "application/pdf",
    });
  });

  it("rechaza el archivo vacío", () => {
    expect(validarSoporteMarca(new Uint8Array(), "vacio.pdf")).toMatchObject({ ok: false });
  });

  it("rechaza lo que supera el tope", () => {
    const grande = new Uint8Array(SOPORTE_MARCA_MAX_BYTES + 1);
    grande.set([0x25, 0x50, 0x44, 0x46, 0x2d]);
    expect(validarSoporteMarca(grande, "enorme.pdf")).toMatchObject({ ok: false });
  });

  it("rechaza un formato no admitido nombrando el archivo", () => {
    const r = validarSoporteMarca(new Uint8Array([0x00, 0x01, 0x02, 0x03]), "raro.bin");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("«raro.bin»");
  });
});

describe("nombreArchivoSeguro", () => {
  it("quita rutas y acota el largo", () => {
    expect(nombreArchivoSeguro("../../etc/passwd", "pdf")).toBe("....etcpasswd");
    expect(nombreArchivoSeguro("   ", "xlsx")).toBe("soporte.xlsx");
    expect(nombreArchivoSeguro("x".repeat(300), "pdf")).toHaveLength(180);
  });
});

describe("claveSoporteMarca y urlSoporteMarca", () => {
  it("agrupa el objeto por marca", () => {
    expect(claveSoporteMarca(12, "a1b2", "pdf")).toBe("soportes-marcas/12/a1b2.pdf");
  });

  it("sirve el soporte por su ruta de descarga", () => {
    expect(urlSoporteMarca(7)).toBe("/api/modulos/marcas/soportes/7");
  });
});

describe("tamanoLegible", () => {
  it("escala a KB y MB con coma decimal", () => {
    expect(tamanoLegible(0)).toBe("0 KB");
    expect(tamanoLegible(512)).toBe("512 B");
    expect(tamanoLegible(2048)).toBe("2 KB");
    expect(tamanoLegible(1_572_864)).toBe("1,5 MB");
  });
});

describe("tipoContenidoSoporte", () => {
  it("prefiere el MIME registrado al subir", () => {
    expect(tipoContenidoSoporte("application/octet-stream", "application/pdf")).toBe("application/pdf");
    expect(tipoContenidoSoporte("image/png", undefined)).toBe("image/png");
    expect(tipoContenidoSoporte(undefined, undefined)).toBe("application/octet-stream");
  });
});
